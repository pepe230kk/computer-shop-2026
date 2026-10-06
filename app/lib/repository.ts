import "server-only";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";

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
export type SortOption = "name-desc" | "date-desc";

export async function getProducts(options?: {
  sortBy?: SortOption;
  availableOnly?: boolean;
  category?: Product["type"];
}): Promise<Product[]> {
  let products = await getProductsData();

  if (options?.availableOnly) {
    products = products.filter((p) => p.amount > 0);
  }

  if (options?.category) {
    products = products.filter((p) => p.type === options.category);
  }

  if (options?.sortBy) {
    // Nie mutuj wejściowego zbioru (to filter() i [...products] zapewniają)
    products = [...products].sort((a, b) => {
      if (options.sortBy === "name-desc") {
        const cmp = b.name.localeCompare(a.name);
        return cmp !== 0 ? cmp : b.id - a.id; // rozstrzyganie remisów
      } else if (options.sortBy === "date-desc") {
        const cmp = new Date(b.date).getTime() - new Date(a.date).getTime();
        return cmp !== 0 ? cmp : b.id - a.id; // rozstrzyganie remisów
      }
      return 0;
    });
  }

  return products;
}

export async function getProductById(id: number): Promise<Product | null> {
  const products = await getProductsData();
  const product = products.find((p) => p.id === id);
  return product || null;
}
