import { type Cents, cents } from "./money";
import { lineTax } from "./tax";

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceDisplayStatus = InvoiceStatus | "overdue";

export const INVOICE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_ACCENT = "#1c1917";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_QUANTITY = 1_000_000;

export type InvoiceSnapshot = {
  number: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  client: {
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    taxExempt: boolean;
  };
  business: {
    name: string;
    address: string | null;
    taxId: string | null;
    footer: string | null;
    accentColor: string;
  };
  lines: {
    name: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
    taxes: { name: string; rateBps: number; taxCents: number }[];
    taxCents: number;
  }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type PricedLine = {
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: Cents;
  amountCents: Cents;
  taxes: { id: string; name: string; rateBps: number; taxCents: Cents }[];
  taxCents: Cents;
};

export function priceInvoice(input: {
  lines: {
    name: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    taxes: { id: string; name: string; rateBps: number }[];
  }[];
  taxExempt: boolean;
}): {
  lines: PricedLine[];
  subtotalCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
} {
  const lines = input.lines.map((line) => {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    ) {
      throw new Error("Quantity must be a whole number");
    }
    const unitPriceCents = cents(line.unitPriceCents);
    if (unitPriceCents < 0) throw new Error("Enter a unit price like 12.50");
    const amount = line.quantity * unitPriceCents;
    if (!Number.isSafeInteger(amount)) {
      throw new Error("Line amount is too large");
    }
    const tax = lineTax({
      amountCents: amount,
      rates: line.taxes,
      taxExempt: input.taxExempt,
    });
    return {
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents,
      amountCents: cents(amount),
      taxes: line.taxes.map((rate, index) => ({
        id: rate.id,
        name: rate.name,
        rateBps: rate.rateBps,
        taxCents: tax.rates[index]?.taxCents ?? cents(0),
      })),
      taxCents: tax.totalCents,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const taxTotal = lines.reduce((sum, line) => sum + line.taxCents, 0);
  const total = subtotal + taxTotal;
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total)) {
    throw new Error("Invoice total is too large");
  }
  return {
    lines,
    subtotalCents: cents(subtotal),
    taxCents: cents(taxTotal),
    totalCents: cents(total),
  };
}

export function assertIsoDate(value: string): string {
  const match = DATE.exec(value);
  if (!match) throw new Error("Enter a date as YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error("Enter a date as YYYY-MM-DD");
  }
  return value;
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Time zone must be a valid IANA name");
  }
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = assertIsoDate(isoDate).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function displayStatus(
  status: InvoiceStatus,
  dueDate: string,
  today: string,
): InvoiceDisplayStatus {
  if (status === "sent" && dueDate < today) return "overdue";
  return status;
}

export function statusLabel(status: InvoiceDisplayStatus): string {
  if (status === "draft") return "Draft";
  if (status === "sent") return "Sent";
  if (status === "paid") return "Paid";
  if (status === "void") return "Void";
  return "Overdue";
}

/**
 * Balance until PR 4 records Payments against the Invoice.
 * Paid and Void are nothing due. Do not add a pay button before that PR.
 */
export function amountDueCents(
  status: InvoiceStatus,
  totalCents: number,
): number {
  if (status === "paid" || status === "void") return 0;
  return totalCents;
}

export function formatInvoiceNumber(number: number): string {
  return String(number).padStart(7, "0");
}

export function accentOrDefault(value: string | null | undefined): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return DEFAULT_ACCENT;
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (
    value === "draft" ||
    value === "sent" ||
    value === "paid" ||
    value === "void"
  );
}
