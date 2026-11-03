import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/client";
import { auditLog, stripeOauthState } from "../src/db/schema";
import { cents } from "../src/lib/money";
import { stripeOauthConfigured } from "../src/lib/stripe";
import type { InvoiceInput } from "../src/server/invoice-store";
import {
  beginStripeOAuth,
  completeStripeOAuth,
  disconnectStripe,
  handleStripeWebhook,
} from "../src/server/stripe";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

const CLIENT = "ca_testclient";

function input(clientId: string): InvoiceInput {
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
        unitPriceCents: cents(3000),
        taxRateIds: [],
      },
    ],
  };
}

function mockStripe(accountId: string) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    if (target.endsWith("/oauth/token")) {
      return Response.json({
        access_token: "sk_test_secret_token",
        refresh_token: "rt_test_secret_token",
        stripe_user_id: accountId,
        token_type: "bearer",
      });
    }
    if (target.includes(`/accounts/${accountId}`)) {
      return Response.json({
        id: accountId,
        charges_enabled: true,
        details_submitted: true,
        email: "owner@example.com",
      });
    }
    if (target.endsWith("/oauth/deauthorize")) {
      expect(String(init?.body)).toContain(`client_id=${CLIENT}`);
      expect(String(init?.body)).toContain(`stripe_user_id=${accountId}`);
      return Response.json({ stripe_user_id: accountId });
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  });
}

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CONNECT_CLIENT_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

describe("stripe oauth", () => {
  it("hides OAuth unless the Connect client id is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(stripeOauthConfigured()).toBe(false);
    const owner = await insertOwner("oauth-hidden@example.com", "Hidden");
    await expect(
      beginStripeOAuth(owner.businessId, owner.userId),
    ).rejects.toThrow(/configured/);
    process.env.STRIPE_CONNECT_CLIENT_ID = "not-a-client-id";
    expect(stripeOauthConfigured()).toBe(false);
  });

  it("rejects a missing or foreign state and links only the matching Business", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_CONNECT_CLIENT_ID = CLIENT;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const db = getDb();
    const alpha = await insertOwner("oauth-a@example.com", "Alpha OAuth");
    const beta = await insertOwner("oauth-b@example.com", "Beta OAuth");
    const calls = mockStripe("acct_oauth_alpha");
    vi.stubGlobal("fetch", calls);

    await expect(
      completeStripeOAuth({
        businessId: alpha.businessId,
        userId: alpha.userId,
        state: "",
        code: "ac_missing",
      }),
    ).rejects.toThrow(/rejected/);
    await expect(
      completeStripeOAuth({
        businessId: alpha.businessId,
        userId: alpha.userId,
        state: "not-a-real-state",
        code: "ac_bad",
      }),
    ).rejects.toThrow(/rejected/);
    expect(calls).not.toHaveBeenCalled();

    const url = await beginStripeOAuth(alpha.businessId, alpha.userId);
    const state = new URL(url).searchParams.get("state") ?? "";
    expect(url).toContain("https://connect.stripe.com/oauth/authorize");
    expect(url).toContain("response_type=code");
    expect(url).toContain("scope=read_write");
    expect(url).toContain(`client_id=${CLIENT}`);
    expect(decodeURIComponent(url)).toContain(
      "http://localhost:3333/app/stripe/oauth",
    );
    expect(url).not.toContain("sk_test");

    await expect(
      completeStripeOAuth({
        businessId: beta.businessId,
        userId: beta.userId,
        state,
        code: "ac_stolen",
      }),
    ).rejects.toThrow(/rejected/);
    expect(
      (await forBusiness(db, beta.businessId).business.get())?.stripeAccountId,
    ).toBeNull();
    expect(await db.select().from(stripeOauthState)).toHaveLength(1);

    await expect(
      completeStripeOAuth({
        businessId: alpha.businessId,
        userId: "someone-else",
        state,
        code: "ac_wrong_owner",
      }),
    ).rejects.toThrow(/rejected/);

    await db
      .update(stripeOauthState)
      .set({ expiresAt: new Date(0) })
      .where(eq(stripeOauthState.state, state));
    await expect(
      completeStripeOAuth({
        businessId: alpha.businessId,
        userId: alpha.userId,
        state,
        code: "ac_expired",
      }),
    ).rejects.toThrow(/rejected/);
    expect(calls).not.toHaveBeenCalled();

    const fresh = new URL(
      await beginStripeOAuth(alpha.businessId, alpha.userId),
    ).searchParams.get("state");
    if (!fresh) throw new Error("state");
    await completeStripeOAuth({
      businessId: alpha.businessId,
      userId: alpha.userId,
      state: fresh,
      code: "ac_ok",
    });
    const linked = await forBusiness(db, alpha.businessId).business.get();
    expect(linked?.stripeAccountId).toBe("acct_oauth_alpha");
    expect(linked?.stripeConnectMethod).toBe("oauth");
    expect(linked?.stripeChargesEnabled).toBe(true);
    const stored = JSON.stringify({
      business: linked,
      audit: await db.select().from(auditLog),
      state: await db.select().from(stripeOauthState),
    });
    expect(stored).not.toContain("sk_test_secret_token");
    expect(stored).not.toContain("rt_test_secret_token");
    expect(stored).not.toContain("owner@example.com");

    const scope = forBusiness(db, alpha.businessId);
    const client = await scope.clients.create({
      name: "Ada",
      email: "ada-oauth@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const created = await scope.invoices.create(input(client.id));
    const sent = await scope.invoices.send(created.id, alpha.userId);
    if (!sent) throw new Error("send");
    const body = JSON.stringify({
      id: "evt_oauth_pay",
      type: "checkout.session.completed",
      account: "acct_oauth_alpha",
      created: 1_780_000_000,
      data: {
        object: {
          id: "cs_oauthpay",
          payment_status: "paid",
          amount_total: 3000,
          currency: "usd",
          payment_intent: "pi_oauthpay",
          metadata: { invoice_id: sent.invoice.id },
        },
      },
    });
    const seconds = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "whsec_test")
      .update(`${seconds}.${body}`)
      .digest("hex");
    expect(
      (
        await handleStripeWebhook(
          new Request("https://invoice.example/api/stripe/webhook", {
            method: "POST",
            headers: { "stripe-signature": `t=${seconds},v1=${signature}` },
            body,
          }),
        )
      ).status,
    ).toBe(200);
    const paid = await scope.invoices.get(sent.invoice.id);
    expect(paid?.status).toBe("paid");
    expect(paid?.paidCents).toBe(3000);

    await disconnectStripe(alpha.businessId, alpha.userId);
    expect(
      (await forBusiness(db, alpha.businessId).business.get())?.stripeAccountId,
    ).toBeNull();
    expect(
      calls.mock.calls.some((call) =>
        String(call[0]).includes("/oauth/deauthorize"),
      ),
    ).toBe(true);
  });
});
