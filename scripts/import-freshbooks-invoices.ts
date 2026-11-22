import { existsSync, readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import {
  business,
  client,
  invoice,
  invoiceCounter,
  invoiceLine,
  invoiceLineTax,
  item,
  payment,
  taxRate,
} from "../src/db/schema";
import { accentOrDefault, priceInvoice } from "../src/lib/invoice";
import { parseDollarsToCents } from "../src/lib/money";

if (existsSync(".env")) process.loadEnvFile(".env");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: tsx scripts/import-freshbooks-invoices.ts <invoices.csv>");
  process.exit(1);
}

type CsvRow = Record<string, string>;

type TaxChoice = { name: string; rateBps: number };

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const grouped = groupInvoices(rows);
const db = getDb();
await db.run(sql`PRAGMA foreign_keys = ON`);

const businesses = await db.select().from(business);
const biz = businesses[0];
if (!biz || businesses.length !== 1) {
  throw new Error("Import expects exactly one local Business");
}
if (biz.currency !== "USD") {
  throw new Error("Import expects a USD Business");
}

const now = new Date();
const existingClients = await db
  .select()
  .from(client)
  .where(eq(client.businessId, biz.id));
const clientByName = new Map(existingClients.map((row) => [row.name, row]));
const existingItems = await db
  .select()
  .from(item)
  .where(eq(item.businessId, biz.id));
const itemByName = new Map(existingItems.map((row) => [row.name, row]));
const existingRates = await db
  .select()
  .from(taxRate)
  .where(eq(taxRate.businessId, biz.id));
const rateByKey = new Map(
  existingRates.map((row) => [`${row.name}:${row.rateBps}`, row.id]),
);
const existingNumbers = new Set(
  (
    await db
      .select({ number: invoice.number })
      .from(invoice)
      .where(eq(invoice.businessId, biz.id))
  ).map((row) => row.number),
);

let createdClients = 0;
let createdItems = 0;
let createdRates = 0;
let createdInvoices = 0;
let skippedInvoices = 0;

await db.transaction(async (tx) => {
  for (const entry of grouped) {
    if (existingNumbers.has(entry.number)) {
      skippedInvoices += 1;
      continue;
    }
    let selected = clientByName.get(entry.clientName);
    if (!selected) {
      const id = crypto.randomUUID();
      await tx.insert(client).values({
        id,
        businessId: biz.id,
        name: entry.clientName,
        email: placeholderEmail(entry.clientName),
        phone: null,
        address: null,
        taxExempt: entry.taxExempt,
        note: "Imported from FreshBooks. The export has no email, so this address is a placeholder.",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      selected = {
        id,
        businessId: biz.id,
        name: entry.clientName,
        email: placeholderEmail(entry.clientName),
        phone: null,
        address: null,
        taxExempt: entry.taxExempt,
        note: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      clientByName.set(entry.clientName, selected);
      createdClients += 1;
    }

    for (const line of entry.lines) {
      if (itemByName.has(line.name)) continue;
      const id = crypto.randomUUID();
      const unitPriceCents = parseDollarsToCents(line.rate);
      await tx.insert(item).values({
        id,
        businessId: biz.id,
        name: line.name,
        description: null,
        unitPriceCents,
        createdAt: now,
        updatedAt: now,
      });
      itemByName.set(line.name, {
        id,
        businessId: biz.id,
        name: line.name,
        description: null,
        unitPriceCents,
        createdAt: now,
        updatedAt: now,
      });
      createdItems += 1;
    }

    const pricedInput = entry.lines.map((line) => ({
      name: line.name,
      description: line.description || null,
      quantity: line.quantity,
      unitPriceCents: parseDollarsToCents(line.rate),
      taxes: line.taxes.map((tax) => {
        const key = `${tax.name}:${tax.rateBps}`;
        let id = rateByKey.get(key);
        if (!id) {
          id = crypto.randomUUID();
          rateByKey.set(key, id);
          createdRates += 1;
        }
        return { id, name: tax.name, rateBps: tax.rateBps };
      }),
    }));

    const rateInserts = new Map<string, TaxChoice & { id: string }>();
    for (const line of pricedInput) {
      for (const tax of line.taxes) {
        rateInserts.set(tax.id, tax);
      }
    }
    for (const tax of rateInserts.values()) {
      if (existingRates.some((row) => row.id === tax.id)) continue;
      const known = existingRates.find(
        (row) => row.name === tax.name && row.rateBps === tax.rateBps,
      );
      if (known) continue;
      await tx.insert(taxRate).values({
        id: tax.id,
        businessId: biz.id,
        name: tax.name,
        rateBps: tax.rateBps,
        createdAt: now,
        updatedAt: now,
      });
      existingRates.push({
        id: tax.id,
        businessId: biz.id,
        name: tax.name,
        rateBps: tax.rateBps,
        createdAt: now,
        updatedAt: now,
      });
    }

    const priced = priceInvoice({
      lines: pricedInput,
      taxExempt: selected.taxExempt,
    });
    const expected = entry.lines.reduce(
      (sum, line) => sum + roundDollarsToCents(line.lineTotal),
      0,
    );
    if (priced.totalCents !== expected) {
      throw new Error(
        `Invoice ${entry.numberLabel} totals ${priced.totalCents} cents, FreshBooks rounds to ${expected}`,
      );
    }

    const invoiceId = crypto.randomUUID();
    const issuedAt = new Date(`${entry.issueDate}T12:00:00.000Z`);
    const status = entry.status === "paid" ? "paid" : "sent";
    const document = {
      number: entry.number,
      currency: biz.currency,
      issueDate: entry.issueDate,
      dueDate: entry.dueDate,
      reference: entry.reference,
      notes: null,
      terms: null,
      client: {
        name: selected.name,
        email: selected.email,
        phone: selected.phone,
        address: selected.address,
        taxExempt: selected.taxExempt,
      },
      business: {
        name: biz.name,
        address: biz.address,
        taxId: biz.taxId,
        footer: biz.footer,
        accentColor: accentOrDefault(biz.accentColor),
      },
      lines: priced.lines.map((line) => ({
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        amountCents: line.amountCents,
        taxCents: line.taxCents,
        taxes: line.taxes.map((tax) => ({
          name: tax.name,
          rateBps: tax.rateBps,
          taxCents: tax.taxCents,
        })),
      })),
      subtotalCents: priced.subtotalCents,
      taxCents: priced.taxCents,
      totalCents: priced.totalCents,
    };

    await tx.insert(invoice).values({
      id: invoiceId,
      businessId: biz.id,
      clientId: selected.id,
      number: entry.number,
      status,
      issueDate: entry.issueDate,
      dueDate: entry.dueDate,
      reference: entry.reference,
      notes: null,
      terms: null,
      voidReason: null,
      voidedAt: null,
      sentAt: issuedAt,
      firstViewedAt: entry.status === "viewed" ? issuedAt : null,
      subtotalCents: priced.subtotalCents,
      taxCents: priced.taxCents,
      totalCents: priced.totalCents,
      snapshot: JSON.stringify(document),
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    for (const [position, line] of priced.lines.entries()) {
      const lineId = crypto.randomUUID();
      await tx.insert(invoiceLine).values({
        id: lineId,
        invoiceId,
        businessId: biz.id,
        position,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      });
      const taxes = line.taxes.filter((tax) => tax.rateBps > 0);
      if (taxes.length === 0) continue;
      await tx.insert(invoiceLineTax).values(
        taxes.map((tax) => ({
          id: crypto.randomUUID(),
          lineId,
          businessId: biz.id,
          taxRateId: tax.id,
          name: tax.name,
          rateBps: tax.rateBps,
          taxCents: tax.taxCents,
        })),
      );
    }

    if (status === "paid") {
      if (!entry.paidOn) {
        throw new Error(`Invoice ${entry.numberLabel} is paid with no Date Paid`);
      }
      if (priced.totalCents > 0) {
        const paidAt = new Date(`${entry.paidOn}T12:00:00.000Z`);
        await tx.insert(payment).values({
          id: crypto.randomUUID(),
          businessId: biz.id,
          invoiceId,
          amountCents: priced.totalCents,
          paidOn: entry.paidOn,
          method: "other",
          note: "Imported from FreshBooks. The export has no payment method.",
          stripeCheckoutSessionId: null,
          stripePaymentIntentId: null,
          stripeChargeId: null,
          stripeBalanceTransactionId: null,
          feeCents: null,
          refundedCents: 0,
          stripeRefundIds: null,
          createdAt: paidAt,
          updatedAt: paidAt,
        });
      }
    }
    createdInvoices += 1;
  }

  const maxRow = await tx
    .select({
      maxNumber: sql<number>`coalesce(max(${invoice.number}), 0)`,
    })
    .from(invoice)
    .where(eq(invoice.businessId, biz.id));
  const lastNumber = maxRow[0]?.maxNumber ?? 0;
  await tx
    .insert(invoiceCounter)
    .values({ businessId: biz.id, lastNumber })
    .onConflictDoUpdate({
      target: invoiceCounter.businessId,
      set: { lastNumber },
    });
});

console.log(
  JSON.stringify(
    {
      business: biz.name,
      createdClients,
      createdItems,
      createdRates,
      createdInvoices,
      skippedInvoices,
    },
    null,
    2,
  ),
);

type ParsedLine = {
  name: string;
  description: string;
  rate: string;
  quantity: number;
  lineTotal: string;
  taxes: TaxChoice[];
};

type ParsedInvoice = {
  number: number;
  numberLabel: string;
  clientName: string;
  status: "paid" | "sent" | "viewed" | "overdue";
  issueDate: string;
  dueDate: string;
  paidOn: string | null;
  reference: string | null;
  taxExempt: boolean;
  lines: ParsedLine[];
};

function groupInvoices(data: CsvRow[]): ParsedInvoice[] {
  const byNumber = new Map<string, CsvRow[]>();
  for (const row of data) {
    const label = row["Invoice #"]?.trim();
    if (!label) throw new Error("A row is missing Invoice #");
    const list = byNumber.get(label) ?? [];
    list.push(row);
    byNumber.set(label, list);
  }
  return [...byNumber.entries()].map(([label, lines]) => {
    const first = lines[0];
    if (!first) throw new Error(`Invoice ${label} has no lines`);
    const number = Number(label);
    if (!Number.isInteger(number) || number < 1) {
      throw new Error(`Invoice ${label} is not a positive integer`);
    }
    const status = first["Invoice Status"]?.trim();
    if (
      status !== "paid" &&
      status !== "sent" &&
      status !== "viewed" &&
      status !== "overdue"
    ) {
      throw new Error(`Invoice ${label} has status ${status}`);
    }
    for (const line of lines) {
      if (line["Client Name"] !== first["Client Name"]) {
        throw new Error(`Invoice ${label} has more than one Client`);
      }
      if (line["Invoice Status"] !== status) {
        throw new Error(`Invoice ${label} has mixed statuses`);
      }
      if (line.Currency !== "USD") {
        throw new Error(`Invoice ${label} is not USD`);
      }
      if (Number(line["Discount Percentage"]) !== 0) {
        throw new Error(`Invoice ${label} has a discount, which this app does not store`);
      }
    }
    const parsedLines = lines.map((line) => parseLine(label, line));
    const taxed = parsedLines.some((line) => line.taxes.length > 0);
    const markedExempt = lines.some((line) =>
      line["Item Name"].startsWith("Tax Exempt"),
    );
    return {
      number,
      numberLabel: label,
      clientName: first["Client Name"].trim(),
      status,
      issueDate: first["Date Issued"],
      dueDate: first["Date Due"],
      paidOn: first["Date Paid"]?.trim() || null,
      reference: referenceFor(lines),
      taxExempt: markedExempt && !taxed,
      lines: parsedLines,
    };
  });
}

function parseLine(label: string, line: CsvRow): ParsedLine {
  const quantity = Number(line.Quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invoice ${label} has a quantity this app cannot store`);
  }
  const taxes: TaxChoice[] = [];
  for (const slot of [1, 2] as const) {
    const type = line[`Tax ${slot} Type`]?.trim();
    const amount = line[`Tax ${slot} Amount`]?.trim();
    if (!type || !amount || Number(amount) === 0) continue;
    taxes.push({
      name: taxName(type, amount, line["Line Subtotal"]),
      rateBps: rateBps(amount, line["Line Subtotal"], label),
    });
  }
  return {
    name: line["Item Name"].trim(),
    description: line["Item Description"].trim(),
    rate: line.Rate.trim(),
    quantity,
    lineTotal: line["Line Total"].trim(),
    taxes,
  };
}

function taxName(type: string, taxAmount: string, subtotal: string): string {
  const bps = rateBps(taxAmount, subtotal, type);
  const percent = (bps / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${type} (${percent}%)`;
}

function rateBps(taxAmount: string, subtotal: string, label: string): number {
  const tax = toTenThousandths(taxAmount);
  const base = toTenThousandths(subtotal);
  if (base === 0n) throw new Error(`Invoice ${label} taxes a zero subtotal`);
  const scaled = tax * 10000n;
  if (scaled % base !== 0n) {
    throw new Error(`Invoice ${label} tax does not land on a 0.01% rate`);
  }
  const bps = Number(scaled / base);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error(`Invoice ${label} has a tax rate outside 0–100%`);
  }
  return bps;
}

function toTenThousandths(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) throw new Error(`Amount ${value} has more than 4 decimal places`);
  const whole = BigInt(match[1]);
  const frac = BigInt((match[2] ?? "").padEnd(4, "0"));
  return whole * 10000n + frac;
}

function roundDollarsToCents(value: string): number {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const match = /^(\d+)\.(\d+)$/.exec(unsigned);
  if (!match) return parseDollarsToCents(unsigned) * (negative ? -1 : 1);
  const cents = Number(match[1]) * 100 + Number(match[2].slice(0, 2).padEnd(2, "0"));
  const roundUp = Number(match[2][2] ?? "0") >= 5;
  const rounded = cents + (roundUp ? 1 : 0);
  return negative ? -rounded : rounded;
}

function referenceFor(lines: CsvRow[]): string | null {
  const pos = new Set<string>();
  for (const line of lines) {
    for (const match of line["Item Description"].matchAll(/PO\s+(\d+)/gi)) {
      if (match[1]) pos.add(match[1]);
    }
  }
  if (pos.size === 0) return null;
  return [...pos].map((po) => `PO ${po}`).join(", ");
}

function placeholderEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}@example.com`;
}

function parseCsv(csv: string): CsvRow[] {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      table.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    table.push(row);
  }
  const header = table[0];
  if (!header) throw new Error("CSV is empty");
  return table
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) =>
      Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])),
    );
}
