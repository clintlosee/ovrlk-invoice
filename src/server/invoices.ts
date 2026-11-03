import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../db/client";
import { appUrl } from "../lib/config";
import { sendInvoiceEmail } from "../lib/email";
import { amountDueCents, statusLabel } from "../lib/invoice";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import { formatCents, parseDollarsToCents } from "../lib/money";
import type { InvoiceInput, InvoiceView } from "./invoice-store";
import { signedInBusiness } from "./membership";
import { forBusiness } from "./tenancy";

const blank = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .transform((value) => (value.length === 0 ? null : value));

const lineFields = z.object({
  name: z.string().trim().min(1, "Each line needs a name.").max(200),
  description: z.string().trim().max(2000).default(""),
  quantity: z.string(),
  unitPrice: z.string(),
  taxRateIds: z.array(z.string().min(1)).default([]),
});

const invoiceFields = z.object({
  clientId: z.string().min(1, "Choose a Client."),
  issueDate: z.string(),
  dueDate: z.string(),
  reference: blank(100, "Reference"),
  notes: blank(4000, "Notes"),
  terms: blank(4000, "Terms"),
  lines: z.array(lineFields).max(100),
});

const idField = z.object({ id: z.string().min(1) });

export type InvoiceFormValues = z.input<typeof invoiceFields>;

type Failure = { ok: false; message: string };

function invalid(error: z.ZodError): Failure {
  return {
    ok: false,
    message: error.issues[0]?.message ?? "Check the form and try again.",
  };
}

function parseQuantity(value: string): number {
  if (!/^\d{1,7}$/.test(value.trim())) {
    throw new Error("Quantity must be a whole number");
  }
  const quantity = Number(value.trim());
  if (quantity < 1) throw new Error("Quantity must be a whole number");
  return quantity;
}

function parseInvoice(
  input: unknown,
): { ok: true; value: InvoiceInput } | Failure {
  const parsed = invoiceFields.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return {
      ok: true,
      value: {
        clientId: parsed.data.clientId,
        issueDate: parsed.data.issueDate,
        dueDate: parsed.data.dueDate,
        reference: parsed.data.reference,
        notes: parsed.data.notes,
        terms: parsed.data.terms,
        lines: parsed.data.lines.map((line) => ({
          name: line.name,
          description: line.description.length === 0 ? null : line.description,
          quantity: parseQuantity(line.quantity),
          unitPriceCents: parseDollarsToCents(line.unitPrice),
          taxRateIds: [...new Set(line.taxRateIds)],
        })),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Check the form and try again.",
    };
  }
}

function saveError(error: unknown): Failure {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("Client") ||
    message.includes("Tax Rate") ||
    message.includes("Quantity") ||
    message.includes("unit price") ||
    message.includes("cents") ||
    message.includes("date") ||
    message.includes("too long") ||
    message.includes("line") ||
    message.includes("Invoice") ||
    message.includes("void") ||
    message.includes("draft") ||
    message.includes("sent")
  ) {
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  throw error;
}

function present(view: InvoiceView) {
  return {
    id: view.id,
    number: view.number,
    numberLabel: view.numberLabel,
    status: view.status,
    displayStatus: view.displayStatus,
    statusLabel: statusLabel(view.displayStatus),
    clientId: view.clientId,
    voidReason: view.voidReason,
    sentAt: view.sentAt ? view.sentAt.toISOString() : null,
    firstViewedAt: view.firstViewedAt ? view.firstViewedAt.toISOString() : null,
    locked: view.locked,
    amountDueCents: view.amountDueCents,
    document: view.document,
    editorLines: view.editorLines?.map((line) => ({
      name: line.name,
      description: line.description ?? "",
      quantity: String(line.quantity),
      unitPrice: formatCents(line.unitPriceCents),
      taxRateIds: line.taxRateIds,
    })),
  };
}

async function scope() {
  const current = await signedInBusiness();
  if (!current) return null;
  return {
    current,
    db: forBusiness(getDb(), current.businessId),
  };
}

export const getInvoices = createServerFn({ method: "GET" }).handler(
  async () => {
    const scoped = await scope();
    if (!scoped) return null;
    const rows = await scoped.db.invoices.list();
    return rows.map((view) => ({
      id: view.id,
      numberLabel: view.numberLabel,
      statusLabel: statusLabel(view.displayStatus),
      displayStatus: view.displayStatus,
      clientName: view.document.client.name,
      totalCents: view.document.totalCents,
      amountDueCents: view.amountDueCents,
      dueDate: view.document.dueDate,
    }));
  },
);

export const getInvoice = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const scoped = await scope();
    if (!scoped) return null;
    const view = await scoped.db.invoices.get(data.id);
    return view ? present(view) : null;
  });

export const createInvoice = createServerFn({ method: "POST" })
  .validator((data: InvoiceFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = parseInvoice(data);
    if (!parsed.ok) return parsed;
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      const view = await scoped.db.invoices.create(parsed.value);
      return { ok: true as const, value: present(view) };
    } catch (error) {
      return saveError(error);
    }
  });

export const updateInvoice = createServerFn({ method: "POST" })
  .validator((data: InvoiceFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success) return invalid(id.error);
    const parsed = parseInvoice(data);
    if (!parsed.ok) return parsed;
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      const view = await scoped.db.invoices.update(id.data.id, parsed.value);
      if (!view) {
        return { ok: false as const, message: "That Invoice does not exist." };
      }
      return { ok: true as const, value: present(view) };
    } catch (error) {
      return saveError(error);
    }
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    const removed = await scoped.db.invoices.remove(data.id);
    if (!removed) {
      return {
        ok: false as const,
        message: "Only a draft Invoice can be deleted.",
      };
    }
    return { ok: true as const };
  });

async function emailInvoice(input: {
  to: string;
  replyTo: string;
  businessName: string;
  number: number;
  totalCents: number;
  dueDate: string;
  token: string;
  status: InvoiceView["status"];
  document: InvoiceView["document"];
  reminder: boolean;
}) {
  const pdf = await renderInvoicePdf(input.document, input.status);
  const url = `${appUrl()}/p/${input.token}`;
  await sendInvoiceEmail({
    to: input.to,
    replyTo: input.replyTo,
    businessName: input.businessName,
    number: input.number,
    totalCents: input.totalCents,
    dueDate: input.dueDate,
    url,
    pdf,
    reminder: input.reminder,
  });
  return url;
}

export const sendInvoice = createServerFn({ method: "POST" })
  .validator((data: InvoiceFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success) return invalid(id.error);
    const parsed = parseInvoice(data);
    if (!parsed.ok) return parsed;
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      const updated = await scoped.db.invoices.update(id.data.id, parsed.value);
      if (!updated) {
        return { ok: false as const, message: "That Invoice does not exist." };
      }
      const sent = await scoped.db.invoices.send(
        id.data.id,
        scoped.current.session.user.id,
      );
      if (!sent) {
        return { ok: false as const, message: "That Invoice does not exist." };
      }
      const url = `${appUrl()}/p/${sent.token}`;
      try {
        await emailInvoice({
          to: sent.invoice.document.client.email,
          replyTo: scoped.current.session.user.email,
          businessName: sent.invoice.document.business.name,
          number: sent.invoice.number,
          totalCents: sent.invoice.document.totalCents,
          dueDate: sent.invoice.document.dueDate,
          token: sent.token,
          status: sent.invoice.status,
          document: sent.invoice.document,
          reminder: false,
        });
      } catch {
        return {
          ok: true as const,
          emailed: false as const,
          message:
            "The Invoice is sent, but the email did not go out. Use Reminder to try again.",
          url,
          value: present(sent.invoice),
        };
      }
      return {
        ok: true as const,
        emailed: true as const,
        url,
        value: present(sent.invoice),
      };
    } catch (error) {
      return saveError(error);
    }
  });

export const remindInvoice = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    const view = await scoped.db.invoices.get(data.id);
    if (view?.status !== "sent") {
      return {
        ok: false as const,
        message: "Reminders go out for a sent, unpaid Invoice.",
      };
    }
    const link = await scoped.db.invoices.issueLink(data.id, false);
    if (!link) {
      return { ok: false as const, message: "That Invoice does not exist." };
    }
    try {
      const url = await emailInvoice({
        to: view.document.client.email,
        replyTo: scoped.current.session.user.email,
        businessName: view.document.business.name,
        number: view.number,
        totalCents: amountDueCents(view.status, view.document.totalCents),
        dueDate: view.document.dueDate,
        token: link.token,
        status: view.status,
        document: view.document,
        reminder: true,
      });
      return { ok: true as const, url };
    } catch (error) {
      return saveError(error);
    }
  });

export const voidInvoice = createServerFn({ method: "POST" })
  .validator((data: { id: string; reason: string }) => data)
  .handler(async ({ data }) => {
    const id = idField.safeParse({ id: data.id });
    if (!id.success || typeof data.reason !== "string") {
      return { ok: false as const, message: "A void reason is required." };
    }
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    try {
      const view = await scoped.db.invoices.voidInvoice(
        id.data.id,
        data.reason,
        scoped.current.session.user.id,
      );
      if (!view) {
        return { ok: false as const, message: "That Invoice does not exist." };
      }
      return { ok: true as const, value: present(view) };
    } catch (error) {
      return saveError(error);
    }
  });

export const regenerateInvoiceLink = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    const link = await scoped.db.invoices.issueLink(data.id, true);
    if (!link) {
      return {
        ok: false as const,
        message: "A draft Invoice does not have a link.",
      };
    }
    return { ok: true as const, url: `${appUrl()}/p/${link.token}` };
  });

export const revokeInvoiceLinks = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const scoped = await scope();
    if (!scoped) return { ok: false as const, message: "Sign in again." };
    const revoked = await scoped.db.invoices.revokeLinks(data.id);
    if (!revoked) {
      return { ok: false as const, message: "That Invoice does not exist." };
    }
    return { ok: true as const };
  });
