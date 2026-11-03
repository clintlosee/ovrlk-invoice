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
