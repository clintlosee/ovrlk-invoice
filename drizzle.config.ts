import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const localFile = url.startsWith("file:");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(localFile
    ? {
        dialect: "sqlite" as const,
        dbCredentials: { url },
      }
    : {
        dialect: "turso" as const,
        dbCredentials: { url, authToken: authToken ?? "" },
      }),
});
