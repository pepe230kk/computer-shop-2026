import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getProductById } from "../../lib/repository";
import { parseAndValidateId } from "../../lib/params";
import AddToCartButton from "../../components/add-to-cart-button";

// Zgodnie z wytycznymi Lab 08 (Sekcja 7):
// Usunięto generateStaticParams z Lab 07. Wymuszone dynamiczne renderowanie (force-dynamic),
// aby strona zawsze odzwierciedlała bieżący stan magazynowy (amount) bezpośrednio z bazy danych PostgreSQL.
export const dynamic = "force-dynamic";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

// Dynamiczne generowanie metadanych (tytuł i opis strony)
export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const numericId = parseAndValidateId(id);

  if (numericId === null) {
    return {
      title: "Produkt nie został znaleziony | Sklep Komputerowy",
    };
  }

  // W razie awarii repozytorium, błąd nie jest łapany (nie ukrywamy awarii jako 404)
  const product = await getProductById(numericId);
  if (!product) {
    return {
      title: "Produkt nie został znaleziony | Sklep Komputerowy",
    };
  }

  return {
    title: `${product.name} | Sklep Komputerowy`,
    description: product.description,
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  // Wymuszenie dynamicznego wykonania po stronie serwera przed zapytaniem do bazy danych
  await connection();

  // 1. Asynchroniczne rozwiązanie params przez await (wymóg Next.js 15/16)
  const { id } = await params;

  // 2. Rygorystyczna walidacja ID:
  // - od 1 do 2147483647
  // - cyfry dziesiętne bez znaku i zer wiodących
  // - odrzucenie '12abc', 'abc', '-1', '0', '01', 2147483648
  const numericId = parseAndValidateId(id);
  if (numericId === null) {
    notFound();
  }

  // 3. Odczyt z asynchronicznego repozytorium serwerowego (Prisma / PostgreSQL)
  // Nie opakowujemy w try/catch zwracający notFound(), aby nie maskować awarii serwera
  const product = await getProductById(numericId);
  if (!product) {
    notFound();
  }

  // Formatowanie ceny w złotych z groszy
  const formattedPrice = (product.price / 100).toFixed(2);
  const formattedDate = new Date(product.date).toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="product-detail-container">
      {/* Link powrotu do katalogu (działa także przy bezpośrednim wejściu bez historii przeglądarki) */}
      <nav aria-label="Nawigacja okruszkowa" style={{ marginBottom: "1.5rem" }}>
        <Link href="/product-list" className="btn-action" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
          &larr; Wróć do katalogu produktów
        </Link>
      </nav>

      <article className="content-box product-detail-card">
        <div className="product-detail-layout">
          {/* Obraz produktu zgodnie z wytycznymi Image z Lab 06 */}
          <div className="product-detail-image-box">
            <Image
              src={product.image}
              alt={`Zdjęcie produktu ${product.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              priority
              style={{ objectFit: "contain" }}
            />
          </div>

          <div className="product-detail-info">
            <div className="product-meta" style={{ marginBottom: "0.5rem" }}>
              <span className="product-category">{product.type}</span>
              <span className="product-code">Kod: {product.code}</span>
            </div>

            <h1 style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>{product.name}</h1>

            <div className="product-price" style={{ fontSize: "2rem", marginBottom: "1rem" }}>
              {formattedPrice} zł
            </div>

            <div className={`product-stock ${product.amount > 0 ? "in" : "out"}`} style={{ fontSize: "1.1rem", marginBottom: "1.5rem" }}>
              Stan magazynowy:{" "}
              <strong>{product.amount > 0 ? `${product.amount} szt.` : "Produkt chwilowo niedostępny (0 szt.)"}</strong>
            </div>

            <div style={{ marginBottom: "1.5rem", maxWidth: "240px" }}>
              <AddToCartButton productId={product.id} disabled={product.amount <= 0} />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Opis produktu</h2>
              <p style={{ lineHeight: "1.6", color: "#e5e5e1" }}>{product.description}</p>
            </div>

            <div style={{ color: "#bcbcb7", fontSize: "0.85rem", borderTop: "1px solid rgba(229, 229, 225, 0.2)", paddingTop: "1rem" }}>
              <p style={{ margin: 0 }}>Identyfikator w bazie: <strong>{product.id}</strong></p>
              <p style={{ margin: "0.25rem 0 0 0" }}>Data wprowadzenia do oferty: {formattedDate}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
