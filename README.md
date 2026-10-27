# Computer Shop 2026 – Laboratorium 08: PostgreSQL i Prisma w aplikacji sklepu

Aplikacja demonstracyjna sklepu komputerowego rozwijana w ramach przedmiotu **Programowanie BackEnd** w Katedrze Informatyki Stosowanej Politechniki Krakowskiej.  
**Autor:** Krzysztof Kacprzak

---

## 1. Szybki start i instrukcja uruchomienia

### Wymagania środowiskowe
* **Node.js**: wersja 22+ (zalecana Node.js 22 LTS / 24 LTS)
* **npm**: wersja 10.x+
* **Docker & Docker Compose**: wersja 2.x+ (lub Docker Desktop)
* **System operacyjny**: Windows / Linux / macOS

### Procedura uruchomienia krok po kroku

```bash
# 1. Klonowanie repozytorium i przejście do katalogu projektu
cd computer-shop-2026kl

# 2. Utworzenie pliku ze zmiennymi środowiskowymi (jeśli nie istnieje)
# Plik .env zawiera definicję DATABASE_URL
cp .env.example .env

# 3. Instalacja zależności z pliku package-lock.json
npm ci

# 4. Uruchomienie kontenera bazy danych PostgreSQL 17 w tle
docker compose up -d --wait

# 5. Zastosowanie migracji schematu bazy danych
npx prisma migrate deploy

# 6. Idempotentne załadowanie danych początkowych (seedowanie kategorii, produktów oraz historii zamówień)
npx prisma db seed

# 7. Uruchomienie testów integracyjnych (28 testów sprawdzających bazę, walidacje, CHECK constraints)
npm test

# 8. Sprawdzenie działania rozszerzenia Historia Zamówień (snapshot cenowy, CHECK constraints)
npx tsx scripts/verify-orders.ts

# 9. Sprawdzenie zgodności kodu z linterem
npm run lint

# 10. Budowanie produkcyjne aplikacji
npm run build

# 11. Uruchomienie serwera aplikacji (domyślnie: http://localhost:3000)
npm run start

# Tryb deweloperski Next.js (z automatycznym przeładowaniem Turbopack)
npm run dev
```

---

## 2. Architektura bazy danych i infrastruktura (Docker Compose)

### 2.1 Konfiguracja kontenera `compose.yaml`
Usługa bazy danych PostgreSQL 17 została zdefiniowana w pliku `compose.yaml` z zachowaniem dobrych praktyk bezpieczeństwa i niezawodności:
* **Obraz**: oficjalny `postgres:17`
* **Porty**: `127.0.0.1:5432:5432` – port bazy danych jest powiązany wyłącznie z interfejsem pętli zwrotnej (*loopback interface*, `127.0.0.1`).
* **Trwały wolumen**: `postgres_data:/var/lib/postgresql/data`
* **Healthcheck**: `pg_isready -U shop_user -d computer_shop` wykonywany cyklicznie co 5 sekund, co pozwala na automatyczne oczekiwanie na gotowość bazy przed wykonaniem migracji lub seedowania (`docker compose up -d --wait`).

### 2.2 Uzasadnienia architektoniczne

#### Dlaczego port bazy jest mapowany wyłącznie na `127.0.0.1`, a nie `0.0.0.0`?
Mapowanie na `0.0.0.0` powoduje nasłuchiwanie na wszystkich dostępnych interfejsach sieciowych komputera, w tym na zewnętrznych kartach Wi-Fi / Ethernet oraz publicznych adresach IP. W konsekwencji port PostgreSQL byłby bezpośrednio osiągalny z sieci lokalnej (LAN) lub publicznego Internetu, co stwarza bezpośrednie zagrożenie bezpieczeństwa (ataki brute-force na hasło bazy, podatności sieciowe). Związanie z `127.0.0.1` (*localhost*) gwarantuje, że połączenia mogą być nawiązywane **wyłącznie z poziomu maszyny lokalnej hosta**, chroniąc bazę przed nieautoryzowanym ruchem z zewnątrz.

#### Rola wolumenu nazwanego (`postgres_data`) w kontekście trwałości danych
Kontenery Dockera są z natury ulotne (*ephemeral*) – wszelkie dane zapisywane w systemie plików wewnątrz warstwy kontenera ulegają bezpowrotnemu zniszczeniu po poleceniu `docker compose down` lub usunięciu kontenera. Nazwany wolumen `postgres_data` jest zarządzany przez silnik Dockera i montowany w ścieżce `/var/lib/postgresql/data`. Sprawia to, że:
1. Dane bazy (tabele, indeksy, katalogi systemowe PostgreSQL) są przechowywane poza cyklem życia kontenera.
2. Zatrzymanie kontenera (`docker compose stop`), usunięcie kontenera (`docker compose down`) czy aktualizacja obrazu nie powodują utraty stanu bazy ani magazynowych danych sklepu.
3. Ponowne uruchomienie kontenera natychmiast przywraca dostęp do wcześniej zapisanych danych bez konieczności ponownego seedowania.

---

## 3. Konfiguracja Prisma 7 i model danych

### 3.1 Modele Prisma i relacje
W `prisma/schema.prisma` zdefiniowano powiązane modele:
* `Category`:
  * `id` (Int, klucz główny, autoincrement)
  * `code` (String, unikalny kod kategorii: `cpu`, `gpu`, `ram`, `disk`)
  * `name` (String, nazwa kategorii)
  * `products` (relacja jeden-do-wielu z modelem `Product`)
* `Product`:
  * `id` (Int, klucz główny – zachowujący stałe identyfikatory z `data/products.json`)
  * `code` (String, unikalny kod towarowy, np. `PROD000001`)
  * `name` (String, nazwa handlowa produktu)
  * `nameSortKey` (String, zoptymalizowany klucz sortowania alfabetycznego)
  * `price` (Int, cena w groszach, liczba nieujemna)
  * `amount` (Int, bieżący stan magazynowy w sztukach, liczba nieujemna)
  * `description` (String, opis szczegółowy)
  * `date` (DateTime, data wprowadzenia do katalogu)
  * `image` (String, relatywna ścieżka do miniatury produktu)
  * `categoryId` (Int, klucz obcy powiązany z `Category.id`)

### 3.2 Indeksy optymalizacyjne
W modelu `Product` utworzono strategiczne indeksy bazodanowe:
1. `@@index([categoryId, amount])` – optymalizuje najczęstsze zapytania katalogu filtrujące produkty po kategorii oraz dostępności magazynowej (`amount > 0` lub `amount = 0`).
2. `@@index([nameSortKey])` – wspiera szybkie sortowanie alfabetyczne po stronie PostgreSQL bez kosztownego pełnego skanowania tabeli (*Seq Scan*).
3. `@@index([date])` – optymalizuje sortowanie katalogu od najnowszych produktów (`ORDER BY date DESC`).

### 3.3 Uzasadnienia architektoniczne

#### Różnica między `prisma migrate dev` / `prisma migrate deploy` a `prisma db push`
* `prisma migrate dev` / `prisma migrate deploy`:
  * Opierają się na **wersjonowanych plikach migracji SQL** (`prisma/migrations/*/migration.sql`) śledzonych w systemie kontroli wersji (Git).
  * Każda zmiana schematu jest deterministyczna, audytowalna i powtarzalna.
  * Umożliwiają stosowanie natywnych konstrukcji SQL niewspieranych bezpośrednio przez DSL Prisma (np. więzy `CHECK`, specyficzne reguły `COLLATE "C"`).
  * `prisma migrate deploy` jest jedynym bezpiecznym narzędziem na produkcji i w CI/CD, ponieważ aplikuje wyłącznie zatwierdzone migracje bez ryzyka niezamierzonego usunięcia kolumn lub tabel.
* `prisma db push`:
  * Porównuje bezpośrednio `schema.prisma` z bazą danych i nanosi zmiany "w locie" bez generowania plików migracji.
  * Służy wyłącznie do szybkiego prototypowania w fazie *exploratory prototyping*.
  * Nie nadaje się do pracy zespołowej ani na produkcję, ponieważ może doprowadzić do utraty danych (*data loss*) i nie pozwala na wersjonowanie niestandardowych reguł SQL.

#### Dlaczego w Prisma 7 zalecany jest Driver Adapter (`@prisma/adapter-pg`)?
W Prisma 7 wprowadzono Driver Adapters (m.in. `@prisma/adapter-pg` oparty na popularnym sterowniku `pg` / `node-postgres`) jako nowoczesną alternatywę dla monolitycznego silnika Query Engine napisanego w Rust:
1. **Wsparcie środowisk Serverless i Edge**: sterowniki JavaScript/TypeScript współpracują z poolerami połączeń (np. PgBouncer, Neon, Supabase) i nie wymagają specyficznych binariów systemowych Rusta dla każdego systemu operacyjnego (musl/glibc).
2. **Optymalizacja zużycia zasobów**: eliminacja narzutu procesu potomnego (*child process*) i komunikacji IPC/Engine, co zmniejsza zużycie pamięci RAM i przyspiesza *cold start*.
3. **Standaryzacja połączeń**: pełna kontrola nad konfiguracją puli połączeń i transakcji z poziomu czystego ekosystemu Node.js.

---

## 4. Więzy integralności w PostgreSQL i reguły sortowania

### 4.1 Więzy integralności na poziomie SQL
W migracji `prisma/migrations/20261020120000_catalog/migration.sql` zdefiniowano następujące więzy:
```sql
-- Więzy integralności wartości dodatnich i nieujemnych
ALTER TABLE "Product" ADD CONSTRAINT "product_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "product_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "product_id_positive" CHECK ("id" > 0);

-- Wymuszenie binarnego porządku bajtowego UTF-8 dla kolumny klucza sortowania
ALTER TABLE "Product" ALTER COLUMN "nameSortKey" TYPE TEXT COLLATE "C";
```

### 4.2 Uzasadnienia architektoniczne

#### Dlaczego walidacja w aplikacji (np. Zod) nie zastępuje więzów bazy danych (CHECK, FK)?
* **Wielodostęp i wiele źródeł zmian**: do bazy danych mogą pisać nie tylko Server Actions / endpointy Next.js podlegające schematom Zod, ale również skrypty administracyjne (np. `scripts/update-stock.ts`), zadania w tle (*cron jobs*), procesy migracji danych, narzędzia BI czy bezpośrednie sesje administratora (`psql`).
* **Warstwy obrony (*Defense in Depth*)**: błąd programisty, przeoczenie walidacji w nowym module, atak wstrzyknięcia danych lub wyścig wątków (*race condition*) mogą ominąć logikę aplikacji.
* **Jedno ostateczne źródło prawdy**: więzy `CHECK` oraz `FOREIGN KEY` są egzekwowane bezpośrednio przez silnik transakcyjny PostgreSQL. Baza gwarantuje atomowość i niezmienniki biznesowe (np. stan magazynowy nigdy nie będzie ujemny), uniemożliwiając niespójność danych niezależnie od pochodzenia zapytania SQL.

#### Problem porządku sortowania w PostgreSQL i rozwiązanie `COLLATE "C"`
* **Domyślne zachowanie PostgreSQL**: domyślne reguły kolacji (np. `pl_PL.utf8` lub `en_US.utf8` oparte na bibliotece ICU lub glibc) ignorują wielkość liter, spacje oraz traktują znaki diakrytyczne zgodnie z regułami językowymi. Ponadto ich zachowanie zależy od wersji biblioteki systemowej na maszynie hosta/kontenerze, co uniemożliwia pełną powtarzalność między systemami Windows a Linux.
* **Spójność z Lab 06**: w Laboratorium 06 zdefiniowano porządek sortowania oparty na binarnej kolejności bajtów UTF-8 (zgodny z `Buffer.compare` w Node.js).
* **Zastosowanie `COLLATE "C"`**: kolacja `"C"` wymusza w PostgreSQL sortowanie czysto bajtowe (kod bajt po kodzie bajtu w UTF-8). Dzięki temu zapytanie SQL:
  ```sql
  ORDER BY "nameSortKey" ASC, "id" ASC
  ```
  zwraca dokładnie taką samą, w 100% deterministyczną kolejność produktów, jak wcześniejsze repozytorium oparte o pamięć i plik JSON.

---

## 5. Idempotentne seedowanie bazy danych (`prisma/seed.ts`)

### 5.1 Zasada działania
Proces seedowania bazy danych zaimplementowano w skrypcie `prisma/seed.ts`:
1. **Walidacja danych źródłowych**: plik `data/products.json` jest odczytywany i weryfikowany schematem `ProductListSchema` (Zod), sprawdzającym unikalność identyfikatorów, dodatnie ceny i poprawność formatów.
2. **Atomiczna transakcja**: cała operacja seedowania 4 kategorii (`cpu`, `gpu`, `ram`, `disk`), 100 produktów oraz 4 zamówień demonstracyjnych wykonuje się w pojedynczej transakcji `prisma.$transaction()`.
3. **Mechanizm `upsert`**: dla każdego produktu, kategorii i zamówienia wykonywana jest operacja `upsert`:
   * Jeśli rekord o danym ID już istnieje – aktualizowane są jego właściwości.
   * Jeśli rekord nie istnieje – jest wstawiany jako nowy.

### 5.2 Uzasadnienia architektoniczne

#### Czym jest idempotentność i jak została zrealizowana?
Operacja jest **idempotentna**, jeśli jej wielokrotne wykonanie daje dokładnie taki sam rezultat końcowy jak pojedyncze wykonanie, bez generowania błędów duplikacji klucza głównego ani powielania wierszy.  
W `prisma/seed.ts` idempotentność zapewniają klauzule `upsert` bazujące na unikalnych identyfikatorach `id` (dla produktów), `code` (dla kategorii) oraz `orderNumber` (dla zamówień). Wielokrotne uruchomienie `npx prisma db seed` za każdym razem kończy się sukcesem i pozostawia w bazie dokładnie tę samą, spójną liczbę rekordów.

#### Dlaczego operacje seedowania powinny być w transakcji bazy danych?
Transakcja gwarantuje właściwość **ACID** (w szczególności atomowość – *Atomicity*). Gdyby podczas seedowania wystąpił błąd (np. błąd sieci, naruszenie więzów), brak transakcji pozostawiłby bazę danych w niespójnym, częściowo wypełnionym stanie ("brudne dane"). Transakcja zapewnia wycofanie (*ROLLBACK*) wszystkich zmian w razie jakiegokolwiek niepowodzenia, pozostawiając bazę w czystym stanie początkowym.

---

## 6. Repozytorium serwerowe (`app/lib/repository.ts`)

### 6.1 Zasady projektowe
* **Ochrona przed wyciekiem do klienta**: moduł posiada dyrektywę `import "server-only"`, uniemożliwiającą dołączenie kodu bazodanowego lub sterownika do bundla przeglądarki.
* **Separacja warstw**: repozytorium odpytuje PostgreSQL za pomocą Prisma Client, a następnie mapuje encje bazodanowe (relacja z `Category`) na domenowy kontrakt `Product` z Lab 06/07.
* **Brak maskowania awarii**: repozytorium **nie posiada** bloków `try/catch` zwracających pustą tablicę ani nie przełącza się na fallback do pliku JSON w razie awarii PostgreSQL. Błąd bazy danych jest propagowany do granicy błędów Next.js (`error.tsx`), co natychmiast informuje użytkownika o usterce technicznej i pozwala administratorom na diagnostykę.
* **Wykonywanie filtrowania i sortowania w bazie danych**:
  * Warunki `WHERE`: kategoria (`categoryId`) oraz filtr dostępności (`amount: { gt: 0 }` lub `amount: 0`) są przekazywane do klauzuli `where` zapytania Prisma.
  * Klauzula `ORDER BY`:
    * domyślnie: `orderBy: [{ nameSortKey: "asc" }, { id: "asc" }]`
    * dla `sort === "newest"`: `orderBy: [{ date: "desc" }, { id: "asc" }]`

### 6.2 Uzasadnienia architektoniczne

#### Dlaczego repozytorium nie powinno maskować błędów ani stosować fallbacku do JSON?
1. **Niewidoczne awarie (*Silent Failures*)**: zwrócenie pustej listy produktów w razie awarii bazy sprawia, że interfejs sklepu wygląda, jakby w magazynie nie było żadnego towaru, myląc klientów i ukrywając awarię przed systemami monitoringu (Sentry, Datadog).
2. **Niespójność danych z fallbackiem**: plik JSON może zawierać nieaktualne stany magazynowe lub ceny sprzed wielu dni. Sprzedaż produktów na podstawie nieaktualnego pliku JSON grozi sprzedażą towaru, którego nie ma w magazynie (*over-selling*).
3. **Poprawność obsługi błędów w Next.js**: błąd rzucony w Server Component jest elegancko przechwytywany przez `error.tsx` z kodem błędu, zachowując nagłówek HTTP 500 i umożliwiając ponowienie próby przez przycisk `Spróbuj ponownie`.

#### Dlaczego filtrowanie i sortowanie należy realizować w SQL, a nie w pamięci Node.js?
* **Wydajność i skalowalność**: pobranie całej tabeli do pamięci RAM procesu Node.js działa akceptowalnie przy 100 produktach, ale przy 100 000 produktów doprowadziłoby do wyczerpania pamięci (*Out of Memory*), blokady pętli zdarzeń Node.js (*event loop lag*) i ogromnego narzutu sieciowego między bazą a serwerem aplikacji.
* **Wykorzystanie indeksów B-Tree**: PostgreSQL wykorzystuje dedykowane indeksy (np. `[categoryId, amount]` oraz `[nameSortKey]`), filtrując i sortując wiersze w czasie logarytmicznym $O(\log N)$ bezpośrednio na poziomie zoptymalizowanych stron pamięci podręcznej silnika bazodanowego.

---

## 7. Wymuszenie dynamicznego renderowania stron i weryfikacja magazynowa

### 7.1 Polityka renderowania w Next.js App Router
Zgodnie z wymaganiami Sekcji 7:
* Strona katalogu (`app/product-list/page.tsx`) oraz strona szczegółów (`app/product-list/[id]/page.tsx`) odzwierciedlają bieżący stan magazynowy z bazy danych PostgreSQL bez konieczności ponownego budowania projektu.
* Na obu stronach wdrożono:
  ```typescript
  import { connection } from "next/server";
  export const dynamic = "force-dynamic";

  export default async function Page() {
    await connection();
    // Odczyt z bazy danych...
  }
  ```
* Usunięto funkcję `generateStaticParams` z Lab 07 na stronie szczegółów produktu, uniemożliwiając serwowanie przestarzałego stanu ze statycznego cache'a SSG. W wynikach `npm run build` obie trasy są oznaczone jako `ƒ (Dynamic)`.

### 7.2 Uzasadnienia architektoniczne

#### Dlaczego statyczne renderowanie z `generateStaticParams` bez natychmiastowej rewalidacji jest niepożądane w sklepie?
W sklepie internetowym stan magazynowy (`amount`) oraz ceny produktów są danymi wysoce dynamicznymi. Gdyby strona szczegółów produktu została wygenerowana statycznie podczas wdrożenia (`generateStaticParams` bez rewalidacji On-Demand):
1. **Problem *Over-sellingu***: jeśli produkt zostanie wyprzedany w bazie (stan = 0), użytkownicy odwiedzający statycznie zbuforowaną stronę nadal widzieliby informację "Dostępność: 10 szt." i mogliby próbować złożyć zamówienie na towar niedostępny.
2. **Niezgodność cenowa**: po zmianie ceny produktu w bazie klient widziałby starą cenę na stronie produktu, a inną w koszyku.
3. Zastosowanie `await connection()` oraz `force-dynamic` gwarantuje, że każde wejście na stronę wykonuje świeże zapytanie do bazy PostgreSQL, zawsze prezentując rzeczywisty stan magazynu.

---

## 8. Skrypt weryfikacji trwałości i więzów CHECK (`scripts/update-stock.ts`)

W projekcie przygotowano narzędziowy skrypt TypeScript służący do bezpośredniego testowania bazy danych za pomocą Prisma Client:

### Sposób użycia:

```bash
# 1. Zmiana stanu magazynowego wybranego produktu (np. ID=1 na 25 sztuk)
npx tsx scripts/update-stock.ts 1 25

# 2. Test działania więzu CHECK bazy danych (próba zapisu ujemnego stanu -5)
npx tsx scripts/update-stock.ts --test-negative
```

### Wynik weryfikacji więzu CHECK:
Próba zapisu ujemnego stanu magazynowego jest natychmiast odrzucana przez PostgreSQL z kodem błędu `23514`:
```
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `23514`. Message: `new row for relation "Product" violates check constraint "product_amount_nonnegative"`
```

---

## 9. Zrealizowane rozszerzenie: Historia zamówień (Sekcja 10 instrukcji)

Zgodnie z wymaganiami Sekcji 10 zaimplementowano pełne rozszerzenie **Historia zamówień** przygotowujące aplikację do obsługi relacji w kolejnych laboratoriach:

### 9.1 Modele danych i relacje
* **`User`**: model użytkownika zgodny ze specyfikacją Better Auth (`id` typu String, `name`, unikalny `email`, `emailVerified`, opcjonalne `image`, znaczniki `createdAt` i `updatedAt`).
* **`Order`**: model zamówienia z unikalnym numerem (`orderNumber`), kluczem obcym do `User` (`onDelete: Restrict`), jawnym statusem (`PENDING`, `PAID`, `CANCELLED`, `COMPLETED`) oraz sumą zamówienia w dokładnych groszach (`totalPrice`).
* **`OrderItem`**: model pozycji zamówienia powiązany z `Order` (`onDelete: Cascade`) oraz opcjonalnie z `Product` (`onDelete: SetNull`). Przechowuje pełną migawkę (*snapshot*) z chwili zakupu:
  * `productName` – kopia nazwy produktu
  * `productCode` – kopia kodu towarowego
  * `quantity` – ilość zakupionych sztuk
  * `unitPrice` – cena jednostkowa w groszach w momencie złożenia zamówienia

### 9.2 Więzy integralności w PostgreSQL (migracja SQL)
W dedykowanej migracji `prisma/migrations/20261027123000_order_history/migration.sql` dodano więzy:
```sql
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_unit_price_nonnegative" CHECK ("unitPrice" >= 0);
```

### 9.3 Ochrona historii i niezmienność cen (Snapshot)
1. **Niezmienność cen**: pozycja zamówienia posiada własną kopię ceny jednostkowej (`unitPrice`). Późniejsza zmiana ceny produktu w katalogu (`Product.price`) **nie modyfikuje** wartości historycznego zamówienia.
2. **Zachowanie historii przy usunięciu produktu**: powiązanie z produktem posiada regułę `onDelete: SetNull`. Jeśli produkt zostanie wycofany lub usunięty, pozycja w historii zamówień nadal zachowuje pełne dane (`productName`, `productCode`, `quantity`, `unitPrice`).
3. **4 deterministyczne zamówienia**: skrypt seedujący tworzy 4 zamówienia o różnych statusach dla użytkownika `Krzysztof Kacprzak`.

### 9.4 Weryfikacja rozszerzenia (`scripts/verify-orders.ts`)
Do weryfikacji i demonstracji rozszerzenia służy dedykowany skrypt:
```bash
npx tsx scripts/verify-orders.ts
```
Skrypt automatycznie:
1. Odczytuje 4 zamówienia wraz z pozycjami i powiązaniami.
2. Modyfikuje cenę produktu w bazie o +500 zł i dowodzi, że cena w zamówieniu pozostała niezmieniona.
3. Testuje odrzucenie ujemnej ceny jednostkowej oraz zerowej ilości przez więzy CHECK w PostgreSQL.

---

## 10. Wyniki testów i weryfikacji

* **Testy integracyjne (`npm test`)**: 28/28 testów zakończonych sukcesem (czas wykonania ~2.6s):
  * Testy repozytorium Prisma na aktywnej bazie PostgreSQL (odczyt, sortowanie, filtry, relacje).
  * Test natychmiastowej widoczności zmian stanu magazynowego w repozytorium po aktualizacji w bazie.
  * Test weryfikujący odrzucenie ujemnego stanu magazynowego przez więz CHECK w PostgreSQL.
  * Pełne testy walidacji parametrów zapytania URL (`searchParams`) i identyfikatorów (`[id]`).
* **Linter (`npm run lint`)**: 0 błędów, kod w pełni zgodny z regułami ESLint 9 i konfiguracją Next.js.
* **Kompilacja produkcyjna (`npm run build`)**: zakończona sukcesem (`Turbopack`), trasy `/product-list` oraz `/product-list/[id]` poprawnie skompilowane jako w pełni dynamiczne (`ƒ`).
