import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { business, member, OWNER_ROLE } from "../db/schema";
import { assertTimeZone } from "../lib/config";
import { seedExpenseCategories } from "./expense-store";

const USD = "USD";

export async function provisionOwner(input: {
  userId: string;
  businessName: string;
  timeZone: string;
}): Promise<{ businessId: string }> {
  const name = input.businessName.trim();
  if (!name) throw new Error("Business name is required");
  const timeZone = assertTimeZone(input.timeZone);
  const db = getDb();

  const existing = await db
    .select()
    .from(member)
    .where(eq(member.userId, input.userId))
    .limit(1);
  if (existing[0]) return { businessId: existing[0].businessId };

  const businessId = crypto.randomUUID();
  const now = new Date();
  await db.insert(business).values({
    id: businessId,
    name,
    currency: USD,
    timeZone,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    businessId,
    userId: input.userId,
    role: OWNER_ROLE,
    createdAt: now,
  });
  await seedExpenseCategories(db, businessId);
  return { businessId };
}

export async function renameBusiness(
  userId: string,
  businessName: string,
  timeZone: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, OWNER_ROLE)))
    .limit(1);
  const owner = rows[0];
  if (!owner) return;
  await db
    .update(business)
    .set({
      name: businessName.trim(),
      timeZone: assertTimeZone(timeZone),
      updatedAt: new Date(),
    })
    .where(eq(business.id, owner.businessId));
}
