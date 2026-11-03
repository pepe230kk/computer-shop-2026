"use client";

import { useState } from "react";
import { addToCartAction } from "@/app/lib/cart-actions";
import { useRouter } from "next/navigation";

export default function AddToCartButton({
  productId,
  disabled = false,
  compact = false,
}: {
  productId: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const router = useRouter();

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || loading) return;

    setLoading(true);
    setMessage(null);

    const res = await addToCartAction(productId, 1);
    setLoading(false);

    if (res.success) {
      setIsError(false);
      setMessage("Dodano do koszyka!");
      setTimeout(() => setMessage(null), 2500);
      router.refresh();
    } else {
      setIsError(true);
      setMessage(res.message || "Błąd dodawania");
      setTimeout(() => setMessage(null), 3500);
    }
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.25rem", width: compact ? "100%" : "auto" }}>
      <button
        onClick={handleAdd}
        disabled={disabled || loading}
        style={{
          background: disabled ? "#444" : "#16a34a",
          color: "#fff",
          border: "none",
          padding: compact ? "0.45rem 0.75rem" : "0.6rem 1.25rem",
          fontSize: compact ? "0.85rem" : "0.95rem",
          borderRadius: "6px",
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          width: "100%",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {loading ? "Dodawanie..." : disabled ? "Niedostępny" : "Do koszyka"}
      </button>
      {message && (
        <span
          style={{
            fontSize: "0.75rem",
            color: isError ? "#f87171" : "#4ade80",
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
