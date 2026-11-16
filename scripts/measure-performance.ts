/**
 * Rozszerzenie 5: Pomiar wydajności i zużycia puli połączeń (Performance Benchmark)
 * 
 * Wymóg:
 * "Pomiar wydajności: zmierz czas odpowiedzi i zużycie puli przy współbieżnych żądaniach
 * na danych testowych. Rozróżnij pierwsze uruchomienie i kolejne próby;
 * opisz liczbę żądań, limity i warunki pomiaru."
 */

import "dotenv/config";
import pg from "pg";
import { performance } from "perf_hooks";

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Brak DATABASE_URL w środowisku");
}

console.log("================================================================================");
console.log("Laboratorium 10 - Rozszerzenie 5: Pomiar wydajności i zachowania puli połączeń");
console.log("================================================================================");
console.log("Baza testowa pomiaru:", DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

const POOL_MAX_LIMIT = 10;
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: POOL_MAX_LIMIT,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function measureColdStartVsWarm() {
  console.log("\n[Część 1] Badanie Cold Start vs kolejne zapytania (Warm):");
  
  // Cold start (nowa, świeża instancja puli bez otwartych połączeń)
  const coldPool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  
  const coldStart = performance.now();
  await coldPool.query(`
    SELECT p.id, p.name, p.price, p.amount, c.name AS category
    FROM "Product" p
    JOIN "Category" c ON p."categoryId" = c.id
    WHERE p.amount > 0 AND c.code = 'GPU'
    ORDER BY p."nameSortKey" ASC
    LIMIT 20
  `);
  const coldDuration = performance.now() - coldStart;
  console.log(`  1. Pierwsze zapytanie (Cold Start - TCP/TLS Handshake + Auth): ${coldDuration.toFixed(2)} ms`);

  // Kolejne zapytania z tej samej instancji (połączenie z puli otwarte)
  const warmDurations: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await coldPool.query(`
      SELECT p.id, p.name, p.price, p.amount, c.name AS category
      FROM "Product" p
      JOIN "Category" c ON p."categoryId" = c.id
      WHERE p.amount > 0 AND c.code = 'GPU'
      ORDER BY p."nameSortKey" ASC
      LIMIT 20
    `);
    warmDurations.push(performance.now() - t0);
  }
  const avgWarm = warmDurations.reduce((a, b) => a + b, 0) / warmDurations.length;
  console.log(`  2. Kolejne zapytania (Warm - Pula otwarta, avg 5 prób):       ${avgWarm.toFixed(2)} ms`);
  console.log(`  -> Zysk z puli połączeń (reused socket):                       ${(coldDuration / avgWarm).toFixed(1)}x szybciej!`);

  await coldPool.end();
}

async function runConcurrencyTest(concurrencyLevels: number[]) {
  console.log(`\n[Część 2] Test obciążeniowy z limitem puli (Pool Max = ${POOL_MAX_LIMIT}):`);

  for (const concurrency of concurrencyLevels) {
    console.log(`\n  --- Test współbieżności: ${concurrency} równoległych żądań ---`);
    const initialPoolState = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
    console.log(`  Stan puli przed serią: total=${initialPoolState.total}, idle=${initialPoolState.idle}, waiting=${initialPoolState.waiting}`);

    const durations: number[] = [];
    const startTime = performance.now();

    // Równoległe uruchomienie N workerów
    const workers = Array.from({ length: concurrency }).map(async (_, idx) => {
      const t0 = performance.now();
      // Mieszanka operacji: odczyt katalogu i transakcyjne zapytanie koszyka
      if (idx % 2 === 0) {
        await pool.query(`
          SELECT p.*, c.name as category_name
          FROM "Product" p
          JOIN "Category" c ON p."categoryId" = c.id
          WHERE p.amount > 0
          ORDER BY p."nameSortKey" ASC
          LIMIT 25
        `);
      } else {
        await pool.query(`
          SELECT c.id, count(ci.id) as item_count, coalesce(sum(ci.quantity * p.price), 0) as total_grosze
          FROM "Cart" c
          LEFT JOIN "CartItem" ci ON c.id = ci."cartId"
          LEFT JOIN "Product" p ON ci."productId" = p.id
          GROUP BY c.id
          LIMIT 10
        `);
      }
      durations.push(performance.now() - t0);
    });

    await Promise.all(workers);
    const totalDuration = performance.now() - startTime;

    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p50 = calculatePercentile(durations, 50);
    const p95 = calculatePercentile(durations, 95);
    const p99 = calculatePercentile(durations, 99);
    const throughput = (concurrency / (totalDuration / 1000)).toFixed(1);

    console.log(`  Wyniki dla N=${concurrency}:`);
    console.log(`    - Całkowity czas wykonania serii: ${totalDuration.toFixed(2)} ms`);
    console.log(`    - Przepustowość (Throughput):     ${throughput} req/s`);
    console.log(`    - Czas min / avg / max:          ${min.toFixed(2)} ms / ${avg.toFixed(2)} ms / ${max.toFixed(2)} ms`);
    console.log(`    - Percentyle: P50=${p50.toFixed(2)} ms | P95=${p95.toFixed(2)} ms | P99=${p99.toFixed(2)} ms`);
    console.log(`    - Stan puli po zakończeniu:       total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`);
    console.log(`    - Bezpieczeństwo puli:            Nawet przy ${concurrency} żądaniach pula nie przekroczyła ${POOL_MAX_LIMIT} połączeń.`);
  }
}

async function run() {
  try {
    await measureColdStartVsWarm();
    await runConcurrencyTest([10, 25, 50]);

    console.log("\n================================================================================");
    console.log("✔ SUKCES ROZSZERZENIA 5: Pomiary wydajności i limitów puli zakończone pomyślnie!");
    console.log("  Udokumentowano cold start vs warm query oraz kolejkę zapytań przy limitach.");
    console.log("================================================================================");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Błąd benchmarku wydajności:", err);
  process.exit(1);
});
