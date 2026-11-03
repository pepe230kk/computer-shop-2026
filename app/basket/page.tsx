import { connection } from "next/server";
import { getSession, getMyCart } from "../lib/cart";
import CartViewClient from "./cart-view";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BasketPage() {
  await connection();

  const session = await getSession();

  if (!session || !session.user) {
    return (
      <div>
        <h1 style={{ marginBottom: "1.5rem" }}>Twój koszyk</h1>
        <div className="content-box" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1.5"
            style={{ margin: "0 auto 1.5rem auto", display: "block" }}
          >
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Zaloguj się, aby uzyskać dostęp do koszyka</h2>
          <p style={{ color: "#bcbcb7", maxWidth: "480px", margin: "0 auto 2rem auto", lineHeight: "1.6" }}>
            Twój koszyk jest ściśle powiązany z Twoim kontem użytkownika i chroniony po stronie serwera.
            Zaloguj się za pośrednictwem GitHub, aby przeglądać dodane produkty i finalizować zamówienia.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
            <Link href="/product-list" className="btn-action" style={{ padding: "0.6rem 1.25rem", background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}>
              &larr; Wróć do katalogu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cart = await getMyCart(session.user.id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Twój koszyk</h1>
        <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
          Zalogowano jako: <strong style={{ color: "#e5e5e1" }}>{session.user.name || session.user.email}</strong>
        </span>
      </div>
      <CartViewClient initialCart={cart} />
    </div>
  );
}
