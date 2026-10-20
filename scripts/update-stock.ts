import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseAndValidateId } from '../app/lib/params.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Brak zmiennej DATABASE_URL.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);

  // Opcjonalny test odrzucenia wartości ujemnej przez bazę danych (SQL CHECK)
  if (args.includes('--test-negative')) {
    const testId = 1;
    console.log(`[Test CHECK] Próba zapisu ujemnego stanu magazynowego (-5) dla produktu ID=${testId}...`);
    try {
      await prisma.$executeRawUnsafe(`UPDATE "Product" SET amount = -5 WHERE id = ${testId};`);
      console.error("BŁĄD: Baza danych zaakceptowała ujemną wartość! Ograniczenie CHECK nie działa!");
      process.exit(1);
    } catch (err: unknown) {
      console.log("SUKCES: Baza danych poprawnie odrzuciła ujemną wartość z błędem CHECK:", (err as Error).message);
      return;
    }
  }

  if (args.length < 2) {
    console.log("Użycie: npx tsx scripts/update-stock.ts <id_produktu> <nowy_stan>");
    console.log("Przykład: npx tsx scripts/update-stock.ts 1 25");
    console.log("Test ograniczenia CHECK: npx tsx scripts/update-stock.ts --test-negative");
    process.exit(1);
  }

  const rawId = args[0];
  const rawAmount = args[1];

  const productId = parseAndValidateId(rawId);
  if (!productId) {
    console.error(`Niepoprawny identyfikator produktu: '${rawId}'.`);
    process.exit(1);
  }

  const newAmount = Number(rawAmount);
  if (!Number.isSafeInteger(newAmount) || newAmount < 0) {
    console.error(`Niepoprawny stan magazynowy: '${rawAmount}'. Stan musi być nieujemną liczbą całkowitą.`);
    process.exit(1);
  }

  // Odczyt aktualnego stanu
  const existing = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!existing) {
    console.error(`Produkt o ID ${productId} nie istnieje w bazie.`);
    process.exit(1);
  }

  console.log(`Produkt: "${existing.name}" (ID: ${existing.id}, Kod: ${existing.code})`);
  console.log(`Dotychczasowy stan magazynowy: ${existing.amount} szt.`);

  // Wykonanie aktualizacji
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { amount: newAmount },
  });

  console.log(`Nowy stan magazynowy: ${updated.amount} szt.`);
  console.log("Aktualizacja zakończona pomyślnie. Zmiana jest trwała w bazie PostgreSQL.");
}

main()
  .catch((err) => {
    console.error("Wystąpił błąd podczas aktualizacji:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
