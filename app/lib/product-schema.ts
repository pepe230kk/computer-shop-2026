import { z } from "zod";

// Zdefiniuj typ produktu i walidację rzeczywistych danych (Tabela 4.1 z Lab 06 / Lab 08).
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
