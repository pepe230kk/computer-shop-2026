import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import NavLink from "./components/nav-link";
import AuthNav from "./components/auth-nav";

export const metadata: Metadata = {
  title: "Computer Shop 2026 | Laboratorium 09",
  description: "Laboratorium 09 - Uwierzytelnianie i własny koszyk w Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <div id="page">
          <header id="main-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div id="logo">
              <Link href="/">Computer Shop</Link>
            </div>
            <nav aria-label="Główna nawigacja serwisu" style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <ul>
                <li><NavLink href="/">Strona główna</NavLink></li>
                <li><NavLink href="/product-list">Katalog</NavLink></li>
                <li><NavLink href="/basket">Koszyk</NavLink></li>
                <li><NavLink href="/order-history">Historia</NavLink></li>
                <li><NavLink href="/about">O sklepie</NavLink></li>
              </ul>
            </nav>
            <AuthNav />
          </header>
          <main id="main-content">{children}</main>
          <footer style={{ marginTop: "4rem", textAlign: "center", color: "#bcbcb7", fontSize: "0.85rem", borderTop: "1px solid rgba(229, 229, 225, 0.2)", paddingTop: "1.5rem" }}>
            <p>&copy; 2026 Sklep Komputerowy. Katedra Informatyki Stosowanej, Politechnika Krakowska.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
