import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../app/lib/db";

async function main() {
  const ctx = await (auth as unknown as { $context: Promise<{ password: { hash: (pwd: string) => Promise<string> } }> }).$context;
  const email = "krzysztof.kacprzak@student.pk.edu.pl";
  const password = "DemoPass123!";

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id: "demo-user-krzysztof",
      name: "Krzysztof Kacprzak",
      email,
      emailVerified: true,
    },
    update: {
      name: "Krzysztof Kacprzak",
      emailVerified: true,
    },
  });

  const hash = await ctx.password.hash(password);

  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hash },
    });
  } else {
    await prisma.account.create({
      data: {
        id: `account-cred-${user.id}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hash,
      },
    });
  }

  console.log(`Pomyślnie skonfigurowano konto demonstracyjne: ${email} / ${password}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
