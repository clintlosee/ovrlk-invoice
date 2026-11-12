import { appUrl } from "../lib/config";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import { createInvoiceToken } from "./invoice-token";
import type { forBusiness } from "./tenancy";

const EMAIL_FAILED =
  "The email did not go out. The Invoice is still a draft." as const;

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
