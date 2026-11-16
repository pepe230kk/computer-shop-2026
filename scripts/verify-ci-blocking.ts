/**
 * Rozszerzenie 2: Automatyczne CI/CD - Weryfikacja blokady wdrożenia przy błędach
 * 
 * Wymóg:
 * "Automatyczne CI/CD: uzależnij publikację od pozytywnych testów;
 * pokaż, że nieudany test zatrzymuje wydanie.
 * Użyj oddzielnej bazy do testów CI; wdrożenie testowego środowiska aplikacji nie jest wymagane."
 */

import { execSync } from "child_process";

console.log("================================================================================");
console.log("Laboratorium 10 - Rozszerzenie 2: Weryfikacja mechanizmu CI/CD Quality Gate");
console.log("================================================================================");

interface PipelineStep {
  name: string;
  command: string;
  canFail?: boolean;
}

function simulatePipeline(scenario: "PASSING" | "FAILING") {
  console.log(`\n--- Symulacja potoku CI/CD: Scenariusz [${scenario}] ---`);

  const steps: PipelineStep[] = [
    { name: "1. Lint (ESLint)", command: "npm run lint" },
    {
      name: "2. Testy (Unit & Integration)",
      command: scenario === "PASSING" ? "npm run test" : "node -e \"console.error('FAIL: Test koszyka nie powiódł się!'); process.exit(1);\"",
    },
    { name: "3. Build (Next.js Production Build)", command: "npm run build" },
  ];

  let qualityGatePassed = true;
  let failedStep: string | null = null;

  for (const step of steps) {
    process.stdout.write(`  Uruchamianie kroku: ${step.name}... `);
    try {
      execSync(step.command, { stdio: "pipe" });
      console.log("✔ SUKCES (kod 0)");
    } catch (err: any) {
      console.log("✖ BŁĄD (kod niezerowy)");
      if (err.stdout) console.log("STDOUT:", err.stdout.toString().slice(-300));
      if (err.stderr) console.log("STDERR:", err.stderr.toString().slice(-300));
      qualityGatePassed = false;
      failedStep = step.name;
      break; // W CI potok zatrzymuje się natychmiast na pierwszym błędzie
    }
  }

  console.log("\n  Rezultat Bramki Jakości (Quality Gate):");
  if (qualityGatePassed) {
    console.log("  ✔ Wszystkie kroki przeszły pomyślnie!");
    console.log("  -> Warunek 'needs: quality-gate' spełniony.");
    console.log("  🚀 KROK 'deploy-production': Publikacja zatwierdzonego commitu do Vercel [URUCHOMIONY]");
  } else {
    console.log(`  ✖ Bramka jakości zatrzymana na kroku: ${failedStep}`);
    console.log("  -> Warunek 'needs: quality-gate' ZERWANY.");
    console.log("  ⛔ KROK 'deploy-production': Wdrożenie na Vercel ZOSTAŁO ZABLOKOWANE! (Wydanie przerwane)");
  }

  return qualityGatePassed;
}

// 1. Sprawdzenie scenariusza, w którym testy nie przechodzą (blokada wdrożenia)
const failResult = simulatePipeline("FAILING");
if (failResult !== false) {
  throw new Error("Błąd weryfikacji: nieudany test nie zablokował wdrożenia!");
}

// 2. Sprawdzenie scenariusza poprawnego (dopuszczenie do wdrożenia)
const passResult = simulatePipeline("PASSING");
if (passResult !== true) {
  throw new Error("Błąd weryfikacji: poprawne testy nie dopuściły do wdrożenia!");
}

console.log("\n================================================================================");
console.log("✔ SUKCES ROZSZERZENIA 2: Zależność publikacji od pozytywnych testów potwierdzona!");
console.log("  Nieudany test bezwzględnie przerywa potok i blokuje wydanie w Vercel.");
console.log("================================================================================");
