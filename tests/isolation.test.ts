import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { member, OWNER_ROLE } from "../src/db/schema";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

describe("tenant isolation", () => {
  it("keeps one Business from reading or writing another", async () => {
    const db = getDb();
    const alpha = await insertOwner("alpha@example.com", "Alpha Prints");
    const beta = await insertOwner("beta@example.com", "Beta Prints");
    const alphaMember = (
      await forBusiness(db, alpha.businessId).members.list()
    )[0];
    const betaMember = (
      await forBusiness(db, beta.businessId).members.list()
    )[0];
    if (!alphaMember || !betaMember) throw new Error("members missing");

    expect((await forBusiness(db, alpha.businessId).business.get())?.name).toBe(
      "Alpha Prints",
    );
    expect(
      await forBusiness(db, alpha.businessId).members.get(betaMember.id),
    ).toBeNull();
    expect(await forBusiness(db, alpha.businessId).members.list()).toEqual([
      expect.objectContaining({
        id: alphaMember.id,
        businessId: alpha.businessId,
      }),
    ]);

    await forBusiness(db, alpha.businessId).business.update({
      name: "Alpha Revised",
    });
    expect((await forBusiness(db, beta.businessId).business.get())?.name).toBe(
      "Beta Prints",
    );
    expect(
      await forBusiness(db, alpha.businessId).members.update(betaMember.id, {
        role: OWNER_ROLE,
      }),
    ).toBe(0);
    const betaStill = await db
      .select()
      .from(member)
      .where(eq(member.id, betaMember.id));
    expect(betaStill[0]?.role).toBe(OWNER_ROLE);
    expect(betaStill[0]?.businessId).toBe(beta.businessId);

    await forBusiness(db, alpha.businessId).audit.record({
      action: "payment.recorded",
      amountCents: 1800,
      entityType: "payment",
      entityId: "pay_alpha",
    });
    expect(await forBusiness(db, beta.businessId).audit.list()).toEqual([]);
    expect(await forBusiness(db, alpha.businessId).audit.list()).toEqual([
      expect.objectContaining({ amountCents: 1800, entityId: "pay_alpha" }),
    ]);
    expect(() => forBusiness(db, "")).toThrow(/Business/);
  });
});
