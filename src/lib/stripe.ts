import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";
const TOLERANCE_SECONDS = 300;
const id = (prefix: string) => new RegExp(`^${prefix}_[A-Za-z0-9_]{1,255}$`);
const ACCOUNT_ID = id("acct");
const EVENT_ID = id("evt");
const SESSION_ID = id("cs");
const CHARGE_ID = id("ch");
const BALANCE_ID = id("txn");
const INTENT_ID = id("pi");
const REFUND_ID = id("re");

export type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  created: number;
  object: Record<string, unknown>;
};

const CLIENT_ID = /^ca_[A-Za-z0-9_]{1,255}$/;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function connectClientId(): string | null {
  const value = process.env.STRIPE_CONNECT_CLIENT_ID ?? "";
  return CLIENT_ID.test(value) ? value : null;
}

/** OAuth needs the platform client id. Account Links do not. */
export function stripeOauthConfigured(): boolean {
  return stripeConfigured() && connectClientId() !== null;
}

export function stripeAuthorizeUrl(input: {
  state: string;
  redirectUri: string;
}): string {
  const clientId = connectClientId();
  if (!clientId) throw new Error("Stripe OAuth is not configured");
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  return url.toString();
}

/** Returns only the Connected Account id. Access and refresh tokens are dropped. */
export async function exchangeOAuthCode(code: string): Promise<string> {
  const payload = await oauthRequest(
    "/oauth/token",
    new URLSearchParams({ grant_type: "authorization_code", code }),
  );
  const id = payload.stripe_user_id;
  if (typeof id !== "string" || !ACCOUNT_ID.test(id)) {
    throw new Error("Stripe request failed");
  }
  return id;
}

export async function deauthorizeConnectedAccount(
  accountId: string,
): Promise<void> {
  const clientId = connectClientId();
  if (!clientId) throw new Error("Stripe OAuth is not configured");
  await oauthRequest(
    "/oauth/deauthorize",
    new URLSearchParams({ client_id: clientId, stripe_user_id: accountId }),
  );
}

export function verifyStripeEvent(
  payload: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
): StripeEvent | null {
  if (!header || !secret || payload.length > 1_000_000) return null;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const split = part.indexOf("=");
    if (split === -1) continue;
    const key = part.slice(0, split);
    const value = part.slice(split + 1);
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  if (!/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return null;
  const seconds = Number(timestamp);
  if (Math.abs(nowMs / 1000 - seconds) > TOLERANCE_SECONDS) return null;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest();
  const signed = signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
  });
  if (!signed) return null;
  return parseEvent(payload);
}

export async function createStandardAccount(): Promise<{ id: string }> {
  const body = new URLSearchParams({ type: "standard" });
  return {
    id: accountId(await stripeRequest("/accounts", { method: "POST", body })),
  };
}

export async function createAccountLink(
  accountId: string,
  urls: { refreshUrl: string; returnUrl: string },
): Promise<{ url: string }> {
  const body = new URLSearchParams({
    account: accountId,
    refresh_url: urls.refreshUrl,
    return_url: urls.returnUrl,
    type: "account_onboarding",
  });
  const url = stringField(
    await stripeRequest("/account_links", { method: "POST", body }),
    "url",
  );
  if (!isStripeHttpsUrl(url)) throw new Error("Stripe request failed");
  return { url };
}

export async function retrieveConnectedAccount(account: string): Promise<{
  id: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  const payload = await stripeRequest(`/accounts/${account}`, {
    method: "GET",
  });
  return {
    id: accountId(payload),
    chargesEnabled: flag(payload, "charges_enabled"),
    detailsSubmitted: flag(payload, "details_submitted"),
  };
}

export async function createDirectCheckout(input: {
  accountId: string;
  invoiceId: string;
  numberLabel: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.invoiceId);
  body.set("metadata[invoice_id]", input.invoiceId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  body.set(
    "line_items[0][price_data][product_data][name]",
    `Invoice ${input.numberLabel}`,
  );
  body.set("payment_intent_data[metadata][invoice_id]", input.invoiceId);
  const payload = await stripeRequest("/checkout/sessions", {
    method: "POST",
    account: input.accountId,
    body,
    idempotencyKey: `checkout_${input.invoiceId}_${input.amountCents}`,
  });
  const id = stringField(payload, "id");
  const url = stringField(payload, "url");
  if (!SESSION_ID.test(id) || !isStripeHttpsUrl(url)) {
    throw new Error("Stripe request failed");
  }
  return { id, url };
}

export type StripeFee = {
  chargeId: string | null;
  balanceTransactionId: string | null;
  feeCents: number | null;
};

/** Fee from the connected account's balance transaction. Null fields if Stripe has not posted it yet. */
export async function fetchStripeFee(
  accountId: string,
  paymentIntentId: string,
): Promise<StripeFee> {
  const payload = await stripeRequest(
    `/payment_intents/${paymentIntentId}?expand[]=latest_charge.balance_transaction`,
    { method: "GET", account: accountId },
  );
  const charge = objectField(payload, "latest_charge");
  if (!charge)
    return { chargeId: null, balanceTransactionId: null, feeCents: null };
  const chargeId = idOrNull(charge.id, CHARGE_ID);
  const balance = objectField(charge, "balance_transaction");
  if (balance?.currency !== "usd") {
    return { chargeId, balanceTransactionId: null, feeCents: null };
  }
  return {
    chargeId,
    balanceTransactionId: idOrNull(balance.id, BALANCE_ID),
    feeCents: integerOrNull(balance.fee),
  };
}

export type ChargeRefund = {
  chargeId: string;
  paymentIntentId: string | null;
  refundedCents: number;
  refundIds: string[];
  /** Net fee after refund balance transactions. Null when Stripe has not posted one. */
  feeCents: number | null;
};

export type RefundEvent = {
  chargeId: string | null;
  paymentIntentId: string | null;
  absoluteRefundedCents: number | null;
  refundId: string | null;
  refundAmountCents: number | null;
  refundIds: string[];
  feeCents: number | null;
};

/**
 * charge.refunded carries the cumulative amount_refunded.
 * refund.created carries one refund. Fee comes only from expanded balance transactions.
 */
export function refundFromEvent(event: StripeEvent): RefundEvent | null {
  if (event.type !== "charge.refunded" && event.type !== "refund.created") {
    return null;
  }
  const object = event.object;
  if (object.currency !== undefined && object.currency !== "usd") return null;
  if (event.type === "charge.refunded") {
    const chargeId = idOrNull(object.id, CHARGE_ID);
    if (!chargeId) return null;
    return {
      chargeId,
      paymentIntentId: intentOf(object.payment_intent),
      absoluteRefundedCents: integerOrNull(object.amount_refunded),
      refundId: null,
      refundAmountCents: null,
      refundIds: refundIdsFrom(object.refunds),
      feeCents: netFee(object),
    };
  }
  const status = object.status;
  if (status !== undefined && status !== "succeeded" && status !== "pending") {
    return null;
  }
  const refundId = idOrNull(object.id, REFUND_ID);
  const chargeId = idOrNull(object.charge, CHARGE_ID);
  if (!refundId || !chargeId) return null;
  return {
    chargeId,
    paymentIntentId: intentOf(object.payment_intent),
    absoluteRefundedCents: null,
    refundId,
    refundAmountCents: integerOrNull(object.amount),
    refundIds: [refundId],
    feeCents: null,
  };
}

/** Authoritative refund total and net fee from the connected account's charge. */
export async function fetchChargeRefund(
  accountId: string,
  chargeId: string,
): Promise<ChargeRefund | null> {
  const payload = await stripeRequest(
    `/charges/${chargeId}?expand[]=balance_transaction&expand[]=refunds.data.balance_transaction`,
    { method: "GET", account: accountId },
  );
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (row.currency !== undefined && row.currency !== "usd") return null;
  const refunded = integerOrNull(row.amount_refunded);
  if (refunded === null) return null;
  return {
    chargeId,
    paymentIntentId: intentOf(row.payment_intent),
    refundedCents: refunded,
    refundIds: refundIdsFrom(row.refunds),
    feeCents: netFee(row),
  };
}

function parseEvent(payload: string): StripeEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !EVENT_ID.test(row.id)) return null;
  if (typeof row.type !== "string" || row.type.length > 80) return null;
  if (row.account !== undefined && typeof row.account !== "string") return null;
  if (typeof row.account === "string" && !ACCOUNT_ID.test(row.account)) {
    return null;
  }
  const data = row.data;
  if (!data || typeof data !== "object") return null;
  const object = (data as Record<string, unknown>).object;
  if (!object || typeof object !== "object") return null;
  return {
    id: row.id,
    type: row.type,
    account: typeof row.account === "string" ? row.account : undefined,
    created: typeof row.created === "number" ? row.created : 0,
    object: object as Record<string, unknown>,
  };
}

async function oauthRequest(
  path: string,
  body: URLSearchParams,
): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  const response = await fetch(`https://connect.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Stripe request failed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Stripe request failed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stripe request failed");
  }
  const row = parsed as Record<string, unknown>;
  if (typeof row.error === "string") throw new Error("Stripe request failed");
  return row;
}

async function stripeRequest(
  path: string,
  options: {
    method: "GET" | "POST";
    account?: string;
    body?: URLSearchParams;
    idempotencyKey?: string;
  },
): Promise<unknown> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  const headers = new Headers({ Authorization: `Bearer ${key}` });
  if (options.account) headers.set("Stripe-Account", options.account);
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  if (options.body)
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: options.method,
    headers,
    body: options.body?.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Stripe request failed");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Stripe request failed");
  }
}

function accountId(payload: unknown): string {
  const id = stringField(payload, "id");
  if (!ACCOUNT_ID.test(id)) throw new Error("Stripe request failed");
  return id;
}

function stringField(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object")
    throw new Error("Stripe request failed");
  const value = (payload as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value)
    throw new Error("Stripe request failed");
  return value;
}

function flag(payload: unknown, key: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  return (payload as Record<string, unknown>)[key] === true;
}

function objectField(
  payload: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function idOrNull(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function intentOf(value: unknown): string | null {
  if (typeof value === "string") return idOrNull(value, INTENT_ID);
  if (value && typeof value === "object") {
    return idOrNull((value as Record<string, unknown>).id, INTENT_ID);
  }
  return null;
}

function refundIdsFrom(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const refundId = idOrNull((item as Record<string, unknown>).id, REFUND_ID);
    if (refundId) ids.push(refundId);
  }
  return ids;
}

function netFee(charge: Record<string, unknown>): number | null {
  const chargeFee = feeOf(objectField(charge, "balance_transaction"));
  const refunds = charge.refunds;
  const rows = Array.isArray((refunds as { data?: unknown } | null)?.data)
    ? ((refunds as { data: unknown[] }).data ?? [])
    : [];
  let fee = chargeFee;
  let known = chargeFee !== null;
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const refundFee = feeOf(
      objectField(item as Record<string, unknown>, "balance_transaction"),
    );
    if (refundFee === null) continue;
    fee = (fee ?? 0) + refundFee;
    known = true;
  }
  if (!known || fee === null) return null;
  return Math.max(fee, 0);
}

function feeOf(balance: Record<string, unknown> | null): number | null {
  if (balance?.currency !== "usd") return null;
  const fee = balance.fee;
  return typeof fee === "number" && Number.isSafeInteger(fee) ? fee : null;
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isStripeHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "stripe.com" ||
        parsed.hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}
