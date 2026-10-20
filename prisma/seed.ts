import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { PrismaClient } from '../lib/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { ProductListSchema } from '../app/lib/product-schema.js';
import { calculateNameSortKey } from '../app/lib/sort-key.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Błąd: brak zmiennej środowiskowej DATABASE_URL.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Rozpoczynanie procesu seedowania bazy danych...");

  // 1. Odczyt i walidacja danych wejściowych z pliku JSON
  const dataPath = path.join(process.cwd(), "data", "products.json");
  const fileContents = await fs.readFile(dataPath, "utf8");
  const rawData = JSON.parse(fileContents);

  const parsed = ProductListSchema.safeParse(rawData);
  if (!parsed.success) {
    console.error("Błąd walidacji danych demonstracyjnych:", parsed.error);
    throw new Error("Niepoprawne dane w data/products.json");
  }

  const products = parsed.data;
  console.log(`Pomyślnie zwalidowano ${products.length} produktów z pliku JSON.`);

  // 2. Transakcja gwarantująca atomowość seedowania
  await prisma.$transaction(async (tx) => {
    // A. Cztery stabilne kategorie
    const categoriesData = [
      { code: "cpu", name: "Procesory" },
      { code: "gpu", name: "Karty graficzne" },
      { code: "ram", name: "Pamięci RAM" },
      { code: "disk", name: "Dyski" },
    ];

    const categoryMap = new Map<string, number>();

    for (const cat of categoriesData) {
      const savedCat = await tx.category.upsert({
        where: { code: cat.code },
        update: { name: cat.name },
        create: { code: cat.code, name: cat.name },
      });
      categoryMap.set(cat.code, savedCat.id);
    }
    console.log("Kategorie zaktualizowane pomyślnie (4 kategorie).");

    // B. 100 produktów z jawnymi ID, kodami, cenami, stanami i kluczem nameSortKey
    for (const p of products) {
      const categoryId = categoryMap.get(p.type);
      if (!categoryId) {
        throw new Error(`Nie odnaleziono kategorii '${p.type}' w bazie.`);
      }

      const nameSortKey = calculateNameSortKey(p.name);

      await tx.product.upsert({
        where: { id: p.id },
        update: {
          code: p.code,
          name: p.name,
          description: p.description,
          image: p.image,
          price: p.price,
          amount: p.amount,
          date: new Date(p.date),
          nameSortKey,
          categoryId,
        },
        create: {
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          image: p.image,
          price: p.price,
          amount: p.amount,
          date: new Date(p.date),
          nameSortKey,
          categoryId,
        },
      });
    }

    console.log(`Zaimportowano/zaktualizowano ${products.length} produktów.`);
  });

  console.log("Seedowanie zakończone pomyślnie!");
}

seed()
  .catch((err) => {
    console.error("Błąd podczas seedowania bazy danych:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
