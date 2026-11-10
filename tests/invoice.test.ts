import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { invoice, invoiceLink } from "../src/db/schema";
import type { InvoiceSnapshot } from "../src/lib/invoice";
import { cents } from "../src/lib/money";
import type { InvoiceInput } from "../src/server/invoice-store";
import { hashInvoiceToken } from "../src/server/invoice-token";
import { openPublicInvoice } from "../src/server/public-invoice";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

function input(
  clientId: string,
  taxRateIds: string[],
  patch: Partial<InvoiceInput> = {},
): InvoiceInput {
  return {
    clientId,
    issueDate: "2026-04-01",
    dueDate: "2026-05-01",
    reference: "PO-9",
    notes: "Thanks",
    terms: "Due on receipt",
    lines: [
      {
        name: "8x10 print",
        description: "Matte",
        quantity: 2,
        unitPriceCents: cents(2500),
        taxRateIds,
      },
    ],
    ...patch,
  };
}

function request(ip: string) {
  return new Request("https://invoice.example/p/token", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("invoices", () => {
  it("numbers per Business, locks a snapshot, and only deletes drafts", async () => {
    const db = getDb();
    const owner = await insertOwner("invoices@example.com", "Catalog Prints");
    const scope = forBusiness(db, owner.businessId);
    await scope.business.update({
      address: "9 Studio Rd",
      taxId: "84-000",
      footer: "Prints",
      accentColor: "#112233",
    });
    const client = await scope.clients.create({
      name: "Ada Prints",
      email: "ada@example.com",
      phone: "801-555-0100",
      address: "1 Main",
      taxExempt: false,
      note: null,
    });
    const utah = await scope.taxRates.create({ name: "Utah", rateBps: 725 });
    const city = await scope.taxRates.create({ name: "City", rateBps: 100 });
    const item = await scope.items.create({
      name: "8x10 print",
      description: "Matte",
      unitPriceCents: cents(2500),
      taxRateIds: [utah.id, city.id],
    });

    const first = await scope.invoices.create(
      input(client.id, [utah.id, city.id]),
    );
    const second = await scope.invoices.create(
      input(client.id, [utah.id], {
        lines: [
          {
            name: "Custom",
            description: null,
            quantity: 1,
            unitPriceCents: cents(1),
            taxRateIds: [utah.id],
          },
        ],
      }),
    );
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(first.numberLabel).toBe("0000001");
    expect(first.document.totalCents).toBe(5000 + 363 + 50);
    expect(first.status).toBe("draft");
    expect(first.displayStatus).toBe("draft");

    const [raced, racedToo] = await Promise.all([
      scope.invoices.create(input(client.id, [])),
      scope.invoices.create(input(client.id, [])),
    ]);
    expect(new Set([raced.number, racedToo.number])).toEqual(new Set([3, 4]));

    const other = await insertOwner("invoices-b@example.com", "Other");
    const otherInvoice = await forBusiness(
      db,
      other.businessId,
    ).invoices.create(
      input(
        (
          await forBusiness(db, other.businessId).clients.create({
            name: "Other Client",
            email: "other@example.com",
            phone: null,
            address: null,
            taxExempt: false,
            note: null,
          })
        ).id,
        [],
        { lines: [] },
      ),
    );
    expect(otherInvoice.number).toBe(1);

    expect(await scope.invoices.remove(first.id)).toBe(1);
    expect(await scope.invoices.get(first.id)).toBeNull();

    const sent = await scope.invoices.send(second.id, owner.userId);
    if (!sent) throw new Error("send failed");
    const frozen = structuredClone(sent.invoice.document) as InvoiceSnapshot;
    expect(frozen.client.name).toBe("Ada Prints");
    expect(frozen.business.name).toBe("Catalog Prints");
    expect(frozen.business.taxId).toBe("84-000");
    expect(frozen.lines[0]?.unitPriceCents).toBe(1);
    expect(frozen.lines[0]?.taxes[0]?.rateBps).toBe(725);
    expect(sent.token).toHaveLength(43);

    await scope.clients.update(client.id, {
      name: "Renamed Client",
      email: "new@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    await scope.items.update(item.id, {
      name: "Renamed Item",
      description: "Changed",
      unitPriceCents: cents(9),
      taxRateIds: [],
    });
    await scope.taxRates.update(utah.id, { name: "Renamed tax", rateBps: 100 });
    await scope.business.update({ name: "Renamed Business" });

    const reread = await scope.invoices.get(second.id);
    expect(reread?.status).toBe("sent");
    expect(reread?.document).toEqual(frozen);
    expect(await scope.invoices.remove(second.id)).toBe(0);
    await expect(scope.invoices.send(second.id, owner.userId)).rejects.toThrow(
      /draft/,
    );

    const stored = await db
      .select({ status: invoice.status })
      .from(invoice)
      .where(eq(invoice.id, second.id));
    expect(stored[0]?.status).toBe("sent");

    const links = await db.select().from(invoiceLink);
    const link = links.find((row) => row.invoiceId === second.id);
    expect(link?.tokenHash).toBe(hashInvoiceToken(sent.token));
    expect(JSON.stringify(links)).not.toContain(sent.token);

    const viewed = await openPublicInvoice(
      request("203.0.113.10"),
      sent.token,
      {
        recordView: true,
      },
    );
    expect(viewed.status).toBe(200);
    if (viewed.status !== 200) return;
    expect(viewed.document).toEqual(frozen);
    expect(viewed.document.client.name).toBe("Ada Prints");
    const stamped = await scope.invoices.get(second.id);
    expect(stamped?.firstViewedAt).toBeInstanceOf(Date);
    await openPublicInvoice(request("203.0.113.10"), sent.token, {
      recordView: true,
    });
    expect((await scope.invoices.get(second.id))?.firstViewedAt).toEqual(
      stamped?.firstViewedAt,
    );

    expect(
      (
        await openPublicInvoice(request("203.0.113.11"), "not-a-token", {
          recordView: false,
        })
      ).status,
    ).toBe(404);
    expect(await scope.invoices.revokeLinks(second.id)).toBe(true);
    expect(
      (
        await openPublicInvoice(request("203.0.113.12"), sent.token, {
          recordView: false,
        })
      ).status,
    ).toBe(404);
    const again = await scope.invoices.issueLink(second.id, false);
    if (!again) throw new Error("link");
    await db
      .update(invoiceLink)
      .set({ expiresAt: new Date(0) })
      .where(eq(invoiceLink.tokenHash, hashInvoiceToken(again.token)));
    expect(
      (
        await openPublicInvoice(request("203.0.113.13"), again.token, {
          recordView: false,
        })
      ).status,
    ).toBe(404);

    process.env.PUBLIC_RATE_LIMIT_MAX = "1";
    try {
      const fresh = await scope.invoices.issueLink(second.id, true);
      if (!fresh) throw new Error("link");
      expect(
        (
          await openPublicInvoice(request("203.0.113.50"), fresh.token, {
            recordView: false,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await openPublicInvoice(request("203.0.113.50"), fresh.token, {
            recordView: false,
          })
        ).status,
      ).toBe(429);
      expect(
        (
          await openPublicInvoice(
            request("203.0.113.51"),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            {
              recordView: false,
            },
          )
        ).status,
      ).toBe(404);
    } finally {
      delete process.env.PUBLIC_RATE_LIMIT_MAX;
    }

    const overdue = await scope.invoices.create(
      input(client.id, [], {
        dueDate: "2020-01-01",
        lines: [
          {
            name: "Late",
            description: null,
            quantity: 1,
            unitPriceCents: cents(100),
            taxRateIds: [],
          },
        ],
      }),
    );
    const sentLate = await scope.invoices.send(overdue.id, owner.userId);
    expect(sentLate?.invoice.status).toBe("sent");
    expect(sentLate?.invoice.displayStatus).toBe("overdue");
    const lateRow = await db
      .select({ status: invoice.status })
      .from(invoice)
      .where(eq(invoice.id, overdue.id));
    expect(lateRow[0]?.status).toBe("sent");

    await expect(
      scope.invoices.voidInvoice(overdue.id, "   ", owner.userId),
    ).rejects.toThrow(/reason/);
    const draft = await scope.invoices.create(
      input(client.id, [], { lines: [] }),
    );
    await expect(
      scope.invoices.voidInvoice(draft.id, "Nope", owner.userId),
    ).rejects.toThrow(/sent/);
    const voided = await scope.invoices.voidInvoice(
      second.id,
      "Wrong Client",
      owner.userId,
    );
    expect(voided?.status).toBe("void");
    expect(voided?.voidReason).toBe("Wrong Client");
    expect(voided?.document).toEqual(frozen);
    expect(voided?.amountDueCents).toBe(0);
    await expect(
      scope.invoices.voidInvoice(second.id, "Again", owner.userId),
    ).rejects.toThrow(/sent/);
    const publicVoid = await openPublicInvoice(
      request("203.0.113.60"),
      (await scope.invoices.issueLink(second.id, false))?.token ?? "",
      { recordView: false },
    );
    expect(publicVoid.status).toBe(200);
    if (publicVoid.status === 200)
      expect(publicVoid.displayStatus).toBe("void");

    const exempt = await scope.clients.create({
      name: "Exempt",
      email: "exempt@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const exemptInvoice = await scope.invoices.create(
      input(exempt.id, [utah.id, city.id], {
        lines: [
          {
            name: "Print",
            description: null,
            quantity: 3,
            unitPriceCents: cents(1000),
            taxRateIds: [utah.id, city.id],
          },
        ],
      }),
    );
    expect(exemptInvoice.document.taxCents).toBe(0);
    expect(exemptInvoice.document.totalCents).toBe(3000);
  });

  it("lets a sent Invoice be edited until it is paid", async () => {
    const db = getDb();
    const owner = await insertOwner("edit-sent@example.com", "Edit Sent");
    const scope = forBusiness(db, owner.businessId);
    const client = await scope.clients.create({
      name: "Ada Prints",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const created = await scope.invoices.create(input(client.id, []));
    const sent = await scope.invoices.send(created.id, owner.userId);
    if (!sent) throw new Error("send failed");
    expect(sent.invoice.editorLines?.[0]?.unitPriceCents).toBe(2500);
    expect(sent.invoice.locked).toBe(true);

    const revised = await scope.invoices.update(
      created.id,
      input(client.id, [], {
        notes: "Updated after send",
        lines: [
          {
            name: "8x10 print",
            description: "Matte",
            quantity: 1,
            unitPriceCents: cents(4000),
            taxRateIds: [],
          },
        ],
      }),
    );
    expect(revised?.status).toBe("sent");
    expect(revised?.document.totalCents).toBe(4000);
    expect(revised?.document.notes).toBe("Updated after send");
    expect(revised?.editorLines?.[0]?.unitPriceCents).toBe(4000);
    const viewed = await openPublicInvoice(
      request("203.0.113.80"),
      sent.token,
      { recordView: false },
    );
    expect(viewed.status).toBe(200);
    if (viewed.status !== 200) return;
    expect(viewed.document.totalCents).toBe(4000);

    await scope.payments.recordManual({
      invoiceId: created.id,
      amountCents: cents(1000),
      paidOn: "2026-04-02",
      method: "check",
      note: null,
      actorUserId: owner.userId,
    });
    const partial = await scope.invoices.update(
      created.id,
      input(client.id, [], {
        lines: [
          {
            name: "8x10 print",
            description: "Matte",
            quantity: 1,
            unitPriceCents: cents(3000),
            taxRateIds: [],
          },
        ],
      }),
    );
    expect(partial?.status).toBe("partial");
    expect(partial?.document.totalCents).toBe(3000);
    expect(partial?.amountDueCents).toBe(2000);

    const settled = await scope.invoices.update(
      created.id,
      input(client.id, [], {
        lines: [
          {
            name: "8x10 print",
            description: "Matte",
            quantity: 1,
            unitPriceCents: cents(1000),
            taxRateIds: [],
          },
        ],
      }),
    );
    expect(settled?.status).toBe("paid");
    await expect(
      scope.invoices.update(created.id, input(client.id, [])),
    ).rejects.toThrow(/paid/);

    const voided = await scope.invoices.create(input(client.id, []));
    const sentVoid = await scope.invoices.send(voided.id, owner.userId);
    if (!sentVoid) throw new Error("send failed");
    await scope.invoices.voidInvoice(voided.id, "Wrong client", owner.userId);
    await expect(
      scope.invoices.update(voided.id, input(client.id, [])),
    ).rejects.toThrow(/paid|void/);
  });

  it("keeps line breaks in an Invoice Line description", async () => {
    const db = getDb();
    const owner = await insertOwner(
      "multiline-invoice@example.com",
      "Line Breaks",
    );
    const scope = forBusiness(db, owner.businessId);
    const client = await scope.clients.create({
      name: "Ada Prints",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
    });
    const created = await scope.invoices.create(
      input(client.id, [], {
        lines: [
          {
            name: "Print",
            description: "First line\nSecond line\n\nFourth line",
            quantity: 1,
            unitPriceCents: cents(100),
            taxRateIds: [],
          },
        ],
      }),
    );
    expect(created.editorLines?.[0]?.description).toBe(
      "First line\nSecond line\n\nFourth line",
    );
    expect(created.document.lines[0]?.description).toBe(
      "First line\nSecond line\n\nFourth line",
    );

    const edited = await scope.invoices.update(
      created.id,
      input(client.id, [], {
        lines: [
          {
            name: "Print",
            description: "  Top\nBottom  ",
            quantity: 1,
            unitPriceCents: cents(100),
            taxRateIds: [],
          },
        ],
      }),
    );
    expect(edited?.editorLines?.[0]?.description).toBe("Top\nBottom");

    const sent = await scope.invoices.send(created.id, owner.userId);
    expect(sent?.invoice.document.lines[0]?.description).toBe("Top\nBottom");
  });

  it("shows an edited Client on a draft Invoice", async () => {
    const db = getDb();
    const owner = await insertOwner(
      "edited-client-invoice@example.com",
      "Edit Client",
    );
    const scope = forBusiness(db, owner.businessId);
    const client = await scope.clients.create({
      name: "Old Name",
      email: "old@example.com",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
    });
    const rate = await scope.taxRates.create({ name: "Utah", rateBps: 725 });
    const draft = await scope.invoices.create(input(client.id, [rate.id]));
    expect(draft.document.client.name).toBe("Old Name");
    const taxedCents = draft.document.taxCents;
    expect(taxedCents).toBeGreaterThan(0);

    await scope.clients.update(client.id, {
      name: "New Name",
      email: "new@example.com",
      phone: "801-555-0111",
      address: "2 Main\nSuite 3",
      taxExempt: true,
      note: null,
    });

    const reread = await scope.invoices.get(draft.id);
    expect(reread?.document.client.name).toBe("New Name");
    expect(reread?.document.client.email).toBe("new@example.com");
    expect(reread?.document.client.address).toBe("2 Main\nSuite 3");
    expect(reread?.document.taxCents).toBe(0);
    expect(reread?.document.totalCents).toBe(draft.document.subtotalCents);
  });

  it("keeps another Business from reading or writing invoices and links", async () => {
    const db = getDb();
    const alpha = await insertOwner("inv-iso-a@example.com", "Alpha");
    const beta = await insertOwner("inv-iso-b@example.com", "Beta");
    const a = forBusiness(db, alpha.businessId);
    const b = forBusiness(db, beta.businessId);
    const client = await a.clients.create({
      name: "Alpha Client",
      email: "a@example.com",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
    });
    const rate = await a.taxRates.create({ name: "Alpha tax", rateBps: 500 });
    const created = await a.invoices.create(input(client.id, [rate.id]));
    const sent = await a.invoices.send(created.id, alpha.userId);
    if (!sent) throw new Error("send");

    expect(await b.invoices.list()).toEqual([]);
    expect(await b.invoices.get(created.id)).toBeNull();
    expect(
      await b.invoices.update(created.id, input(client.id, [])),
    ).toBeNull();
    expect(await b.invoices.remove(created.id)).toBe(0);
    expect(
      await b.invoices.voidInvoice(created.id, "Steal", beta.userId),
    ).toBeNull();
    expect(await b.invoices.send(created.id, beta.userId)).toBeNull();
    expect(await b.invoices.issueLink(created.id, true)).toBeNull();
    expect(await b.invoices.revokeLinks(created.id)).toBe(false);

    const betaClient = await b.clients.create({
      name: "Beta Client",
      email: "b@example.com",
      phone: null,
      address: null,
      taxExempt: false,
      note: null,
    });
    await expect(b.invoices.create(input(client.id, []))).rejects.toThrow(
      /Client/,
    );
    await expect(
      b.invoices.create(input(betaClient.id, [rate.id])),
    ).rejects.toThrow(/Tax Rate/);

    const planted = await b.invoices.create({
      ...input(betaClient.id, []),
      ...({ businessId: alpha.businessId } as object),
    } as InvoiceInput);
    expect(planted.document.business.name).toBe("Beta");
    const row = await db
      .select({ businessId: invoice.businessId })
      .from(invoice)
      .where(eq(invoice.id, planted.id));
    expect(row[0]?.businessId).toBe(beta.businessId);

    const opened = await openPublicInvoice(
      request("203.0.113.70"),
      sent.token,
      { recordView: false },
    );
    expect(opened.status).toBe(200);
    if (opened.status === 200) {
      expect(opened.document.client.email).toBe("a@example.com");
      expect(JSON.stringify(opened)).not.toContain(alpha.businessId);
    }
  });
});
