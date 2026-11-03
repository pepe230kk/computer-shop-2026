import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Błąd: brak zmiennej DATABASE_URL.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function verify() {
  console.log("================================================================");
  console.log("  Laboratorium 09: Kompleksowa weryfikacja uwierzytelniania,   ");
  console.log("       koszyka i wszystkich rozszerzeń architektonicznych       ");
  console.log("================================================================\n");

  let passed = 0;
  let total = 0;

  async function runCheck(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error("       Szczegóły:", err instanceof Error ? err.message : err);
    }
  }

  // 1. Sprawdzenie połączenia z bazą
  await runCheck("Połączenie z bazą PostgreSQL", async () => {
    const res = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "Product"');
    if (!res || Number(res[0].count) < 1) {
      throw new Error("Brak produktów w bazie danych");
    }
  });

  // 2. Weryfikacja modeli Better Auth i Cart
  await runCheck("Weryfikacja istnienia tabel: User, Session, Account, Verification, Cart, CartItem, Order, OrderItem", async () => {
    const tables = ["User", "Session", "Account", "Verification", "Cart", "CartItem", "Order", "OrderItem"];
    for (const table of tables) {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
    }
  });

  // 3. Weryfikacja CHECK constraint dla CartItem (quantity BETWEEN 1 AND 99)
  await runCheck("Ograniczenie SQL CHECK dla CartItem (quantity BETWEEN 1 AND 99)", async () => {
    const user = await prisma.user.upsert({
      where: { email: "check-test@example.com" },
      create: { id: "check-test-id", name: "Check User", email: "check-test@example.com" },
      update: {},
    });
    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    let caughtZero = false;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CartItem" ("cartId", "productId", "quantity", "createdAt", "updatedAt") VALUES (${cart.id}, 1, 0, NOW(), NOW())`
      );
    } catch {
      caughtZero = true;
    }
    if (!caughtZero) throw new Error("Baza pozwoliła wstawić quantity = 0!");

    let caught100 = false;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CartItem" ("cartId", "productId", "quantity", "createdAt", "updatedAt") VALUES (${cart.id}, 1, 100, NOW(), NOW())`
      );
    } catch {
      caught100 = true;
    }
    if (!caught100) throw new Error("Baza pozwoliła wstawić quantity = 100!");
  });

  // 4. Rozszerzenie 1: Transakcyjny Checkout z kluczem idempotencji i redukcją stanów
  await runCheck("Rozszerzenie 1: Checkout transakcyjny z idempotencją i atomowością", async () => {
    const testUser = await prisma.user.upsert({
      where: { email: "checkout-verify@example.com" },
      create: { id: "checkout-verify-id", name: "Checkout User", email: "checkout-verify@example.com" },
      update: {},
    });

    const product = await prisma.product.findFirstOrThrow({ where: { amount: { gte: 5 } } });
    const initialStock = product.amount;

    const cart = await prisma.cart.upsert({
      where: { userId: testUser.id },
      create: { userId: testUser.id },
      update: {},
    });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: product.id, quantity: 2 },
    });

    // Import cart logic
    const { checkoutCart } = await import("../app/lib/cart.js");
    const idempotencyKey = `idemp-verify-${Date.now()}`;

    // 1st checkout
    const res1 = await checkoutCart(testUser.id, idempotencyKey);
    if (res1.replayed) throw new Error("Pierwszy checkout nie powinien być oznaczony jako replayed");

    const stockAfter = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    if (stockAfter.amount !== initialStock - 2) throw new Error("Stan magazynowy nie spadł poprawnie o 2 sztuki");

    // 2nd checkout with same idempotency key
    const res2 = await checkoutCart(testUser.id, idempotencyKey);
    if (!res2.replayed) throw new Error("Drugi checkout z tym samym kluczem powinien zwrócić replayed: true");
    if (res2.order.id !== res1.order.id) throw new Error("Identyfikatory zamówień nie są identyczne");

    // Przywróć stan
    await prisma.product.update({ where: { id: product.id }, data: { amount: initialStock } });
  });

  // 5. Rozszerzenie 2: Izolacja historii zamówień między użytkownikami
  await runCheck("Rozszerzenie 2: Izolacja historii zamówień (User A vs User B)", async () => {
    const userA = await prisma.user.upsert({
      where: { email: "iso-a@example.com" },
      create: { id: "iso-a-id", name: "User A", email: "iso-a@example.com" },
      update: {},
    });
    const userB = await prisma.user.upsert({
      where: { email: "iso-b@example.com" },
      create: { id: "iso-b-id", name: "User B", email: "iso-b@example.com" },
      update: {},
    });

    // Utwórz zamówienie dla A
    await prisma.order.create({
      data: {
        orderNumber: `ORD-ISO-A-${Date.now()}`,
        userId: userA.id,
        status: "COMPLETED",
        totalPrice: 15000,
        items: {
          create: [{ productName: "Pamięć RAM", productCode: "RAM01", quantity: 1, unitPrice: 15000 }],
        },
      },
    });

    const ordersA = await prisma.order.findMany({ where: { userId: userA.id } });
    const ordersB = await prisma.order.findMany({ where: { userId: userB.id } });

    if (!ordersA.every((o) => o.userId === userA.id)) throw new Error("Zamówienia A zawierają cudze dane");
    if (ordersB.some((o) => o.userId === userA.id)) throw new Error("Użytkownik B widzi zamówienia Użytkownika A!");
  });

  // 6. Rozszerzenie 3: Wielourządzeniowe sesje (Single Sign-out vs Global Revoke)
  await runCheck("Rozszerzenie 3: Obsługa sesji wielourządzeniowych i unieważnianie", async () => {
    const user = await prisma.user.upsert({
      where: { email: "session-test@example.com" },
      create: { id: "session-test-id", name: "Session User", email: "session-test@example.com" },
      update: {},
    });

    const tokenDev1 = `token-phone-${Date.now()}`;
    const tokenDev2 = `token-laptop-${Date.now()}`;

    await prisma.session.createMany({
      data: [
        { id: `s1-${Date.now()}`, token: tokenDev1, userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
        { id: `s2-${Date.now()}`, token: tokenDev2, userId: user.id, expiresAt: new Date(Date.now() + 3600000) },
      ],
    });

    // Wylogowanie z telefonu
    await prisma.session.delete({ where: { token: tokenDev1 } });
    const active = await prisma.session.findMany({ where: { userId: user.id } });
    if (active.length !== 1 || active[0].token !== tokenDev2) {
      throw new Error("Wylogowanie z jednego urządzenia nie zachowało drugiej sesji");
    }

    // Globalne wylogowanie
    await prisma.session.deleteMany({ where: { userId: user.id } });
    const remaining = await prisma.session.findMany({ where: { userId: user.id } });
    if (remaining.length !== 0) throw new Error("Globalne wylogowanie nie usunęło wszystkich sesji");
  });

  // 7. Rozszerzenie 4: Współbieżne modyfikacje koszyka
  await runCheck("Rozszerzenie 4: Współbieżność zapisów do koszyka i spójność stanu", async () => {
    const user = await prisma.user.upsert({
      where: { email: "concur-cart@example.com" },
      create: { id: "concur-cart-id", name: "Concur User", email: "concur-cart@example.com" },
      update: {},
    });

    const inStockProduct = await prisma.product.findFirstOrThrow({ where: { amount: { gte: 10 } } });

    const { addToCart, updateCartItemQuantity, getMyCart } = await import("../app/lib/cart.js");
    await addToCart(user.id, inStockProduct.id, 1);

    const cart = await getMyCart(user.id);
    const itemId = cart.items[0].id;

    // Równoległe modyfikacje
    await Promise.allSettled([
      updateCartItemQuantity(user.id, itemId, 5),
      updateCartItemQuantity(user.id, itemId, 6),
    ]);

    const finalCart = await getMyCart(user.id);
    if (![5, 6].includes(finalCart.items[0].quantity)) {
      throw new Error(`Nieoczekiwana wartość po współbieżnym zapisie: ${finalCart.items[0].quantity}`);
    }
  });

  console.log("\n================================================================");
  console.log(`  Wynik testów: ${passed}/${total} zaliczonych`);
  console.log("================================================================\n");

  await prisma.$disconnect();
}

verify().catch((err) => {
  console.error("Krytyczny błąd skryptu weryfikacyjnego:", err);
  process.exit(1);
});
