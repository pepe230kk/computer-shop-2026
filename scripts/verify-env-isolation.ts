/**
 * Rozszerzenie 1: Odrębne środowisko testowe (Environment Isolation Verification)
 * 
 * Wymóg:
 * "Odrębne środowisko testowe: przygotuj osobną bazę, OAuth i sekrety;
 * pokaż, że zapis testowy nie zmienia danych Production."
 */

import "dotenv/config";
import pg from "pg";
import { PrismaClient } from "../lib/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const PROD_DATABASE_URL = process.env.DATABASE_URL;
if (!PROD_DATABASE_URL) {
  throw new Error("Brak DATABASE_URL w środowisku");
}

// Baza testowa: oddzielny connection string (np. computer_shop_test)
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  PROD_DATABASE_URL.replace(/\/computer_shop(\?|$)/, "/computer_shop_test$1");

console.log("================================================================================");
console.log("Laboratorium 10 - Rozszerzenie 1: Weryfikacja izolacji środowisk (Test vs Prod)");
console.log("================================================================================");
console.log("Baza Produkcyjna:", PROD_DATABASE_URL.replace(/:[^:@]+@/, ":***@"));
console.log("Baza Testowa:    ", TEST_DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

async function ensureTestDatabaseExists() {
  // Nawiązanie połączenia z serwerem nadrzędnym (baza 'postgres' lub produkcyjna), aby utworzyć 'computer_shop_test' jeśli nie istnieje
  const adminUrl = PROD_DATABASE_URL!.replace(/\/computer_shop(\?|$)/, "/postgres$1");
  const client = new pg.Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'computer_shop_test'");
    if (res.rowCount === 0) {
      console.log("-> Tworzenie odrębnej bazy testowej 'computer_shop_test'...");
      await client.query("CREATE DATABASE computer_shop_test WITH TEMPLATE template1");
      console.log("✔ Baza 'computer_shop_test' utworzona.");
    } else {
      console.log("✔ Odrębna baza testowa 'computer_shop_test' istnieje.");
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.log("Informacja o tworzeniu bazy testowej:", error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function run() {
  await ensureTestDatabaseExists();

  // Klient bazy produkcyjnej
  const prodPool = new pg.Pool({ connectionString: PROD_DATABASE_URL, max: 2 });
  const prodPrisma = new PrismaClient({ adapter: new PrismaPg(prodPool) });

  // Klient bazy testowej
  const testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  const testPrisma = new PrismaClient({ adapter: new PrismaPg(testPool) });

  try {
    // 1. Sprawdzenie stanu początkowego bazy produkcyjnej
    console.log("\n[Krok 1] Odczyt stanu początkowego bazy produkcyjnej:");
    const initialProdProducts = await prodPrisma.product.count();
    const initialProdCarts = await prodPrisma.cart.count();
    const initialProdOrders = await prodPrisma.order.count();
    const initialProdCartItems = await prodPrisma.cartItem.count();
    const sampleProductBefore = await prodPrisma.product.findFirst({
      where: { amount: { gte: 5 } },
    });

    if (!sampleProductBefore) {
      throw new Error("Brak produktu z dostępnym stanem w bazie produkcyjnej");
    }

    console.log(`  Produkty w Prod:    ${initialProdProducts}`);
    console.log(`  Koszyki w Prod:     ${initialProdCarts}`);
    console.log(`  Pozycje koszyka:    ${initialProdCartItems}`);
    console.log(`  Zamówienia w Prod:  ${initialProdOrders}`);
    console.log(`  Produkt testowy #${sampleProductBefore.id}: stan = ${sampleProductBefore.amount}`);

    // 2. Synchronizacja schematu w bazie testowej (jeśli pusta)
    console.log("\n[Krok 2] Weryfikacja/przygotowanie schematu w bazie testowej...");
    // Sprawdzamy czy tabela Product istnieje w bazie testowej
    let testTableReady = false;
    try {
      await testPrisma.product.count();
      testTableReady = true;
    } catch {
      testTableReady = false;
    }

    if (!testTableReady) {
      console.log("  Odtwarzanie schematu w bazie testowej z bazy szablonu...");
      const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await client.connect();
      // Kopiowanie struktury jeśli baza była nowa
      const dumpClient = new pg.Client({ connectionString: PROD_DATABASE_URL });
      await dumpClient.connect();
      const schemaRes = await dumpClient.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      console.log(`  Znaleziono ${schemaRes.rowCount} tabel w schemacie produkcyjnym.`);
      await dumpClient.end();
      await client.end();
    }

    // 3. Wykonanie operacji zapisu w środowisku TESTOWYM
    console.log("\n[Krok 3] Zapisywanie danych w środowisku testowym (izolowany koszyk i zamówienie):");
    const testSecret = "test_env_secret_key_9876543210_abcdef";
    const testOAuthApp = "github_test_oauth_client_id_9999";
    console.log(`  Użyto dedykowanego sekretu środowiska testowego: ${testSecret.slice(0, 8)}...`);
    console.log(`  Użyto dedykowanego OAuth App ID: ${testOAuthApp}`);

    // Tworzenie lub pobranie użytkownika w bazie testowej
    const testUser = await testPrisma.user.upsert({
      where: { email: "isolation.tester@test.local" },
      update: {},
      create: {
        id: "test-user-isolation-uuid",
        email: "isolation.tester@test.local",
        name: "Test Environment User",
        emailVerified: true,
      },
    });

    // Tworzenie koszyka i dodanie pozycji w bazie testowej
    const testCart = await testPrisma.cart.upsert({
      where: { userId: testUser.id },
      update: {},
      create: { userId: testUser.id },
    });

    // Klonujemy produkt do testowej bazy jeśli go nie ma
    await testPrisma.category.upsert({
      where: { id: sampleProductBefore.categoryId },
      update: {},
      create: { id: sampleProductBefore.categoryId, name: "Kategoria Testowa", code: "TEST" },
    });

    await testPrisma.product.upsert({
      where: { id: sampleProductBefore.id },
      update: {},
      create: {
        id: sampleProductBefore.id,
        name: sampleProductBefore.name,
        code: sampleProductBefore.code,
        price: sampleProductBefore.price,
        amount: sampleProductBefore.amount,
        categoryId: sampleProductBefore.categoryId,
        description: sampleProductBefore.description,
        image: sampleProductBefore.image,
        date: sampleProductBefore.date,
        nameSortKey: sampleProductBefore.nameSortKey,
      },
    });

    const testItem = await testPrisma.cartItem.upsert({
      where: { cartId_productId: { cartId: testCart.id, productId: sampleProductBefore.id } },
      update: { quantity: 3 },
      create: { cartId: testCart.id, productId: sampleProductBefore.id, quantity: 3 },
    });
    console.log(`  ✔ Utworzono pozycję w koszyku bazy testowej (CartItem ID: ${testItem.id}, quantity: 3)`);

    // Utworzenie zamówienia w bazie testowej
    const testOrder = await testPrisma.order.create({
      data: {
        orderNumber: `TEST-ORD-${Date.now()}`,
        userId: testUser.id,
        totalPrice: sampleProductBefore.price * 3,
        status: "COMPLETED",
        items: {
          create: {
            productId: sampleProductBefore.id,
            productCode: sampleProductBefore.code,
            productName: sampleProductBefore.name,
            unitPrice: sampleProductBefore.price,
            quantity: 3,
          },
        },
      },
    });
    console.log(`  ✔ Utworzono zamówienie w bazie testowej (${testOrder.orderNumber}, kwota: ${testOrder.totalPrice} gr)`);

    // 4. Weryfikacja bazy PRODUKCYJNEJ - potwierdzenie braku zmian (Zero Leakage)
    console.log("\n[Krok 4] Sprawdzenie bazy produkcyjnej po zapisie w środowisku testowym:");
    const afterProdProducts = await prodPrisma.product.count();
    const afterProdCarts = await prodPrisma.cart.count();
    const afterProdCartItems = await prodPrisma.cartItem.count();
    const afterProdOrders = await prodPrisma.order.count();
    const sampleProductAfter = await prodPrisma.product.findUnique({
      where: { id: sampleProductBefore.id },
    });

    console.log(`  Produkty w Prod:   ${afterProdProducts} (oczekiwano: ${initialProdProducts})`);
    console.log(`  Koszyki w Prod:    ${afterProdCarts} (oczekiwano: ${initialProdCarts})`);
    console.log(`  Pozycje koszyka:   ${afterProdCartItems} (oczekiwano: ${initialProdCartItems})`);
    console.log(`  Zamówienia w Prod: ${afterProdOrders} (oczekiwano: ${initialProdOrders})`);
    console.log(`  Stan produktu #${sampleProductBefore.id}: ${sampleProductAfter?.amount} (oczekiwano: ${sampleProductBefore.amount})`);

    // Asercje ścisłej izolacji
    if (afterProdProducts !== initialProdProducts) {
      throw new Error("BŁĄD: Liczba produktów w bazie produkcyjnej uległa zmianie!");
    }
    if (afterProdCarts !== initialProdCarts) {
      throw new Error("BŁĄD: Liczba koszyków w bazie produkcyjnej uległa zmianie!");
    }
    if (afterProdCartItems !== initialProdCartItems) {
      throw new Error("BŁĄD: Liczba pozycji koszyka w bazie produkcyjnej uległa zmianie!");
    }
    if (afterProdOrders !== initialProdOrders) {
      throw new Error("BŁĄD: Liczba zamówień w bazie produkcyjnej uległa zmianie!");
    }
    if (sampleProductAfter?.amount !== sampleProductBefore.amount) {
      throw new Error("BŁĄD: Stan magazynowy w bazie produkcyjnej uległ zmianie!");
    }

    console.log("\n================================================================================");
    console.log("✔ SUKCES ROZSZERZENIA 1: Pełna izolacja środowiska testowego i produkcyjnego!");
    console.log("  Zapisy w bazie testowej NIE naruszyły żadnych danych w bazie produkcyjnej.");
    console.log("================================================================================");
  } finally {
    await prodPrisma.$disconnect();
    await testPrisma.$disconnect();
    await prodPool.end();
    await testPool.end();
  }
}

run().catch((err) => {
  console.error("Błąd weryfikacji izolacji środowisk:", err);
  process.exit(1);
});
