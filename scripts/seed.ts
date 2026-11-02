import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { getDb, migrateDb } from "../src/db/client";
import { account, user } from "../src/db/schema";
import { assertTimeZone } from "../src/lib/config";
import { provisionOwner } from "../src/server/provision";

if (existsSync(".env")) process.loadEnvFile(".env");

const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD;
const name = process.env.SEED_OWNER_NAME?.trim();
const businessName = process.env.SEED_BUSINESS_NAME?.trim();
const timeZone = process.env.SEED_BUSINESS_TIMEZONE?.trim() || "America/Denver";

const missing = [
  ["SEED_OWNER_EMAIL", email],
  ["SEED_OWNER_PASSWORD", password],
  ["SEED_OWNER_NAME", name],
  ["SEED_BUSINESS_NAME", businessName],
].flatMap(([key, value]) => (value ? [] : [key]));

if (missing.length > 0) {
  console.error(`Missing ${missing.join(", ")}`);
  process.exit(1);
}

if (!password || password.length < 12) {
  console.error("SEED_OWNER_PASSWORD must be at least 12 characters");
  process.exit(1);
}

await assertReady(email, password, name, businessName, timeZone);

async function assertReady(
  ownerEmail: string | undefined,
  ownerPassword: string,
  ownerName: string | undefined,
  ownerBusiness: string | undefined,
  zone: string,
) {
  if (!ownerEmail || !ownerName || !ownerBusiness) return;
  assertTimeZone(zone);
  await migrateDb();
  const db = getDb();
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, ownerEmail))
    .limit(1);
  if (existing[0]) {
    console.log(`Owner already exists for ${ownerEmail}`);
    return;
  }
  const userId = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: ownerName,
    email: ownerEmail,
    emailVerified: true,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(ownerPassword),
    createdAt: now,
    updatedAt: now,
  });
  const created = await provisionOwner({
    userId,
    businessName: ownerBusiness,
    timeZone: zone,
  });
  console.log(`Created Owner ${ownerEmail} for Business ${created.businessId}`);
}
