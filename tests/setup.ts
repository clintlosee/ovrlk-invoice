import { mkdirSync, rmSync } from "node:fs";

process.env.VITEST = "1";
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-32";
process.env.BETTER_AUTH_URL = "http://localhost:3333";
process.env.DATABASE_URL = "file:./data/test.db";
process.env.ALLOW_SIGN_UP = "false";
process.env.EMAIL_FROM = "ovrlk invoice <test@example.com>";
delete process.env.RESEND_API_KEY;

mkdirSync("data", { recursive: true });
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  rmSync(`data/test.db${suffix}`, { force: true });
}

const { migrateDb } = await import("../src/db/client");
await migrateDb();
