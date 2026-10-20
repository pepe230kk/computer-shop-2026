import test from "node:test";
import assert from "node:assert";
import { getProducts, getProductById, ProductListSchema } from "./repository";
import { parseCatalogQueryParams, parseAndValidateId } from "./params";

test("repository tests", async (t) => {
  await t.test("getProducts returns a list", async () => {
    const products = await getProducts();
    assert.ok(Array.isArray(products));
    assert.ok(products.length > 0);
  });

  await t.test("getProducts sorts by name ascending by default with id tie-breaker", async () => {
    const products = await getProducts({ sort: "name" });
    for (let i = 0; i < products.length - 1; i++) {
      const cmp = products[i].name.localeCompare(products[i + 1].name, "pl");
      if (cmp === 0) {
        assert.ok(products[i].id < products[i + 1].id, "Ties should be broken by id ascending");
      } else {
        assert.ok(cmp <= 0, "Products should be sorted by name ascending");
      }
    }
  });

  await t.test("getProducts sorts by newest descending with id tie-breaker", async () => {
    const products = await getProducts({ sort: "newest" });
    for (let i = 0; i < products.length - 1; i++) {
      const timeA = new Date(products[i].date).getTime();
      const timeB = new Date(products[i + 1].date).getTime();
      if (timeA === timeB) {
        assert.ok(products[i].id < products[i + 1].id, "Ties should be broken by id ascending");
      } else {
        assert.ok(timeA >= timeB, "Products should be sorted by date descending");
      }
    }
  });

  await t.test("getProducts filters available products (amount > 0)", async () => {
    const products = await getProducts({ stock: "available" });
    assert.ok(products.length > 0);
    assert.ok(products.every(p => p.amount > 0));
  });

  await t.test("getProducts filters unavailable products (amount === 0)", async () => {
    const products = await getProducts({ stock: "unavailable" });
    assert.ok(products.length > 0);
    assert.ok(products.every(p => p.amount === 0));
  });

  await t.test("getProducts filters by category type", async () => {
    const products = await getProducts({ type: "cpu" });
    assert.ok(products.length > 0);
    assert.ok(products.every(p => p.type === "cpu"));
  });

  await t.test("getProducts combined filters work", async () => {
    const products = await getProducts({ type: "gpu", stock: "available", sort: "newest" });
    assert.ok(products.every(p => p.type === "gpu" && p.amount > 0));
  });

  await t.test("getProducts does not mutate original data", async () => {
    const firstCall = await getProducts();
    const firstId = firstCall[0].id;
    await getProducts({ sort: "newest" });
    const thirdCall = await getProducts();
    assert.strictEqual(thirdCall[0].id, firstId);
  });

  await t.test("getProductById returns correct product", async () => {
    const products = await getProducts();
    const firstId = products[0].id;
    const product = await getProductById(firstId);
    assert.strictEqual(product?.id, firstId);
  });

  await t.test("getProductById returns product with amount === 0", async () => {
    const unavailableProducts = await getProducts({ stock: "unavailable" });
    assert.ok(unavailableProducts.length > 0);
    const zeroStockProduct = await getProductById(unavailableProducts[0].id);
    assert.ok(zeroStockProduct !== null);
    assert.strictEqual(zeroStockProduct.amount, 0);
  });

  await t.test("getProductById returns null for missing product", async () => {
    const product = await getProductById(999999);
    assert.strictEqual(product, null);
  });

  await t.test("immediate visibility of stock update in repository (wymóg z Lab 08)", async () => {
    const products = await getProducts();
    const testProduct = products[0];
    const originalAmount = testProduct.amount;
    const updatedAmount = originalAmount + 17;

    // Aktualizacja w bazie danych przez klienta Prisma
    const { prisma } = await import("./db");
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { amount: updatedAmount },
    });

    // Natychmiastowe odczytanie przez repozytorium
    const freshProduct = await getProductById(testProduct.id);
    assert.strictEqual(freshProduct?.amount, updatedAmount, "Repository must immediately reflect updated stock in PostgreSQL");

    // Przywrócenie stanu początkowego
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { amount: originalAmount },
    });

    const restoredProduct = await getProductById(testProduct.id);
    assert.strictEqual(restoredProduct?.amount, originalAmount);
  });

  await t.test("database enforces CHECK constraint for non-negative amount", async () => {
    const { prisma } = await import("./db");
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          'UPDATE "Product" SET "amount" = -10 WHERE "id" = 1'
        );
      },
      /violates check constraint "product_amount_nonnegative"/
    );
  });
});

test("parameter interpretation tests (Tabela 4.1 & Sec 6)", async (t) => {
  await t.test("poprawna kombinacja parametrów", () => {
    const parsed = parseCatalogQueryParams({
      type: "gpu",
      stock: "available",
      sort: "newest",
    });
    assert.deepStrictEqual(parsed.criteria, {
      type: "gpu",
      stock: "available",
      sort: "newest",
    });
    assert.strictEqual(parsed.warnings.length, 0);
  });

  await t.test("brak wartości (puste searchParams) -> wartości domyślne", () => {
    const parsed = parseCatalogQueryParams({});
    assert.deepStrictEqual(parsed.criteria, {
      type: "all",
      stock: "all",
      sort: "name",
    });
    assert.strictEqual(parsed.warnings.length, 0);
  });

  await t.test("nieznana wartość parametru -> wartość domyślna i ostrzeżenie", () => {
    const parsed = parseCatalogQueryParams({
      type: "nieznanyTyp",
      stock: "all",
      sort: "name",
    });
    assert.strictEqual(parsed.criteria.type, "all");
    assert.ok(parsed.warnings.length > 0);
    assert.ok(parsed.warnings[0].includes("type"));
  });

  await t.test("pusty tekst parametru -> wartość domyślna i ostrzeżenie", () => {
    const parsed = parseCatalogQueryParams({
      type: "",
      stock: "",
      sort: "",
    });
    assert.deepStrictEqual(parsed.criteria, {
      type: "all",
      stock: "all",
      sort: "name",
    });
    assert.strictEqual(parsed.warnings.length, 3);
  });

  await t.test("powtórzony klucz (tablica parametrów) -> wartość domyślna i ostrzeżenie", () => {
    const parsed = parseCatalogQueryParams({
      type: ["gpu", "cpu"],
      sort: "newest",
    });
    assert.strictEqual(parsed.criteria.type, "all");
    assert.strictEqual(parsed.criteria.sort, "newest");
    assert.strictEqual(parsed.warnings.length, 1);
    assert.ok(parsed.warnings[0].includes("powtórzony"));
  });

  await t.test("nieznane nazwy parametrów są ignorowane bez ostrzeżeń", () => {
    const parsed = parseCatalogQueryParams({
      nieznanyKlucz: "test",
      foo: "bar",
      type: "cpu",
    });
    assert.strictEqual(parsed.criteria.type, "cpu");
    assert.strictEqual(parsed.warnings.length, 0);
  });
});

test("route id validation tests (Tabela 6.1)", async (t) => {
  await t.test("poprawne identyfikatory", () => {
    assert.strictEqual(parseAndValidateId("1"), 1);
    assert.strictEqual(parseAndValidateId("42"), 42);
    assert.strictEqual(parseAndValidateId("2147483647"), 2147483647);
  });

  await t.test("odrzucenie błędnych formatów", () => {
    assert.strictEqual(parseAndValidateId("abc"), null);
    assert.strictEqual(parseAndValidateId("12abc"), null);
    assert.strictEqual(parseAndValidateId("0"), null);
    assert.strictEqual(parseAndValidateId("-1"), null);
    assert.strictEqual(parseAndValidateId("01"), null);
    assert.strictEqual(parseAndValidateId("1.5"), null);
    assert.strictEqual(parseAndValidateId(""), null);
    assert.strictEqual(parseAndValidateId(undefined), null);
    assert.strictEqual(parseAndValidateId(null), null);
  });

  await t.test("odrzucenie wartości poza zakresem i liczb niebezpiecznych", () => {
    assert.strictEqual(parseAndValidateId("2147483648"), null);
    assert.strictEqual(parseAndValidateId("99999999999999999999999"), null);
  });
});

test("validation tests", async (t) => {
  await t.test("rejects negative price", () => {
    const data = [{
      id: 1,
      code: "ABCDEFGHIJ",
      name: "Test",
      type: "cpu",
      price: -10, // Invalid
      amount: 10,
      description: "Desc",
      date: new Date().toISOString(),
      image: "/images/products/cpu.webp"
    }];
    const parsed = ProductListSchema.safeParse(data);
    assert.strictEqual(parsed.success, false);
  });

  await t.test("rejects duplicate id", () => {
    const data = [
      {
        id: 1,
        code: "ABCDEFGHIJ",
        name: "Test1",
        type: "cpu",
        price: 100,
        amount: 10,
        description: "Desc",
        date: new Date().toISOString(),
        image: "/images/products/cpu.webp"
      },
      {
        id: 1, // Duplicate
        code: "ABCDEFGHI2",
        name: "Test2",
        type: "gpu",
        price: 200,
        amount: 5,
        description: "Desc",
        date: new Date().toISOString(),
        image: "/images/products/gpu.webp"
      }
    ];
    const parsed = ProductListSchema.safeParse(data);
    assert.strictEqual(parsed.success, false);
  });
});
