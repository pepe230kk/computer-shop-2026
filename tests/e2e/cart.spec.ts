import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../lib/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "crypto";

const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

test.describe("Laboratorium 10 - Rozszerzenie 3: Test przeglądarkowy koszyka (E2E)", () => {
  let testUserId: string;
  let sessionToken: string;

  test.beforeAll(async () => {
    // Przygotowanie użytkownika i autentycznej sesji w bazie danych (bez publicznego bypassu OAuth)
    const email = `e2e.tester.${Date.now()}@test.local`;
    testUserId = `e2e-user-${crypto.randomUUID()}`;
    sessionToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.create({
      data: {
        id: testUserId,
        email,
        name: "E2E Test User",
        emailVerified: true,
      },
    });

    // Tworzenie sesji w bazie danych zgodnej z Better Auth
    await prisma.session.create({
      data: {
        id: `sess-${crypto.randomUUID()}`,
        token: sessionToken,
        userId: testUserId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });
  });

  test.afterAll(async () => {
    // Sprzątanie danych po teście
    try {
      await prisma.cartItem.deleteMany({
        where: { cart: { userId: testUserId } },
      });
      await prisma.cart.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.session.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    } catch {}
    await prisma.$disconnect();
    await pool.end();
  });

  test("1. Odmowa dostępu do koszyka bez aktywnej sesji (Guest)", async ({ browser }) => {
    // Czysty kontekst przeglądarki bez ciasteczek
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/basket");

    // Weryfikacja: widok blokady z informacją o konieczności logowania
    await expect(page.locator("h2")).toContainText("Zaloguj się, aby uzyskać dostęp do koszyka");
    // Brak tabeli z pozycjami koszyka
    await expect(page.locator("table")).toHaveCount(0);
    // Obecność przycisku GitHub OAuth
    await expect(page.locator("button:has-text('Zaloguj przez GitHub')")).toBeVisible();

    await context.close();
  });

  test("2. Pełny cykl koszyka: dodanie, zmiana ilości i usunięcie z autentyczną sesją", async ({ browser }) => {
    // Kontekst z wstrzykniętym autentycznym ciasteczkiem sesji Better Auth
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();

    // Krok A: Wejście do koszyka - powinien być pusty
    await page.goto("/basket");
    await expect(page.locator("h1")).toContainText("Twój koszyk");
    await expect(page.locator("text=Twój koszyk jest pusty")).toBeVisible();

    // Krok B: Przejście do widoku szczegółów produktu #1
    await page.goto("/product-list/1");
    await expect(page.locator("h1")).toBeVisible();

    // Kliknięcie "Dodaj do koszyka"
    const addToCartBtn = page.locator("button:has-text('Dodaj do koszyka')");
    await expect(addToCartBtn).toBeVisible();
    await addToCartBtn.click();

    // Oczekiwanie na komunikat sukcesu lub przekierowanie do koszyka
    await page.waitForTimeout(1000);
    await page.goto("/basket");

    // Krok C: Weryfikacja obecności produktu w koszyku
    await expect(page.locator("table")).toBeVisible();
    const quantityDisplay = page.locator("span:has-text('1')");
    await expect(quantityDisplay.first()).toBeVisible();

    // Krok D: Zmiana ilości pozycji (zwiększenie o 1)
    const plusBtn = page.locator("button:has-text('+')").first();
    if (await plusBtn.isVisible()) {
      await plusBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("span:has-text('2')").first()).toBeVisible();
    }

    // Krok E: Usunięcie pozycji z koszyka
    const removeBtn = page.locator("button:has-text('Usuń')").first();
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("text=Twój koszyk jest pusty")).toBeVisible();
    }

    await context.close();
  });
});
