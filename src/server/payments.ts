import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../db/client";
import { isManualPaymentMethod } from "../lib/invoice";
import { parseDollarsToCents } from "../lib/money";
import { signedInBusiness } from "./membership";
import { forBusiness } from "./tenancy";

const manualFields = z.object({
  invoiceId: z.string().min(1),
  amount: z.string(),
  paidOn: z.string(),
  method: z.string(),
  note: z.string().max(500).default(""),
});

const paymentId = z.object({
  invoiceId: z.string().min(1),
  paymentId: z.string().min(1),
});

function failure(error: unknown): { ok: false; message: string } {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("Payment") ||
    message.includes("Invoice") ||
    message.includes("amount") ||
    message.includes("balance") ||
    message.includes("date") ||
    message.includes("Note") ||
    message.includes("method") ||
    message.includes("cents")
  ) {
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  throw error;
}

function parseManual(data: unknown) {
  const parsed = manualFields.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false as const,
      message:
        parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  if (!isManualPaymentMethod(parsed.data.method)) {
    return { ok: false as const, message: "Choose a payment method." };
  }
  try {
    return {
      ok: true as const,
      value: {
        invoiceId: parsed.data.invoiceId,
        amountCents: parseDollarsToCents(parsed.data.amount),
        paidOn: parsed.data.paidOn,
        method: parsed.data.method,
        note: parsed.data.note.trim() ? parsed.data.note.trim() : null,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

async function scope() {
  const current = await signedInBusiness();
  if (!current) return null;
  return {
    actorUserId: current.session.user.id,
    db: forBusiness(getDb(), current.businessId),
  };
}

const batchFields = z.object({
  notify: z.boolean().optional().default(false),
  rows: z.array(
    z.object({
      invoiceId: z.string().min(1),
      amountCents: z.number(),
      paidOn: z.string(),
      method: z.string(),
      note: z.string().max(500).nullable(),
    }),
  ),
});

export const getPaymentInvoices = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ ids: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const scoped = await scope();
    if (!scoped) return null;
    const biz = await scoped.db.business.get();
    if (!biz) return null;
    const ids = [
      ...new Set(
        data.ids
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    const listed = await scoped.db.invoices.list();
    const byId = new Map(listed.map((view) => [view.id, view]));
    const invoices = [];
    for (const id of ids) {
      const view = byId.get(id);
      if (!view) continue;
      invoices.push({
        id: view.id,
        clientName: view.document.client.name,
        numberLabel: view.numberLabel,
        amountDueCents: view.amountDueCents,
        status: view.status,
      });
    }
    return { timeZone: biz.timeZone, invoices };
  });

export const recordInvoicePayments = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const parsed = batchFields.safeParse(data);
    if (!parsed.success) {
      return {
        ok: false as const,
        message:
          parsed.error.issues[0]?.message ?? "Check the form and try again.",
      };
    }
    const rows = [];
    for (const row of parsed.data.rows) {
      if (!isManualPaymentMethod(row.method)) {
        return { ok: false as const, message: "Choose a payment method." };
      }
      rows.push({
        invoiceId: row.invoiceId,
        amountCents: row.amountCents,
        paidOn: row.paidOn,
        method: row.method,
        note: row.note,
      });
    }
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      const result = await scoped.db.payments.recordManualBatch({
        actorUserId: scoped.actorUserId,
        notify: parsed.data.notify,
        rows,
      });
      return { ok: true as const, ...result };
    } catch (error) {
      return failure(error);
    }
  });

export const recordManualPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const parsed = parseManual(data);
    if (!parsed.ok) return parsed;
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      await scoped.db.payments.recordManual({
        ...parsed.value,
        actorUserId: scoped.actorUserId,
      });
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

export const updateManualPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const id = paymentId.safeParse(data);
    if (!id.success)
      return { ok: false as const, message: "That Payment does not exist." };
    const parsed = parseManual(data);
    if (!parsed.ok) return parsed;
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      await scoped.db.payments.updateManual(id.data.paymentId, {
        amountCents: parsed.value.amountCents,
        paidOn: parsed.value.paidOn,
        method: parsed.value.method,
        note: parsed.value.note,
        actorUserId: scoped.actorUserId,
      });
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

export const deleteManualPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const id = paymentId.safeParse(data);
    if (!id.success)
      return { ok: false as const, message: "That Payment does not exist." };
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      await scoped.db.payments.removeManual(
        id.data.paymentId,
        scoped.actorUserId,
      );
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });
