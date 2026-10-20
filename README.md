# Computer Shop 2026 – Laboratorium 07: Trasy dynamiczne i filtry w Next.js

Aplikacja demonstracyjna sklepu komputerowego rozwijana w ramach przedmiotu **Programowanie BackEnd** w Katedrze Informatyki Stosowanej Politechniki Krakowskiej.

---

## 1. Uruchomienie aplikacji i weryfikacja

Wymagane środowisko: **Node.js 24 LTS**, **npm 10.x**, **Next.js 16.3.x**, **TypeScript 5.x**, **App Router**, **ESLint 9.x**.

```bash
# 1. Odtworzenie zależności z lockfile
npm ci

# 2. Uruchomienie testów jednostkowych (26 testów: interpretacja URL, walidacja ID, sortowanie, filtry, niemutowalność)
npm run test

# 3. Sprawdzenie lintera
npm run lint

# 4. Kompilacja produkcyjna
npm run build

# 5. Uruchomienie serwera produkcyjnego (http://localhost:3000)
npm run start

# Tryb deweloperski
npm run dev
```

---

## 2. Opis tras i kontraktu URL

### 2.1 Trasy w aplikacji
* `/` – strona główna z logo Politechniki Krakowskiej i opisem projektu.
* `/product-list` – katalog produktów z filtrami w URL (`type`, `stock`, `sort`), obsługą pustej listy i slotem równoległym `@recommended`.
* `/product-list/[id]` – strona szczegółów pojedynczego produktu z rygorystyczną walidacją identyfikatora, dedykowanymi metadanymi (`generateMetadata`) oraz prerenderowaniem (`generateStaticParams`).
* `/catalog/[[...slug]]` – rozszerzenie: wielopoziomowy katalog demonstracyjny z segmentami opcjonalnymi (kategorie oraz produkt w kategorii).
* `/basket` – placeholder koszyka.
* `/order-history` – placeholder historii zamówień.
* `/about` – informacje o projekcie i autorze.
* `/api/products` – endpoint REST (Read-only API z Lab 06).

### 2.2 Kontrakt parametrów zapytania katalogu (`/product-list`)

| Parametr | Dozwolone wartości | Wartość domyślna | Zachowanie w przypadku błędu / braku |
| :--- | :--- | :--- | :--- |
| `type` | `all`, `cpu`, `gpu`, `ram`, `disk` | `all` | Brak: `all`. Pusty, nieznany lub powtórzony: domyślna `all` + ostrzeżenie. |
| `stock` | `all`, `available`, `unavailable` | `all` | Brak: `all`. Pusty, nieznany lub powtórzony: domyślna `all` + ostrzeżenie. Dostępność: `amount > 0`. |
| `sort` | `name`, `newest` | `name` | Brak: `name`. Pusty, nieznany lub powtórzony: domyślna `name` + ostrzeżenie. |

Nieznane nazwy parametrów (np. `?ref=google&utm_source=fb`) są całkowicie ignorowane.

### 2.3 Kontrakt identyfikatora trasy szczegółów (`/product-list/[id]`)
* Przyjmowane są wyłącznie dodatnie liczby całkowite w zakresie **1 do 2147483647**, zapisane cyframi dziesiętnymi bez znaku i zer wiodących (wyrażenie regularne: `/^[1-9]\d*$/`).
* Walidacja sprawdza całą wartość tekstową oraz `Number.isSafeInteger()`.
* Wartości takie jak `abc`, `12abc`, `0`, `-1`, `01`, `2147483648` oraz nieistniejące ID wywołują `notFound()` z `next/navigation`, prezentując dedykowany widok braku produktu z linkiem powrotnym do katalogu.

### 2.4 Przykładowe adresy URL do sprawdzenia
* `/product-list` – domyślny katalog (wszystkie kategorie, wszystkie stany magazynowe, sortowanie A-Z).
* `/product-list?type=gpu&stock=available&sort=newest` – tylko dostępne karty graficzne posortowane od najnowszych.
* `/product-list?type=cpu&stock=unavailable` – procesory o stanie zerowym.
* `/product-list?type=gpu&type=cpu&sort=newest` – powtórzony parametr `type`: przyjęcie wartości domyślnej `all` oraz wyświetlenie ostrzeżenia na stronie.
* `/product-list?type=invalid&nieznany=123` – nieznana wartość `type`: przyjęcie domyślnej `all` i ostrzeżenie, `nieznany` zignorowany.
* `/product-list/1` – istniejący produkt ze stanem > 0 (prerenderowany statycznie w build).
* `/product-list/12abc` lub `/product-list/99999` – widok `notFound()`.
* `/catalog` oraz `/catalog/cpu` oraz `/catalog/cpu/1` – demonstracja opcjonalnego Catch-all `[[...slug]]`.

---

## 3. Zrealizowane rozszerzenia (Sekcja 8)

1. **Trasy równoległe (Parallel Routes) – slot `@recommended`:**
   * Obok katalogu produktów wdrożono slot równoległy `@recommended` zdefiniowany w `app/product-list/layout.tsx`.
   * Prezentuje panel trzech polecanych produktów, dobieranych deterministycznie (pierwsze 3 produkty ze stanem > 0 posortowane po ID).
   * Wdrożono pliki `default.tsx` (dla slotu `@recommended` oraz dla `children`), co gwarantuje poprawne zachowanie przy odświeżeniu i nawigacji.

2. **Prerenderowanie szczegółów (`generateStaticParams` i `dynamicParams`):**
   * W `app/product-list/[id]/page.tsx` wdrożono `generateStaticParams` dla pierwszych 5 produktów, co generuje dla nich statyczny HTML podczas `npm run build` (oznaczenie `● (SSG)` w podsumowaniu kompilacji).
   * Ustawiono `export const dynamicParams = true;`, co pozwala na dynamiczne renderowanie pozostałych produktów na żądanie przy zachowaniu korzyści z cache'owania.

3. **Segmenty obejmujące wiele części ścieżki (`[[...slug]]`):**
   * Zaimplementowano dedykowaną trasę `app/catalog/[[...slug]]/page.tsx`.
   * Obsługuje 3 poziomy zagnieżdżenia w jednym pliku:
     * `/catalog` (slug niezdefiniowany) – wybór kategorii z liczbą produktów,
     * `/catalog/[category]` (1 segment) – lista produktów w kategorii (walidacja kategorii),
     * `/catalog/[category]/[id]` (2 segmenty) – szczegóły produktu wraz z walidacją, czy dany produkt rzeczywiście należy do podanej w URL kategorii.
     * > 2 segmenty – wywołanie `notFound()`.

---

## 4. Odpowiedzi na pytania architektoniczne

### 1. Czym różnią się błędny format identyfikatora, brak produktu i awaria?
* **Błędny format identyfikatora** (np. `12abc`, `-5`, `01`): błąd składniowy/walidacyjny danych wejściowych pochodzących z zewnątrz (URL). Jest to sytuacja oczekiwana przez aplikację i powinna natychmiast prowadzić do `notFound()` bez odpytywania bazy danych/repozytorium.
* **Brak produktu** (poprawny identyfikator, np. `999999`, dla którego repozytorium zwraca `null`): poprawny semantycznie stan logiczny, w którym zasób nie istnieje. Zwracany jest widok `notFound()`.
* **Awaria serwera / repozytorium** (np. błąd odczytu pliku, awaria połączenia z bazą, niespójność danych): błąd wykonania, którego aplikacja nie może obsłużyć jako zwykłego braku zasobu. **Nie wolno zamieniać awarii na 404/null**, lecz pozwolić na przechwycenie jej przez granicę błędu `error.tsx`, informując o problemie technicznym z możliwością ponowienia żądania (`reset()`).

### 2. Dlaczego folder `[id]` nie oznacza sam w sobie, że strona zawsze renderuje się dopiero przy żądaniu?
Obecność parametru dynamicznego `[id]` nie wyklucza statycznego renderowania. W Next.js funkcja `generateStaticParams()` pozwala wskazać z góry zestaw parametrów, dla których strony zostaną wyrenderowane do czystego HTML już w trakcie procesu budowania (`npm run build`, SSG). Strona renderuje się w locie (na żądanie) tylko wtedy, gdy parametr nie został prerenderowany i `dynamicParams = true`, lub gdy strona używa dynamicznych funkcji odczytu nagłówków/ciasteczek.

### 3. Gdzie wykonują się odczyt danych i walidacja?
* **Odczyt danych**: Wykonuje się wyłącznie po stronie serwera (moduł `app/lib/repository.ts` posiada dyrektywę `import "server-only"`, uniemożliwiającą dołączenie do bundla przeglądarki).
* **Walidacja identyfikatora i parametrów URL**: Wykonuje się na serwerze w Server Component przed wywołaniem repozytorium. Walidacja Zod sprawdza również spójność bazy w repozytorium serwerowym.

### 4. Dlaczego walidujemy adres mimo kontrolek ograniczających wybór?
Kontrolki w interfejsie (`<select>`, przyciski) można łatwo ominąć – użytkownik może ręcznie edytować pasek adresu, wkleić niepoprawny link ze schowka, użyć narzędzi deweloperskich lub zewnętrznego skryptu. Zgodnie z zasadą *Zero Trust* serwer nigdy nie może ufać danym przychodzącym z żądania HTTP i musi przeprowadzić pełną walidację po swojej stronie.

### 5. Co się stanie po przesłaniu tego samego klucza dwa razy?
Gdy w URL pojawi się powtórzony parametr (np. `?type=gpu&type=cpu`), parser HTTP w Node.js / Next.js zamienia jego wartość w tablicę stringów `['gpu', 'cpu']`. Bez odpowiedniej obsługi kod oczekujący pojedynczego ciągu znaków mógłby ulec awarii lub zachować się nieprzewidywalnie. Zaimplementowany parser `parseCatalogQueryParams` wykrywa tablicę, zastępuje ją bezpieczną wartością domyślną (`all`) i wyświetla użytkownikowi komunikat ostrzegawczy.

### 6. Dlaczego filtr w `useState` nie odtwarza widoku z udostępnionego linku?
Stan w `useState` istnieje wyłącznie w pamięci RAM pojedynczej instancji komponentu w przeglądarce danego użytkownika. Przy odświeżeniu strony, otwarciu linku w nowej karcie lub przesłaniu go innej osobie `useState` jest inicjalizowany od zera. Umieszczenie stanu filtrów w URL (`searchParams`) sprawia, że adres staje się jedynym źródłem prawdy (*Single Source of Truth*), umożliwiając udostępnianie, zakładkowanie oraz poprawne działanie historii przeglądarki (Wstecz/Dalej).

### 7. Co zachowuje nawigacja przez `<Link>`, a co pełne przeładowanie strony?
* **Nawigacja przez `<Link>`**: Wykonuje nawigację SPA (Single Page Application). Pobiera w tle jedynie RSC Payload nowej strony, podmieniając zawartość komponentu `page.tsx`. Zachowuje stan DOM i stan komponentów we wspólnych układach `layout.tsx` (np. wpisany tekst w formularzu nagłówka, stan scrolla).
* **Pełne przeładowanie strony (F5 / `window.location`)**: Kasuje całe drzewo DOM, niszczy stan JavaScript, pobiera od nowa cały dokument HTML wraz z assetami i powoduje ponowną hydrację aplikacji.

### 8. Dlaczego komponent z `use client` może otrzymać początkowy HTML z serwera?
Dyrektywa `use client` oznacza jedynie granicę pakietu (klient-serwer) oraz umożliwia użycie hooków Reacta i zdarzeń przeglądarki. **Nie wyłącza ona SSR**. Podczas renderowania strony na serwerze komponent klienta jest renderowany do statycznego szkieletu HTML, który przeglądarka wyświetla natychmiast (First Contentful Paint), a dopiero później następuje proces hydracji JavaScriptu.

### 9. Czy wyróżnienie sekcji wymaga pobrania całego katalogu do przeglądarki?
Nie. Do wyróżnienia sekcji w nawigacji wystarczy hook `usePathname()`, który odczytuje jedynie bieżący adres URL. Dane katalogu produktów pozostają w Server Component i nie trafiają do bundla klienta.

### 10. Wyjaśnij różnicę między slotem `@folder` i segmentem URL.
Folder ze znakiem `@` (np. `@recommended`) w Parallel Routes definiuje **slot** (gniazdo), który jest wstrzykiwany jako właściwość (prop) do nadrzędnego `layout.tsx`. Slot **nie wpływa na strukturę ścieżki w URL** (adres `/product-list` nie zawiera segmentu `@recommended`). Segment URL (np. `[id]`) natomiast bezpośrednio odzwierciedla ścieżkę w pasku adresu przeglądarki.

### 11. Porównaj `[...slug]` i `[[...slug]]` oraz parametry zapytania.
* `[...slug]` (Catch-all): dopasowuje jeden lub więcej segmentów (np. `/catalog/a`, `/catalog/a/b`), ale **nie** dopasowuje ścieżki bazowej `/catalog` (wymagałby osobnego `page.tsx` w folderze rodzica).
* `[[...slug]]` (Optional Catch-all): dopasowuje również ścieżkę bazową `/catalog` bez żadnych segmentów (wtedy `slug` jest `undefined`).
* **Tablica segmentów vs query params**: segmenty ścieżki reprezentują hierarchiczną strukturę zasobów w REST (kolejność ma kluczowe znaczenie), natomiast `searchParams` (`?k=v`) służą do modyfikacji widoku zasobu (filtrowanie, sortowanie, paginacja) i ich kolejność nie ma znaczenia.

### 12. Uzasadnij wybór `dynamicParams` dla przypiętej wersji projektu.
W `app/product-list/[id]/page.tsx` ustawiono:
```typescript
export const dynamicParams = true;
```
Dzięki temu wybrane popularne produkty (zwrócone przez `generateStaticParams`) są generowane w trakcie budowania (SSG), a dla wszystkich pozostałych poprawnych identyfikatorów Next.js renderuje stronę na żądanie przy pierwszym wejściu (Server-Side Rendering) i zapisuje w cache. Ustawienie `false` powodowałoby błąd 404 dla każdego produktu spoza listy wstępnie wygenerowanej, co byłoby niepożądane przy 100 produktach w katalogu.

### 13. Rozstrzyganie remisów i stabilność sortowania
Podczas sortowania po nazwie (`name`) lub dacie (`newest`) w przypadku identycznych wartości klucza głównego zastosowano deterministyczne rozstrzyganie remisów:
```typescript
return cmp !== 0 ? cmp : a.id - b.id; // remis rozstrzygany po ID rosnąco
```
Gwarantuje to stabilność sortowania na różnych silnikach JavaScript i w testach jednostkowych.

### 14. Odróżnienie widoku braku produktu od kodu HTTP przy streamingu
* W przypadku **wejścia bezpośredniego** (np. wpisanie w pasek adresu `/product-list/niepoprawne_id`) serwer natychmiast zwraca nagłówek **HTTP 404 Not Found** wraz z wyrenderowanym widokiem `not-found.tsx`.
* W przypadku **przejścia przez nawigację `<Link>`** lub gdy odpowiedź jest strumieniowana po wysłaniu początkowych nagłówków HTTP 200 OK, kod odpowiedzi HTTP w narzędziach sieciowych przeglądarki może wynosić **200**, mimo że na ekranie poprawnie wyświetla się widok błędu `not-found.tsx`. Wynika to z faktu, że nagłówki HTTP nie mogą zostać zmodyfikowane po rozpoczęciu przesyłania strumienia (chunked transfer encoding).

---

## 5. Wyniki testów i weryfikacji

* **`npm run test`**: 26/26 testów zdanych bezbłędnie (czas: ~2.0s).
* **`npm run lint`**: brak błędów.
* **`npm run build`**: pełna kompilacja produkcyjna powiodła się:
  * Trasa `/product-list/[id]` poprawnie oznaczona jako `● (SSG)` dla wstępnie wygenerowanych stron.
  * Trasa `/catalog/[[...slug]]` oraz `/product-list` poprawnie oznaczone jako `ƒ (Dynamic)`.
