import "server-only";
import { prisma } from "./db";
import { Product, ProductSchema, ProductListSchema } from "./product-schema";
import { CatalogQueryCriteria } from "./params";
import { Prisma } from "@/lib/generated/prisma/client";

export { ProductSchema, ProductListSchema };
export type { Product };

export type SortOption = "name" | "newest" | "name-desc" | "date-desc";

export interface GetProductsOptions extends Partial<CatalogQueryCriteria> {
  sortBy?: SortOption;
  category?: Product["type"] | "all";
  availableOnly?: boolean;
}

/**
 * Pobiera listę produktów z bazy danych PostgreSQL za pomocą Prisma.
 * Zapytanie buduje warunki WHERE oraz ORDER BY na poziomie bazy danych,
 * bez nieefektywnego pobierania całej tabeli do pamięci procesu.
 */
export async function getProducts(options?: GetProductsOptions): Promise<Product[]> {
  const where: Prisma.ProductWhereInput = {};

  // 1. Filtr kategorii (type)
  const categoryFilter = options?.type || options?.category;
  if (categoryFilter && categoryFilter !== "all") {
    where.category = {
      code: categoryFilter,
    };
  }

  // 2. Filtr dostępności (stock)
  if (options?.stock === "available" || options?.availableOnly === true) {
    where.amount = { gt: 0 };
  } else if (options?.stock === "unavailable") {
    where.amount = { equals: 0 };
  }

  // 3. Sortowanie według wytycznych z Lab 08:
  // - name: [{ nameSortKey: "asc" }, { id: "asc" }] (reguła COLLATE "C" w PostgreSQL zapewnia porządek bajtów UTF-8)
  // - newest: [{ date: "desc" }, { id: "asc" }]
  const sortMode = options?.sort || options?.sortBy || "name";
  let orderBy: Prisma.ProductOrderByWithRelationInput[];

  if (sortMode === "newest" || sortMode === "date-desc") {
    orderBy = [{ date: "desc" }, { id: "asc" }];
  } else if (sortMode === "name-desc") {
    orderBy = [{ nameSortKey: "desc" }, { id: "desc" }];
  } else {
    // Domyślnie "name"
    orderBy = [{ nameSortKey: "asc" }, { id: "asc" }];
  }

  // W razie awarii bazy danych, Prisma rzuci błąd, który odrzuci Promise (nie zamieniamy awarii na pustą listę)
  const rows = await prisma.product.findMany({
    where,
    orderBy,
    include: {
      category: true,
    },
  });

  // Mapowanie rekordu bazy na model domenowy aplikacji
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.category.code as Product["type"],
    price: r.price,
    amount: r.amount,
    description: r.description,
    date: r.date.toISOString(),
    image: r.image,
  }));
}

/**
 * Pobiera pojedynczy produkt po ID z bazy danych PostgreSQL.
 * Wartości ID spoza zakresu 1..2147483647 są odrzucane przed wysłaniem zapytania.
 */
export async function getProductById(id: number): Promise<Product | null> {
  if (id < 1 || id > 2147483647 || !Number.isSafeInteger(id)) {
    return null;
  }

  const row = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
    },
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.category.code as Product["type"],
    price: row.price,
    amount: row.amount,
    description: row.description,
    date: row.date.toISOString(),
    image: row.image,
  };
}
