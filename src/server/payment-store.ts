import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "../db/client";
import {
  auditLog,
  invoice,
  member,
  OWNER_ROLE,
  payment,
  user,
} from "../db/schema";
import { sendReceiptEmail } from "../lib/email";
import {
  assertIsoDate,
  type InvoiceSnapshot,
  isInvoiceStatus,
  isManualPaymentMethod,
  type ManualPaymentMethod,
} from "../lib/invoice";
import { cents } from "../lib/money";
import type { StripeFee } from "../lib/stripe";

export type PaymentView = {
  id: string;
  amountCents: number;
  paidOn: string;
  method: string;
  note: string | null;
  feeCents: number | null;
  manual: boolean;
};

export type ManualPaymentInput = {
  invoiceId: string;
  amountCents: number;
  paidOn: string;
  method: ManualPaymentMethod;
  note: string | null;
  actorUserId: string;
};

export type StripePaymentInput = {
  invoiceId: string;
  amountCents: number;
  paidOn: string;
  checkoutSessionId: string | null;
  paymentIntentId: string;
  fee: StripeFee;
};

type StripeRecord = "recorded" | "updated" | "overpay" | "ignored";

const NOTE_MAX = 500;

export async function paymentsByInvoice(
  db: AppDb,
  businessId: string,
  invoiceIds: string[],
): Promise<Map<string, PaymentView[]>> {
  const grouped = new Map<string, PaymentView[]>();
  if (invoiceIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.businessId, businessId),
        inArray(payment.invoiceId, invoiceIds),
      ),
    )
    .orderBy(asc(payment.paidOn), asc(payment.createdAt));
  for (const row of rows) {
    const list = grouped.get(row.invoiceId) ?? [];
    list.push(toView(row));
    grouped.set(row.invoiceId, list);
  }
  return grouped;
}

export function paymentMethods(db: AppDb, businessId: string) {
  return {
    async recordManual(input: ManualPaymentInput) {
      const saved = await mutate(db, async (tx) => {
        const target = await payableInvoice(tx, businessId, input.invoiceId);
        const amount = positiveCents(input.amountCents);
        const paidOn = assertIsoDate(input.paidOn);
        if (!isManualPaymentMethod(input.method)) {
          throw new Error("Choose a payment method");
        }
        const note = boundedNote(input.note);
        const already = await sumPayments(tx, businessId, target.id);
        assertRoom(already, amount, target.totalCents);
        const now = new Date();
        const id = crypto.randomUUID();
        await tx.insert(payment).values({
          id,
          businessId,
          invoiceId: target.id,
          amountCents: amount,
          paidOn,
          method: input.method,
          note,
          stripeCheckoutSessionId: null,
          stripePaymentIntentId: null,
          stripeChargeId: null,
          stripeBalanceTransactionId: null,
          feeCents: null,
          createdAt: now,
          updatedAt: now,
        });
        const paid = already + amount;
        await writeStatus(tx, businessId, target, paid, now);
        await writeAudit(tx, {
          businessId,
          actorUserId: input.actorUserId,
          action: "payment.recorded",
          invoiceId: target.id,
          amountCents: amount,
          metadata: { method: input.method, number: target.number },
          at: now,
        });
        return { id, paid, target, paidOn, method: input.method, amount };
      });
      await receipt(db, businessId, saved);
      return saved.id;
    },
    async updateManual(
      paymentId: string,
      input: Omit<ManualPaymentInput, "invoiceId">,
    ) {
      await mutate(db, async (tx) => {
        const current = await onePayment(tx, businessId, paymentId);
        if (!current) throw new Error("That Payment does not exist");
        if (current.method === "stripe") {
          throw new Error("A card Payment cannot be changed");
        }
        const target = await payableInvoice(tx, businessId, current.invoiceId);
        const amount = positiveCents(input.amountCents);
        const paidOn = assertIsoDate(input.paidOn);
        if (!isManualPaymentMethod(input.method)) {
          throw new Error("Choose a payment method");
        }
        const note = boundedNote(input.note);
        const others = await sumPayments(tx, businessId, target.id, current.id);
        assertRoom(others, amount, target.totalCents);
        const now = new Date();
        const updated = await tx
          .update(payment)
          .set({
            amountCents: amount,
            paidOn,
            method: input.method,
            note,
            updatedAt: now,
          })
          .where(
            and(
              eq(payment.id, current.id),
              eq(payment.businessId, businessId),
              inArray(payment.method, ["check", "cash", "venmo", "other"]),
            ),
          )
          .returning({ id: payment.id });
        if (!updated[0]) throw new Error("A card Payment cannot be changed");
        await writeStatus(tx, businessId, target, others + amount, now);
        await writeAudit(tx, {
          businessId,
          actorUserId: input.actorUserId,
          action: "payment.updated",
          invoiceId: target.id,
          amountCents: amount,
          metadata: { method: input.method, number: target.number },
          at: now,
        });
        return current.id;
      });
    },
    async removeManual(paymentId: string, actorUserId: string) {
      await mutate(db, async (tx) => {
        const current = await onePayment(tx, businessId, paymentId);
        if (!current) throw new Error("That Payment does not exist");
        if (current.method === "stripe") {
          throw new Error("A card Payment cannot be changed");
        }
        const target = await payableInvoice(tx, businessId, current.invoiceId);
        const now = new Date();
        const removed = await tx
          .delete(payment)
          .where(
            and(
              eq(payment.id, current.id),
              eq(payment.businessId, businessId),
              inArray(payment.method, ["check", "cash", "venmo", "other"]),
            ),
          )
          .returning({ id: payment.id });
        if (!removed[0]) throw new Error("A card Payment cannot be changed");
        const paid = await sumPayments(tx, businessId, target.id);
        await writeStatus(tx, businessId, target, paid, now);
        await writeAudit(tx, {
          businessId,
          actorUserId,
          action: "payment.deleted",
          invoiceId: target.id,
          amountCents: current.amountCents,
          metadata: { method: current.method, number: target.number },
          at: now,
        });
        return current.id;
      });
    },
    async recordStripe(input: StripePaymentInput): Promise<StripeRecord> {
      const outcome = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(invoice)
          .where(
            and(
              eq(invoice.id, input.invoiceId),
              eq(invoice.businessId, businessId),
            ),
          )
          .limit(1);
        const target = rows[0];
        if (!target || !isInvoiceStatus(target.status))
          return "ignored" as const;
        if (
          target.status === "draft" ||
          target.status === "void" ||
          !target.snapshot
        ) {
          return "ignored" as const;
        }
        const amount = positiveCents(input.amountCents);
        const paidOn = assertIsoDate(input.paidOn);
        const existing = await tx
          .select()
          .from(payment)
          .where(eq(payment.stripePaymentIntentId, input.paymentIntentId))
          .limit(1);
        const now = new Date();
        const prior = existing[0];
        if (prior) {
          if (prior.invoiceId !== target.id) return "ignored" as const;
          await tx
            .update(payment)
            .set({
              stripeCheckoutSessionId:
                prior.stripeCheckoutSessionId ?? input.checkoutSessionId,
              stripeChargeId: prior.stripeChargeId ?? input.fee.chargeId,
              stripeBalanceTransactionId:
                prior.stripeBalanceTransactionId ??
                input.fee.balanceTransactionId,
              feeCents: prior.feeCents ?? input.fee.feeCents,
              updatedAt: now,
            })
            .where(
              and(eq(payment.id, prior.id), eq(payment.businessId, businessId)),
            );
          return "updated" as const;
        }
        const already = await sumPayments(tx, businessId, target.id);
        if (already + amount > target.totalCents) {
          await writeAudit(tx, {
            businessId,
            actorUserId: null,
            action: "payment.rejected",
            invoiceId: target.id,
            amountCents: amount,
            metadata: {
              method: "stripe",
              number: target.number,
              paymentIntentId: input.paymentIntentId,
            },
            at: now,
          });
          return "overpay" as const;
        }
        await tx.insert(payment).values({
          id: crypto.randomUUID(),
          businessId,
          invoiceId: target.id,
          amountCents: amount,
          paidOn,
          method: "stripe",
          note: null,
          stripeCheckoutSessionId: input.checkoutSessionId,
          stripePaymentIntentId: input.paymentIntentId,
          stripeChargeId: input.fee.chargeId,
          stripeBalanceTransactionId: input.fee.balanceTransactionId,
          feeCents: input.fee.feeCents,
          createdAt: now,
          updatedAt: now,
        });
        await writeStatus(tx, businessId, target, already + amount, now);
        await writeAudit(tx, {
          businessId,
          actorUserId: null,
          action: "payment.recorded",
          invoiceId: target.id,
          amountCents: amount,
          metadata: {
            method: "stripe",
            number: target.number,
            paymentIntentId: input.paymentIntentId,
            feeCents: input.fee.feeCents,
          },
          at: now,
        });
        return {
          kind: "recorded" as const,
          paid: already + amount,
          target,
          paidOn,
          amount,
        };
      });
      if (typeof outcome !== "string") {
        await receipt(db, businessId, {
          target: outcome.target,
          paid: outcome.paid,
          paidOn: outcome.paidOn,
          method: "stripe",
          amount: outcome.amount,
        });
        return "recorded";
      }
      return outcome;
    },
  };
}

function toView(row: typeof payment.$inferSelect): PaymentView {
  return {
    id: row.id,
    amountCents: row.amountCents,
    paidOn: row.paidOn,
    method: row.method,
    note: row.note,
    feeCents: row.feeCents,
    manual: row.method !== "stripe",
  };
}

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

type Payable = {
  id: string;
  number: number;
  totalCents: number;
  snapshot: string | null;
};

function mutate<T>(db: AppDb, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(run);
}

async function payableInvoice(
  tx: Tx,
  businessId: string,
  invoiceId: string,
): Promise<Payable> {
  const rows = await tx
    .select({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      totalCents: invoice.totalCents,
      snapshot: invoice.snapshot,
    })
    .from(invoice)
    .where(and(eq(invoice.id, invoiceId), eq(invoice.businessId, businessId)))
    .limit(1);
  const row = rows[0];
  if (!row || !isInvoiceStatus(row.status)) {
    throw new Error("That Invoice does not exist");
  }
  if (row.status === "draft" || row.status === "void" || !row.snapshot) {
    throw new Error("A Payment can be recorded on a sent Invoice");
  }
  return row;
}

async function onePayment(tx: Tx, businessId: string, paymentId: string) {
  const rows = await tx
    .select()
    .from(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

async function sumPayments(
  tx: Tx,
  businessId: string,
  invoiceId: string,
  exceptId?: string,
) {
  const rows = await tx
    .select({
      total: sql<number>`coalesce(sum(${payment.amountCents}), 0)`,
    })
    .from(payment)
    .where(
      and(
        eq(payment.businessId, businessId),
        eq(payment.invoiceId, invoiceId),
        exceptId ? sql`${payment.id} != ${exceptId}` : undefined,
      ),
    );
  const total = Number(rows[0]?.total ?? 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Payment total is not valid");
  }
  return total;
}

function positiveCents(value: number) {
  const amount = cents(value);
  if (amount <= 0) throw new Error("Enter an amount");
  return amount;
}

function assertRoom(already: number, amount: number, total: number) {
  if (already + amount > total) {
    throw new Error("That amount is more than the balance");
  }
}

function boundedNote(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTE_MAX) throw new Error("Note is too long");
  return trimmed;
}

async function writeStatus(
  tx: Tx,
  businessId: string,
  target: Payable,
  paid: number,
  now: Date,
) {
  const status =
    paid <= 0 ? "sent" : paid < target.totalCents ? "partial" : "paid";
  const updated = await tx
    .update(invoice)
    .set({ status, updatedAt: now })
    .where(
      and(
        eq(invoice.id, target.id),
        eq(invoice.businessId, businessId),
        inArray(invoice.status, ["sent", "partial", "paid"]),
      ),
    )
    .returning({ id: invoice.id });
  if (!updated[0])
    throw new Error("A Payment can be recorded on a sent Invoice");
}

async function writeAudit(
  tx: Tx,
  input: {
    businessId: string;
    actorUserId: string | null;
    action: string;
    invoiceId: string;
    amountCents: number;
    metadata: Record<string, unknown>;
    at: Date;
  },
) {
  await tx.insert(auditLog).values({
    id: crypto.randomUUID(),
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "payment",
    entityId: input.invoiceId,
    amountCents: input.amountCents,
    metadata: JSON.stringify(input.metadata),
    ip: null,
    userAgent: null,
    createdAt: input.at,
  });
}

async function receipt(
  db: AppDb,
  businessId: string,
  saved: {
    target: Payable;
    paid: number;
    paidOn: string;
    method: string;
    amount: number;
  },
) {
  if (!saved.target.snapshot) return;
  try {
    const document = JSON.parse(saved.target.snapshot) as InvoiceSnapshot;
    const owners = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.businessId, businessId), eq(member.role, OWNER_ROLE)),
      )
      .limit(1);
    const balance = Math.max(0, saved.target.totalCents - saved.paid);
    await sendReceiptEmail({
      to: document.client.email,
      replyTo: owners[0]?.email,
      businessName: document.business.name,
      number: saved.target.number,
      amountCents: saved.amount,
      paidOn: saved.paidOn,
      method: saved.method,
      balanceCents: balance,
    });
  } catch {
    // The Payment is already stored. A missed receipt can be sent again later.
  }
}
