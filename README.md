# Computer Shop 2026 – Laboratorium 09: Uwierzytelnianie i własny koszyk

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

# 2. Upewnij się, że jesteś na gałęzi lab09
git checkout lab09

# 3. Konfiguracja zmiennych środowiskowych
# Plik .env zawiera konfigurację bazy PostgreSQL oraz Better Auth
cp .env.example .env

# 4. Uruchomienie kontenera bazy danych PostgreSQL 17 w tle
docker compose up -d --wait

# 5. Zastosowanie migracji schematu bazy danych (w tym tabel auth i koszyka z regułami CHECK)
npx prisma migrate deploy

# 6. Idempotentne załadowanie danych demonstracyjnych (kategorie i 100 produktów)
npx prisma db seed

# 7. Uruchomienie pełnego zestawu testów integracyjnych (38 testów: repozytorium, walidacja, koszyk, CHECK constraints, współbieżność)
npm test

# 8. Uruchomienie skryptu weryfikacyjnego dla wszystkich rozszerzeń Lab 09
node --conditions react-server --import tsx scripts/verify-lab09.ts

# 9. Sprawdzenie zgodności kodu z ESLint (0 błędów, 0 ostrzeżeń)
npm run lint

# 10. Budowanie produkcyjne aplikacji (Next.js 16.3 Turbopack)
npm run build

# 11. Uruchomienie aplikacji produkcyjnej (domyślnie: http://localhost:3000)
npm run start

# Lub tryb deweloperski z HMR:
npm run dev
```

---

## 2. Uwierzytelnianie (Better Auth 1.7.7 i Zero-Trust)

W Laboratorium 09 zintegrowano nowoczesną bibliotekę uwierzytelniania **Better Auth** (wersja `better-auth@1.7.7` oraz `@better-auth/prisma-adapter@1.7.14`).

* **Adapter bazy danych**: Dedykowany adapter Prisma (`@better-auth/prisma-adapter`) współpracujący z instancją PostgreSQL 17.
* **Provider logowania**: GitHub OAuth (`socialProviders.github`).
* **Zasada Zero-Trust**:
  * Identyfikator użytkownika (`userId`) jest **zawsze** pobierany i weryfikowany bezpośrednio z sesji serwerowej za pomocą `auth.api.getSession({ headers: await headers() })`.
  * Klient nigdy nie przesyła własnego `userId` w ciele zapytania ani w ukrytych polach formularza.
  * Opcja `cookieCache.enabled: false` została wyłączona w `lib/auth.ts`, co wymusza weryfikację każdego tokena sesyjnego bezpośrednio w bazie danych PostgreSQL (odporność na unieważnione tokeny).

---

## 3. Modele danych i reguły bazy danych (`prisma/schema.prisma`)

### Nowe modele uwierzytelniania i koszyka:
1. **User**: Standardowy model użytkownika Better Auth (`id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`).
2. **Session**: Sesje użytkowników z unikalnym tokenem, datą wygaśnięcia, adresem IP i nagłówkiem `userAgent`.
3. **Account**: Połączenia z kontami dostawców tożsamości (OAuth GitHub).
4. **Verification**: Tokeny weryfikacyjne.
5. **Cart**: Koszyk przypisany relacją 1:1 do użytkownika (`userId String @unique`).
6. **CartItem**: Pozycja w koszyku z relacją do koszyka i produktu.
   * Unikalna para: `@@unique([cartId, productId])` – zapobiega duplikowaniu wierszy dla tego samego produktu.
   * Reguła integralności SQL CHECK: `CHECK ("quantity" BETWEEN 1 AND 99)`.
   * Kaskadowe usuwanie: usunięcie koszyka usuwa powiązane pozycje (`onDelete: Cascade`).
7. **Order & OrderItem**: Historia zamówień ze snapshotem danych z chwili zakupu oraz unikalnym kluczem idempotencji `idempotencyKey`.

---

## 4. Architektura widoków i Server Actions

* **Nawigacja i stan logowania (`app/components/auth-nav.tsx`)**:
  * Wyświetla awatar i imię/email zalogowanego użytkownika oraz przycisk „Wyloguj”.
  * Dla użytkowników niezalogowanych prezentuje przycisk „Zaloguj przez GitHub”.
* **Katalog (`/product-list`) oraz szczegóły produktu (`/product-list/[id]`)**:
  * Dodano przyciski „Do koszyka” (`AddToCartButton`), które wywołują Server Action z optymistyczną informacją zwrotną.
* **Widok koszyka (`/basket`)**:
  * Stan niezalogowany: czytelny komunikat i monit o konieczność zalogowania.
  * Stan pusty: graficzna ilustracja z przyciskiem powrotu do katalogu.
  * Stan wypełniony: tabela produktów, dynamiczne przeliczanie kwot (w całkowitych groszach), kontrolki ilości (`+` / `-` / bezpośredni wpis), usuwanie pozycji oraz podsumowanie z przyciskiem „Złóż zamówienie (Kupuję)”.
* **Server Actions (`app/lib/cart-actions.ts`)**:
  * `addToCartAction(productId, quantity)`
  * `updateQuantityAction(itemId, quantity)`
  * `removeItemAction(itemId)`
  * `checkoutAction(idempotencyKey)`
  * Wszystkie mutacje wywołują `revalidatePath('/basket')` i podlegają ścisłej autoryzacji serwerowej.

---

## 5. Implementacja wszystkich rozszerzeń (Sekcja 10 instrukcji)

W ramach Laboratorium 09 zaimplementowano **wszystkie cztery rozszerzenia** przewidziane w specyfikacji:

### Rozszerzenie 1: Transakcyjny Checkout (`checkoutCart`)
* **Klucz idempotencji (`idempotencyKey`)**: Przesłanie żądania z tym samym kluczem nie tworzy duplikatu zamówienia ani nie pobiera powtórnie sztuk z magazynu – zwraca istniejące zamówienie (idempotent replay).
* **Atomowa redukcja stanów magazynowych**: Wykonywana w pojedynczej transakcji `$transaction`. Jeśli w magazynie brakuje sztuk, transakcja zostaje natychmiast wycofana (rollback).
* **Ochrona przed współbieżnym zakupem (Double-purchase protection)**: Przetestowano równoległy zakup ostatniej sztuki przez dwóch użytkowników – dokładnie jedno zamówienie kończy się sukcesem, a drugie zostaje odrzucone z błędem braku sztuk.
* **Snapshot cenowy**: Pozycje `OrderItem` utrwalają cenę jednostkową, nazwę i kod produktu z chwili zakupu.
* **Automatyczne czyszczenie koszyka**: Po udanym zakupie pozycje koszyka użytkownika są atomowo usuwane.

### Rozszerzenie 2: Własna historia zamówień (`/order-history`)
* Strona `/order-history` prezentuje wyłącznie zamówienia zalogowanego użytkownika (`where: { userId: session.user.id }`).
* Zapewniono pełną izolację danych: Użytkownik A nie ma wglądu w zamówienia Użytkownika B.
* Użytkownik niezalogowany otrzymuje jasny monit o konieczności zalogowania się.

### Rozszerzenie 3: Wielourządzeniowe sesje (Multi-device Sessions)
* Zaimplementowano i przetestowano obsługę wielu równoczesnych sesji tego samego użytkownika (np. laptop i smartfon).
* **Pojedyncze wylogowanie**: Usunięcie pojedynczego tokena sesji unieważnia dostęp wyłącznie na danym urządzeniu, zachowując sesję na pozostałych.
* **Globalne unieważnienie**: Wyczyszczenie wszystkich sesji użytkownika natychmiast blokuje dostęp na wszystkich podłączonych urządzeniach.

### Rozszerzenie 4: Współbieżne modyfikacje koszyka (Concurrent Cart Writes)
* Sprawdzono zachowanie aplikacji przy współbieżnych mutacjach koszyka (np. równoczesne wywołanie zmiany ilości z dwóch kart przeglądarki).
* Dzięki transakcjom i kluczom unikalnym `[cartId, productId]` stan bazy danych pozostaje spójny i wolny od zduplikowanych rekordów.

---

## 6. Wyniki testów i weryfikacji

### Testy integracyjne (`npm test`):
```
> node --conditions react-server --import tsx --test app/lib/repository.test.ts app/lib/cart.test.ts

# tests 38
# suites 0
# pass 38
# fail 0
```
Wszystkie 38 testów zakończyło się wynikiem pozytywnym:
* 13 testów repozytorium produktów (sortowanie, filtrowanie, natychmiastowa widoczność, CHECK `amount >= 0`)
* 6 testów interpretacji parametrów zapytania URL
* 3 testy rygorystycznej walidacji identyfikatorów
* 2 testy walidacji schematu Zod
* 9 testów autoryzacji, izolacji koszyków, CHECK constraints, transakcyjnego checkoutu i współbieżności

### Skrypt weryfikacyjny (`scripts/verify-lab09.ts`):
```
================================================================
  Laboratorium 09: Kompleksowa weryfikacja uwierzytelniania,   
       koszyka i wszystkich rozszerzeń architektonicznych       
================================================================

[PASS] Połączenie z bazą PostgreSQL
[PASS] Weryfikacja istnienia tabel: User, Session, Account, Verification, Cart, CartItem, Order, OrderItem
[PASS] Ograniczenie SQL CHECK dla CartItem (quantity BETWEEN 1 AND 99)
[PASS] Rozszerzenie 1: Checkout transakcyjny z idempotencją i atomowością
[PASS] Rozszerzenie 2: Izolacja historii zamówień (User A vs User B)
[PASS] Rozszerzenie 3: Obsługa sesji wielourządzeniowych i unieważnianie
[PASS] Rozszerzenie 4: Współbieżność zapisów do koszyka i spójność stanu

================================================================
  Wynik testów: 7/7 zaliczonych
================================================================
```

### Jakość kodu:
* `npm run lint`: **0 błędów, 0 ostrzeżeń**
* `npm run build`: **Kompilacja zakończona sukcesem** z zachowaniem dynamicznych tras serwerowych
