import type { InvoiceStatus } from "./invoice";

const EDITABLE: InvoiceStatus[] = ["draft", "sent", "partial"];
const PAYMENT_ELIGIBLE: InvoiceStatus[] = ["sent", "partial"];

export function bulkActionState(
  invoices: { id: string; status: InvoiceStatus }[],
): {
  edit: boolean;
  addPayment: boolean;
} {
  const edit =
    invoices.length === 1 && EDITABLE.includes(invoices[0]!.status);

  const addPayment =
    invoices.length > 0 &&
    invoices.every((inv) => PAYMENT_ELIGIBLE.includes(inv.status));

  return { edit, addPayment };
}
