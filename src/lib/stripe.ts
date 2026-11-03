import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";
const TOLERANCE_SECONDS = 300;
const id = (prefix: string) => new RegExp(`^${prefix}_[A-Za-z0-9_]{1,255}$`);
const ACCOUNT_ID = id("acct");
const EVENT_ID = id("evt");
const SESSION_ID = id("cs");
const CHARGE_ID = id("ch");
const BALANCE_ID = id("txn");

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
