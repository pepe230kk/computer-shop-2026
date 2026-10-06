import { getProducts } from "../lib/repository";
import Image from "next/image";

export default async function ProductList() {
  const products = await getProducts();

  if (products.length === 0) {
    return <p>Katalog jest obecnie pusty. Przepraszamy.</p>;
  }

  return (
    <div>
      <h1>Katalog produktów</h1>
      <div className="product-list">
        {products.map((product) => (
          <div key={product.id} className="product-card">
            <h2>{product.name}</h2>
            <div style={{ position: "relative", width: "100%", height: "200px" }}>
              <Image 
                src={product.image} 
                alt={`Zdjęcie produktu ${product.name}`} 
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 250px"
                style={{ objectFit: "contain" }}
              />
            </div>
            <div className="product-category">Kategoria: {product.type.toUpperCase()}</div>
            <div className="product-price">
              {(product.price / 100).toFixed(2)} zł
            </div>
            <div className={`product-stock ${product.amount > 0 ? 'in' : 'out'}`}>
              Dostępność: {product.amount > 0 ? `${product.amount} szt.` : "Brak w magazynie"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
