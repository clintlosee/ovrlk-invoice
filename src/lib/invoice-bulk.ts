import type { InvoiceStatus, ManualPaymentMethod } from "./invoice";

const EDITABLE: InvoiceStatus[] = ["draft", "sent", "partial"];
const PAYMENT_ELIGIBLE: InvoiceStatus[] = ["sent", "partial"];

export type PaymentFormInvoice = {
  id: string;
  clientName: string;
  numberLabel: string;
  amountDueCents: number;
  status: InvoiceStatus;
};

export type PaymentFormRow = {
  invoiceId: string;
  numberLabel: string;
  paidOn: string;
  note: string;
  method: ManualPaymentMethod;
  amountCents: number;
};

export type PaymentFormGroup = {
  clientName: string;
  rows: PaymentFormRow[];
};

export function bulkActionState(
  invoices: { id: string; status: InvoiceStatus }[],
): {
  edit: boolean;
  addPayment: boolean;
} {
  const edit = invoices.length === 1 && EDITABLE.includes(invoices[0]!.status);

  const addPayment =
    invoices.length > 0 &&
    invoices.every((inv) => PAYMENT_ELIGIBLE.includes(inv.status));

  return { edit, addPayment };
}

export function paymentFormRows(
  invoices: PaymentFormInvoice[],
  paidOn: string,
): {
  rejected: { id: string; clientName: string }[];
  groups: PaymentFormGroup[];
} {
  const rejected: { id: string; clientName: string }[] = [];
  const groups: PaymentFormGroup[] = [];
  const indexByClient = new Map<string, number>();
  for (const invoice of invoices) {
    if (!PAYMENT_ELIGIBLE.includes(invoice.status)) {
      rejected.push({ id: invoice.id, clientName: invoice.clientName });
      continue;
    }
    const row: PaymentFormRow = {
      invoiceId: invoice.id,
      numberLabel: invoice.numberLabel,
      paidOn,
      note: "",
      method: "check",
      amountCents: invoice.amountDueCents,
    };
    const existing = indexByClient.get(invoice.clientName);
    if (existing === undefined) {
      indexByClient.set(invoice.clientName, groups.length);
      groups.push({ clientName: invoice.clientName, rows: [row] });
    } else {
      const group = groups[existing];
      if (group) group.rows.push(row);
    }
  }
  return { rejected, groups };
}

export function applyToAll(
  rows: PaymentFormRow[],
  fields: { paidOn: string; note: string; method: ManualPaymentMethod },
): PaymentFormRow[] {
  return rows.map((row) => ({
    ...row,
    paidOn: fields.paidOn,
    note: fields.note,
    method: fields.method,
  }));
}
