import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Computer Shop 2026",
  description: "Laboratorium 6 - Sklep komputerowy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <header>
          <nav>
            <ul>
              <li><Link href="/">Strona główna</Link></li>
              <li><Link href="/product-list">Katalog</Link></li>
              <li><Link href="/basket">Koszyk</Link></li>
              <li><Link href="/order-history">Historia zamówień</Link></li>
              <li><Link href="/about">O sklepie</Link></li>
            </ul>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>&copy; 2026 Sklep Komputerowy. Wszelkie prawa zastrzeżone.</p>
        </footer>
      </body>
    </html>
  );
}
