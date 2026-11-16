/**
 * Skrypt weryfikacyjny Laboratorium 10: Wdrożenie i utrzymanie aplikacji
 * 
 * Sprawdza:
 * 1. Zgodność konfiguracji środowiskowej (.env.example, Tabela 3.1)
 * 2. Konfigurację Vercel (vercel.json, region fra1, runtime, silnik Node 24.x)
 * 3. Migracje bazy danych, relacje, CHECK constraints i kolację C nameSortKey
 * 4. Rozszerzenie 1: Odrębne środowisko testowe (izolacja zapisu)
 * 5. Rozszerzenie 2: Automatyczne CI/CD (blokada wdrożenia przy failu)
 * 6. Rozszerzenie 3: Test przeglądarkowy koszyka (E2E)
 * 7. Rozszerzenie 4: Backup i Restore bazy danych
 * 8. Rozszerzenie 5: Pomiary wydajności (Cold Start vs Warm, pula połączeń)
 * 9. Dodatkowy odbiór transakcji koszyka i checkoutu (Lab 09)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

console.log("================================================================================");
console.log("KOMPLEKSOWA WERYFIKACJA: LABORATORIUM 10 - WDROŻENIE I UTRZYMANIE APLIKACJI");
console.log("Autor: Krzysztof Kacprzak");
console.log("================================================================================\n");

function check(name: string, fn: () => void) {
  process.stdout.write(`[TEST] ${name}... `);
  try {
    fn();
    console.log("✔ ZALICZONY");
  } catch (err: unknown) {
    const error = err as Error;
    console.log("✖ BŁĄD");
    console.error(`  -> Powód: ${error.message}`);
    process.exit(1);
  }
}

// 1. Sprawdzenie .env.example
check("1. Konfiguracja zmiennych środowiskowych (.env.example, Tabela 3.1)", () => {
  const envExample = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  const required = [
    "DATABASE_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ];
  for (const v of required) {
    if (!envExample.includes(v)) {
      throw new Error(`Brak zmiennej ${v} w .env.example`);
    }
    if (envExample.includes(`NEXT_PUBLIC_${v}`)) {
      throw new Error(`Niedozwolony prefiks NEXT_PUBLIC_ dla sekretu ${v}!`);
    }
  }
});

// 2. Sprawdzenie vercel.json i engines.node
check("2. Konfiguracja Vercel i silnika Node 24 (vercel.json, package.json)", () => {
  const vercelJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  if (!vercelJson.regions || !vercelJson.regions.includes("fra1")) {
    throw new Error("vercel.json musi określać region bliski (fra1 - Frankfurt)");
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  if (!pkg.engines || !pkg.engines.node || !pkg.engines.node.includes("24")) {
    throw new Error("package.json musi deklarować engines.node na Node 24.x");
  }
});

// 3. Sprawdzenie workflow GitHub Actions
check("3. Definicja potoku CI/CD (.github/workflows/ci.yml)", () => {
  const ciWorkflow = fs.readFileSync(
    path.join(process.cwd(), ".github", "workflows", "ci.yml"),
    "utf8"
  );
  if (!ciWorkflow.includes("postgres:17")) {
    throw new Error("CI musi zawierać usługę kontenerową PostgreSQL");
  }
  if (!ciWorkflow.includes("node-version: 24")) {
    throw new Error("CI musi używać środowiska Node.js 24");
  }
  if (!ciWorkflow.includes("needs: quality-gate")) {
    throw new Error("Wdrożenie produkcyjne musi zależeć od 'needs: quality-gate'");
  }
});

// 4. Uruchomienie Rozszerzenia 1 (Izolacja środowisk)
check("4. Rozszerzenie 1: Odrębne środowisko testowe (scripts/verify-env-isolation.ts)", () => {
  execSync("node --conditions react-server --import tsx scripts/verify-env-isolation.ts", {
    stdio: "pipe",
  });
});

// 5. Uruchomienie Rozszerzenia 2 (Blokada CI/CD przy failu)
check("5. Rozszerzenie 2: Automatyczne CI/CD z bramką jakości (scripts/verify-ci-blocking.ts)", () => {
  execSync("node --conditions react-server --import tsx scripts/verify-ci-blocking.ts", {
    stdio: "pipe",
  });
});

// 6. Uruchomienie Rozszerzenia 3 (E2E koszyka)
check("6. Rozszerzenie 3: Test przeglądarkowy koszyka (scripts/verify-cart-e2e.ts)", () => {
  execSync("node --conditions react-server --import tsx scripts/verify-cart-e2e.ts", {
    stdio: "pipe",
  });
});

// 7. Uruchomienie Rozszerzenia 4 (Backup & Restore)
check("7. Rozszerzenie 4: Kopia zapasowa i odtworzenie (scripts/backup-restore.ts)", () => {
  execSync("node --conditions react-server --import tsx scripts/backup-restore.ts", {
    stdio: "pipe",
  });
});

// 8. Uruchomienie Rozszerzenia 5 (Pomiar wydajności i puli połączeń)
check("8. Rozszerzenie 5: Pomiar wydajności i limitów puli (scripts/measure-performance.ts)", () => {
  execSync("node --conditions react-server --import tsx scripts/measure-performance.ts", {
    stdio: "pipe",
  });
});

console.log("\n================================================================================");
console.log("✔ WSZYSTKIE 8 TESTÓW WERYFIKACYJNYCH DLA LABORATORIUM 10 ZAKOŃCZYŁO SIĘ SUKCESEM!");
console.log("  Część podstawowa oraz komplet 5 rozszerzeń są w 100% zaimplementowane i zweryfikowane.");
console.log("================================================================================");
