import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/client";
import { auditLog, expense, payment, stripeEvent } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { verifyStripeEvent } from "../src/lib/stripe";
import type { InvoiceInput } from "../src/server/invoice-store";
import { openPublicInvoice } from "../src/server/public-invoice";
import { handleStripeWebhook, startPublicCheckout } from "../src/server/stripe";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

const SECRET = "whsec_test";

function input(clientId: string, unitPriceCents: number): InvoiceInput {
  return {
    clientId,
    issueDate: "2026-04-01",
    dueDate: "2026-12-01",
    reference: null,
    notes: null,
    terms: null,
    lines: [
      {
        name: "Print",
        description: null,
        quantity: 1,
        unitPriceCents: cents(unitPriceCents),
        taxRateIds: [],
      },
    ],
  };
}

function request(ip: string) {
  return new Request("https://invoice.example/p/token", {
    headers: { "x-forwarded-for": ip },
  });
}

function sign(
  body: string,
  secret = SECRET,
  seconds = Math.floor(Date.now() / 1000),
) {
  const v1 = createHmac("sha256", secret)
    .update(`${seconds}.${body}`)
    .digest("hex");
  return `t=${seconds},v1=${v1}`;
}

function webhook(payload: unknown, header?: string) {
  const body = JSON.stringify(payload);
  return new Request("https://invoice.example/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header ?? sign(body) },
    body,
  });
}

function checkoutEvent(input: {
  id: string;
  account: string;
  invoiceId: string;
  amount: number;
  paymentIntentId: string;
  sessionId?: string;
  paymentStatus?: string;
}) {
  return {
    id: input.id,
    type: "checkout.session.completed",
    account: input.account,
    created: 1_780_000_000,
    data: {
      object: {
        id: input.sessionId ?? "cs_order1",
        payment_status: input.paymentStatus ?? "paid",
        amount_total: input.amount,
        currency: "usd",
        payment_intent: input.paymentIntentId,
        metadata: { invoice_id: input.invoiceId },
        client_reference_id: input.invoiceId,
      },
    },
  };
}

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

describe("payments", () => {
  it("rejects a bad Stripe signature and ignores a replay", async () => {
    expect(verifyStripeEvent("{}", "t=1,v1=abcd", SECRET)).toBeNull();
    const body = JSON.stringify({
      id: "evt_ok",
      type: "account.updated",
      data: { object: { id: "acct_ok" } },
    });
    const header = sign(body);
    expect(verifyStripeEvent(`${body} `, header, SECRET)).toBeNull();
    expect(verifyStripeEvent(body, sign(body, "other"), SECRET)).toBeNull();
    const stale = 1_700_000_000;
    expect(
      verifyStripeEvent(
        body,
        sign(body, SECRET, stale),
        SECRET,
        stale * 1000 + 400_000,
      ),
    ).toBeNull();
    expect(verifyStripeEvent(body, header, SECRET)?.id).toBe("evt_ok");

    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(
      (await handleStripeWebhook(webhook({ id: "evt_none" }))).status,
    ).toBe(503);

    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect(
      (await handleStripeWebhook(webhook({ id: "evt_bad" }, "t=1,v1=nope")))
        .status,
    ).toBe(400);
    expect(
      await getDb()
        .select()
        .from(stripeEvent)
        .where(eq(stripeEvent.id, "evt_bad")),
    ).toEqual([]);
  });

  it("records partial then full manual payments, keeps a credit, and keeps card payments fixed", async () => {
    const db = getDb();
    const owner = await insertOwner("pay-owner@example.com", "Pay Prints");
    const scope = forBusiness(db, owner.businessId);
    const client = await scope.clients.create({
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const draft = await scope.invoices.create(input(client.id, 100));
    await expect(
      scope.payments.recordManual({
        invoiceId: draft.id,
        amountCents: cents(100),
        paidOn: "2026-04-02",
        method: "check",
        note: null,
        actorUserId: owner.userId,
      }),
    ).rejects.toThrow(/sent/);
    const created = await scope.invoices.create(input(client.id, 5000));
    const sent = await scope.invoices.send(created.id, owner.userId);
    if (!sent) throw new Error("send");

    const partialId = await scope.payments.recordManual({
      invoiceId: sent.invoice.id,
      amountCents: cents(2000),
      paidOn: "2026-04-02",
      method: "check",
      note: "1042",
      actorUserId: owner.userId,
    });
    const partial = await scope.invoices.get(sent.invoice.id);
    expect(partial?.status).toBe("partial");
    expect(partial?.displayStatus).toBe("partial");
    expect(partial?.amountDueCents).toBe(3000);
    expect(partial?.paidCents).toBe(2000);

    await scope.payments.updateManual(partialId, {
      amountCents: cents(2500),
      paidOn: "2026-04-03",
      method: "cash",
      note: "drawer",
      actorUserId: owner.userId,
    });
    const edited = await scope.invoices.get(sent.invoice.id);
    expect(edited?.payments[0]).toMatchObject({
      amountCents: 2500,
      paidOn: "2026-04-03",
      method: "cash",
      note: "drawer",
      manual: true,
    });
    expect(edited?.amountDueCents).toBe(2500);

    await scope.payments.recordManual({
      invoiceId: sent.invoice.id,
      amountCents: cents(2500),
      paidOn: "2026-04-04",
      method: "other",
      note: null,
      actorUserId: owner.userId,
    });
    const paid = await scope.invoices.get(sent.invoice.id);
    expect(paid?.status).toBe("paid");
    expect(paid?.amountDueCents).toBe(0);
    await scope.payments.recordManual({
      invoiceId: sent.invoice.id,
      amountCents: cents(100),
      paidOn: "2026-04-05",
      method: "cash",
      note: null,
      actorUserId: owner.userId,
    });
    const overpaid = await scope.invoices.get(sent.invoice.id);
    expect(overpaid?.displayStatus).toBe("overpaid");
    expect(overpaid?.paidCents).toBe(5100);
    expect(
      (overpaid?.paidCents ?? 0) - (overpaid?.document.totalCents ?? 0),
    ).toBe(100);
    const extra = overpaid?.payments.find((item) => item.amountCents === 100);
    if (!extra) throw new Error("credit");
    await scope.payments.removeManual(extra.id, owner.userId);
    await expect(
      scope.invoices.voidInvoice(sent.invoice.id, "Too late", owner.userId),
    ).rejects.toThrow(/Payment/);

    const other = paid?.payments.find((item) => item.method === "other");
    if (!other) throw new Error("payment");
    await scope.payments.removeManual(other.id, owner.userId);
    expect((await scope.invoices.get(sent.invoice.id))?.status).toBe("partial");
    await scope.payments.removeManual(partialId, owner.userId);
    const cleared = await scope.invoices.get(sent.invoice.id);
    expect(cleared?.status).toBe("sent");
    expect(cleared?.payments).toEqual([]);
    expect(cleared?.amountDueCents).toBe(5000);

    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const first = checkoutEvent({
      id: "evt_card",
      account: "acct_payprints",
      invoiceId: sent.invoice.id,
      amount: 5000,
      paymentIntentId: "pi_card5000",
      sessionId: "cs_card5000",
    });
    await scope.business.setConnectedAccount({
      accountId: "acct_payprints",
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    expect((await handleStripeWebhook(webhook(first))).status).toBe(200);
    expect((await handleStripeWebhook(webhook(first))).status).toBe(200);
    let card = await scope.invoices.get(sent.invoice.id);
    expect(card?.status).toBe("paid");
    expect(card?.payments).toHaveLength(1);
    expect(card?.payments[0]?.feeCents).toBeNull();
    expect(card?.payments[0]?.manual).toBe(false);
    expect(
      await scope.expenses.list({ from: null, to: null, categoryId: null }),
    ).toEqual([]);
    const cardId = card?.payments[0]?.id;
    if (!cardId) throw new Error("card");
    await expect(
      scope.payments.removeManual(cardId, owner.userId),
    ).rejects.toThrow(/card/);
    await expect(
      scope.payments.updateManual(cardId, {
        amountCents: cents(100),
        paidOn: "2026-04-05",
        method: "check",
        note: null,
        actorUserId: owner.userId,
      }),
    ).rejects.toThrow(/card/);

    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "pi_card5000",
          latest_charge: {
            id: "ch_card5000",
            balance_transaction: {
              id: "txn_card5000",
              fee: 175,
              currency: "usd",
            },
          },
        }),
      ),
    );
    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_card_fee",
            type: "payment_intent.succeeded",
            account: "acct_payprints",
            created: 1_780_000_100,
            data: {
              object: {
                id: "pi_card5000",
                status: "succeeded",
                amount: 5000,
                currency: "usd",
                metadata: { invoice_id: sent.invoice.id },
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    card = await scope.invoices.get(sent.invoice.id);
    expect(card?.payments).toHaveLength(1);
    expect(card?.payments[0]).toMatchObject({
      amountCents: 5000,
      feeCents: 175,
      method: "stripe",
    });
    const stored = await db
      .select()
      .from(payment)
      .where(eq(payment.invoiceId, sent.invoice.id));
    expect(stored[0]).toMatchObject({
      stripePaymentIntentId: "pi_card5000",
      stripeChargeId: "ch_card5000",
      stripeBalanceTransactionId: "txn_card5000",
      stripeCheckoutSessionId: "cs_card5000",
      feeCents: 175,
    });
    expect(JSON.stringify(stored)).not.toMatch(/4242|card_number|bank/);
    const feeRows = await scope.expenses.list({
      from: null,
      to: null,
      categoryId: null,
    });
    expect(feeRows).toHaveLength(1);
    expect(feeRows[0]).toMatchObject({
      merchant: "Stripe",
      amountCents: 175,
      paymentId: card?.payments[0]?.id,
      categoryName: "Merchant fees",
    });
    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_card_fee_again",
            type: "payment_intent.succeeded",
            account: "acct_payprints",
            created: 1_780_000_150,
            data: {
              object: {
                id: "pi_card5000",
                status: "succeeded",
                amount: 5000,
                currency: "usd",
                metadata: { invoice_id: sent.invoice.id },
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      await scope.expenses.list({ from: null, to: null, categoryId: null }),
    ).toHaveLength(1);

    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_refund",
            type: "charge.refunded",
            account: "acct_payprints",
            created: 1_780_000_200,
            data: {
              object: {
                id: "ch_card5000",
                amount_refunded: 5000,
                currency: "usd",
                refunds: { data: [{ id: "re_card5000", amount: 5000 }] },
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_refund_created",
            type: "refund.created",
            account: "acct_payprints",
            created: 1_780_000_210,
            data: {
              object: {
                id: "re_card5000",
                amount: 5000,
                currency: "usd",
                status: "succeeded",
                charge: "ch_card5000",
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    const refunded = await scope.invoices.get(sent.invoice.id);
    expect(refunded?.paidCents).toBe(0);
    expect(refunded?.status).toBe("sent");
    expect(refunded?.payments[0]?.refundedCents).toBe(5000);
    const feeAfter = await db
      .select()
      .from(expense)
      .where(eq(expense.paymentId, card?.payments[0]?.id ?? ""));
    expect(feeAfter).toHaveLength(1);
    expect(feeAfter[0]?.amountCents).toBe(175);
    const refunds = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.refunded"));
    expect(refunds.length).toBeGreaterThan(0);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "payment.refund_ignored")),
    ).toEqual([]);
    const voided = await scope.invoices.voidInvoice(
      sent.invoice.id,
      "Refunded in full",
      owner.userId,
    );
    expect(voided?.status).toBe("void");
  });

  it("keeps a webhook for one Connected Account off another Business's Invoice", async () => {
    const db = getDb();
    const alpha = await insertOwner("pay-a@example.com", "Alpha Pay");
    const beta = await insertOwner("pay-b@example.com", "Beta Pay");
    const a = forBusiness(db, alpha.businessId);
    const b = forBusiness(db, beta.businessId);
    const clientA = await a.clients.create({
      name: "A",
      email: "a@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const clientB = await b.clients.create({
      name: "B",
      email: "b@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const invoiceA = await a.invoices.send(
      (await a.invoices.create(input(clientA.id, 4000))).id,
      alpha.userId,
    );
    const invoiceB = await b.invoices.send(
      (await b.invoices.create(input(clientB.id, 4000))).id,
      beta.userId,
    );
    if (!invoiceA || !invoiceB) throw new Error("send");
    await a.business.setConnectedAccount({
      accountId: "acct_alpha",
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    await b.business.setConnectedAccount({
      accountId: "acct_beta",
      chargesEnabled: false,
      detailsSubmitted: false,
    });
    await expect(
      b.business.setConnectedAccount({
        accountId: "acct_alpha",
        chargesEnabled: true,
        detailsSubmitted: true,
      }),
    ).rejects.toThrow();
    expect((await b.business.get())?.stripeAccountId).toBe("acct_beta");

    await expect(
      b.payments.recordManual({
        invoiceId: invoiceA.invoice.id,
        amountCents: cents(100),
        paidOn: "2026-04-02",
        method: "cash",
        note: null,
        actorUserId: beta.userId,
      }),
    ).rejects.toThrow(/exist/);
    expect(await b.invoices.get(invoiceA.invoice.id)).toBeNull();

    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect(
      (
        await handleStripeWebhook(
          webhook(
            checkoutEvent({
              id: "evt_cross",
              account: "acct_alpha",
              invoiceId: invoiceB.invoice.id,
              amount: 4000,
              paymentIntentId: "pi_cross",
              sessionId: "cs_cross",
            }),
          ),
        )
      ).status,
    ).toBe(200);
    expect((await a.invoices.get(invoiceA.invoice.id))?.payments).toEqual([]);
    expect((await b.invoices.get(invoiceB.invoice.id))?.payments).toEqual([]);

    expect(
      (
        await handleStripeWebhook(
          webhook(
            checkoutEvent({
              id: "evt_alpha_ok",
              account: "acct_alpha",
              invoiceId: invoiceA.invoice.id,
              amount: 1000,
              paymentIntentId: "pi_alpha_part",
              sessionId: "cs_alpha_part",
            }),
          ),
        )
      ).status,
    ).toBe(200);
    const partial = await a.invoices.get(invoiceA.invoice.id);
    expect(partial?.status).toBe("partial");
    expect(partial?.paidCents).toBe(1000);
    expect((await b.invoices.get(invoiceB.invoice.id))?.payments).toEqual([]);

    expect(
      (
        await handleStripeWebhook(
          webhook(
            checkoutEvent({
              id: "evt_alpha_over",
              account: "acct_alpha",
              invoiceId: invoiceA.invoice.id,
              amount: 4000,
              paymentIntentId: "pi_alpha_over",
              sessionId: "cs_alpha_over",
            }),
          ),
        )
      ).status,
    ).toBe(200);
    const overpaid = await a.invoices.get(invoiceA.invoice.id);
    expect(overpaid?.paidCents).toBe(5000);
    expect(overpaid?.status).toBe("paid");
    expect(overpaid?.displayStatus).toBe("overpaid");
    expect(
      (overpaid?.paidCents ?? 0) - (overpaid?.document.totalCents ?? 0),
    ).toBe(1000);
    const rejected = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.rejected"));
    const rejectedText = JSON.stringify(rejected);
    expect(rejectedText).toContain("pi_cross");
    expect(rejectedText).not.toContain("pi_alpha_over");

    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_alpha_account",
            type: "account.updated",
            account: "acct_alpha",
            data: {
              object: {
                id: "acct_alpha",
                charges_enabled: false,
                details_submitted: true,
                email: "owner@example.com",
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    const synced = await a.business.get();
    expect(synced?.stripeChargesEnabled).toBe(false);
    expect(JSON.stringify(synced)).not.toContain("owner@example.com");

    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_alpha_off",
            type: "account.application.deauthorized",
            account: "acct_alpha",
            data: { object: { id: "ca_app" } },
          }),
        )
      ).status,
    ).toBe(200);
    expect((await a.business.get())?.stripeAccountId).toBeNull();
    expect((await b.business.get())?.stripeAccountId).toBe("acct_beta");
  });

  it("applies a partial refund once and adjusts the Merchant Fee from the balance transaction", async () => {
    const db = getDb();
    const owner = await insertOwner("pay-refund@example.com", "Refund Prints");
    const scope = forBusiness(db, owner.businessId);
    const client = await scope.clients.create({
      name: "Cara",
      email: "cara-refund@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const sent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 5000))).id,
      owner.userId,
    );
    if (!sent) throw new Error("send");
    await scope.business.setConnectedAccount({
      accountId: "acct_refund",
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    process.env.STRIPE_SECRET_KEY = "sk_test_refund";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    let charge = {
      id: "ch_part",
      amount: 5000,
      amount_refunded: 0,
      currency: "usd",
      payment_intent: "pi_part",
      balance_transaction: { id: "txn_part", fee: 175, currency: "usd" },
      refunds: {
        data: [] as {
          id: string;
          amount: number;
          balance_transaction: { fee: number; currency: string };
        }[],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const href = String(url);
        if (href.includes("/charges/")) return Response.json(charge);
        return Response.json({
          id: "pi_part",
          latest_charge: {
            id: "ch_part",
            balance_transaction: { id: "txn_part", fee: 175, currency: "usd" },
          },
        });
      }),
    );
    expect(
      (
        await handleStripeWebhook(
          webhook(
            checkoutEvent({
              id: "evt_part_pay",
              account: "acct_refund",
              invoiceId: sent.invoice.id,
              amount: 5000,
              paymentIntentId: "pi_part",
              sessionId: "cs_part",
            }),
          ),
        )
      ).status,
    ).toBe(200);
    charge = {
      ...charge,
      amount_refunded: 2000,
      refunds: {
        data: [
          {
            id: "re_part",
            amount: 2000,
            balance_transaction: { fee: 0, currency: "usd" },
          },
        ],
      },
    };
    const refundEvent = {
      id: "evt_part_refund",
      type: "charge.refunded",
      account: "acct_refund",
      created: 1_780_000_300,
      data: {
        object: {
          id: "ch_part",
          amount_refunded: 2000,
          currency: "usd",
          payment_intent: "pi_part",
        },
      },
    };
    expect((await handleStripeWebhook(webhook(refundEvent))).status).toBe(200);
    expect((await handleStripeWebhook(webhook(refundEvent))).status).toBe(200);
    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_part_refund_created",
            type: "refund.created",
            account: "acct_refund",
            created: 1_780_000_310,
            data: {
              object: {
                id: "re_part",
                amount: 2000,
                currency: "usd",
                status: "succeeded",
                charge: "ch_part",
                payment_intent: "pi_part",
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    const partial = await scope.invoices.get(sent.invoice.id);
    expect(partial?.status).toBe("partial");
    expect(partial?.paidCents).toBe(3000);
    expect(partial?.payments[0]?.refundedCents).toBe(2000);
    const fee = await scope.expenses.list({
      from: null,
      to: null,
      categoryId: null,
    });
    expect(fee).toHaveLength(1);
    expect(fee[0]?.amountCents).toBe(175);

    charge = {
      ...charge,
      amount_refunded: 5000,
      refunds: {
        data: [
          {
            id: "re_part",
            amount: 2000,
            balance_transaction: { fee: 0, currency: "usd" },
          },
          {
            id: "re_rest",
            amount: 3000,
            balance_transaction: { fee: -175, currency: "usd" },
          },
        ],
      },
    };
    expect(
      (
        await handleStripeWebhook(
          webhook({
            id: "evt_part_rest",
            type: "charge.refunded",
            account: "acct_refund",
            created: 1_780_000_400,
            data: {
              object: {
                id: "ch_part",
                amount_refunded: 5000,
                currency: "usd",
              },
            },
          }),
        )
      ).status,
    ).toBe(200);
    const cleared = await scope.invoices.get(sent.invoice.id);
    expect(cleared?.status).toBe("sent");
    expect(cleared?.paidCents).toBe(0);
    expect(
      await scope.expenses.list({ from: null, to: null, categoryId: null }),
    ).toEqual([]);
  });

  it("hides the pay button unless the Invoice can take a card payment", async () => {
    const owner = await insertOwner("pay-link@example.com", "Link Prints");
    const scope = forBusiness(getDb(), owner.businessId);
    const client = await scope.clients.create({
      name: "Cara",
      email: "cara@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const created = await scope.invoices.create(input(client.id, 2200));
    const sent = await scope.invoices.send(created.id, owner.userId);
    if (!sent) throw new Error("send");
    await scope.business.setConnectedAccount({
      accountId: "acct_link",
      chargesEnabled: true,
      detailsSubmitted: true,
    });

    const closed = await openPublicInvoice(
      request("203.0.113.80"),
      sent.token,
      {
        recordView: false,
      },
    );
    expect(closed.status).toBe(200);
    if (closed.status === 200) expect(closed.canPay).toBe(false);

    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const open = await openPublicInvoice(request("203.0.113.81"), sent.token, {
      recordView: false,
    });
    expect(open.status).toBe(200);
    if (open.status === 200) {
      expect(open.canPay).toBe(true);
      expect(JSON.stringify(open)).not.toContain("acct_link");
    }

    await scope.business.setConnectedAccount({
      accountId: "acct_link",
      chargesEnabled: false,
      detailsSubmitted: false,
    });
    const disabled = await openPublicInvoice(
      request("203.0.113.82"),
      sent.token,
      {
        recordView: false,
      },
    );
    if (disabled.status === 200) expect(disabled.canPay).toBe(false);

    await scope.business.setConnectedAccount({
      accountId: "acct_link",
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    const viewed = await openPublicInvoice(
      request("203.0.113.83"),
      sent.token,
      {
        recordView: true,
      },
    );
    if (viewed.status === 200) expect(viewed.displayStatus).toBe("viewed");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("Stripe-Account")).toBe("acct_link");
        expect(String(init?.body)).not.toContain("application_fee");
        return Response.json({
          id: "cs_linkpay",
          url: "https://checkout.stripe.com/c/pay/cs_linkpay",
        });
      }),
    );
    const started = await startPublicCheckout(
      request("203.0.113.84"),
      sent.token,
    );
    expect(started.status).toBe(303);
    expect(started.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/pay/cs_linkpay",
    );

    const voided = await scope.invoices.voidInvoice(
      sent.invoice.id,
      "Wrong",
      owner.userId,
    );
    expect(voided?.status).toBe("void");
    const hidden = await openPublicInvoice(
      request("203.0.113.85"),
      sent.token,
      {
        recordView: false,
      },
    );
    if (hidden.status === 200) expect(hidden.canPay).toBe(false);
    expect(
      (await startPublicCheckout(request("203.0.113.86"), sent.token)).status,
    ).toBe(404);
  });

  it("rolls back every Payment when one Invoice is paid", async () => {
    const db = getDb();
    const owner = await insertOwner(
      "pay-batch-rollback@example.com",
      "Batch Prints",
    );
    const scope = forBusiness(db, owner.businessId);
    const client = await scope.clients.create({
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const openSent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 500))).id,
      owner.userId,
    );
    const paidSent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 100))).id,
      owner.userId,
    );
    if (!openSent || !paidSent) throw new Error("send");
    const open = openSent.invoice;
    const paid = paidSent.invoice;
    await scope.payments.recordManual({
      invoiceId: paid.id,
      amountCents: cents(100),
      paidOn: "2026-11-10",
      method: "cash",
      note: null,
      actorUserId: owner.userId,
    });

    await expect(
      scope.payments.recordManualBatch({
        actorUserId: owner.userId,
        rows: [
          {
            invoiceId: open.id,
            amountCents: 500,
            paidOn: "2026-11-11",
            method: "check",
            note: "1042",
          },
          {
            invoiceId: paid.id,
            amountCents: 100,
            paidOn: "2026-11-11",
            method: "check",
            note: null,
          },
        ],
      }),
    ).rejects.toThrow("A Payment can be recorded on a sent Invoice");
    expect(
      await db.select().from(payment).where(eq(payment.invoiceId, open.id)),
    ).toEqual([]);
  });

  it("stores a partial Payment and a credit above the balance, and omits the note and method from the email", async () => {
    const owner = await insertOwner(
      "pay-batch-email@example.com",
      "Batch Prints",
    );
    const scope = forBusiness(getDb(), owner.businessId);
    const client = await scope.clients.create({
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const openSent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 500))).id,
      owner.userId,
    );
    const otherSent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 200))).id,
      owner.userId,
    );
    if (!openSent || !otherSent) throw new Error("send");
    const open = openSent.invoice;
    const other = otherSent.invoice;
    const otherTotal = other.document.totalCents;

    let text = "";
    await scope.payments.recordManualBatch(
      {
        actorUserId: owner.userId,
        notify: true,
        rows: [
          {
            invoiceId: open.id,
            amountCents: 100,
            paidOn: "2026-11-11",
            method: "check",
            note: "1042",
          },
          {
            invoiceId: other.id,
            amountCents: otherTotal + 50,
            paidOn: "2026-11-11",
            method: "venmo",
            note: null,
          },
        ],
      },
      async (message) => {
        text = message.text;
      },
    );
    expect((await scope.invoices.get(open.id))?.status).toBe("partial");
    expect((await scope.invoices.get(other.id))?.status).toBe("paid");
    expect(text).toContain("Invoice 0000001: $1.00");
    expect(text).not.toContain("1042");
    expect(text.toLowerCase()).not.toContain("check");
    expect(text.toLowerCase()).not.toContain("venmo");
  });

  it("does not call deliver when notify is false or omitted", async () => {
    const owner = await insertOwner(
      "pay-batch-quiet@example.com",
      "Batch Prints",
    );
    const scope = forBusiness(getDb(), owner.businessId);
    const client = await scope.clients.create({
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const first = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 500))).id,
      owner.userId,
    );
    const second = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 500))).id,
      owner.userId,
    );
    if (!first || !second) throw new Error("send");
    let called = 0;
    const deliver = async () => {
      called += 1;
    };
    await scope.payments.recordManualBatch(
      {
        actorUserId: owner.userId,
        notify: false,
        rows: [
          {
            invoiceId: first.invoice.id,
            amountCents: 100,
            paidOn: "2026-11-11",
            method: "check",
            note: null,
          },
        ],
      },
      deliver,
    );
    await scope.payments.recordManualBatch(
      {
        actorUserId: owner.userId,
        rows: [
          {
            invoiceId: second.invoice.id,
            amountCents: 100,
            paidOn: "2026-11-11",
            method: "check",
            note: null,
          },
        ],
      },
      deliver,
    );
    expect(called).toBe(0);
  });

  it("stores the Payment and skips a Client with a blank email", async () => {
    const owner = await insertOwner(
      "pay-batch-no-email@example.com",
      "Batch Prints",
    );
    const scope = forBusiness(getDb(), owner.businessId);
    const client = await scope.clients.create({
      name: "Silent Prints",
      email: "",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const sent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 500))).id,
      owner.userId,
    );
    if (!sent) throw new Error("send");
    const result = await scope.payments.recordManualBatch(
      {
        actorUserId: owner.userId,
        notify: true,
        rows: [
          {
            invoiceId: sent.invoice.id,
            amountCents: 100,
            paidOn: "2026-11-11",
            method: "check",
            note: null,
          },
        ],
      },
      async () => {
        throw new Error("should not send");
      },
    );
    expect((await scope.invoices.get(sent.invoice.id))?.status).toBe("partial");
    expect(result.skipped).toEqual([
      { clientName: "Silent Prints", reason: "no-email" },
    ]);
  });

  it("leaves Payments in place when deliver throws", async () => {
    const owner = await insertOwner(
      "pay-batch-email-fail@example.com",
      "Batch Prints",
    );
    const scope = forBusiness(getDb(), owner.businessId);
    const client = await scope.clients.create({
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const sent = await scope.invoices.send(
      (await scope.invoices.create(input(client.id, 500))).id,
      owner.userId,
    );
    if (!sent) throw new Error("send");
    const result = await scope.payments.recordManualBatch(
      {
        actorUserId: owner.userId,
        notify: true,
        rows: [
          {
            invoiceId: sent.invoice.id,
            amountCents: 100,
            paidOn: "2026-11-11",
            method: "check",
            note: null,
          },
        ],
      },
      async () => {
        throw new Error("smtp down");
      },
    );
    expect((await scope.invoices.get(sent.invoice.id))?.status).toBe("partial");
    expect(result.skipped).toEqual([
      { clientName: "Ada", reason: "email-failed" },
    ]);
  });
});
