import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { business, invoiceLink, stripeEvent } from "../db/schema";
import { appUrl } from "../lib/config";
import { formatInvoiceNumber, todayInTimeZone } from "../lib/invoice";
import {
  createAccountLink,
  createDirectCheckout,
  createStandardAccount,
  fetchStripeFee,
  retrieveConnectedAccount,
  type StripeEvent,
  type StripeFee,
  stripeConfigured,
  verifyStripeEvent,
} from "../lib/stripe";
import { hashInvoiceToken, isInvoiceToken } from "./invoice-token";
import { signedInBusiness } from "./membership";
import { openPublicInvoice } from "./public-invoice";
import { forBusiness, recordAudit } from "./tenancy";

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
  "account.updated",
  "account.application.deauthorized",
  "charge.refunded",
  "refund.created",
]);

const INTENT = /^pi_[A-Za-z0-9_]{1,255}$/;
const SESSION = /^cs_[A-Za-z0-9_]{1,255}$/;

/**
 * Webhook lookup outside forBusiness. The Business comes from the Connected
 * Account on the signed event, never from metadata.
 */
async function businessIdForAccount(accountId: string) {
  const rows = await getDb()
    .select({ id: business.id })
    .from(business)
    .where(eq(business.stripeAccountId, accountId))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function beginStripeOnboarding(
  businessId: string,
  actorUserId: string,
): Promise<string> {
  if (!stripeConfigured()) throw new Error("Stripe is not configured");
  const scope = forBusiness(getDb(), businessId);
  const row = await scope.business.get();
  if (!row) throw new Error("A signed-in Business is required");
  let accountId = row.stripeAccountId;
  if (!accountId) {
    const created = await createStandardAccount();
    await scope.business.setConnectedAccount({
      accountId: created.id,
      chargesEnabled: false,
      detailsSubmitted: false,
    });
    await scope.audit.record({
      action: "stripe.connected",
      actorUserId,
      entityType: "business",
      entityId: businessId,
      metadata: { accountId: created.id },
    });
    accountId = created.id;
  }
  const link = await createAccountLink(accountId, {
    refreshUrl: `${appUrl()}/app/stripe/refresh`,
    returnUrl: `${appUrl()}/app/stripe/return`,
  });
  return link.url;
}

export async function refreshStripeState(businessId: string): Promise<void> {
  if (!stripeConfigured()) return;
  const scope = forBusiness(getDb(), businessId);
  const row = await scope.business.get();
  if (!row?.stripeAccountId) return;
  const account = await retrieveConnectedAccount(row.stripeAccountId);
  if (account.id !== row.stripeAccountId) return;
  await scope.business.setConnectedAccount({
    accountId: account.id,
    chargesEnabled: account.chargesEnabled,
    detailsSubmitted: account.detailsSubmitted,
  });
}

export async function disconnectStripe(
  businessId: string,
  actorUserId: string,
): Promise<void> {
  const scope = forBusiness(getDb(), businessId);
  const row = await scope.business.get();
  if (!row?.stripeAccountId) return;
  await scope.business.setConnectedAccount(null);
  await scope.audit.record({
    action: "stripe.disconnected",
    actorUserId,
    entityType: "business",
    entityId: businessId,
  });
}

export async function startPublicCheckout(
  request: Request,
  token: string,
): Promise<Response> {
  const opened = await openPublicInvoice(request, token, { recordView: false });
  if (opened.status === 429) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "retry-after": String(Math.ceil(opened.retryAfterMs / 1000)),
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  if (opened.status !== 200 || !opened.canPay) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  const target = await payableTarget(token);
  if (!target || target.amountDueCents !== opened.amountDueCents) {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
  try {
    const session = await createDirectCheckout({
      accountId: target.accountId,
      invoiceId: target.invoiceId,
      numberLabel: formatInvoiceNumber(target.number),
      amountCents: target.amountDueCents,
      successUrl: `${appUrl()}/p/${token}?checkout=success`,
      cancelUrl: `${appUrl()}/p/${token}?checkout=cancel`,
    });
    return Response.redirect(session.url, 303);
  } catch {
    return new Response("Payment could not be started", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Stripe webhooks are not configured", { status: 503 });
  }
  const payload = await request.text();
  const event = verifyStripeEvent(
    payload,
    request.headers.get("stripe-signature"),
    secret,
  );
  if (!event) return new Response("Invalid signature", { status: 400 });
  if (!HANDLED.has(event.type)) return new Response("ok", { status: 200 });
  const db = getDb();
  const claimed = await db
    .insert(stripeEvent)
    .values({ id: event.id, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: stripeEvent.id });
  if (!claimed[0]) return new Response("ok", { status: 200 });
  try {
    await dispatch(event);
    return new Response("ok", { status: 200 });
  } catch {
    await db.delete(stripeEvent).where(eq(stripeEvent.id, event.id));
    return new Response("Webhook failed", { status: 500 });
  }
}

async function dispatch(event: StripeEvent) {
  if (event.type === "account.updated") {
    await syncAccount(event);
    return;
  }
  if (event.type === "account.application.deauthorized") {
    await deauthorize(event);
    return;
  }
  if (event.type === "charge.refunded" || event.type === "refund.created") {
    await ignoreRefund(event);
    return;
  }
  await recordFromEvent(event);
}

async function syncAccount(event: StripeEvent) {
  if (!event.account || event.object.id !== event.account) return;
  const businessId = await businessIdForAccount(event.account);
  if (!businessId) return;
  await forBusiness(getDb(), businessId).business.setConnectedAccount({
    accountId: event.account,
    chargesEnabled: event.object.charges_enabled === true,
    detailsSubmitted: event.object.details_submitted === true,
  });
}

async function deauthorize(event: StripeEvent) {
  if (!event.account) return;
  const businessId = await businessIdForAccount(event.account);
  if (!businessId) return;
  const scope = forBusiness(getDb(), businessId);
  await scope.business.setConnectedAccount(null);
  await scope.audit.record({
    action: "stripe.deauthorized",
    entityType: "business",
    entityId: businessId,
  });
}

async function ignoreRefund(event: StripeEvent) {
  // ponytail: refunds are acknowledged so Stripe stops retrying, and not applied.
  // Apply them when a refund can reduce paid cents and create the fee adjustment.
  if (!event.account) return;
  const businessId = await businessIdForAccount(event.account);
  if (!businessId) return;
  const amount = event.object.amount_refunded;
  await recordAudit(getDb(), {
    businessId,
    action: "payment.refund_ignored",
    entityType: "payment",
    amountCents:
      typeof amount === "number" && Number.isSafeInteger(amount)
        ? amount
        : null,
    metadata: {
      eventType: event.type,
      chargeId: typeof event.object.id === "string" ? event.object.id : null,
    },
  });
}

async function recordFromEvent(event: StripeEvent) {
  if (!event.account) return;
  const businessId = await businessIdForAccount(event.account);
  if (!businessId) return;
  const parsed = paymentFromEvent(event);
  if (!parsed) return;
  const scope = forBusiness(getDb(), businessId);
  const row = await scope.business.get();
  if (!row) return;
  let fee: StripeFee = {
    chargeId: null,
    balanceTransactionId: null,
    feeCents: null,
  };
  if (stripeConfigured()) {
    try {
      fee = await fetchStripeFee(event.account, parsed.paymentIntentId);
    } catch {
      fee = { chargeId: null, balanceTransactionId: null, feeCents: null };
    }
  }
  await scope.payments.recordStripe({
    invoiceId: parsed.invoiceId,
    amountCents: parsed.amountCents,
    paidOn: todayInTimeZone(
      row.timeZone,
      parsed.created > 0 ? new Date(parsed.created * 1000) : new Date(),
    ),
    checkoutSessionId: parsed.checkoutSessionId,
    paymentIntentId: parsed.paymentIntentId,
    fee,
  });
}

function paymentFromEvent(event: StripeEvent): {
  invoiceId: string;
  amountCents: number;
  paymentIntentId: string;
  checkoutSessionId: string | null;
  created: number;
} | null {
  const invoiceId = invoiceIdFrom(event.object);
  if (!invoiceId) return null;
  if (event.type === "payment_intent.succeeded") {
    if (event.object.status !== "succeeded") return null;
    const paymentIntentId = idOf(event.object.id, INTENT);
    const amountCents = money(event.object.amount, event.object.currency);
    if (!paymentIntentId || amountCents === null) return null;
    return {
      invoiceId,
      amountCents,
      paymentIntentId,
      checkoutSessionId: null,
      created: event.created,
    };
  }
  if (event.object.payment_status !== "paid") return null;
  const paymentIntentId = intentFrom(event.object.payment_intent);
  const sessionId = idOf(event.object.id, SESSION);
  const amountCents = money(event.object.amount_total, event.object.currency);
  if (!paymentIntentId || !sessionId || amountCents === null) return null;
  return {
    invoiceId,
    amountCents,
    paymentIntentId,
    checkoutSessionId: sessionId,
    created: event.created,
  };
}

function invoiceIdFrom(object: Record<string, unknown>): string | null {
  const metadata = object.metadata;
  if (metadata && typeof metadata === "object") {
    const id = (metadata as Record<string, unknown>).invoice_id;
    if (typeof id === "string" && id.length > 0 && id.length <= 80) return id;
  }
  return typeof object.client_reference_id === "string" &&
    object.client_reference_id.length > 0 &&
    object.client_reference_id.length <= 80
    ? object.client_reference_id
    : null;
}

function intentFrom(value: unknown): string | null {
  if (typeof value === "string") return idOf(value, INTENT);
  if (value && typeof value === "object") {
    return idOf((value as Record<string, unknown>).id, INTENT);
  }
  return null;
}

function idOf(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function money(amount: unknown, currency: unknown): number | null {
  if (currency !== "usd") return null;
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return null;
  }
  return amount;
}

async function payableTarget(token: string) {
  if (!isInvoiceToken(token)) return null;
  const rows = await getDb()
    .select()
    .from(invoiceLink)
    .where(eq(invoiceLink.tokenHash, hashInvoiceToken(token)))
    .limit(1);
  const link = rows[0];
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now())
    return null;
  const scope = forBusiness(getDb(), link.businessId);
  const [view, row] = await Promise.all([
    scope.invoices.get(link.invoiceId),
    scope.business.get(),
  ]);
  if (!view || !row?.stripeAccountId || view.amountDueCents <= 0) return null;
  return {
    invoiceId: view.id,
    number: view.number,
    amountDueCents: view.amountDueCents,
    accountId: row.stripeAccountId,
  };
}

export async function signedStripeRedirect(
  kind: "refresh" | "return",
  request: Request,
): Promise<Response> {
  const current = await signedInBusiness();
  if (!current) return Response.redirect(new URL("/sign-in", request.url), 303);
  try {
    if (kind === "return") {
      await refreshStripeState(current.businessId);
      return Response.redirect(new URL("/app/settings", request.url), 303);
    }
    const url = await beginStripeOnboarding(
      current.businessId,
      current.session.user.id,
    );
    return Response.redirect(url, 303);
  } catch {
    return Response.redirect(new URL("/app/settings", request.url), 303);
  }
}
