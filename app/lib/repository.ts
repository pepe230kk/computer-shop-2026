import "server-only";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { CatalogQueryCriteria } from "./params";

// 1. Zdefiniuj typ produktu i walidację rzeczywistych danych (Tabela 4.1).
export const ProductSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().length(10).regex(/^[A-Z0-9]+$/),
  name: z.string().min(1),
  type: z.enum(["cpu", "gpu", "ram", "disk"]),
  price: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
  description: z.string(),
  date: z.string().datetime(), // ISO 8601 UTC
  image: z.string().url().or(z.string().startsWith("/")),
});

export type Product = z.infer<typeof ProductSchema>;

export const ProductListSchema = z.array(ProductSchema).refine((items) => {
  const ids = new Set<number>();
  const codes = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) return false; // Duplicate ID
    if (codes.has(item.code)) return false; // Duplicate Code
    ids.add(item.id);
    codes.add(item.code);
  }
  return true;
}, "Duplicate ID or Code in data");

const dataPath = path.join(process.cwd(), "data", "products.json");

// Asynchroniczny odczyt
async function getProductsData(): Promise<Product[]> {
  const fileContents = await fs.readFile(dataPath, "utf8");
  const data = JSON.parse(fileContents);
  
  // Zod validation
  const parsed = ProductListSchema.safeParse(data);
  if (!parsed.success) {
    console.error("Data validation failed", parsed.error);
    throw new Error("Invalid data in repository");
  }
  
  return parsed.data;
}

// 2. Moduł repozytorium:
export type SortOption = "name" | "newest" | "name-desc" | "date-desc";

export interface GetProductsOptions extends Partial<CatalogQueryCriteria> {
  sortBy?: SortOption;
  category?: Product["type"] | "all";
  availableOnly?: boolean;
}

export async function getProducts(options?: GetProductsOptions): Promise<Product[]> {
  const allProducts = await getProductsData();
  // Kopia tablicy - gwarancja niemutowania danych wejściowych
  let products = [...allProducts];

  // 1. Filtr kategorii (type)
  const categoryFilter = options?.type || options?.category;
  if (categoryFilter && categoryFilter !== "all") {
    products = products.filter((p) => p.type === categoryFilter);
  }

  // 2. Filtr dostępności (stock)
  if (options?.stock === "available" || options?.availableOnly === true) {
    products = products.filter((p) => p.amount > 0);
  } else if (options?.stock === "unavailable") {
    products = products.filter((p) => p.amount === 0);
  }

  // 3. Sortowanie i rozstrzyganie remisów przez id rosnąco
  const sortMode = options?.sort || options?.sortBy || "name";

  products.sort((a, b) => {
    if (sortMode === "newest" || sortMode === "date-desc") {
      const cmp = new Date(b.date).getTime() - new Date(a.date).getTime();
      return cmp !== 0 ? cmp : a.id - b.id; // remisy: id rosnąco
    } else if (sortMode === "name-desc") {
      const cmp = b.name.localeCompare(a.name, "pl");
      return cmp !== 0 ? cmp : b.id - a.id;
    } else {
      // Domyślnie "name" (nazwa rosnąco wg alfabetu, remisy: id rosnąco)
      const cmp = a.name.localeCompare(b.name, "pl");
      return cmp !== 0 ? cmp : a.id - b.id; // remisy: id rosnąco
    }
  });

  return products;
}

export async function getProductById(id: number): Promise<Product | null> {
  const products = await getProductsData();
  const product = products.find((p) => p.id === id);
  return product || null;
}
