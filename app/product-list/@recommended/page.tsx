import Image from "next/image";
import Link from "next/link";
import { getProducts } from "../../lib/repository";

export default async function RecommendedProductsSlot() {
  // Dobór deterministyczny: pierwsze 3 produkty o stanie > 0 posortowane rosnąco po ID
  const allProducts = await getProducts();
  const recommended = [...allProducts]
    .filter((p) => p.amount > 0)
    .sort((a, b) => a.id - b.id)
    .slice(0, 3);

  return (
    <aside className="content-box recommended-panel" style={{ marginTop: "3rem", borderTop: "2px solid #ffe066" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <h2 style={{ fontSize: "1.35rem", margin: 0, color: "#ffe066" }}>Polecane produkty</h2>
        <span style={{ fontSize: "0.85rem", color: "#bcbcb7" }}>Parallel Routes: slot <code>@recommended</code></span>
      </div>
      <p style={{ color: "#bcbcb7", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        Trzy wybrane deterministycznie pozycje wyrenderowane równolegle obok widoku katalogu.
      </p>

      <div className="product-list" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {recommended.map((p) => (
          <article key={p.id} className="product-card" style={{ background: "rgba(40, 40, 95, 0.6)" }}>
            <Link href={`/product-list/${p.id}`} className="product-image-container" style={{ height: "150px", display: "block" }}>
              <Image src={p.image} alt={p.name} fill sizes="220px" style={{ objectFit: "cover" }} />
            </Link>
            <div className="product-meta">
              <span className="product-category">{p.type}</span>
              <span className="product-code">ID: {p.id}</span>
            </div>
            <h3 style={{ fontSize: "1rem", margin: "0.5rem 0" }}>
              <Link href={`/product-list/${p.id}`} style={{ color: "#ffffff", textDecoration: "none" }}>
                {p.name}
              </Link>
            </h3>
            <div className="product-price" style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
              {(p.price / 100).toFixed(2)} zł
            </div>
            <Link
              href={`/product-list/${p.id}`}
              className="btn-action"
              style={{ textAlign: "center", padding: "0.4rem 0.8rem", fontSize: "0.85rem", marginTop: "auto" }}
            >
              Zobacz szczegóły
            </Link>
          </article>
        ))}
      </div>
    </aside>
  );
}
