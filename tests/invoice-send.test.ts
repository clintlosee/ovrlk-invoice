import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { invoiceLink } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { mailDraft } from "../src/server/invoice-mail";
import { openPublicInvoice } from "../src/server/public-invoice";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

function request(ip: string) {
  return new Request("https://invoice.example/p/token", {
    headers: { "x-forwarded-for": ip },
  });
}

async function draftInvoice(email: string) {
  const db = getDb();
  const owner = await insertOwner(email, "Catalog Prints");
  const scope = forBusiness(db, owner.businessId);
  const client = await scope.clients.create({
    name: "Ada Prints",
    email: "ada@example.com",
    phone: null,
    address: null,
    taxExempt: false,
    note: null,
  });
  const draft = await scope.invoices.create({
    clientId: client.id,
    issueDate: "2026-04-01",
    dueDate: "2026-05-01",
    reference: null,
    notes: null,
    terms: null,
    lines: [
      {
        name: "8x10 print",
        description: null,
        quantity: 1,
        unitPriceCents: cents(2500),
        taxRateIds: [],
      },
    ],
  });
  return { db, owner, scope, draft };
}

describe("invoice send", () => {
  it("leaves a draft unsent when the invoice email throws", async () => {
    const { db, owner, scope, draft } = await draftInvoice(
      "send-fail@example.com",
    );
    const result = await mailDraft(scope, draft.id, owner.userId, async () => {
      throw new Error("smtp down");
    });
    expect(result).toEqual({
      ok: true,
      emailed: false,
      message: "The email did not go out. The Invoice is still a draft.",
    });
    expect((await scope.invoices.get(draft.id))?.status).toBe("draft");
    const links = await db
      .select()
      .from(invoiceLink)
      .where(eq(invoiceLink.invoiceId, draft.id));
    expect(links).toEqual([]);
  });

  it("marks the draft sent when the email succeeds and the link matches the emailed url", async () => {
    const { owner, scope, draft } = await draftInvoice("send-ok@example.com");
    let url = "";
    const result = await mailDraft(
      scope,
      draft.id,
      owner.userId,
      async (message) => {
        url = message.url;
      },
    );
    expect(result.emailed).toBe(true);
    if (!result.emailed) return;
    expect(result.url).toBe(url);
    expect((await scope.invoices.get(draft.id))?.status).toBe("sent");
    expect(
      await openPublicInvoice(request("1.2.3.4"), url.split("/p/")[1] ?? "", {
        recordView: false,
      }),
    ).toMatchObject({
      status: 200,
    });
  });
});
