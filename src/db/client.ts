import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type AppDb = LibSQLDatabase<typeof schema>;

let client: Client | undefined;
let database: AppDb | undefined;

export function getDb(): AppDb {
  if (!database) {
    const url = process.env.DATABASE_URL ?? "file:local.db";
    const authToken = process.env.TURSO_AUTH_TOKEN;
    client = createClient({ url, authToken: authToken || undefined });
    database = drizzle(client, { schema });
  }
  return database;
}

export async function migrateDb(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client?.execute("PRAGMA foreign_keys = ON");
}
