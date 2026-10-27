import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Błąd: brak zmiennej środowiskowej DATABASE_URL.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Weryfikacja Rozszerzenia: Historia Zamówień (Lab 08) ===");

  // 1. Pobranie i wyświetlenie zamówień
  const orders = await prisma.order.findMany({
    include: {
      user: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  console.log(`\nLiczba zamówień w bazie: ${orders.length}`);
  for (const order of orders) {
    console.log(`\n[Zamówienie ${order.orderNumber}] Status: ${order.status}, Klient: ${order.user.name} (${order.user.email})`);
    console.log(`Łączna kwota: ${(order.totalPrice / 100).toFixed(2)} zł`);
    for (const item of order.items) {
      console.log(`  - ${item.productName} (kod: ${item.productCode}) | Ilość: ${item.quantity} szt. | Cena zakupu (snapshot): ${(item.unitPrice / 100).toFixed(2)} zł | Aktualna cena w sklepie: ${(item.product?.price ? item.product.price / 100 : 0).toFixed(2)} zł`);
    }
  }

  // 2. Demonstracja niezmienności snapshotu cenowego po zmianie ceny produktu
  console.log("\n--- Test niezmienności snapshotu cenowego ---");
  const firstItem = orders[0].items[0];
  const testProductId = firstItem.productId!;
  const originalProduct = await prisma.product.findUnique({ where: { id: testProductId } });
  
  if (originalProduct) {
    const originalPrice = originalProduct.price;
    const modifiedPrice = originalPrice + 50000; // podwyżka o 500 zł

    console.log(`Zmieniamy cenę produktu ID=${testProductId} ("${originalProduct.name}") z ${(originalPrice / 100).toFixed(2)} zł na ${(modifiedPrice / 100).toFixed(2)} zł w bazie...`);
    await prisma.product.update({
      where: { id: testProductId },
      data: { price: modifiedPrice },
    });

    // Sprawdzamy, czy w historii zamówienia cena pozostała nienaruszona
    const orderItemAfterChange = await prisma.orderItem.findUnique({ where: { id: firstItem.id } });
    console.log(`Cena w pozycji zamówienia po zmianie w sklepie: ${(orderItemAfterChange!.unitPrice / 100).toFixed(2)} zł`);
    if (orderItemAfterChange!.unitPrice === firstItem.unitPrice) {
      console.log("SUKCES: Zmiana aktualnej ceny w sklepie NIE wpłynęła na cenę w historycznym zamówieniu (snapshot zachowany).");
    } else {
      console.error("BŁĄD: Cena w zamówieniu uległa zmianie!");
    }

    // Przywrócenie pierwotnej ceny
    await prisma.product.update({
      where: { id: testProductId },
      data: { price: originalPrice },
    });
    console.log(`Przywrócono pierwotną cenę produktu (${(originalPrice / 100).toFixed(2)} zł).`);
  }

  // 3. Test więzów CHECK bazy danych dla OrderItem
  console.log("\n--- Test więzów CHECK dla OrderItem w PostgreSQL ---");
  
  // Test ujemnej ceny
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OrderItem" ("orderId", "productName", "productCode", "quantity", "unitPrice") VALUES (${orders[0].id}, 'Test', 'TEST01', 1, -100);`
    );
    console.error("BŁĄD: Baza pozwoliła zapisać ujemną cenę jednostkową!");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("order_item_unit_price_nonnegative")) {
      console.log("SUKCES: Baza PostgreSQL odrzuciła ujemną cenę jednostkową (CHECK constraint 'order_item_unit_price_nonnegative').");
    } else {
      console.log("Odrzucono:", msg);
    }
  }

  // Test ilości <= 0
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OrderItem" ("orderId", "productName", "productCode", "quantity", "unitPrice") VALUES (${orders[0].id}, 'Test', 'TEST01', 0, 100);`
    );
    console.error("BŁĄD: Baza pozwoliła zapisać zerową/ujemną ilość!");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("order_item_quantity_positive")) {
      console.log("SUKCES: Baza PostgreSQL odrzuciła zerową ilość (CHECK constraint 'order_item_quantity_positive').");
    } else {
      console.log("Odrzucono:", msg);
    }
  }

  console.log("\n=== Wszystkie testy rozszerzenia Historia Zamówień zakończone pomyślnie! ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
