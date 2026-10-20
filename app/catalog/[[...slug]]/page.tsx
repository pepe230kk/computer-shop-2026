import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getProducts, getProductById, Product } from "../../lib/repository";
import { parseAndValidateId } from "../../lib/params";

interface CatalogCatchAllProps {
  params: Promise<{ slug?: string[] }>;
}

const VALID_CATEGORIES = new Set(["cpu", "gpu", "ram", "disk"]);

export async function generateMetadata({ params }: CatalogCatchAllProps): Promise<Metadata> {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    return { title: "Katalog wielopoziomowy (Rozszerzenie [[...slug]]) | Sklep Komputerowy" };
  }

  if (slug.length === 1) {
    const category = slug[0].toLowerCase();
    if (!VALID_CATEGORIES.has(category)) {
      return { title: "Nie znaleziono kategorii | Sklep Komputerowy" };
    }
    return { title: `Kategoria: ${category.toUpperCase()} | Sklep Komputerowy` };
  }

  if (slug.length === 2) {
    const [category, rawId] = slug;
    const numId = parseAndValidateId(rawId);
    if (!VALID_CATEGORIES.has(category.toLowerCase()) || numId === null) {
      return { title: "Nie znaleziono produktu | Sklep Komputerowy" };
    }
    const product = await getProductById(numId);
    if (!product || product.type !== category.toLowerCase()) {
      return { title: "Nie znaleziono produktu | Sklep Komputerowy" };
    }
    return { title: `${product.name} (${category.toUpperCase()}) | Sklep Komputerowy` };
  }

  return { title: "Nie znaleziono | Sklep Komputerowy" };
}

export default async function CatalogCatchAllPage({ params }: CatalogCatchAllProps) {
  const { slug } = await params;

  // 1. Scenariusz: /catalog (slug jest undefined lub pusty w [[...slug]])
  // W przypadku [...slug] ta ścieżka wymagałaby osobnego pliku app/catalog/page.tsx
  if (!slug || slug.length === 0) {
    const products = await getProducts();
    const categories: Array<{ id: Product["type"]; label: string; count: number }> = [
      { id: "cpu", label: "Procesory (CPU)", count: products.filter(p => p.type === "cpu").length },
      { id: "gpu", label: "Karty graficzne (GPU)", count: products.filter(p => p.type === "gpu").length },
      { id: "ram", label: "Pamięci RAM", count: products.filter(p => p.type === "ram").length },
      { id: "disk", label: "Dyski (SSD/HDD)", count: products.filter(p => p.type === "disk").length },
    ];

    return (
      <div>
        <h1>Katalog wielopoziomowy (Rozszerzenie [[...slug]])</h1>
        <p style={{ color: "#bcbcb7", marginBottom: "2rem" }}>
          Demonstracja segmentów opcjonalnych Catch-all (<code>[[...slug]]</code>) w odrębnej sekcji trasy.
        </p>
        <div className="product-list">
          {categories.map((cat) => (
            <div key={cat.id} className="product-card" style={{ textAlign: "center", padding: "2rem" }}>
              <h2>{cat.label}</h2>
              <p style={{ color: "#bcbcb7", margin: "1rem 0" }}>Liczba produktów: <strong>{cat.count}</strong></p>
              <Link href={`/catalog/${cat.id}`} className="btn-action" style={{ display: "inline-block" }}>
                Przeglądaj kategorię &rarr;
              </Link>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Scenariusz: /catalog/[category] (slug.length === 1)
  if (slug.length === 1) {
    const category = slug[0].toLowerCase() as Product["type"];
    if (!VALID_CATEGORIES.has(category)) {
      notFound();
    }

    const categoryProducts = await getProducts({ category });

    return (
      <div>
        <nav aria-label="Okruszki" style={{ marginBottom: "1.5rem" }}>
          <Link href="/catalog" className="btn-action" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
            &larr; Wróć do wyboru kategorii
          </Link>
        </nav>
        <h1>Kategoria: {category.toUpperCase()}</h1>
        <p style={{ color: "#bcbcb7" }}>Liczba produktów w kategorii: <strong>{categoryProducts.length}</strong></p>
        <div className="product-list">
          {categoryProducts.map((p) => (
            <article key={p.id} className="product-card">
              <div className="product-image-container">
                <Image src={p.image} alt={p.name} fill sizes="260px" style={{ objectFit: "cover" }} />
              </div>
              <div className="product-meta">
                <span className="product-category">{p.type}</span>
                <span className="product-code">{p.code}</span>
              </div>
              <h2>{p.name}</h2>
              <div className="product-price">{(p.price / 100).toFixed(2)} zł</div>
              <Link href={`/catalog/${category}/${p.id}`} className="btn-action" style={{ textAlign: "center", marginTop: "1rem" }}>
                Szczegóły w /catalog
              </Link>
            </article>
          ))}
        </div>
      </div>
    );
  }

  // 3. Scenariusz: /catalog/[category]/[id] (slug.length === 2)
  if (slug.length === 2) {
    const [rawCategory, rawId] = slug;
    const category = rawCategory.toLowerCase();
    const numId = parseAndValidateId(rawId);

    if (!VALID_CATEGORIES.has(category) || numId === null) {
      notFound();
    }

    const product = await getProductById(numId);
    // Walidacja zgodności kategorii produktu z segmentem URL
    if (!product || product.type !== category) {
      notFound();
    }

    return (
      <div>
        <nav aria-label="Okruszki" style={{ marginBottom: "1.5rem" }}>
          <Link href={`/catalog/${category}`} className="btn-action" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
            &larr; Wróć do kategorii {category.toUpperCase()}
          </Link>
        </nav>
        <article className="content-box product-detail-card">
          <div className="product-detail-layout">
            <div className="product-detail-image-box">
              <Image src={product.image} alt={product.name} fill priority sizes="350px" style={{ objectFit: "contain" }} />
            </div>
            <div className="product-detail-info">
              <div className="product-meta">
                <span className="product-category">{product.type}</span>
                <span className="product-code">{product.code}</span>
              </div>
              <h1>{product.name}</h1>
              <div className="product-price" style={{ fontSize: "2rem", margin: "1rem 0" }}>
                {(product.price / 100).toFixed(2)} zł
              </div>
              <p style={{ lineHeight: "1.6" }}>{product.description}</p>
              <div style={{ marginTop: "1.5rem", color: "#bcbcb7", fontSize: "0.9rem" }}>
                Stan: {product.amount} szt. | Trasa: <code>/catalog/{category}/{product.id}</code>
              </div>
            </div>
          </div>
        </article>
      </div>
    );
  }

  // 4. Scenariusz: slug.length > 2 -> niedozwolona liczba segmentów
  notFound();
}
