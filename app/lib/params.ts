export type ProductTypeFilter = "all" | "cpu" | "gpu" | "ram" | "disk";
export type StockFilter = "all" | "available" | "unavailable";
export type SortFilter = "name" | "newest";

export interface CatalogQueryCriteria {
  type: ProductTypeFilter;
  stock: StockFilter;
  sort: SortFilter;
}

export interface ParsedCatalogParams {
  criteria: CatalogQueryCriteria;
  warnings: string[];
}

const ALLOWED_TYPES = new Set<string>(["all", "cpu", "gpu", "ram", "disk"]);
const ALLOWED_STOCKS = new Set<string>(["all", "available", "unavailable"]);
const ALLOWED_SORTS = new Set<string>(["name", "newest"]);

export const DEFAULT_CATALOG_CRITERIA: CatalogQueryCriteria = {
  type: "all",
  stock: "all",
  sort: "name",
};

/**
 * Interpretuje surowy obiekt searchParams z URL:
 * - brakujący parametr -> wartość domyślna
 * - nieznana, pusta albo powtórzona wartość -> wartość domyślna + ostrzeżenie
 * - nieznane nazwy parametrów -> ignorowane bez ostrzeżeń
 */
export function parseCatalogQueryParams(
  rawParams?: Record<string, string | string[] | undefined> | null
): ParsedCatalogParams {
  const warnings: string[] = [];
  const criteria: CatalogQueryCriteria = { ...DEFAULT_CATALOG_CRITERIA };

  if (!rawParams) {
    return { criteria, warnings };
  }

  // 1. Parametr type
  if (rawParams.type !== undefined) {
    if (Array.isArray(rawParams.type)) {
      warnings.push("Wykryto powtórzony parametr 'type'. Zastosowano wartość domyślną ('all').");
    } else if (rawParams.type === "") {
      warnings.push("Pusty parametr 'type'. Zastosowano wartość domyślną ('all').");
    } else if (!ALLOWED_TYPES.has(rawParams.type)) {
      warnings.push(`Nieznana wartość parametru 'type' ("${rawParams.type}"). Zastosowano wartość domyślną ('all').`);
    } else {
      criteria.type = rawParams.type as ProductTypeFilter;
    }
  }

  // 2. Parametr stock
  if (rawParams.stock !== undefined) {
    if (Array.isArray(rawParams.stock)) {
      warnings.push("Wykryto powtórzony parametr 'stock'. Zastosowano wartość domyślną ('all').");
    } else if (rawParams.stock === "") {
      warnings.push("Pusty parametr 'stock'. Zastosowano wartość domyślną ('all').");
    } else if (!ALLOWED_STOCKS.has(rawParams.stock)) {
      warnings.push(`Nieznana wartość parametru 'stock' ("${rawParams.stock}"). Zastosowano wartość domyślną ('all').`);
    } else {
      criteria.stock = rawParams.stock as StockFilter;
    }
  }

  // 3. Parametr sort
  if (rawParams.sort !== undefined) {
    if (Array.isArray(rawParams.sort)) {
      warnings.push("Wykryto powtórzony parametr 'sort'. Zastosowano wartość domyślną ('name').");
    } else if (rawParams.sort === "") {
      warnings.push("Pusty parametr 'sort'. Zastosowano wartość domyślną ('name').");
    } else if (!ALLOWED_SORTS.has(rawParams.sort)) {
      warnings.push(`Nieznana wartość parametru 'sort' ("${rawParams.sort}"). Zastosowano wartość domyślną ('name').`);
    } else {
      criteria.sort = rawParams.sort as SortFilter;
    }
  }

  return { criteria, warnings };
}

/**
 * Waliduje surowy identyfikator trasy [id]:
 * - przyjmuje wyłącznie cyfry dziesiętne bez znaku i zer wiodących (/^[1-9]\d*$/)
 * - zakres: od 1 do 2147483647
 * - sprawdza Number.isSafeInteger
 * - odrzuca '12abc', 'abc', '-1', '0', '01', 2147483648 itp.
 */
export function parseAndValidateId(rawId: string | undefined | null): number | null {
  if (typeof rawId !== "string") {
    return null;
  }

  // Dokładne dopasowanie: cyfry dziesiętne bez znaku i bez zer wiodących
  if (!/^[1-9]\d*$/.test(rawId)) {
    return null;
  }

  const num = Number(rawId);
  if (!Number.isSafeInteger(num)) {
    return null;
  }

  if (num < 1 || num > 2147483647) {
    return null;
  }

  return num;
}
