import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/app/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "default_development_secret_32_characters_long_min",
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean) as string[],
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
