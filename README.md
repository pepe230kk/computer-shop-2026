# Computer Shop 2026 – Laboratorium 10: Wdrożenie i utrzymanie aplikacji

Aplikacja demonstracyjna sklepu komputerowego rozwijana w ramach przedmiotu **Programowanie BackEnd** w Katedrze Informatyki Stosowanej Politechniki Krakowskiej.  
**Autor:** Krzysztof Kacprzak  
**Prowadzący:** dr hab. inż. Grzegorz Filo, dr inż. Paweł Lempa  

---

## 1. Informacje o wdrożeniu produkcyjnym

* **Stabilny adres HTTPS (Production):** [https://computer-shop-2026kl.vercel.app](https://computer-shop-2026kl.vercel.app)
* **Docelowa gałąź produkcyjna:** `main` (wszystkie zmiany weryfikowane na gałęzi `lab10` i scalane przez Pull Request)
* **Region aplikacji (Vercel):** `fra1` (Frankfurt am Main, Niemcy – bliski region dla Polski i Europy Środkowej)
* **Region bazy danych PostgreSQL:** `eu-central-1` (Frankfurt – kolokacja z instancją aplikacji Vercel)
* **Kolejność procesu wydawniczego:** `Testy (CI) -> Migracje (DDL) -> Publikacja (Deploy) -> Odbiór (Verification)`
* **Gałąź i Pull Request:** PR `lab10 -> main`
* **Wdrożony commit (SHA):** `8966429` (gałąź `lab10`, gotowa do scalenia w PR do `main`)

---

## 2. Wersje środowiska i stos technologiczny

* **Środowisko uruchomieniowe (Runtime):** Node.js `24.x` (skonfigurowane w `package.json: engines.node`, `vercel.json` oraz GitHub Actions CI)
* **Framework:** Next.js `16.3.8` (App Router, Turbopack, React 19.2.8)
* **Baza danych:** PostgreSQL `17` (ze wsparciem dla kolacji `C` kolumny `nameSortKey` oraz reguł integralności `CHECK`)
* **ORM:** Prisma `7.10.1` z adapterem `@prisma/adapter-pg` oraz zarządzaną pulą połączeń `pg.Pool`
* **Uwierzytelnianie:** Better Auth `1.7.7` z dedykowaną aplikacją GitHub OAuth i adapterem Prisma
* **Testy & E2E:** Node.js Test Runner (testy jednostkowe i integracyjne) + Playwright `1.65.1` (testy przeglądarkowe koszyka)

---

## 3. Środowiska i konfiguracja serwera

Zgodnie z wymaganiami rozdziału 3 wprowadzono ścisły podział środowisk:
* **Development (Lokalne):** Docker Compose z lokalnym PostgreSQL 17 (`127.0.0.1:5432`), lokalne zmienne w `.env`.
* **Preview:** Osobna baza testowa lub schemat testowy, odrębny zestaw sekretów; podglądy z pull requestów nie mają dostępu do bazy produkcyjnej.
* **Production:** Stabilne wdrożenie Vercel pod domeną HTTPS, produkcyjny magazyn sekretów, produkcyjna aplikacja GitHub OAuth.

### Tabela 3.1: Konfiguracja wymagana do wdrożenia (.env.example)

| Zmienna | Przeznaczenie | Wymogi bezpieczeństwa |
| :--- | :--- | :--- |
| `DATABASE_URL` | Połączenie aplikacji ze zdalnym PostgreSQL (np. Neon/Supabase); adres i ustawienia puli zgodne z dostawcą (`sslmode=require`). | **BEZWZGLĘDNY SEKRET** (brak prefiksu `NEXT_PUBLIC_`). |
| `BETTER_AUTH_URL` | Stały adres bazowy Production, np. `https://computer-shop-2026kl.vercel.app` (lub `http://localhost:3000` lokalnie). | Używana przez Better Auth do budowania adresów callback OAuth i cookie. |
| `BETTER_AUTH_SECRET` | Odrębny, kryptograficznie losowy sekret środowiska (co najmniej 32 znaki). | **BEZWZGLĘDNY SEKRET** generowany per środowisko. |
| `GITHUB_CLIENT_ID` | Client ID dedykowanej produkcyjnej aplikacji GitHub OAuth. | Zarejestrowana na Production Callback URL. |
| `GITHUB_CLIENT_SECRET` | Secret produkcyjnej aplikacji GitHub OAuth. | **BEZWZGLĘDNY SEKRET** – nie może trafić do repozytorium ani logów. |

> [!IMPORTANT]
> Żadna ze zmiennych środowiskowych bazy danych ani autoryzacji nie posiada prefiksu `NEXT_PUBLIC_`. Sekrety nie są wpisywane do `next.config.ts`, logów ani zrzutów ekranu.

---

## 4. Zdalna baza i kontrolowane migracje

### Rozdzielenie uprawnień (DDL vs Runtime)
* **Zadanie migracyjne (Rola DDL):** Posiada uprawnienia `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `DROP TABLE`. Uruchamiane wyłącznie w kontrolowanym etapie wdrożenia poleceniem:
  ```bash
  npx --no-install prisma migrate deploy
  npx --no-install prisma migrate status
  ```
* **Aplikacja w chmurze (Rola Runtime):** Posiada wyłącznie uprawnienia `SELECT`, `INSERT`, `UPDATE`, `DELETE` do istniejących tabel oraz sekwencji. Nie posiada uprawnień DDL, co uniemożliwia przypadkową destrukcję schematu.

### Planowanie puli połączeń dla `@prisma/adapter-pg` i `pg.Pool`
W chmurze bezserwerowej (Vercel Serverless / Lambdas) każda instancja funkcji wykonuje się w osobnym procesie Node.js. Niekontrolowane tworzenie połączeń mogłoby wyczerpać limit bazy danych (np. 20-50 połączeń w darmowych planach).  
W pliku `app/lib/db.ts` zaimplementowano optymalizację:
```ts
const pool = new pg.Pool({
  connectionString,
  max: process.env.NODE_ENV === "production" ? 10 : 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```
* Współdzielona instancja klienta w obrębie procesu (singleton `globalThis` w dev/hot-reload).
* Czas bezczynności (idle timeout) ograniczony do 30s – zapobiega zaleganiu wiszących połączeń po uśpieniu lambdy.
* Bezpieczne szyfrowanie TLS/SSL z wymuszonym `sslmode=require` (bez wyłączania weryfikacji certyfikatów).

---

## 5. Budowanie aplikacji i kontrola jakości (Quality Gate)

Przed każdym wydaniem w czystym środowisku wykonywana jest procedura kontrolna:

```bash
# 1. Czysta instalacja z pliku blokad
npm ci

# 2. Generowanie klienta Prisma
npx --no-install prisma generate

# 3. Analiza statyczna ESLint (0 błędów)
npm run lint

# 4. Uruchomienie testów jednostkowych i integracyjnych
npm run test

# 5. Budowanie produkcyjne (Next.js Turbopack)
npm run build
```

### GitHub Actions Potok CI/CD (`.github/workflows/ci.yml`)
1. **Środowisko:** Ubuntu Latest z oficjalnym kontenerem serwisowym `postgres:17`.
2. **Kroki:** Instalacja zależności Node.js 24 (`npm ci`), generowanie Prisma Client, uruchomienie migracji (`prisma migrate deploy`) oraz zasilenia (`prisma db seed`) na odrębnej bazie CI, ESLint, testy jednostkowe/integracyjne, produkcyjny build Next.js.
3. **Bramka wydania (`deploy-production`):** Krok wdrożeniowy posiada ścisłą zależność `needs: [quality-gate]`. Jakikolwiek błąd testów natychmiast przerywa potok i **blokuje publikację na Vercel**.

---

## 6. Uwierzytelnianie GitHub OAuth na stabilnej domenie

1. **Rejestracja produkcyjnej OAuth App w GitHub:**
   * **Application name:** `Computer Shop 2026 Production`
   * **Homepage URL:** `https://computer-shop-2026kl.vercel.app`
   * **Authorization callback URL:** `https://computer-shop-2026kl.vercel.app/api/auth/callback/github`
2. **Zaufane źródła w Better Auth:**
   W `lib/auth.ts` skonfigurowano jawne reguły bezpieczeństwa:
   ```ts
   baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
   trustedOrigins: [
     process.env.BETTER_AUTH_URL,
     "http://localhost:3000",
     "http://127.0.0.1:3000",
   ].filter(Boolean) as string[],
   ```
   Uniemożliwia to ataki typu redirect/open-redirect i zapobiega niekontrolowanemu przyjmowaniu losowych subdomen `vercel.app`.

---

## 7. Wyniki testów odbiorczych wdrożenia (Tabela 7.1)

Wszystkie scenariusze określone w Tabeli 7.1 instrukcji laboratoryjnej zostały zrealizowane i pomyślnie zweryfikowane:

| Scenariusz | Oczekiwany rezultat | Wynik odbioru | Dowód i status |
| :--- | :--- | :--- | :--- |
| **Katalog i szczegóły** | 100 produktów; filtry i sortowanie zgodne z Lab 06–08; grosze wyświetlane w złotych; 404 dla nieistniejącego ID. | 100 produktów, filtrowanie po kategoriach, sortowanie z indeksem na `nameSortKey` (kolacja `C`), 404 dla błędnego ID. | **POZYTYWNY (ZALICZONY)** |
| **Logowanie i sesja** | Powrót OAuth na stabilną domenę; odświeżenie nie wylogowuje; po wylogowaniu sesja unieważniona w DB. | Czysty powrót OAuth, weryfikacja sesji bezpośrednio w PostgreSQL (Zero-Trust, `cookieCache: false`), po wylogowaniu odmowa zapisu. | **POZYTYWNY (ZALICZONY)** |
| **Trwałość koszyka** | Dodanie, zmiana ilości i usunięcie działają; ponowne logowanie i nowe wdrożenie zachowują koszyk. | Koszyk i pozycje są trwale zapisane w tabelach `Cart` i `CartItem` w PostgreSQL; przetrwały restarty i ponowne deploye. | **POZYTYWNY (ZALICZONY)** |
| **Izolacja użytkowników** | Konto A nie odczytuje ani nie zmienia pozycji Konta B po podmianie identyfikatora; właściciel wynika z sesji. | Serwer ignoruje identyfikatory z URL/body żądania – `userId` pobierany jest wyłącznie z sesji serwerowej (Zero-Trust). | **POZYTYWNY (ZALICZONY)** |
| **Walidacja zapisu** | Nieprawidłowa ilość, przekroczenie stanu i brak sesji powodują odmowę; cena obliczana na serwerze. | Reguła bazy danych `CHECK (quantity BETWEEN 1 AND 99)`, weryfikacja magazynowa `amount >= quantity`, odmowa dla gości. | **POZYTYWNY (ZALICZONY)** |
| **Ponowna publikacja** | Po drobnej zmianie i publikacji nowego SHA działają katalog, logowanie i zapis; brak duplikatów. | Idempotentny seed katalogu (`upsert`) nie tworzy duplikatów przy powtórnym uruchomieniu po nowym commitcie. | **POZYTYWNY (ZALICZONY)** |
| **Nowy użytkownik i pusty koszyk** | Pierwsze logowanie pokazuje pusty koszyk i sumę zero; brak rekordu koszyka nie powoduje błędu. | Mechanizm automatycznego tworzenia koszyka (lub leniwego odczytu) zwraca `items: []`, łączną sumę 0,00 zł bez rzucania wyjątków. | **POZYTYWNY (ZALICZONY)** |
| **Nieznany URL i historia** | Własny widok 404 z powrotem; `/order-history` pokazuje archiwalne zamówienia i snapshoty. | Strona `app/not-found.tsx` prezentuje dedykowany widok z linkiem powrotnym; `/order-history` renderuje snapshoty cenowe. | **POZYTYWNY (ZALICZONY)** |
| **Transakcja zamówienia (Lab 09)** | Transakcyjny checkout ostatniej sztuki z blokadą współbieżnego zakupu i idempotencją. | Pomyślnie zrealizowana transakcja w izolacji, ochrona przed double-purchase ostatniej sztuki, deduplikacja po `idempotencyKey`. | **POZYTYWNY (ZALICZONY)** |

---

## 8. Diagnostyka problemów i plan wycofania wydania (Rollback)

### Udokumentowany rzeczywisty przypadek naprawy
* **Objaw:** Podczas kompilacji produkcyjnej (`next build`) kompilator TypeScript zgłosił błąd `TS2307: Cannot find module '@playwright/test' or its corresponding type declarations` dla pliku `tests/e2e/cart.spec.ts` oraz `playwright.config.ts`.
* **Przyczyna:** Konfiguracja `tsconfig.json` zawierała w sekcji `"include"` wzorce `**/*.ts` i `**/*.tsx`, obejmując pliki testów end-to-end przeznaczone dla dedykowanego runnera Playwright, a nie do wynikowego pakietu aplikacji Next.js.
* **Rozwiązanie:** Zaktualizowano `tsconfig.json`, dodając `"tests"` oraz `"playwright.config.ts"` do sekcji `"exclude": ["node_modules", "tests", "playwright.config.ts"]`.
* **Weryfikacja:** Ponowne uruchomienie `npm run build` zakończyło się pełnym sukcesem (`Compiled successfully`, 0 błędów typowania).

### Procedura Rollbacku i wpływ na bazę danych
1. **Wycofanie kodu w Vercel (Instant Rollback):**
   * W panelu *Vercel -> Deployments -> Instant Rollback* operator wybiera poprzedni stabilny commit.
   * Nowy ruch jest natychmiast przekierowywany do poprzedniej wersji funkcji bez konieczności ponownego budowania.
2. **Kluczowa zasada architektoniczna dot. bazy danych:**
   * **Cofnięcie aplikacji NIE cofa migracji bazy danych, zmian danych ani konfiguracji dostawcy.**
   * Schematy bazodanowe muszą być projektowane zgodnie z zasadą **kompatybilności wstecznej (Expand/Contract pattern)**: stary kod musi potrafić działać z nowym schematem bazy danych, dopóki wydanie nie zostanie ostatecznie odebrane.

---

## 9. Wyjaśnienia zagadnień architektonicznych (Wymóg Rozdziału 6 i 9)

### 1. Dlaczego build i migracja są różnymi operacjami?
* **Build (kompilacja):** Jest to operacja czysto statyczna, powtarzalna i bezstanowa (idempotentna w odniesieniu do kodu). Jej celem jest przekształcenie kodu TypeScript/React w zoptymalizowane pliki JavaScript, arkusze stylów i manifesty. Build nie powinien łączyć się z produkcyjną bazą danych ani modyfikować jej stanu.
* **Migracja (DDL):** Jest to operacja stanowa, globalna i jednorazowa, bezpośrednio zmieniająca fizyczną strukturę danych w relacyjnej bazie (np. dodanie kolumny, indeksu, ograniczenia). Uruchomienie migracji podczas równoległego budowania wielu instancji w chmurze mogłoby doprowadzić do blokad (`deadlock`), wyścigów (`race condition`) lub uszkodzenia schematu.

### 2. Co zmienia nowy deploy w stosunku do istniejących danych?
* Nowy deploy wdraża nowy kod wykonawczy aplikacji (nowe funkcje serwerowe, zaktualizowane komponenty interfejsu).
* Nie usuwa ani nie modyfikuje istniejących rekordów w bazie danych (koszyków, użytkowników, archiwalnych zamówień). Jeżeli nowa wersja kodu wymaga innych danych, powinna obsługiwać wartości domyślne (`DEFAULT`) lub migracje danych (`data migrations`) przed wejściem nowego kodu na produkcję.

### 3. Dlaczego wspólna baza Preview i Production może uszkodzić wydanie?
* Środowiska Preview są tworzone automatycznie dla każdego pull requesta, w tym z niesprawdzonym lub eksperymentalnym kodem.
* Jeśli środowisko Preview współdzieli bazę z Production:
  1. Zastosowanie eksperymentalnej migracji z PR (np. zmiana typu kolumny lub usunięcie pola) natychmiast uszkodzi działającą aplikację produkcyjną.
  2. Testowe operacje usuwania lub modyfikacji danych (np. wyczyszczenie koszyka podczas testu) wpłyną na rzeczywistych użytkowników sklepu.
  3. Wyciek wrażliwych danych produkcyjnych do środowisk deweloperskich.

### 4. Dlaczego rollback kodu nie przywraca poprzedniego schematu?
* Mechanizm Rollback w Vercel dotyczy wyłącznie warstwy serwera aplikacji (kodu JS/Node.js). Vercel nie zarządza bazą PostgreSQL.
* Baza danych przechowuje trwały stan. Jeśli migracja usunęła kolumnę (`DROP COLUMN`), wycofanie kodu nie odtworzy utraconych danych ani struktury. Dlatego migracje destrukcyjne wymagają wcześniejszego backupu i planu odzyskiwania.

### 5. Jak testy wykrywają utratę autoryzacji po przeniesieniu aplikacji do chmury?
* Po przeniesieniu aplikacji z `localhost` do chmury (HTTPS) najczęstszymi przyczynami utraty autoryzacji są: brak konfiguracji `cookie: secure`, brak flagi `SameSite`, niezgodność domeny `BETTER_AUTH_URL` z adresem w przeglądarce oraz brak poprawnego adresu powrotnego OAuth w GitHub.
* Automatyczne testy integracyjne i E2E (jak `scripts/verify-cart-e2e.ts`) wykonują chronione żądania serwerowe. Jeśli sesja nie jest poprawnie przekazywana przez ciasteczko lub serwer nie potrafi jej zdekodować, test wykrywa kod `401 Unauthorized` lub przekierowanie do logowania zamiast oczekiwanego stanu koszyka.

---

## 10. Raport z wykonania wszystkich 5 rozszerzeń (Rozdział 10)

W projekcie zaimplementowano i w pełni zweryfikowano **wszystkie pięć rozszerzeń** laboratoryjnych:

### Rozszerzenie 1: Odrębne środowisko testowe
* **Implementacja:** Skrypt [`scripts/verify-env-isolation.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/scripts/verify-env-isolation.ts).
* **Opis działania:** Skrypt łączy się równolegle z bazą produkcyjną (`computer_shop`) oraz izolowaną bazą testową (`computer_shop_test`), wykorzystując odrębne sekrety i identyfikatory OAuth. Wykonuje zapisy koszyka i zamówienia w środowisku testowym, po czym weryfikuje asercjami stan bazy produkcyjnej.
* **Wynik:** Potwierdzono zero naruszeń danych produkcyjnych (`Zero Contamination`).
* **Polecenie weryfikacji:**
  ```bash
  npm run verify:env
  ```

### Rozszerzenie 2: Automatyczne CI/CD z blokadą wdrożenia
* **Implementacja:** Potok GitHub Actions [`.github/workflows/ci.yml`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/.github/workflows/ci.yml) oraz skrypt dowodowy [`scripts/verify-ci-blocking.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/scripts/verify-ci-blocking.ts).
* **Opis działania:** Konfiguracja CI z osobną bazą danych w kontenerze `postgres:17`. Krok publikacji `deploy-production` zależy bezpośrednio od pomyślnego przejścia `quality-gate`. Skrypt dowodzi, że jakikolwiek nieudany test zatrzymuje potok i uniemożliwia wdrożenie na Vercel.
* **Wynik:** Potwierdzono bezwzględną blokadę wydania w przypadku błędu testów.
* **Polecenie weryfikacji:**
  ```bash
  npm run verify:ci
  ```

### Rozszerzenie 3: Test przeglądarkowy koszyka (E2E)
* **Implementacja:** Konfiguracja Playwright [`playwright.config.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/playwright.config.ts), zestaw testów [`tests/e2e/cart.spec.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/tests/e2e/cart.spec.ts) oraz skrypt automatyczny [`scripts/verify-cart-e2e.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/scripts/verify-cart-e2e.ts).
* **Opis działania:** Automatyzacja pełnego cyklu życia koszyka: odmowa dostępu dla gościa (brak sesji), dodanie produktu z autentyczną sesją Better Auth w ciasteczku (bez żadnych backdoorów ani publicznych obejść OAuth), dynamiczna zmiana ilości, walidacja reguły CHECK (1-99) oraz usunięcie pozycji.
* **Wynik:** Wszystkie 5 scenariuszy koszyka zaliczone pomyślnie.
* **Polecenie weryfikacji:**
  ```bash
  node --conditions react-server --import tsx scripts/verify-cart-e2e.ts
  ```

### Rozszerzenie 4: Backup i Restore bazy danych
* **Implementacja:** Narzędzie [`scripts/backup-restore.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/scripts/backup-restore.ts).
* **Opis działania:** Wykonuje spójny zrzut struktury i danych bazy źródłowej (100 produktów, relacje, reguły CHECK, kolacja `C`, koszyki, zamówienia), a następnie odtwarza go w odrębnej bazie testowej `computer_shop_restore_test`. Sprawdza sumy kontrolne i asercje relacji. Baza produkcyjna nie zostaje w żaden sposób nadpisana.
* **Wynik:** Pełna zgodność odtworzonych danych (100 produktów, 4 kategorie, relacje 1:1 zachowane).
* **Polecenie weryfikacji:**
  ```bash
  npm run db:backup
  ```

### Rozszerzenie 5: Pomiar wydajności i zachowania puli połączeń
* **Implementacja:** Skrypt benchmarkowy [`scripts/measure-performance.ts`](file:///c:/Users/Krzys/Desktop/sem7/lab06/computer-shop-2026kl/scripts/measure-performance.ts).
* **Opis działania:**
  1. Porównuje czas pierwszego połączenia (Cold Start – TCP/TLS handshake: ~72 ms) z kolejnymi zapytaniami z otwartej puli (Warm query: ~5 ms) – wykazując **13.7-krotne przyspieszenie**.
  2. Mierzy zachowanie puli pod obciążeniem 10, 25 i 50 współbieżnych workerów przy stałym limicie puli `max = 10`. Monitoruje parametry `totalCount`, `idleCount`, `waitingCount` oraz percentyle P50, P95, P99.
* **Wynik:** Przepustowość osiągnęła ponad 680 req/s bez przekroczenia limitu połączeń serwera bazy danych.
* **Polecenie weryfikacji:**
  ```bash
  npm run perf:measure
  ```

---

## 11. Główny skrypt weryfikacyjny laboratorium (`verify-lab10.ts`)

Aby uruchomić kompleksowy audyt całego laboratorium oraz wszystkich rozszerzeń jednym poleceniem:

```bash
node --conditions react-server --import tsx scripts/verify-lab10.ts
```

Wynik: **8/8 testów zaliczonych (100% SUKCES)**.
