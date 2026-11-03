import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { client, item, itemTaxRate, taxRate } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { type ClientInput, forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

describe("catalog tenant isolation", () => {
  it("keeps Business B from reading, writing, or attaching Business A's records", async () => {
    const db = getDb();
    const alpha = await insertOwner("iso-a@example.com", "Alpha Prints");
    const beta = await insertOwner("iso-b@example.com", "Beta Prints");
    const a = forBusiness(db, alpha.businessId);
    const b = forBusiness(db, beta.businessId);

    const alphaClient = await a.clients.create({
      name: "Alpha Client",
      email: "client-a@example.com",
      phone: "801-555-0199",
      address: "9 Alpha Rd",
      taxExempt: true,
      note: "Cert A",
    });
    const alphaRate = await a.taxRates.create({
      name: "Alpha tax",
      rateBps: 725,
    });
    const alphaItem = await a.items.create({
      name: "Alpha print",
      description: "Keep",
      unitPriceCents: cents(1800),
      taxRateIds: [alphaRate.id],
    });

    expect(await b.clients.list()).toEqual([]);
    expect(await b.taxRates.list()).toEqual([]);
    expect(await b.items.list()).toEqual([]);
    expect(await b.clients.get(alphaClient.id)).toBeNull();
    expect(await b.taxRates.get(alphaRate.id)).toBeNull();
    expect(await b.items.get(alphaItem.id)).toBeNull();

    expect(
      await b.clients.update(alphaClient.id, {
        name: "Stolen",
        email: "stolen@example.com",
        phone: null,
        address: null,
        taxExempt: false,
        note: null,
      }),
    ).toBeNull();
    expect(
      await b.taxRates.update(alphaRate.id, { name: "Stolen", rateBps: 100 }),
    ).toBeNull();
    expect(
      await b.items.update(alphaItem.id, {
        name: "Stolen",
        description: null,
        unitPriceCents: cents(1),
        taxRateIds: [],
      }),
    ).toBeNull();
    expect(await b.clients.setArchived(alphaClient.id, true)).toBeNull();
    expect(await b.taxRates.remove(alphaRate.id)).toBe(0);
    expect(await b.items.remove(alphaItem.id)).toBe(0);

    const stillClient = await db
      .select()
      .from(client)
      .where(eq(client.id, alphaClient.id));
    expect(stillClient[0]).toMatchObject({
      name: "Alpha Client",
      email: "client-a@example.com",
      taxExempt: true,
      note: "Cert A",
      businessId: alpha.businessId,
      archivedAt: null,
    });
    const stillRate = await db
      .select()
      .from(taxRate)
      .where(eq(taxRate.id, alphaRate.id));
    expect(stillRate[0]).toMatchObject({
      name: "Alpha tax",
      rateBps: 725,
      businessId: alpha.businessId,
    });
    const stillItem = await db
      .select()
      .from(item)
      .where(eq(item.id, alphaItem.id));
    expect(stillItem[0]).toMatchObject({
      name: "Alpha print",
      unitPriceCents: 1800,
      businessId: alpha.businessId,
    });
    expect(
      await db
        .select()
        .from(itemTaxRate)
        .where(eq(itemTaxRate.itemId, alphaItem.id)),
    ).toEqual([
      expect.objectContaining({
        taxRateId: alphaRate.id,
        businessId: alpha.businessId,
      }),
    ]);

    await expect(
      b.items.create({
        name: "Stolen rate",
        description: null,
        unitPriceCents: cents(100),
        taxRateIds: [alphaRate.id],
      }),
    ).rejects.toThrow(/Tax Rate/);
    expect(await b.items.list()).toEqual([]);

    const betaItem = await b.items.create({
      name: "Beta print",
      description: null,
      unitPriceCents: cents(500),
      taxRateIds: [],
    });
    await expect(
      b.items.update(betaItem.id, {
        name: "Beta print",
        description: null,
        unitPriceCents: cents(500),
        taxRateIds: [alphaRate.id],
      }),
    ).rejects.toThrow(/Tax Rate/);
    expect((await b.items.get(betaItem.id))?.taxRates).toEqual([]);
    expect(
      await db
        .select()
        .from(itemTaxRate)
        .where(eq(itemTaxRate.taxRateId, alphaRate.id)),
    ).toHaveLength(1);

    const planted = await b.clients.create({
      name: "Pat",
      email: "pat@beta.example",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
      ...({ businessId: alpha.businessId } as object),
    } as ClientInput);
    expect(planted.businessId).toBe(beta.businessId);
  });
});
