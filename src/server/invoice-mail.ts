import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { user } from "../db/schema";
import { appUrl } from "../lib/config";
import {
  deliverEmail,
  sendInvoiceEmail,
  sendInvoiceListEmail,
} from "../lib/email";
import { formatInvoiceNumber } from "../lib/invoice";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import type { InvoiceView } from "./invoice-store";
import { createInvoiceToken } from "./invoice-token";
import type { forBusiness } from "./tenancy";

const EMAIL_FAILED =
  "The email did not go out. The Invoice is still a draft." as const;

export type InvoiceEmailSkip = {
  invoiceId: string;
  clientName: string;
  reason: "void" | "no-lines" | "no-email" | "email-failed";
};

export async function mailDraft(
  scope: ReturnType<typeof forBusiness>,
  invoiceId: string,
  actorUserId: string,
  deliver: (message: { url: string; pdf: Uint8Array }) => Promise<void>,
): Promise<
  | { ok: true; emailed: true; url: string }
  | { ok: true; emailed: false; message: typeof EMAIL_FAILED }
> {
  const view = await scope.invoices.get(invoiceId);
  if (!view) throw new Error("Could not send the Invoice");
  if (view.status !== "draft") throw new Error("Only a draft can be sent");
  if (view.document.lines.length === 0) {
    throw new Error("Add a line before sending");
  }
  const prepared = createInvoiceToken();
  const url = `${appUrl()}/p/${prepared.token}`;
  const pdf = await renderInvoicePdf(view.document, "sent");
  try {
    await deliver({ url, pdf });
  } catch {
    return { ok: true, emailed: false, message: EMAIL_FAILED };
  }
  await scope.invoices.send(invoiceId, actorUserId, prepared);
  return { ok: true, emailed: true, url };
}

async function actorEmail(actorUserId: string) {
  const rows = await getDb()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, actorUserId))
    .limit(1);
  return rows[0]?.email ?? "";
}

export async function sendInvoicesByEmail(
  scope: ReturnType<typeof forBusiness>,
  actorUserId: string,
  invoiceIds: string[],
  options: { attachPdf: boolean },
  deliver: typeof deliverEmail = deliverEmail,
): Promise<{ sentIds: string[]; skipped: InvoiceEmailSkip[] }> {
  const sentIds: string[] = [];
  const skipped: InvoiceEmailSkip[] = [];
  const replyTo = await actorEmail(actorUserId);
  const remaining: InvoiceView[] = [];
  const ids = [...new Set(invoiceIds)];

  for (const id of ids) {
    const view = await scope.invoices.get(id);
    if (!view) continue;
    const clientName = view.document.client.name;
    if (view.status === "void") {
      skipped.push({ invoiceId: view.id, clientName, reason: "void" });
      continue;
    }
    if (view.status === "draft" && view.document.lines.length === 0) {
      skipped.push({ invoiceId: view.id, clientName, reason: "no-lines" });
      continue;
    }
    remaining.push(view);
  }

  const groups = new Map<string, InvoiceView[]>();
  for (const view of remaining) {
    const list = groups.get(view.clientId) ?? [];
    list.push(view);
    groups.set(view.clientId, list);
  }

  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const to = first.document.client.email;
    if (!to.trim()) {
      for (const view of group) {
        skipped.push({
          invoiceId: view.id,
          clientName: view.document.client.name,
          reason: "no-email",
        });
      }
      continue;
    }

    const businessName = first.document.business.name;
    try {
      const prepared: {
        view: InvoiceView;
        url: string;
        token?: { token: string; tokenHash: string };
        pdf?: Uint8Array;
      }[] = [];

      for (const view of group) {
        const pdf = options.attachPdf
          ? await renderInvoicePdf(
              view.document,
              view.status === "draft" ? "sent" : view.status,
            )
          : undefined;
        if (view.status === "draft") {
          const token = createInvoiceToken();
          prepared.push({
            view,
            url: `${appUrl()}/p/${token.token}`,
            token,
            pdf,
          });
        } else {
          const link = await scope.invoices.issueLink(view.id, false);
          if (!link) throw new Error("Could not send the Invoice");
          prepared.push({ view, url: `${appUrl()}/p/${link.token}`, pdf });
        }
      }

      const only = prepared.length === 1 ? prepared[0] : undefined;
      if (only) {
        await sendInvoiceEmail({
          to,
          replyTo,
          businessName,
          number: only.view.number,
          totalCents: only.view.amountDueCents,
          dueDate: only.view.document.dueDate,
          url: only.url,
          pdf: only.pdf,
          reminder: false,
          deliver,
        });
      } else {
        await sendInvoiceListEmail({
          to,
          replyTo,
          businessName,
          invoices: prepared.map((item) => ({
            number: item.view.number,
            totalCents: item.view.amountDueCents,
            dueDate: item.view.document.dueDate,
            url: item.url,
          })),
          pdfs: prepared.flatMap((item) =>
            item.pdf
              ? [
                  {
                    filename: `invoice-${formatInvoiceNumber(item.view.number)}.pdf`,
                    content: item.pdf,
                  },
                ]
              : [],
          ),
          deliver,
        });
      }

      const drafts = prepared.filter(
        (
          item,
        ): item is typeof item & {
          token: { token: string; tokenHash: string };
        } => item.view.status === "draft" && item.token !== undefined,
      );
      if (drafts.length === 1 && drafts[0]) {
        await scope.invoices.send(
          drafts[0].view.id,
          actorUserId,
          drafts[0].token,
        );
      } else if (drafts.length > 1) {
        await scope.invoices.sendAll(
          actorUserId,
          drafts.map((item) => ({
            id: item.view.id,
            prepared: item.token,
          })),
        );
      }
      for (const item of prepared) sentIds.push(item.view.id);
    } catch {
      for (const view of group) {
        skipped.push({
          invoiceId: view.id,
          clientName: view.document.client.name,
          reason: "email-failed",
        });
      }
    }
  }

  return { sentIds, skipped };
}
