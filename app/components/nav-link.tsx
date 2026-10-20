'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Dopasowanie aktywnego stanu zgodnie z sekcją 5:
  // - Strona główna: rozpoznawana dokładnie
  // - Sekcja produktów (/product-list): aktywna na /product-list oraz /product-list/<id>,
  //   ale NIE na przypadkowej ścieżce zaczynającej się podobnie (np. /product-list-fake)
  // - Sekcja /catalog: aktywna na /catalog oraz /catalog/...
  let isCurrentPage = false;
  let isCurrentSection = false;

  if (href === '/') {
    isCurrentPage = pathname === '/';
  } else if (href === '/product-list') {
    isCurrentPage = pathname === '/product-list';
    isCurrentSection = pathname.startsWith('/product-list/');
  } else if (href === '/catalog') {
    isCurrentPage = pathname === '/catalog';
    isCurrentSection = pathname.startsWith('/catalog/');
  } else {
    isCurrentPage = pathname === href;
  }

  const isActive = isCurrentPage || isCurrentSection;
  // Semantyczne aria-current: "page" dla bieżącej strony, "true" dla sekcji
  const ariaCurrent = isCurrentPage ? 'page' : isCurrentSection ? 'true' : undefined;

  return (
    <Link
      href={href}
      className={isActive ? 'active' : ''}
      aria-current={ariaCurrent}
    >
      {children}
    </Link>
  );
}
