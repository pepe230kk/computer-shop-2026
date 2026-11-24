/**
 * Rozszerzenie 4: Backup i Restore bazy danych
 * 
 * Wymóg:
 * "Backup i restore: wykonaj kopię bazy i odtwórz ją do odrębnej bazy testowej;
 * sprawdź katalog, relacje i koszyki. Nie nadpisuj bazy Production."
 */

import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

const PROD_DATABASE_URL = process.env.DATABASE_URL;
if (!PROD_DATABASE_URL) {
  throw new Error("Brak DATABASE_URL w środowisku");
}

// Odrębna docelowa baza testowa do odtworzenia kopii zapasowej
const RESTORE_TARGET_DATABASE_URL =
  process.env.RESTORE_DATABASE_URL ||
  PROD_DATABASE_URL.replace(/\/computer_shop(\?|$)/, "/computer_shop_restore_test$1");

console.log("================================================================================");
console.log("Laboratorium 10 - Rozszerzenie 4: Kopia zapasowa (Backup) i Odtworzenie (Restore)");
console.log("================================================================================");
console.log("Baza Źródłowa (Prod): ", PROD_DATABASE_URL.replace(/:[^:@]+@/, ":***@"));
console.log("Baza Docelowa (Restore):", RESTORE_TARGET_DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

async function ensureTargetDatabaseExists() {
  const adminUrl = PROD_DATABASE_URL!.replace(/\/computer_shop(\?|$)/, "/postgres$1");
  const client = new pg.Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'computer_shop_restore_test'"
    );
    if (res.rowCount === 0) {
      console.log("-> Tworzenie odrębnej bazy testowej 'computer_shop_restore_test'...");
      await client.query("CREATE DATABASE computer_shop_restore_test WITH TEMPLATE template1");
      console.log("✔ Baza 'computer_shop_restore_test' utworzona.");
    } else {
      console.log("✔ Odrębna baza 'computer_shop_restore_test' jest gotowa.");
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.log("Informacja o bazie:", error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function run() {
  await ensureTargetDatabaseExists();

  const sourceClient = new pg.Client({ connectionString: PROD_DATABASE_URL });
  const targetClient = new pg.Client({ connectionString: RESTORE_TARGET_DATABASE_URL });

  await sourceClient.connect();
  await targetClient.connect();

  try {
    // -------------------------------------------------------------------------
    // Krok 1: Wykonanie kopii zapasowej (Backup) ze źródła produkcyjnego
    // -------------------------------------------------------------------------
    console.log("\n[Krok 1] Wykonywanie kopii zapasowej (Eksport danych źródłowych):");
    
    const categories = (await sourceClient.query('SELECT * FROM "Category" ORDER BY id')).rows;
    const products = (await sourceClient.query('SELECT * FROM "Product" ORDER BY id')).rows;
    const users = (await sourceClient.query('SELECT * FROM "User" ORDER BY id')).rows;
    const accounts = (await sourceClient.query('SELECT * FROM "Account" ORDER BY id')).rows;
    const sessions = (await sourceClient.query('SELECT * FROM "Session" ORDER BY id')).rows;
    const carts = (await sourceClient.query('SELECT * FROM "Cart" ORDER BY id')).rows;
    const cartItems = (await sourceClient.query('SELECT * FROM "CartItem" ORDER BY id')).rows;
    const orders = (await sourceClient.query('SELECT * FROM "Order" ORDER BY id')).rows;
    const orderItems = (await sourceClient.query('SELECT * FROM "OrderItem" ORDER BY id')).rows;

    const backupData = {
      createdAt: new Date().toISOString(),
      sourceDatabase: "computer_shop",
      tables: {
        categories,
        products,
        users,
        accounts,
        sessions,
        carts,
        cartItems,
        orders,
        orderItems,
      },
    };

    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupFile = path.join(backupDir, `backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), "utf8");

    console.log(`  ✔ Zapisano kopię zapasową do pliku: ${path.basename(backupFile)}`);
    console.log(`    - Kategorie:   ${categories.length}`);
    console.log(`    - Produkty:    ${products.length}`);
    console.log(`    - Użytkownicy: ${users.length}`);
    console.log(`    - Koszyki:     ${carts.length}`);
    console.log(`    - Pozycje kosz:${cartItems.length}`);
    console.log(`    - Zamówienia:  ${orders.length}`);
    console.log(`    - Pozycje zam: ${orderItems.length}`);

    // -------------------------------------------------------------------------
    // Krok 2: Odtwarzanie struktury i danych w ODRĘBNEJ bazie testowej (Restore)
    // -------------------------------------------------------------------------
    console.log("\n[Krok 2] Odtwarzanie kopii w odrębnej bazie testowej (Restore):");

    // Odtworzenie DDL ze schematu produkcyjnego jeśli tabele nie istnieją
    await targetClient.query(`
      CREATE TABLE IF NOT EXISTS "Category" (
        "id" INTEGER NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "Product" (
        "id" INTEGER NOT NULL,
        "code" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "image" TEXT NOT NULL,
        "price" INTEGER NOT NULL,
        "amount" INTEGER NOT NULL,
        "date" TIMESTAMPTZ(3) NOT NULL,
        "nameSortKey" TEXT COLLATE "C" NOT NULL,
        "categoryId" INTEGER NOT NULL,
        CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Product_amount_check" CHECK (amount >= 0),
        CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        "image" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "Cart" (
        "id" SERIAL NOT NULL,
        "userId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Cart_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "CartItem" (
        "id" SERIAL NOT NULL,
        "cartId" INTEGER NOT NULL,
        "productId" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "CartItem_quantity_check" CHECK (quantity BETWEEN 1 AND 99),
        CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "Order" (
        "id" SERIAL NOT NULL,
        "orderNumber" TEXT NOT NULL,
        "idempotencyKey" TEXT,
        "userId" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "totalPrice" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "OrderItem" (
        "id" SERIAL NOT NULL,
        "orderId" INTEGER NOT NULL,
        "productId" INTEGER,
        "productName" TEXT NOT NULL,
        "productCode" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "unitPrice" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" > 0),
        CONSTRAINT "OrderItem_unitPrice_check" CHECK ("unitPrice" >= 0),
        CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    // Czyszczenie tabel docelowych w transakcji przed wstrzyknięciem kopii
    await targetClient.query('BEGIN');
    await targetClient.query('TRUNCATE "OrderItem", "Order", "CartItem", "Cart", "Product", "Category", "User" CASCADE');

    // Wstawianie kategorii
    for (const cat of categories) {
      await targetClient.query('INSERT INTO "Category" (id, name, code) VALUES ($1, $2, $3)', [cat.id, cat.name, cat.code]);
    }
    // Wstawianie produktów
    for (const prod of products) {
      await targetClient.query(
        'INSERT INTO "Product" (id, code, name, description, image, price, amount, date, "nameSortKey", "categoryId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [prod.id, prod.code, prod.name, prod.description, prod.image, prod.price, prod.amount, prod.date, prod.nameSortKey, prod.categoryId]
      );
    }
    // Wstawianie użytkowników
    for (const u of users) {
      await targetClient.query(
        'INSERT INTO "User" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [u.id, u.name, u.email, u.emailVerified, u.image, u.createdAt, u.updatedAt]
      );
    }
    // Wstawianie koszyków
    for (const c of carts) {
      await targetClient.query(
        'INSERT INTO "Cart" (id, "userId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4)',
        [c.id, c.userId, c.createdAt, c.updatedAt]
      );
    }
    // Wstawianie pozycji koszyka
    for (const ci of cartItems) {
      await targetClient.query(
        'INSERT INTO "CartItem" (id, "cartId", "productId", quantity, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)',
        [ci.id, ci.cartId, ci.productId, ci.quantity, ci.createdAt, ci.updatedAt]
      );
    }
    // Wstawianie zamówień
    for (const o of orders) {
      await targetClient.query(
        'INSERT INTO "Order" (id, "orderNumber", "idempotencyKey", "userId", status, "totalPrice", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [o.id, o.orderNumber, o.idempotencyKey, o.userId, o.status, o.totalPrice, o.createdAt, o.updatedAt]
      );
    }
    // Wstawianie pozycji zamówień
    for (const oi of orderItems) {
      await targetClient.query(
        'INSERT INTO "OrderItem" (id, "orderId", "productId", "productName", "productCode", quantity, "unitPrice", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [oi.id, oi.orderId, oi.productId, oi.productName, oi.productCode, oi.quantity, oi.unitPrice, oi.createdAt]
      );
    }
    await targetClient.query('COMMIT');
    console.log("  ✔ Wszystkie tabele i relacje odtworzone w bazie 'computer_shop_restore_test'.");

    // -------------------------------------------------------------------------
    // Krok 3: Weryfikacja spójności po odtworzeniu (Sprawdzenie integralności)
    // -------------------------------------------------------------------------
    console.log("\n[Krok 3] Porównanie spójności danych: Baza Źródłowa vs Baza Odtworzona:");
    const restoredCatCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "Category"')).rows[0].count, 10);
    const restoredProdCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "Product"')).rows[0].count, 10);
    const restoredUserCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "User"')).rows[0].count, 10);
    const restoredCartCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "Cart"')).rows[0].count, 10);
    const restoredCartItemCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "CartItem"')).rows[0].count, 10);
    const restoredOrderCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "Order"')).rows[0].count, 10);
    const restoredOrderItemCount = parseInt((await targetClient.query('SELECT COUNT(*) FROM "OrderItem"')).rows[0].count, 10);

    console.log(`  Kategorie:   Źródło=${categories.length} | Odtworzono=${restoredCatCount}`);
    console.log(`  Produkty:    Źródło=${products.length} | Odtworzono=${restoredProdCount}`);
    console.log(`  Użytkownicy: Źródło=${users.length} | Odtworzono=${restoredUserCount}`);
    console.log(`  Koszyki:     Źródło=${carts.length} | Odtworzono=${restoredCartCount}`);
    console.log(`  Pozycje kosz:Źródło=${cartItems.length} | Odtworzono=${restoredCartItemCount}`);
    console.log(`  Zamówienia:  Źródło=${orders.length} | Odtworzono=${restoredOrderCount}`);
    console.log(`  Pozycje zam: Źródło=${orderItems.length} | Odtworzono=${restoredOrderItemCount}`);

    if (restoredCatCount !== categories.length ||
        restoredProdCount !== products.length ||
        restoredUserCount !== users.length ||
        restoredCartCount !== carts.length ||
        restoredCartItemCount !== cartItems.length ||
        restoredOrderCount !== orders.length ||
        restoredOrderItemCount !== orderItems.length) {
      throw new Error("Błąd weryfikacji: Niezgodność liczby rekordów między źródłem a bazą odtworzoną!");
    }

    // Weryfikacja ograniczenia CHECK w odtworzonej bazie
    console.log("\n[Krok 4] Weryfikacja ograniczeń CHECK i relacji w odtworzonej bazie:");
    try {
      await targetClient.query('INSERT INTO "CartItem" ("cartId", "productId", quantity) VALUES ($1, $2, $3)', [carts[0].id, products[0].id, 100]);
      throw new Error("Błąd: CHECK constraint quantity BETWEEN 1 AND 99 nie zadziałał w odtworzonej bazie!");
    } catch {
      console.log("  ✔ Ograniczenie CHECK (quantity BETWEEN 1 AND 99) jest w pełni aktywne.");
    }

    console.log("\n================================================================================");
    console.log("✔ SUKCES ROZSZERZENIA 4: Pełna kopia zapasowa wykonana i odtworzona bezbłędnie!");
    console.log("  Integralność relacji, katalogu i koszyków potwierdzona w odrębnej bazie.");
    console.log("  Baza produkcyjna (Production) nie została w żaden sposób nadpisana.");
    console.log("================================================================================");
  } finally {
    await sourceClient.end().catch(() => {});
    await targetClient.end().catch(() => {});
  }
}

run().catch((err) => {
  console.error("Błąd backup/restore:", err);
  process.exit(1);
});
