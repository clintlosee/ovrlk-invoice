import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { invoiceLink } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { mailDraft, sendInvoicesByEmail } from "../src/server/invoice-mail";
import type { InvoiceInput } from "../src/server/invoice-store";
import { openPublicInvoice } from "../src/server/public-invoice";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

function request(ip: string) {
  return new Request("https://invoice.example/p/token", {
    headers: { "x-forwarded-for": ip },
  });
}

function line() {
  return {
    name: "8x10 print",
    description: null,
    quantity: 1,
    unitPriceCents: cents(2500),
    taxRateIds: [] as string[],
  };
}

function invoiceInput(
  clientId: string,
  lines: InvoiceInput["lines"] = [line()],
): InvoiceInput {
  return {
    clientId,
    issueDate: "2026-04-01",
    dueDate: "2026-05-01",
    reference: null,
    notes: null,
    terms: null,
    lines,
  };
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

async function catalog(email: string) {
  const db = getDb();
  const owner = await insertOwner(email, "Catalog Prints");
  const scope = forBusiness(db, owner.businessId);
  return { db, owner, scope };
}

async function addClient(
  scope: ReturnType<typeof forBusiness>,
  name: string,
  email: string,
) {
  return scope.clients.create({
    name,
    email,
    phone: null,
    address: null,
    taxExempt: false,
    note: null,
  });
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

  it("emails each Client only their Invoices and does not send a void or an empty draft", async () => {
    const { owner, scope } = await catalog("bulk-send@example.com");
    const ada = await addClient(scope, "Ada Prints", "ada@example.com");
    const bea = await addClient(scope, "Bea Prints", "bea@example.com");
    const empty = await scope.invoices.create(invoiceInput(ada.id, []));
    const adaA = await scope.invoices.create(invoiceInput(ada.id));
    const doomed = await scope.invoices.create(invoiceInput(ada.id));
    await scope.invoices.send(doomed.id, owner.userId);
    await scope.invoices.voidInvoice(doomed.id, "Wrong Client", owner.userId);
    const beaDraft = await scope.invoices.create(invoiceInput(bea.id));
    const ids = [adaA.id, beaDraft.id, doomed.id, empty.id];
    const deliveries: {
      to: string;
      text: string;
      files: string[];
      subject: string;
    }[] = [];
    const result = await sendInvoicesByEmail(
      scope,
      owner.userId,
      ids,
      { attachPdf: true },
      async (message) => {
        deliveries.push({
          to: message.to,
          text: message.text,
          files: (message.attachments ?? []).map((file) => file.filename),
          subject: message.subject,
        });
      },
    );
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].text).toContain("0000002");
    expect(deliveries[0].text).not.toContain("0000004");
    expect(deliveries[1].text).toContain("0000004");
    expect(deliveries[1].text).not.toContain("0000002");
    expect(deliveries[0].files).toEqual(["invoice-0000002.pdf"]);
    expect(deliveries[1].files).toEqual(["invoice-0000004.pdf"]);
    expect(result.skipped.map((row) => row.reason).sort()).toEqual([
      "no-lines",
      "void",
    ]);
    expect((await scope.invoices.get(adaA.id))?.status).toBe("sent");
    expect(deliveries[0].subject).toBe("Invoice 0000002 from Catalog Prints");
    expect(deliveries[1].subject).toBe("Invoice 0000004 from Catalog Prints");
    expect(deliveries[0].text).toContain("Amount due:");
    expect(deliveries[0].text).toContain("The PDF is attached.");
    expect(deliveries[0].text).not.toContain("The PDFs are attached.");
  });

  it("leaves every draft in a failed Client email unsent", async () => {
    const { owner, scope } = await catalog("bulk-fail@example.com");
    const ada = await addClient(scope, "Ada Prints", "ada@example.com");
    const adaA = await scope.invoices.create(invoiceInput(ada.id));
    const adaB = await scope.invoices.create(invoiceInput(ada.id));
    const result = await sendInvoicesByEmail(
      scope,
      owner.userId,
      [adaA.id, adaB.id],
      { attachPdf: false },
      async () => {
        throw new Error("smtp down");
      },
    );
    expect(result.sentIds).toEqual([]);
    expect(result.skipped).toEqual([
      { invoiceId: adaA.id, clientName: "Ada Prints", reason: "email-failed" },
      { invoiceId: adaB.id, clientName: "Ada Prints", reason: "email-failed" },
    ]);
    expect((await scope.invoices.get(adaA.id))?.status).toBe("draft");
    expect((await scope.invoices.get(adaB.id))?.status).toBe("draft");
  });

  it("skips a Client whose email is blank and leaves that draft", async () => {
    const { owner, scope } = await catalog("bulk-no-email@example.com");
    const silent = await addClient(scope, "Silent Prints", "");
    const draft = await scope.invoices.create(invoiceInput(silent.id));
    const result = await sendInvoicesByEmail(
      scope,
      owner.userId,
      [draft.id],
      { attachPdf: true },
      async () => {
        throw new Error("should not send");
      },
    );
    expect(result.sentIds).toEqual([]);
    expect(result.skipped).toEqual([
      { invoiceId: draft.id, clientName: "Silent Prints", reason: "no-email" },
    ]);
    expect((await scope.invoices.get(draft.id))?.status).toBe("draft");
  });

  it("sends a list email with Amount due, view URLs, and PDFs only when attached", async () => {
    const { owner, scope } = await catalog("bulk-list@example.com");
    const ada = await addClient(scope, "Ada Prints", "ada@example.com");
    const adaA = await scope.invoices.create(invoiceInput(ada.id));
    const adaB = await scope.invoices.create(invoiceInput(ada.id));
    const deliveries: {
      to: string;
      text: string;
      files: string[];
      subject: string;
    }[] = [];
    const result = await sendInvoicesByEmail(
      scope,
      owner.userId,
      [adaA.id, adaB.id],
      { attachPdf: true },
      async (message) => {
        deliveries.push({
          to: message.to,
          text: message.text,
          files: (message.attachments ?? []).map((file) => file.filename),
          subject: message.subject,
        });
      },
    );
    expect(result.sentIds).toEqual([adaA.id, adaB.id]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].subject).toBe("Invoices from Catalog Prints");
    expect(deliveries[0].text).toContain("Amount due:");
    expect(deliveries[0].text).toContain("The PDFs are attached.");
    expect(deliveries[0].files).toEqual([
      "invoice-0000001.pdf",
      "invoice-0000002.pdf",
    ]);
    const urls = [...deliveries[0].text.matchAll(/\/p\/[A-Za-z0-9_-]+/g)].map(
      (match) => match[0],
    );
    expect(urls).toHaveLength(2);
    expect(
      await openPublicInvoice(request("1.2.3.5"), urls[0]?.slice(3) ?? "", {
        recordView: false,
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await openPublicInvoice(request("1.2.3.6"), urls[1]?.slice(3) ?? "", {
        recordView: false,
      }),
    ).toMatchObject({ status: 200 });

    const quiet: { files: string[]; text: string }[] = [];
    await sendInvoicesByEmail(
      scope,
      owner.userId,
      [adaA.id, adaB.id],
      { attachPdf: false },
      async (message) => {
        quiet.push({
          files: (message.attachments ?? []).map((file) => file.filename),
          text: message.text,
        });
      },
    );
    expect(quiet).toHaveLength(1);
    expect(quiet[0].files).toEqual([]);
    expect(quiet[0].text).not.toContain("The PDFs are attached.");
    expect((await scope.invoices.get(adaA.id))?.status).toBe("sent");
    expect((await scope.invoices.get(adaB.id))?.status).toBe("sent");
  });

  it("includes an already sent Invoice and leaves sent, partial, and paid unchanged", async () => {
    const { owner, scope } = await catalog("bulk-sent@example.com");
    const ada = await addClient(scope, "Ada Prints", "ada@example.com");
    const sentRow = await scope.invoices.send(
      (await scope.invoices.create(invoiceInput(ada.id))).id,
      owner.userId,
    );
    const partialRow = await scope.invoices.send(
      (await scope.invoices.create(invoiceInput(ada.id))).id,
      owner.userId,
    );
    const paidRow = await scope.invoices.send(
      (await scope.invoices.create(invoiceInput(ada.id))).id,
      owner.userId,
    );
    if (!sentRow || !partialRow || !paidRow) throw new Error("send failed");
    await scope.payments.recordManual({
      invoiceId: partialRow.invoice.id,
      amountCents: cents(1000),
      paidOn: "2026-04-02",
      method: "check",
      note: null,
      actorUserId: owner.userId,
    });
    await scope.payments.recordManual({
      invoiceId: paidRow.invoice.id,
      amountCents: cents(2500),
      paidOn: "2026-04-02",
      method: "check",
      note: null,
      actorUserId: owner.userId,
    });
    const deliveries: { text: string; files: string[] }[] = [];
    const result = await sendInvoicesByEmail(
      scope,
      owner.userId,
      [sentRow.invoice.id, partialRow.invoice.id, paidRow.invoice.id],
      { attachPdf: false },
      async (message) => {
        deliveries.push({
          text: message.text,
          files: (message.attachments ?? []).map((file) => file.filename),
        });
      },
    );
    expect(result.skipped).toEqual([]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].files).toEqual([]);
    expect(deliveries[0].text).toContain("0000001");
    expect(deliveries[0].text).toContain("0000002");
    expect(deliveries[0].text).toContain("0000003");
    expect((await scope.invoices.get(sentRow.invoice.id))?.status).toBe("sent");
    expect((await scope.invoices.get(partialRow.invoice.id))?.status).toBe(
      "partial",
    );
    expect((await scope.invoices.get(paidRow.invoice.id))?.status).toBe("paid");
  });

  it("emails other Clients when one Client delivery fails", async () => {
    const { owner, scope } = await catalog("bulk-isolate@example.com");
    const ada = await addClient(scope, "Ada Prints", "ada@example.com");
    const bea = await addClient(scope, "Bea Prints", "bea@example.com");
    const adaA = await scope.invoices.create(invoiceInput(ada.id));
    const adaB = await scope.invoices.create(invoiceInput(ada.id));
    const beaDraft = await scope.invoices.create(invoiceInput(bea.id));
    const result = await sendInvoicesByEmail(
      scope,
      owner.userId,
      [adaA.id, adaB.id, beaDraft.id],
      { attachPdf: false },
      async (message) => {
        if (message.to === "ada@example.com") throw new Error("smtp down");
      },
    );
    expect(result.sentIds).toEqual([beaDraft.id]);
    expect(result.skipped).toEqual([
      { invoiceId: adaA.id, clientName: "Ada Prints", reason: "email-failed" },
      { invoiceId: adaB.id, clientName: "Ada Prints", reason: "email-failed" },
    ]);
    expect((await scope.invoices.get(adaA.id))?.status).toBe("draft");
    expect((await scope.invoices.get(adaB.id))?.status).toBe("draft");
    expect((await scope.invoices.get(beaDraft.id))?.status).toBe("sent");
  });
});
