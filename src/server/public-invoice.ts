import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { invoiceLink } from "../db/schema";
import {
  canAcceptCardPayment,
  type InvoiceDisplayStatus,
  type InvoiceSnapshot,
  type InvoiceStatus,
} from "../lib/invoice";
import { stripeConfigured } from "../lib/stripe";
import { hashInvoiceToken, isInvoiceToken } from "./invoice-token";
import { signedInBusiness } from "./membership";
import {
  clientIp,
  consumePublicRateLimit,
  publicRateLimitCounted,
} from "./rate-limit";
import { forBusiness } from "./tenancy";

export type PublicInvoice =
  | {
      status: 200;
      document: InvoiceSnapshot;
      statusValue: InvoiceStatus;
      displayStatus: InvoiceDisplayStatus;
      voidReason: string | null;
      amountDueCents: number;
      paidCents: number;
      canPay: boolean;
      payments: {
        id: string;
        paidOn: string;
        method: string;
        amountCents: number;
      }[];
    }
  | { status: 404 }
  | { status: 429; retryAfterMs: number };

/**
 * Invoice Link entry point. Counts against the public limit unless the
 * /p/ middleware already counted this request.
 */
export async function openPublicInvoice(
  request: Request,
  token: string,
  options: { recordView: boolean },
): Promise<PublicInvoice> {
  if (!publicRateLimitCounted()) {
    const limit = await consumePublicRateLimit(clientIp(request));
    if (!limit.allowed) {
      return { status: 429, retryAfterMs: limit.retryAfterMs };
    }
  }
  if (!isInvoiceToken(token)) return { status: 404 };
  const rows = await getDb()
    .select()
    .from(invoiceLink)
    .where(eq(invoiceLink.tokenHash, hashInvoiceToken(token)))
    .limit(1);
  const link = rows[0];
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) {
    return { status: 404 };
  }
  const scope = forBusiness(getDb(), link.businessId);
  const [view, row] = await Promise.all([
    scope.invoices.get(link.invoiceId),
    scope.business.get(),
  ]);
  if (!view?.locked || !row) return { status: 404 };
  if (options.recordView) await scope.invoices.markViewed(view.id);
  const current = options.recordView
    ? ((await scope.invoices.get(link.invoiceId)) ?? view)
    : view;
  return {
    status: 200,
    document: current.document,
    statusValue: current.status,
    displayStatus: current.displayStatus,
    voidReason: current.voidReason,
    amountDueCents: current.amountDueCents,
    paidCents: current.paidCents,
    canPay: canAcceptCardPayment({
      configured: stripeConfigured(),
      chargesEnabled: row.stripeChargesEnabled,
      status: current.status,
      amountDueCents: current.amountDueCents,
    }),
    payments: current.payments.map((item) => ({
      id: item.id,
      paidOn: item.paidOn,
      method: item.method,
      amountCents: item.amountCents,
    })),
  };
}

export async function ownedInvoiceForPdf(invoiceId: string) {
  const current = await signedInBusiness();
  if (!current) return { status: 401 as const };
  const view = await forBusiness(getDb(), current.businessId).invoices.get(
    invoiceId,
  );
  if (!view?.locked) return { status: 404 as const };
  return { status: 200 as const, view };
}
