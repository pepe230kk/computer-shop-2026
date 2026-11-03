import { connection } from "next/server";
import { prisma } from "../lib/db";
import { getSession } from "../lib/cart";
import Link from "next/link";
import AuthNav from "../components/auth-nav";

// Wymuszenie dynamicznego renderowania zgodnie z wytycznymi Lab 08 i Lab 09
export const dynamic = "force-dynamic";

export default async function OrderHistoryPage() {
  await connection();

  const session = await getSession();

  // Wymóg Rozszerzenia 2: Pełna izolacja danych użytkowników (Zero-Trust)
  if (!session || !session.user) {
    return (
      <div>
        <h1 style={{ marginBottom: "1.5rem" }}>Historia zamówień</h1>
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
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Zaloguj się, aby zobaczyć historię zamówień</h2>
          <p style={{ color: "#bcbcb7", maxWidth: "520px", margin: "0 auto 2rem auto", lineHeight: "1.6" }}>
            Historia zakupów jest ściśle przypisana do Twojego konta. Zaloguj się przez GitHub poniżej,
            aby przeglądać swoje archiwalne zamówienia i snapshoty cenowe.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <AuthNav />
            <Link href="/product-list" className="btn-action" style={{ padding: "0.45rem 1.25rem", background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}>
              &larr; Wróć do katalogu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Pobranie zamówień WYŁĄCZNIE zalogowanego użytkownika (Zero-Trust)
  const orders = await prisma.order.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Odwzorowanie statusów na czytelne etykiety i kolory
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return { label: "Zrealizowane", bg: "rgba(46, 204, 113, 0.2)", border: "#2ecc71", color: "#2ecc71" };
      case "PAID":
        return { label: "Opłacone", bg: "rgba(52, 152, 219, 0.2)", border: "#3498db", color: "#3498db" };
      case "PENDING":
        return { label: "W trakcie realizacji", bg: "rgba(241, 196, 15, 0.2)", border: "#f1c40f", color: "#f1c40f" };
      case "CANCELLED":
        return { label: "Anulowane", bg: "rgba(231, 76, 60, 0.2)", border: "#e74c3c", color: "#e74c3c" };
      default:
        return { label: status, bg: "rgba(188, 188, 183, 0.2)", border: "#bcbcb7", color: "#bcbcb7" };
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Twoja historia zamówień</h1>
        <p style={{ color: "#bcbcb7", margin: 0, fontSize: "0.95rem" }}>
          Zalogowano jako: <strong>{session.user.name || session.user.email}</strong> | Zamówień: <strong>{orders.length}</strong>
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="content-box" style={{ textAlign: "center", padding: "3rem" }}>
          <h2>Brak historii zamówień</h2>
          <p style={{ color: "#bcbcb7", marginBottom: "1.5rem" }}>Nie złożyłeś jeszcze żadnych zamówień w naszym sklepie.</p>
          <Link href="/product-list" className="btn-action">
            Rozpocznij zakupy &rarr;
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {orders.map((order) => {
            const status = getStatusBadge(order.status);
            const formattedDate = new Date(order.createdAt).toLocaleDateString("pl-PL", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const formattedTotal = (order.totalPrice / 100).toFixed(2);

            return (
              <article key={order.id} className="content-box" style={{ marginTop: 0, padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", borderBottom: "1px solid rgba(229, 229, 225, 0.15)", paddingBottom: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                      Zamówienie {order.orderNumber}
                    </h2>
                    <span style={{ fontSize: "0.85rem", color: "#bcbcb7" }}>
                      Złożono: {formattedDate}
                    </span>
                  </div>
                  <div style={{
                    padding: "0.35rem 0.85rem",
                    borderRadius: "20px",
                    fontSize: "0.85rem",
                    fontWeight: "bold",
                    backgroundColor: status.bg,
                    border: `1px solid ${status.border}`,
                    color: status.color,
                  }}>
                    {status.label}
                  </div>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1rem", margin: "0 0 0.75rem 0", color: "#e5e5e1" }}>Pozycje w zamówieniu:</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {order.items.map((item) => (
                      <div key={item.id} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem 1rem",
                        backgroundColor: "rgba(10, 10, 30, 0.3)",
                        borderRadius: "6px",
                        fontSize: "0.95rem"
                      }}>
                        <div>
                          <strong>{item.productName}</strong>
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#bcbcb7" }}>
                            (Kod: {item.productCode})
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: "#bcbcb7", marginRight: "1rem" }}>
                            {item.quantity} szt. &times; {(item.unitPrice / 100).toFixed(2)} zł
                          </span>
                          <strong style={{ color: "#ffffff" }}>
                            {((item.quantity * item.unitPrice) / 100).toFixed(2)} zł
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(229, 229, 225, 0.15)", paddingTop: "1rem", marginTop: "1rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "#bcbcb7", fontStyle: "italic" }}>
                    * Ceny jednostkowe i nazwy produktów utrwalone w chwili zakupu (snapshot cenowy).
                  </span>
                  <div style={{ fontSize: "1.2rem" }}>
                    Łączna kwota: <strong style={{ color: "#22c55e" }}>{formattedTotal} zł</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
