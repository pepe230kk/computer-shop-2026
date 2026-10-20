import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { getProducts } from "../lib/repository";
import { parseCatalogQueryParams } from "../lib/params";
import ProductFilters from "./product-filters";

// Wymuszenie dynamicznego renderowania zgodnie z wytycznymi Lab 08
export const dynamic = "force-dynamic";

interface ProductListPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductList({ searchParams }: ProductListPageProps) {
  // Wymuszenie dynamicznego wykonania po stronie serwera przed zapytaniem do bazy danych
  await connection();

  // 1. Asynchroniczny odczyt searchParams po stronie serwerowej (Next.js 15/16)
  const rawParams = await searchParams;

  // 2. Walidacja i interpretacja parametrów URL (oddzielona od repozytorium)
  const { criteria, warnings } = parseCatalogQueryParams(rawParams);

  // 3. Pobranie danych z repozytorium na podstawie zwalidowanych kryteriów
  const products = await getProducts(criteria);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Katalog produktów</h1>
        <p style={{ color: "#bcbcb7", margin: 0, fontSize: "0.95rem" }}>
          Liczba pozycji w widoku: <strong>{products.length}</strong>
        </p>
      </div>

      {/* Komunikaty o zignorowanych/błędnych parametrach (wymóg z sekcji 4) */}
      {warnings.length > 0 && (
        <div className="filter-warnings" role="alert" style={{
          backgroundColor: "rgba(255, 107, 107, 0.15)",
          border: "1px solid #ff6b6b",
          borderRadius: "8px",
          padding: "1rem 1.5rem",
          marginBottom: "1.5rem",
          color: "#ffe3e3"
        }}>
          <strong>Informacja o parametrach zapytania:</strong>
          <ul style={{ margin: "0.5rem 0 0 1.25rem", listStyle: "disc" }}>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Kontrolki filtrowania i sortowania owinięte w Suspense (dla optymalnego prerenderowania) */}
      <Suspense fallback={<div className="content-box" style={{ padding: "1rem", textAlign: "center" }}>Ładowanie filtrów...</div>}>
        <ProductFilters initialCriteria={criteria} />
      </Suspense>

      {/* Widok w przypadku pustej listy wynikowej (wymóg z sekcji 4) */}
      {products.length === 0 ? (
        <div className="content-box" style={{ textAlign: "center", padding: "3rem" }}>
          <h2>Brak produktów</h2>
          <p style={{ color: "#bcbcb7", margin: "1rem 0 2rem 0" }}>
            Żaden produkt nie spełnia obecnie wybranych kryteriów filtrowania.
          </p>
          <Link href="/product-list" className="btn-action">
            Wyczyść filtry
          </Link>
        </div>
      ) : (
        <div className="product-list">
          {products.map((product) => (
            <article key={product.id} className="product-card">
              <Link
                href={`/product-list/${product.id}`}
                className="product-image-container"
                style={{ display: "block" }}
                aria-label={`Przejdź do szczegółów produktu ${product.name}`}
              >
                <Image 
                  src={product.image} 
                  alt={`Zdjęcie produktu ${product.name}`} 
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 260px"
                  style={{ objectFit: "cover" }}
                />
              </Link>
              <div className="product-meta">
                <span className="product-category">{product.type}</span>
                <span className="product-code">{product.code}</span>
              </div>
              <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.5rem 0" }}>
                <Link
                  href={`/product-list/${product.id}`}
                  style={{ color: "#ffffff", textDecoration: "none" }}
                >
                  {product.name}
                </Link>
              </h2>
              <div className="product-price">
                {(product.price / 100).toFixed(2)} zł
              </div>
              <div className={`product-stock ${product.amount > 0 ? 'in' : 'out'}`}>
                Dostępność: {product.amount > 0 ? `${product.amount} szt.` : "Brak w magazynie"}
              </div>
              <div style={{ marginTop: "1rem" }}>
                <Link
                  href={`/product-list/${product.id}`}
                  className="btn-action"
                  style={{ display: "block", textAlign: "center", padding: "0.5rem 1rem", fontSize: "0.9rem" }}
                >
                  Szczegóły produktu
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
