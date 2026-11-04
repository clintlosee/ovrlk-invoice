import type { InvoiceDisplayStatus } from "./invoice";

export type ClientListClient = {
  id: string;
  name: string;
  email: string;
  taxExempt: boolean;
  note: string;
  archived: boolean;
};

export type ClientListInvoice = {
  clientId: string;
  displayStatus: InvoiceDisplayStatus;
  amountDueCents: number;
  totalCents: number;
  sentAt: string | null;
};

export type ClientListRow = ClientListClient & { outstandingCents: number };

export function toClientListInvoice(invoice: {
  clientId: string;
  displayStatus: InvoiceDisplayStatus;
  amountDueCents: number;
  totalCents: number;
  sentAt: Date | null;
}): ClientListInvoice {
  return {
    clientId: invoice.clientId,
    displayStatus: invoice.displayStatus,
    amountDueCents: invoice.amountDueCents,
    totalCents: invoice.totalCents,
    sentAt: invoice.sentAt ? invoice.sentAt.toISOString() : null,
  };
}

const RECENT_LIMIT = 3;

export function clientListView(
  clients: ClientListClient[],
  invoices: ClientListInvoice[],
): {
  overdueCents: number;
  outstandingCents: number;
  draftCents: number;
  recent: ClientListClient[];
  rows: ClientListRow[];
  archived: ClientListRow[];
} {
  const overdueCents = sum(
    invoices.filter((invoice) => invoice.displayStatus === "overdue"),
    (invoice) => invoice.amountDueCents,
  );
  const outstandingCents = sum(
    invoices.filter((invoice) => invoice.displayStatus !== "draft"),
    (invoice) => invoice.amountDueCents,
  );
  const draftCents = sum(
    invoices.filter((invoice) => invoice.displayStatus === "draft"),
    (invoice) => invoice.totalCents,
  );

  const outstandingByClient = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.displayStatus === "draft") continue;
    outstandingByClient.set(
      invoice.clientId,
      (outstandingByClient.get(invoice.clientId) ?? 0) + invoice.amountDueCents,
    );
  }

  const latestSent = new Map<string, string>();
  for (const invoice of invoices) {
    if (!countsAsSent(invoice)) continue;
    const current = latestSent.get(invoice.clientId);
    if (!current || invoice.sentAt > current) {
      latestSent.set(invoice.clientId, invoice.sentAt);
    }
  }

  const recent = clients
    .filter((client) => !client.archived && latestSent.has(client.id))
    .sort((a, b) => {
      const bySent = (latestSent.get(b.id) ?? "").localeCompare(
        latestSent.get(a.id) ?? "",
      );
      if (bySent !== 0) return bySent;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    })
    .slice(0, RECENT_LIMIT);

  const rows = clients
    .filter((client) => !client.archived)
    .map((client) => ({
      ...client,
      outstandingCents: outstandingByClient.get(client.id) ?? 0,
    }))
    .sort(byName);
  const archived = clients
    .filter((client) => client.archived)
    .map((client) => ({
      ...client,
      outstandingCents: outstandingByClient.get(client.id) ?? 0,
    }))
    .sort(byName);

  return {
    overdueCents,
    outstandingCents,
    draftCents,
    recent,
    rows,
    archived,
  };
}

export function filterClientRows<
  T extends { name: string; email: string; note: string },
>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.name, row.email, row.note].join("\n").toLowerCase().includes(needle),
  );
}

/** Two letters for a card: first word and last word. One word keeps its first letter. */
export function clientMark(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[0-9A-Za-z]/.test(word));
  const first = words[0];
  if (!first) return "";
  const last = words.at(-1);
  if (!last || words.length === 1) return first.slice(0, 1).toUpperCase();
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}

function countsAsSent(
  invoice: ClientListInvoice,
): invoice is ClientListInvoice & { sentAt: string } {
  if (!invoice.sentAt) return false;
  return invoice.displayStatus !== "draft" && invoice.displayStatus !== "void";
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function sum(
  invoices: ClientListInvoice[],
  pick: (invoice: ClientListInvoice) => number,
) {
  return invoices.reduce((total, invoice) => total + pick(invoice), 0);
}
