import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "@/app/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "mock_github_client_id",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "mock_github_client_secret",
    },
  },
  session: {
    cookieCache: {
      enabled: false, // Wymóg instrukcji: weryfikacja sesji zawsze bezpośrednio w DB
    },
  },
});
