import { getProducts } from "../lib/repository";
import Image from "next/image";

export default async function ProductList() {
  const products = await getProducts();

  if (products.length === 0) {
    return (
      <div className="content-box">
        <h1>Katalog produktów</h1>
        <p>Katalog jest obecnie pusty. Przepraszamy.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Katalog produktów</h1>
        <p style={{ color: "#bcbcb7", margin: 0, fontSize: "0.95rem" }}>
          Liczba pozycji w katalogu: <strong>{products.length}</strong>
        </p>
      </div>

      <div className="product-list">
        {products.map((product) => (
          <article key={product.id} className="product-card">
            <div className="product-image-container">
              <Image 
                src={product.image} 
                alt={`Zdjęcie produktu ${product.name}`} 
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 260px"
                style={{ objectFit: "cover" }}
              />
            </div>
            <div className="product-meta">
              <span className="product-category">{product.type}</span>
              <span className="product-code">{product.code}</span>
            </div>
            <h2>{product.name}</h2>
            <div className="product-price">
              {(product.price / 100).toFixed(2)} zł
            </div>
            <div className={`product-stock ${product.amount > 0 ? 'in' : 'out'}`}>
              Dostępność: {product.amount > 0 ? `${product.amount} szt.` : "Brak w magazynie"}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
