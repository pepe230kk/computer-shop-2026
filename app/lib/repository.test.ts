import test from "node:test";
import assert from "node:assert";
import { getProducts, getProductById, ProductListSchema } from "./repository";

test("repository tests", async (t) => {
  await t.test("getProducts returns a list", async () => {
    const products = await getProducts();
    assert.ok(Array.isArray(products));
    assert.ok(products.length > 0);
  });

  await t.test("getProducts sorts by name descending", async () => {
    const products = await getProducts({ sortBy: "name-desc" });
    assert.ok(products[0].name.localeCompare(products[products.length - 1].name) >= 0);
  });

  await t.test("getProducts filters available products", async () => {
    const products = await getProducts({ availableOnly: true });
    assert.ok(products.every(p => p.amount > 0));
  });

  await t.test("getProductById returns correct product", async () => {
    const products = await getProducts();
    const firstId = products[0].id;
    const product = await getProductById(firstId);
    assert.strictEqual(product?.id, firstId);
  });

  await t.test("getProductById returns null for missing product", async () => {
    const product = await getProductById(999999);
    assert.strictEqual(product, null);
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
