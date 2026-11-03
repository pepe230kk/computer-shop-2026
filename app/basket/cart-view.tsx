"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CartView, CartItemView } from "../lib/cart";
import { updateQuantityAction, removeItemAction, checkoutAction } from "../lib/cart-actions";

export default function CartViewClient({ initialCart }: { initialCart: CartView }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView>(initialCart);
  const [loadingItemId, setLoadingItemId] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string; orderNumber?: string } | null>(null);

  const handleUpdateQuantity = async (item: CartItemView, newQuantity: number) => {
    if (newQuantity < 1 || newQuantity > 99 || newQuantity > item.availableStock) return;
    setLoadingItemId(item.id);
    setAlert(null);

    const res = await updateQuantityAction(item.id, newQuantity);
    setLoadingItemId(null);

    if (res.success) {
      router.refresh();
      // Aktualizacja optymistyczna
      setCart((prev) => {
        const updatedItems = prev.items.map((i) =>
          i.id === item.id
            ? { ...i, quantity: newQuantity, lineTotal: i.unitPrice * newQuantity }
            : i
        );
        const totalPrice = updatedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);
        const totalItems = updatedItems.reduce((acc, curr) => acc + curr.quantity, 0);
        return { ...prev, items: updatedItems, totalPrice, totalItems };
      });
    } else {
      setAlert({ type: "error", message: res.message || "Błąd aktualizacji ilości." });
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    setLoadingItemId(itemId);
    setAlert(null);

    const res = await removeItemAction(itemId);
    setLoadingItemId(null);

    if (res.success) {
      router.refresh();
      setCart((prev) => {
        const updatedItems = prev.items.filter((i) => i.id !== itemId);
        const totalPrice = updatedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);
        const totalItems = updatedItems.reduce((acc, curr) => acc + curr.quantity, 0);
        return { ...prev, items: updatedItems, totalPrice, totalItems };
      });
    } else {
      setAlert({ type: "error", message: res.message || "Błąd usuwania pozycji z koszyka." });
    }
  };

  const handleCheckout = async () => {
    if (checkoutLoading || cart.items.length === 0) return;
    setCheckoutLoading(true);
    setAlert(null);

    // Klucz idempotencji zabezpieczający przed podwójnym zamówieniem
    const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `checkout-${Date.now()}`;

    const res = await checkoutAction(idempotencyKey);
    setCheckoutLoading(false);

    if (res.success && res.data) {
      setAlert({
        type: "success",
        message: res.message || "Zamówienie zostało pomyślnie złożone!",
        orderNumber: res.data.orderNumber,
      });
      // Wyczyszczenie lokalnego stanu koszyka
      setCart((prev) => ({ ...prev, items: [], totalPrice: 0, totalItems: 0 }));
      router.refresh();
    } else {
      setAlert({
        type: "error",
        message: res.message || "Wystąpił błąd podczas finalizacji zamówienia.",
      });
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="content-box" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
        {alert && (
          <div
            style={{
              padding: "1rem 1.5rem",
              borderRadius: "8px",
              marginBottom: "2rem",
              backgroundColor: alert.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${alert.type === "success" ? "#22c55e" : "#ef4444"}`,
              color: alert.type === "success" ? "#86efac" : "#fca5a5",
              textAlign: "left",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>{alert.message}</p>
            {alert.orderNumber && (
              <p style={{ margin: "0.5rem 0 0 0" }}>
                Numer zamówienia: <strong>{alert.orderNumber}</strong>. Możesz sprawdzić szczegóły w zakładce{" "}
                <Link href="/order-history" style={{ color: "#38bdf8", textDecoration: "underline" }}>
                  Historii zamówień
                </Link>
                .
              </p>
            )}
          </div>
        )}
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#888"
          strokeWidth="1.5"
          style={{ margin: "0 auto 1.5rem auto", display: "block" }}
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Twój koszyk jest pusty</h2>
        <p style={{ color: "#bcbcb7", marginBottom: "2rem" }}>
          Nie masz jeszcze żadnych produktów w swoim koszyku. Przejrzyj nasz katalog i dodaj interesujący sprzęt.
        </p>
        <Link href="/product-list" className="btn-action" style={{ padding: "0.75rem 1.75rem" }}>
          Przejdź do katalogu produktów &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div>
      {alert && (
        <div
          style={{
            padding: "1rem 1.5rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            backgroundColor: alert.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${alert.type === "success" ? "#22c55e" : "#ef4444"}`,
            color: alert.type === "success" ? "#86efac" : "#fca5a5",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{alert.message}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>
        {/* Lista pozycji w koszyku */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {cart.items.map((item) => {
            const isBusy = loadingItemId === item.id;
            const isMax = item.quantity >= 99 || item.quantity >= item.availableStock;
            const isMin = item.quantity <= 1;

            return (
              <div
                key={item.id}
                className="content-box"
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr auto auto",
                  gap: "1.5rem",
                  alignItems: "center",
                  padding: "1rem 1.5rem",
                  opacity: isBusy ? 0.6 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                {/* Obraz produktu */}
                <div style={{ position: "relative", width: 100, height: 80, borderRadius: "6px", overflow: "hidden" }}>
                  <Image
                    src={item.productImage}
                    alt={item.productName}
                    fill
                    sizes="100px"
                    style={{ objectFit: "cover" }}
                  />
                </div>

                {/* Tytuł i metadane */}
                <div>
                  <span style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 600 }}>{item.productCode}</span>
                  <h3 style={{ margin: "0.2rem 0 0.4rem 0", fontSize: "1.05rem" }}>
                    <Link
                      href={`/product-list/${item.productId}`}
                      style={{ color: "#ffffff", textDecoration: "none" }}
                    >
                      {item.productName}
                    </Link>
                  </h3>
                  <div style={{ color: "#9ca3af", fontSize: "0.85rem" }}>
                    Cena jednostkowa:{" "}
                    <strong style={{ color: "#e5e5e1" }}>{(item.unitPrice / 100).toFixed(2)} zł</strong>
                    {item.availableStock <= 5 && (
                      <span style={{ color: "#f59e0b", marginLeft: "0.5rem" }}>
                        (Pozostało tylko: {item.availableStock} szt.)
                      </span>
                    )}
                  </div>
                </div>

                {/* Kontrolki ilości */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleUpdateQuantity(item, item.quantity - 1)}
                    disabled={isMin || isBusy}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "4px",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff",
                      cursor: isMin || isBusy ? "not-allowed" : "pointer",
                      fontSize: "1rem",
                      fontWeight: "bold",
                    }}
                    title="Zmniejsz ilość"
                  >
                    -
                  </button>
                  <span
                    style={{
                      minWidth: "32px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "1rem",
                    }}
                  >
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => handleUpdateQuantity(item, item.quantity + 1)}
                    disabled={isMax || isBusy}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "4px",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff",
                      cursor: isMax || isBusy ? "not-allowed" : "pointer",
                      fontSize: "1rem",
                      fontWeight: "bold",
                    }}
                    title="Zwiększ ilość"
                  >
                    +
                  </button>
                </div>

                {/* Łączna cena i przycisk usuwania */}
                <div style={{ textAlign: "right", minWidth: 110 }}>
                  <div style={{ fontSize: "1.15rem", fontWeight: "bold", color: "#22c55e", marginBottom: "0.4rem" }}>
                    {(item.lineTotal / 100).toFixed(2)} zł
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={isBusy}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ef4444",
                      fontSize: "0.85rem",
                      cursor: isBusy ? "not-allowed" : "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    {isBusy ? "Usuwanie..." : "Usuń"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Podsumowanie koszyka i Checkout */}
        <div className="content-box" style={{ padding: "1.75rem", position: "sticky", top: "1rem" }}>
          <h2 style={{ fontSize: "1.25rem", margin: "0 0 1.25rem 0", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "0.75rem" }}>
            Podsumowanie
          </h2>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", color: "#9ca3af" }}>
            <span>Liczba produktów:</span>
            <strong style={{ color: "#e5e5e1" }}>{cart.totalItems} szt.</strong>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem", color: "#9ca3af" }}>
            <span>Dostawa:</span>
            <strong style={{ color: "#22c55e" }}>Gratis (0,00 zł)</strong>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              paddingTop: "1rem",
              marginBottom: "1.75rem",
            }}
          >
            <span style={{ fontSize: "1.1rem", fontWeight: 600 }}>Łącznie:</span>
            <span style={{ fontSize: "1.6rem", fontWeight: "bold", color: "#22c55e" }}>
              {(cart.totalPrice / 100).toFixed(2)} zł
            </span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={checkoutLoading || cart.items.length === 0}
            className="btn-action"
            style={{
              width: "100%",
              padding: "0.85rem 1rem",
              fontSize: "1.05rem",
              fontWeight: "bold",
              background: checkoutLoading ? "#444" : "#22c55e",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: checkoutLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            {checkoutLoading ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" strokeWidth="4" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Przetwarzanie zamówienia...
              </>
            ) : (
              "Złóż zamówienie (Kupuję)"
            )}
          </button>

          <p style={{ color: "#6b7280", fontSize: "0.75rem", marginTop: "1rem", textAlign: "center", lineHeight: "1.4" }}>
            Bezpieczna transakcja chroniona kluczem idempotencji z natychmiastową rezerwacją stanów magazynowych.
          </p>
        </div>
      </div>
    </div>
  );
}
