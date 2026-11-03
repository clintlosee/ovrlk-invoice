import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { item, itemTaxRate, taxRate } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

describe("clients, tax rates, and items", () => {
  it("saves, updates, archives, and deletes inside one Business", async () => {
    const db = getDb();
    const owner = await insertOwner("catalog@example.com", "Catalog Prints");
    const scope = forBusiness(db, owner.businessId);

    const client = await scope.clients.create({
      name: "Ada Prints",
      email: "ada@example.com",
      phone: "801-555-0100",
      address: "1 Main St",
      taxExempt: false,
      note: null,
    });
    expect(client.taxExempt).toBe(false);
    expect(client.businessId).toBe(owner.businessId);

    const exempt = await scope.clients.update(client.id, {
      name: "Ada Prints",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: "Cert 44",
    });
    expect(exempt?.taxExempt).toBe(true);
    expect(exempt?.note).toBe("Cert 44");
    expect(
      (await scope.clients.setArchived(client.id, true))?.archivedAt,
    ).toBeInstanceOf(Date);
    expect(
      (await scope.clients.setArchived(client.id, false))?.archivedAt,
    ).toBeNull();

    const state = await scope.taxRates.create({ name: "Utah", rateBps: 485 });
    const local = await scope.taxRates.create({ name: "Local", rateBps: 240 });
    const print = await scope.items.create({
      name: "8x10 print",
      description: "Matte",
      unitPriceCents: cents(2500),
      taxRateIds: [state.id, local.id],
    });
    expect(print.unitPriceCents).toBe(2500);
    expect(print.taxRates.map((rate) => rate.name)).toEqual(["Local", "Utah"]);

    const updated = await scope.items.update(print.id, {
      name: "8x10 print",
      description: null,
      unitPriceCents: cents(3200),
      taxRateIds: [state.id, state.id],
    });
    expect(updated?.unitPriceCents).toBe(3200);
    expect(updated?.taxRates.map((rate) => rate.id)).toEqual([state.id]);

    expect(await scope.taxRates.remove(local.id)).toBe(1);
    expect(
      (await scope.items.get(print.id))?.taxRates.map((rate) => rate.id),
    ).toEqual([state.id]);
    const links = await db
      .select()
      .from(itemTaxRate)
      .where(eq(itemTaxRate.itemId, print.id));
    expect(links.map((link) => link.taxRateId)).toEqual([state.id]);

    expect(await scope.items.remove(print.id)).toBe(1);
    expect(await scope.items.get(print.id)).toBeNull();
    expect(await db.select().from(item).where(eq(item.id, print.id))).toEqual(
      [],
    );
    expect(await scope.taxRates.remove(state.id)).toBe(1);
    expect(
      await db.select().from(taxRate).where(eq(taxRate.id, state.id)),
    ).toEqual([]);

    await expect(
      scope.taxRates.create({ name: "Float", rateBps: 7.25 }),
    ).rejects.toThrow(/basis points/);
    await expect(
      scope.items.create({
        name: "Bad price",
        description: null,
        unitPriceCents: 10.5,
        taxRateIds: [],
      }),
    ).rejects.toThrow(/integer/);
    await expect(
      db.insert(taxRate).values({
        id: crypto.randomUUID(),
        businessId: owner.businessId,
        name: "Float",
        rateBps: 7.25,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
