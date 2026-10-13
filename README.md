# Computer Shop 2026 (Lab 06)

## Uruchomienie aplikacji
1. Zbuduj aplikację: `npm run build`
2. Uruchom serwer produkcyjny: `npm run start`
3. Aplikacja będzie dostępna pod adresem: http://localhost:3000
4. Tryb deweloperski: `npm run dev`
5. Testy: `npm run test`
6. Linter: `npm run lint`

## Wersje środowiska
- Node.js: 22.14.0 LTS
- npm: 10.9.2
- Next.js: 15.x / 16.x (App Router)
- TypeScript: 5.x
- Zod: 3.23.8

## Wykorzystane materiały i źródła grafik
- **Materiały prowadzącego:** Wykorzystano pliki z folderu `Materials`:
  - `Materials/global.css` – podstawowe style aplikacji, fonty Merriweather i Inter, selektory `#page`, `#main-header`, `#home`, `.error`.
  - `Materials/politechnika-krakowska-logo.svg` – oficjalne logo Politechniki Krakowskiej umieszczone na stronie głównej w komponencie `#home img`.
  - `Materials/favicon.ico` – ikona favicon serwisu.
- **Zdjęcia produktów w katalogu (`public/images/products/`):**
  - `cpu.webp`, `gpu.webp`, `ram.webp`, `disk.webp` – wygenerowane grafiki poglądowe na licencji dopuszczającej wykorzystanie edukacyjne i demonstracyjne (CC-BY/Public Domain equivalent), skonwertowane do formatu WebP i zoptymalizowane pod kątem wydajności Next.js Image.

## Wyniki testów i sprawdzeń
- `npm run lint` wykonuje się poprawnie, brak błędów.
- `npm run test` zalicza 9 na 9 testów jednostkowych walidacji i logiki asynchronicznego repozytorium.
- `npm run build` wykonuje się pomyślnie, generując zoptymalizowane strony i endpoint API.

## Odpowiedzi na pytania architektoniczne

**1. Czym różnią się page.tsx i layout.tsx?**
`page.tsx` jest unikalnym dla danego segmentu trasowania widokiem UI, natomiast `layout.tsx` definiuje wspólny interfejs graficzny otaczający wszystkie zagnieżdżone w nim podkatalogi i strony. Layouty zachowują swój stan między przejściami (nie renderują się ponownie).

**2. Czy do publicznej strony potrzeba osobnego layoutu?**
Nie ma konieczności tworzenia osobnego layoutu dla publicznej strony, jeśli strona ta ma dzielić nawigację ze stronami prywatnymi/ogólnymi. Główny `layout.tsx` (Root Layout) jest wymagany i zazwyczaj wystarczy.

**3. Co w nawigacji przez Link pozostaje wspólne?**
Link pobiera (prefetch) kod docelowej strony w tle oraz renderuje komponent tylko z różnicą względem obecnego stanu (SPA-like client navigation). Komponenty ze wspólnego `layout.tsx` nie są przeładowywane (np. nagłówek, stopka, stan nawigacji).

**4. Gdzie wykonuje się funkcja repozytorium?**
Funkcja działa wyłącznie po stronie serwera, ponieważ korzysta m.in. z modułów Node.js takich jak `fs` i importuje moduł blokujący klienta: `server-only`. 

**5. Jakie dane trafiają do przeglądarki?**
Do przeglądarki trafia jedynie wygenerowany przez komponenty na serwerze HTML ze zredukowanym stanem RSC Payload (dane z repozytorium po przefiltrowaniu pod konkretny widok React, bez całej zawartości JSON czy pełnych obiektów bez odniesień w interfejsie użytkownika).

**6. Dlaczego import całego JSON do komponentu klienta zmienia architekturę?**
Przekazanie całości do klienta naruszałoby separację i sprawiało, że cała "baza danych" (wielki obiekt JSON) byłaby pobierana przez przeglądarkę z siecią, narażając na problemy bezpieczeństwa i obniżenie wydajności.

**7. Czy use client wyklucza początkowe renderowanie HTML na serwerze?**
Nie. Komponenty oznaczone przez `use client` nadal mogą być domyślnie poddane procesowi prerenderowania do HTML (Server Side Rendering) jako początkowy snapshot na serwerze, ale ich interaktywność i właściwe wykonywanie JavaScriptu odbywa się po stronie klienta (hydracja).

**8. Dlaczego brak funkcjonalności nie jest awarią? Czy granica error.tsx przechwytuje błąd layoutu w tym samym segmencie? Dlaczego widok "nie znaleziono" nie zawsze oznacza HTTP 404 w odpowiedzi strumieniowej?**
- Brak (np. wynik 0 produktów z filtru) to normalny stan logiczny w aplikacji. Awarie zarezerwowane są dla nieoczekiwanych wyjątków kodu.
- `error.tsx` **nie** przechwytuje błędu rzuconego w `layout.tsx` znajdującego się na tym samym poziomie drzewa plików (wymagałby rodzica, tj. global-error.tsx lub error w folderze wyżej).
- Przesłanie HTTP 404 podczas strumieniowania SSR jest niemożliwe, jeśli status HTTP 200 OK został już wysłany przez serwer w nagłówkach początkowych. Wtedy Next.js wyświetli komponent "not-found", ale HTTP pozostaje 200.

**9. Dlaczego wyjątek rzucony celowo w katalogu w czasie procesu build nie jest testem błędu obsługiwanego dopiero przy żądaniu?**
Polecenie `next build` próbuje wygenerować statyczny HTML (prerendering SSG). Gdy natrafi na błąd, powoduje on awarię całego procesu kompilacji. Testowanie `error.tsx` dla błędów w locie należy prowadzić na żywo w środowisku developerskim, a nie jako element procesu budowania.

## Rozszerzenia
Zrealizowano rozszerzenie **Read-only API**: dostępny jest punkt końcowy `/api/products` (np. `/api/products?category=cpu&availableOnly=true`), wykorzystujący walidację z użyciem biblioteki Zod i współdzielący główny moduł repozytorium.
