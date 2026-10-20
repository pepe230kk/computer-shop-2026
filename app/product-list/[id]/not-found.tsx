import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="error content-box" style={{ padding: "3rem 1.5rem" }}>
      <h2 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Produkt nie został znaleziony</h2>
      <p style={{ color: "#bcbcb7", marginBottom: "2rem", fontSize: "1.1rem" }}>
        Przepraszamy, ale produkt o podanym identyfikatorze nie istnieje w bazie sklepu
        lub przekazany identyfikator ma niepoprawny format.
      </p>
      <Link href="/product-list" className="btn-action">
        &larr; Wróć do katalogu produktów
      </Link>
    </div>
  );
}
