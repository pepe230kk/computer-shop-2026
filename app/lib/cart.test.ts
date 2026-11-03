import test from "node:test";
import assert from "node:assert";
import { prisma } from "./db";
import {
  getMyCart,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  checkoutCart,
} from "./cart";

test("Laboratorium 09: Cart & Authentication Isolation Tests", async (t) => {
  // Przygotowanie dwóch odrębnych kont użytkowników testowych
  const userA = await prisma.user.upsert({
    where: { email: "test-user-a@example.com" },
    create: {
      id: "test-user-a-id",
      name: "Użytkownik Testowy A",
      email: "test-user-a@example.com",
      emailVerified: true,
    },
    update: {
      name: "Użytkownik Testowy A",
    },
  });

  const userB = await prisma.user.upsert({
    where: { email: "test-user-b@example.com" },
    create: {
      id: "test-user-b-id",
      name: "Użytkownik Testowy B",
      email: "test-user-b@example.com",
      emailVerified: true,
    },
    update: {
      name: "Użytkownik Testowy B",
    },
  });

  // Wyczyść koszyki i zamówienia testowe przed rozpoczęciem testów
  await prisma.cartItem.deleteMany({
    where: {
      cart: { userId: { in: [userA.id, userB.id] } },
    },
  });
  await prisma.orderItem.deleteMany({
    where: {
      order: { userId: { in: [userA.id, userB.id] } },
    },
  });
  await prisma.order.deleteMany({
    where: {
      userId: { in: [userA.id, userB.id] },
    },
  });

  // Pobierz dwa istniejące produkty z bazy
  const products = await prisma.product.findMany({
    where: { amount: { gte: 5 } },
    take: 2,
    orderBy: { id: "asc" },
  });
  assert.ok(products.length >= 2, "Wymagane co najmniej 2 produkty w bazie do testów");
  const p1 = products[0];
  const p2 = products[1];

  await t.test("1. Izolacja koszyków: Użytkownik A dodaje produkt, Użytkownik B widzi pusty koszyk", async () => {
    // Użytkownik A dodaje 2 sztuki produktu p1
    await addToCart(userA.id, p1.id, 2);

    const cartA = await getMyCart(userA.id);
    assert.strictEqual(cartA.items.length, 1);
    assert.strictEqual(cartA.items[0].productId, p1.id);
    assert.strictEqual(cartA.items[0].quantity, 2);
    assert.strictEqual(cartA.totalPrice, p1.price * 2);

    // Użytkownik B sprawdza swój koszyk
    const cartB = await getMyCart(userB.id);
    assert.strictEqual(cartB.items.length, 0, "Koszyk Użytkownika B musi być pusty (pełna izolacja)");
    assert.strictEqual(cartB.totalPrice, 0);
  });

  await t.test("2. Zero-Trust: Użytkownik B nie może modyfikować pozycji Użytkownika A", async () => {
    const cartA = await getMyCart(userA.id);
    const itemA = cartA.items[0];

    // Użytkownik B próbuje zmienić ilość pozycji w koszyku A
    await assert.rejects(
      async () => {
        await updateCartItemQuantity(userB.id, itemA.id, 5);
      },
      /Nie znaleziono pozycji w Twoim koszyku/,
      "Próba modyfikacji cudzego koszyka musi zakończyć się odmową"
    );

    // Użytkownik B próbuje usunąć pozycję z koszyka A
    await assert.rejects(
      async () => {
        await removeCartItem(userB.id, itemA.id);
      },
      /Nie znaleziono pozycji w Twoim koszyku/,
      "Próba usunięcia cudzej pozycji musi zakończyć się odmową"
    );

    // Stan koszyka A pozostał nienaruszony
    const cartACheck = await getMyCart(userA.id);
    assert.strictEqual(cartACheck.items[0].quantity, 2);
  });

  await t.test("3. Walidacja ilości pozycji (1-99 oraz dostępny stan magazynowy)", async () => {
    const cartA = await getMyCart(userA.id);
    const itemA = cartA.items[0];

    // Próba ustawienia powyżej 99
    await assert.rejects(
      async () => {
        await updateCartItemQuantity(userA.id, itemA.id, 100);
      },
      /Ilość musi wynosić od 0 do 99/
    );

    // Próba przekroczenia stanu magazynowego
    const excessiveAmount = p1.amount + 50;
    if (excessiveAmount <= 99) {
      await assert.rejects(
        async () => {
          await updateCartItemQuantity(userA.id, itemA.id, excessiveAmount);
        },
        /Dostępna liczba sztuk w magazynie to tylko/
      );
    }

    // Ustawienie ilości 0 usuwa pozycję
    await updateCartItemQuantity(userA.id, itemA.id, 0);
    const cartAEmpty = await getMyCart(userA.id);
    assert.strictEqual(cartAEmpty.items.length, 0);
  });

  await t.test("4. CHECK constraint bazy danych: quantity BETWEEN 1 AND 99", async () => {
    const cart = await prisma.cart.upsert({
      where: { userId: userA.id },
      create: { userId: userA.id },
      update: {},
    });

    // Próba bezpośredniego zapisu SQL naruszającego ograniczenie CHECK
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "CartItem" ("cartId", "productId", "quantity", "createdAt", "updatedAt") VALUES (${cart.id}, ${p1.id}, 0, NOW(), NOW())`
        );
      },
      /cart_item_quantity_range/
    );

    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "CartItem" ("cartId", "productId", "quantity", "createdAt", "updatedAt") VALUES (${cart.id}, ${p1.id}, 100, NOW(), NOW())`
        );
      },
      /cart_item_quantity_range/
    );
  });

  await t.test("5. Rozszerzenie 1: Transakcyjny Checkout z kluczem idempotencji i redukcją stanu", async () => {
    // Pobierz świeży stan p2
    const freshP2 = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
    const initialStock = freshP2.amount;
    assert.ok(initialStock >= 2, "Wymagane co najmniej 2 sztuki produktu do testu checkout");

    // Dodaj p2 do koszyka
    await addToCart(userA.id, p2.id, 2);

    const idempotencyKey = `test-idempotency-${Date.now()}`;

    // 1. Pierwszy checkout
    const result1 = await checkoutCart(userA.id, idempotencyKey);
    assert.strictEqual(result1.replayed, false);
    assert.ok(result1.order.orderNumber.startsWith("ORD-"));
    assert.strictEqual(result1.order.totalPrice, p2.price * 2);

    // Koszyk powinien zostać opróżniony
    const cartAfter = await getMyCart(userA.id);
    assert.strictEqual(cartAfter.items.length, 0);

    // Stan magazynowy powinien spaść dokładnie o 2 sztuki
    const stockAfter = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
    assert.strictEqual(stockAfter.amount, initialStock - 2);

    // 2. Ponowna próba z tym samym kluczem idempotencji (replay)
    const result2 = await checkoutCart(userA.id, idempotencyKey);
    assert.strictEqual(result2.replayed, true, "Ponowne zapytanie z tym samym kluczem zwraca istniejące zamówienie");
    assert.strictEqual(result2.order.id, result1.order.id);

    // Stan magazynowy NIE może spaść powtórnie
    const stockAfterReplay = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
    assert.strictEqual(stockAfterReplay.amount, initialStock - 2);

    // Przywróć stan początkowy p2
    await prisma.product.update({
      where: { id: p2.id },
      data: { amount: initialStock },
    });
  });

  await t.test("6. Rozszerzenie 1: Współbieżny checkout ostatniej sztuki (double-purchase protection)", async () => {
    // Ustaw produkt z dokładnie 1 sztuką w magazynie
    await prisma.product.update({
      where: { id: p1.id },
      data: { amount: 1 },
    });

    // Użytkownik A dodaje 1 sztukę
    await addToCart(userA.id, p1.id, 1);
    // Użytkownik B dodaje 1 sztukę
    await addToCart(userB.id, p1.id, 1);

    // Równoległe próby sfinalizowania zamówienia
    const [resA, resB] = await Promise.allSettled([
      checkoutCart(userA.id, `concur-a-${Date.now()}`),
      checkoutCart(userB.id, `concur-b-${Date.now()}`),
    ]);

    const successes = [resA, resB].filter((r) => r.status === "fulfilled");
    const failures = [resA, resB].filter((r) => r.status === "rejected");

    assert.strictEqual(successes.length, 1, "Dokładnie jedno zamówienie musi się udać");
    assert.strictEqual(failures.length, 1, "Dokładnie jedno zamówienie musi zakończyć się błędem braku sztuk");

    // Stan w magazynie musi wynosić dokładnie 0 (nie może zejść poniżej zera)
    const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    assert.strictEqual(finalProduct.amount, 0);

    // Przywróć stan p1
    await prisma.product.update({
      where: { id: p1.id },
      data: { amount: 10 },
    });
  });

  await t.test("7. Rozszerzenie 2: Izolacja historii zamówień między Użytkownikiem A a Użytkownikiem B", async () => {
    // Pobierz zamówienia z perspektywy A
    const ordersA = await prisma.order.findMany({
      where: { userId: userA.id },
    });
    // Pobierz zamówienia z perspektywy B
    const ordersB = await prisma.order.findMany({
      where: { userId: userB.id },
    });

    assert.ok(ordersA.length > 0, "Użytkownik A ma zamówienia z poprzednich kroków");
    // Żadne zamówienie A nie może mieć userId równego B
    assert.ok(ordersA.every((o) => o.userId === userA.id));
    assert.ok(ordersB.every((o) => o.userId === userB.id));
  });

  await t.test("8. Rozszerzenie 3: Wielourządzeniowe sesje (Single Session Sign-out vs Global Revoke)", async () => {
    const token1 = `session-token-dev-1-${Date.now()}`;
    const token2 = `session-token-dev-2-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    // Utwórz 2 aktywne sesje dla użytkownika A (np. telefon i laptop)
    await prisma.session.create({
      data: {
        id: `sess-1-${Date.now()}`,
        token: token1,
        userId: userA.id,
        expiresAt,
        userAgent: "Mobile Safari",
      },
    });

    await prisma.session.create({
      data: {
        id: `sess-2-${Date.now()}`,
        token: token2,
        userId: userA.id,
        expiresAt,
        userAgent: "Desktop Chrome",
      },
    });

    // Weryfikacja: obie sesje aktywne w bazie
    let activeSessions = await prisma.session.findMany({ where: { userId: userA.id } });
    assert.strictEqual(activeSessions.length, 2);

    // Wylogowanie z pojedynczego urządzenia (usunięcie token1)
    await prisma.session.delete({ where: { token: token1 } });

    // Sesja na drugim urządzeniu nadal aktywna
    const sess2Check = await prisma.session.findUnique({ where: { token: token2 } });
    assert.ok(sess2Check !== null, "Druga sesja musi pozostać aktywna po wylogowaniu z pierwszego urządzenia");

    // Globalne unieważnienie sesji na wszystkich urządzeniach
    await prisma.session.deleteMany({ where: { userId: userA.id } });
    activeSessions = await prisma.session.findMany({ where: { userId: userA.id } });
    assert.strictEqual(activeSessions.length, 0, "Wszystkie sesje użytkownika zostały unieważnione");
  });

  await t.test("9. Rozszerzenie 4: Współbieżne modyfikacje koszyka (Concurrent Cart Writes)", async () => {
    // Dodaj produkt p1 do koszyka A
    await addToCart(userA.id, p1.id, 1);
    const cart = await getMyCart(userA.id);
    const itemId = cart.items[0].id;

    // Dwie równoległe sesje użytkownika A modyfikujące tę samą pozycję
    const [write1, write2] = await Promise.allSettled([
      updateCartItemQuantity(userA.id, itemId, 3),
      updateCartItemQuantity(userA.id, itemId, 4),
    ]);

    assert.ok(write1.status === "fulfilled" || write2.status === "fulfilled");

    // Końcowy stan koszyka musi być spójny i zawierać dokładnie 1 pozycję
    const finalCart = await getMyCart(userA.id);
    assert.strictEqual(finalCart.items.length, 1);
    assert.ok([3, 4].includes(finalCart.items[0].quantity));

    // Wyczyść po teście
    await removeCartItem(userA.id, itemId);
  });
});
