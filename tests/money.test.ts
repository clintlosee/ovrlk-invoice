import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { auditLog } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

describe("money", () => {
  it("accepts integer cents and rejects fractional amounts", async () => {
    expect(cents(1250)).toBe(1250);
    expect(() => cents(12.5)).toThrow(/integer/);
    const db = getDb();
    const owner = await insertOwner("money@example.com");
    const row = await forBusiness(db, owner.businessId).audit.record({
      action: "payment.recorded",
      amountCents: cents(2500),
      entityType: "payment",
      entityId: "pay_later",
    });
    expect(row?.amountCents).toBe(2500);
    await expect(
      forBusiness(db, owner.businessId).audit.record({
        action: "payment.recorded",
        amountCents: 10.5,
      }),
    ).rejects.toThrow(/integer/);
    await expect(
      db.insert(auditLog).values({
        id: crypto.randomUUID(),
        businessId: owner.businessId,
        action: "payment.recorded",
        amountCents: 10.5,
        createdAt: new Date(),
      }),
    ).rejects.toThrow();
    const stored = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, row?.id ?? ""));
    expect(stored[0]?.amountCents).toBe(2500);
  });
});
