import { connection } from "next/server";
import { prisma } from "../lib/db";

// Wymuszenie dynamicznego renderowania zgodnie z wytycznymi Lab 08
export const dynamic = "force-dynamic";

export default async function OrderHistoryPage() {
  await connection();

  // Pobranie zamówień z bazy PostgreSQL przez Prisma Client
  const orders = await prisma.order.findMany({
    include: {
      user: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { id: "asc" },
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
        <h1 style={{ margin: 0 }}>Historia zamówień</h1>
        <p style={{ color: "#bcbcb7", margin: 0, fontSize: "0.95rem" }}>
          Liczba zarejestrowanych zamówień: <strong>{orders.length}</strong>
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="content-box" style={{ textAlign: "center", padding: "3rem" }}>
          <h2>Brak historii zamówień</h2>
          <p style={{ color: "#bcbcb7" }}>Nie zarejestrowano jeszcze żadnych zamówień w bazie danych PostgreSQL.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {orders.map((order) => {
            const status = getStatusBadge(order.status);
            const formattedDate = new Date(order.createdAt).toLocaleDateString("pl-PL", {
              year: "numeric",
              month: "long",
              day: "numeric",
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
                      Data: {formattedDate} | Klient: <strong>{order.user.name}</strong> ({order.user.email})
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
                    Łączna kwota: <strong style={{ color: "#ffffff" }}>{formattedTotal} zł</strong>
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
