import type { CategoryGroup } from "./expense-categories";
import {
  amountDueCents,
  assertIsoDate,
  creditCents,
  type InvoiceStatus,
} from "./invoice";
import { formatCents } from "./money";

export const REPORT_PRESETS = [
  "this_month",
  "last_month",
  "this_quarter",
  "year_to_date",
  "last_year",
  "custom",
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number];
export type ReportBasis = "cash" | "accrual";

export type DateRange = { from: string; to: string };

export type ReportQuery = {
  preset: ReportPreset;
  basis: ReportBasis;
  from: string;
  to: string;
};

export const PRESET_LABELS: Record<ReportPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  year_to_date: "Year to date",
  last_year: "Last year",
  custom: "Custom",
};

/** Shown on the Profit and Loss report and kept in step with GLOSSARY.md. */
export const CASH_BASIS_TEXT =
  "Cash basis. Income is Payments in the period: amount minus refunded cents, on the business-local payment date. A refund reduces that Payment and stays on the payment date. Expenses are Expenses dated in the period, including Merchant fees. Gross profit is income minus Cost of Goods Sold. Net profit subtracts Schedule C expenses from gross profit.";

export const ACCRUAL_BASIS_TEXT =
  "Accrual basis (invoice basis). Income is Sent Invoices that are not Void, by issue date. Draft and Void Invoices count for nothing. Expenses match cash basis. Gross profit and net profit use the same expense totals.";

export const REVENUE_CASH_TEXT =
  "Paid is Payments in this period, including Payments on older Invoices. Invoiced, outstanding, and credit are Sent Invoices issued in this period. Outstanding is the unpaid balance still due. Credit is an overpayment on those Invoices.";

export const REVENUE_ACCRUAL_TEXT =
  "Invoiced is Sent Invoices issued in this period. Paid is every Payment on those Invoices, including Payments outside the period, minus refunds. Outstanding is what is still due. Credit is an overpayment.";

export const TAX_PAID_TEXT =
  "Tax paid is the tax recorded on each Expense. It is not added to the amount, and Profit and Loss does not subtract it again.";

export const EXPENSE_REPORT_TEXT =
  "Expenses dated in the period, including Merchant fees and archived Categories. Cost of Goods Sold is listed apart from Schedule C.";

export type CategoryAmount = {
  categoryId: string;
  name: string;
  archived: boolean;
  amountCents: number;
  taxPaidCents: number;
};

export type ProfitAndLoss = {
  basis: ReportBasis;
  from: string;
  to: string;
  definition: string;
  grossIncomeCents: number;
  cogs: CategoryAmount[];
  cogsCents: number;
  grossProfitCents: number;
  expenses: CategoryAmount[];
  expenseCents: number;
  netProfitCents: number;
};

export type ExpenseCategoryReport = {
  from: string;
  to: string;
  cogs: CategoryAmount[];
  cogsCents: number;
  cogsTaxCents: number;
  expenses: CategoryAmount[];
  expenseCents: number;
  expenseTaxCents: number;
  totalCents: number;
  taxPaidCents: number;
};

export type ClientRevenue = {
  clientId: string;
  name: string;
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  creditCents: number;
};

export type RevenueReport = {
  basis: ReportBasis;
  from: string;
  to: string;
  definition: string;
  note: string;
  rows: ClientRevenue[];
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  creditCents: number;
  /** Cash uses paid. Accrual uses invoiced. */
  revenueCents: number;
};

export type ExpenseLine = {
  categoryId: string;
  categoryName: string;
  categoryGroup: CategoryGroup;
  archived: boolean;
  amountCents: number;
  taxPaidCents: number;
};

export type IssuedInvoice = {
  clientId: string;
  clientName: string;
  status: InvoiceStatus;
  totalCents: number;
  paidCents: number;
};

export type CashPayment = {
  clientId: string;
  clientName: string;
  netCents: number;
};

export type MonthBucket = {
  key: string;
  label: string;
  shortLabel: string;
  from: string;
  to: string;
  incomeCents: number;
  expenseCents: number;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function isReportPreset(value: string): value is ReportPreset {
  return (REPORT_PRESETS as readonly string[]).includes(value);
}

export function reportSearch(search: Record<string, unknown>): ReportQuery {
  return parseReportQuery({
    preset: typeof search.preset === "string" ? search.preset : undefined,
    basis: typeof search.basis === "string" ? search.basis : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  });
}

export function parseReportQuery(input: {
  preset?: string;
  basis?: string;
  from?: string;
  to?: string;
}): ReportQuery {
  return {
    preset:
      input.preset && isReportPreset(input.preset)
        ? input.preset
        : "this_month",
    basis: input.basis === "accrual" ? "accrual" : "cash",
    from: input.from ?? "",
    to: input.to ?? "",
  };
}

export function basisText(basis: ReportBasis): string {
  return basis === "accrual" ? ACCRUAL_BASIS_TEXT : CASH_BASIS_TEXT;
}

export function addCents(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new Error("Money must be an integer number of cents");
  }
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw new Error("Report total is too large");
  return sum;
}

export function mustCents(value: unknown): number {
  if (typeof value === "bigint") {
    if (
      value > BigInt(Number.MAX_SAFE_INTEGER) ||
      value < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new Error("Report total is too large");
    }
    return Number(value);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error("Money must be an integer number of cents");
  }
  return number;
}

export function netCents(amountCents: number, refundedCents: number): number {
  return addCents(mustCents(amountCents), -mustCents(refundedCents));
}

/** Inclusive calendar ranges. `today` is a business-local YYYY-MM-DD. */
export function periodRange(
  preset: ReportPreset,
  today: string,
  custom?: { from: string; to: string },
): DateRange {
  const current = parts(today);
  if (preset === "this_month") return monthRange(current.year, current.month);
  if (preset === "last_month") {
    const previous = shiftMonth(current.year, current.month, -1);
    return monthRange(previous.year, previous.month);
  }
  if (preset === "this_quarter") {
    const startMonth = Math.floor((current.month - 1) / 3) * 3 + 1;
    const end = shiftMonth(current.year, startMonth, 2);
    return {
      from: iso(current.year, startMonth, 1),
      to: iso(end.year, end.month, lastDay(end.year, end.month)),
    };
  }
  if (preset === "year_to_date") {
    return { from: iso(current.year, 1, 1), to: today };
  }
  if (preset === "last_year") {
    return {
      from: iso(current.year - 1, 1, 1),
      to: iso(current.year - 1, 12, 31),
    };
  }
  const from = custom?.from?.trim() ?? "";
  const to = custom?.to?.trim() ?? "";
  if (!from || !to) throw new Error("Enter a start and end date");
  const range = { from: assertIsoDate(from), to: assertIsoDate(to) };
  if (range.from > range.to) {
    throw new Error("The start date is after the end date");
  }
  return range;
}

export function dateInRange(isoDate: string, range: DateRange): boolean {
  return isoDate >= range.from && isoDate <= range.to;
}

/** Twelve calendar months ending with the month that contains `today`. */
export function monthSeries(today: string, count = 12): MonthBucket[] {
  const current = parts(today);
  const start = shiftMonth(current.year, current.month, -(count - 1));
  const months: MonthBucket[] = [];
  for (let index = 0; index < count; index += 1) {
    const cursor = shiftMonth(start.year, start.month, index);
    const range = monthRange(cursor.year, cursor.month);
    months.push({
      key: range.from.slice(0, 7),
      label: `${MONTHS[cursor.month - 1]} ${cursor.year}`,
      shortLabel: MONTHS[cursor.month - 1] ?? "",
      from: range.from,
      to: range.to,
      incomeCents: 0,
      expenseCents: 0,
    });
  }
  return months;
}

export function profitAndLoss(input: {
  basis: ReportBasis;
  range: DateRange;
  incomeCents: number;
  expenses: ExpenseLine[];
}): ProfitAndLoss {
  const grouped = groupExpenses(input.expenses);
  const income = mustCents(input.incomeCents);
  const cogsCents = sumAmounts(grouped.cogs);
  const expenseCents = sumAmounts(grouped.expenses);
  const grossProfitCents = addCents(income, -cogsCents);
  return {
    basis: input.basis,
    from: input.range.from,
    to: input.range.to,
    definition: basisText(input.basis),
    grossIncomeCents: income,
    cogs: grouped.cogs,
    cogsCents,
    grossProfitCents,
    expenses: grouped.expenses,
    expenseCents,
    netProfitCents: addCents(grossProfitCents, -expenseCents),
  };
}

export function expenseCategoryReport(
  range: DateRange,
  expenses: ExpenseLine[],
): ExpenseCategoryReport {
  const grouped = groupExpenses(expenses);
  const cogsCents = sumAmounts(grouped.cogs);
  const cogsTaxCents = sumTax(grouped.cogs);
  const expenseCents = sumAmounts(grouped.expenses);
  const expenseTaxCents = sumTax(grouped.expenses);
  return {
    from: range.from,
    to: range.to,
    cogs: grouped.cogs,
    cogsCents,
    cogsTaxCents,
    expenses: grouped.expenses,
    expenseCents,
    expenseTaxCents,
    totalCents: addCents(cogsCents, expenseCents),
    taxPaidCents: addCents(cogsTaxCents, expenseTaxCents),
  };
}

export function revenueReport(input: {
  basis: ReportBasis;
  range: DateRange;
  issued: IssuedInvoice[];
  payments: CashPayment[];
}): RevenueReport {
  const byClient = new Map<string, ClientRevenue>();
  const ensure = (clientId: string, name: string) => {
    const existing = byClient.get(clientId);
    if (existing) {
      existing.name = name;
      return existing;
    }
    const created: ClientRevenue = {
      clientId,
      name,
      invoicedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      creditCents: 0,
    };
    byClient.set(clientId, created);
    return created;
  };

  for (const invoice of input.issued) {
    const row = ensure(invoice.clientId, invoice.clientName);
    const total = mustCents(invoice.totalCents);
    const paid = mustCents(invoice.paidCents);
    row.invoicedCents = addCents(row.invoicedCents, total);
    row.outstandingCents = addCents(
      row.outstandingCents,
      amountDueCents(invoice.status, total, paid),
    );
    row.creditCents = addCents(row.creditCents, creditCents(total, paid));
    if (input.basis === "accrual") {
      row.paidCents = addCents(row.paidCents, paid);
    }
  }
  if (input.basis === "cash") {
    for (const payment of input.payments) {
      const row = ensure(payment.clientId, payment.clientName);
      row.paidCents = addCents(row.paidCents, mustCents(payment.netCents));
    }
  }

  const rows = [...byClient.values()]
    .filter(
      (row) =>
        row.invoicedCents !== 0 ||
        row.paidCents !== 0 ||
        row.outstandingCents !== 0 ||
        row.creditCents !== 0,
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.clientId.localeCompare(b.clientId),
    );
  const invoicedCents = sumBy(rows, (row) => row.invoicedCents);
  const paidCents = sumBy(rows, (row) => row.paidCents);
  return {
    basis: input.basis,
    from: input.range.from,
    to: input.range.to,
    definition: basisText(input.basis),
    note: input.basis === "accrual" ? REVENUE_ACCRUAL_TEXT : REVENUE_CASH_TEXT,
    rows,
    invoicedCents,
    paidCents,
    outstandingCents: sumBy(rows, (row) => row.outstandingCents),
    creditCents: sumBy(rows, (row) => row.creditCents),
    revenueCents: input.basis === "accrual" ? invoicedCents : paidCents,
  };
}

export function fillMonths(
  months: MonthBucket[],
  payments: { paidOn: string; netCents: number }[],
  expenses: { spentOn: string; amountCents: number }[],
): MonthBucket[] {
  const byKey = new Map(months.map((month) => [month.key, month]));
  for (const payment of payments) {
    const month = byKey.get(payment.paidOn.slice(0, 7));
    if (!month) continue;
    month.incomeCents = addCents(
      month.incomeCents,
      mustCents(payment.netCents),
    );
  }
  for (const expense of expenses) {
    const month = byKey.get(expense.spentOn.slice(0, 7));
    if (!month) continue;
    month.expenseCents = addCents(
      month.expenseCents,
      mustCents(expense.amountCents),
    );
  }
  return months;
}

export function sumInRange(
  rows: { date: string; amountCents: number }[],
  range: DateRange,
): number {
  let total = 0;
  for (const row of rows) {
    if (!dateInRange(row.date, range)) continue;
    total = addCents(total, mustCents(row.amountCents));
  }
  return total;
}

export function profitAndLossCsv(report: ProfitAndLoss): string {
  const lines = [
    line(["Report", "Profit and Loss"]),
    line(["Basis", report.basis === "accrual" ? "Accrual" : "Cash"]),
    line(["From", report.from]),
    line(["To", report.to]),
    line(["Definition", report.definition]),
    line(["Line", "Category", "Amount", "Archived"]),
    line(["Gross income", "", money(report.grossIncomeCents), ""]),
  ];
  for (const category of report.cogs) {
    lines.push(categoryLine("Cost of Goods Sold", category));
  }
  lines.push(
    line(["Cost of Goods Sold total", "", money(report.cogsCents), ""]),
    line(["Gross profit", "", money(report.grossProfitCents), ""]),
  );
  for (const category of report.expenses) {
    lines.push(categoryLine("Expense", category));
  }
  lines.push(
    line(["Expenses total", "", money(report.expenseCents), ""]),
    line(["Net profit", "", money(report.netProfitCents), ""]),
  );
  return `${lines.join("\n")}\n`;
}

export function expenseCategoryCsv(report: ExpenseCategoryReport): string {
  const lines = [
    line(["Report", "Expenses by category"]),
    line(["From", report.from]),
    line(["To", report.to]),
    line(["Note", TAX_PAID_TEXT]),
    line(["Group", "Category", "Amount", "Tax paid", "Archived"]),
  ];
  for (const category of report.cogs) {
    lines.push(expenseLine("Cost of Goods Sold", category));
  }
  lines.push(
    line([
      "Cost of Goods Sold total",
      "",
      money(report.cogsCents),
      money(report.cogsTaxCents),
      "",
    ]),
  );
  for (const category of report.expenses) {
    lines.push(expenseLine("Schedule C", category));
  }
  lines.push(
    line([
      "Schedule C total",
      "",
      money(report.expenseCents),
      money(report.expenseTaxCents),
      "",
    ]),
    line([
      "Total",
      "",
      money(report.totalCents),
      money(report.taxPaidCents),
      "",
    ]),
  );
  return `${lines.join("\n")}\n`;
}

export function revenueCsv(report: RevenueReport): string {
  const lines = [
    line(["Report", "Revenue by client"]),
    line(["Basis", report.basis === "accrual" ? "Accrual" : "Cash"]),
    line(["From", report.from]),
    line(["To", report.to]),
    line(["Definition", report.note]),
    line(["Client", "Invoiced", "Paid", "Outstanding", "Credit"]),
  ];
  for (const row of report.rows) {
    lines.push(
      line([
        row.name,
        money(row.invoicedCents),
        money(row.paidCents),
        money(row.outstandingCents),
        money(row.creditCents),
      ]),
    );
  }
  lines.push(
    line([
      "Total",
      money(report.invoicedCents),
      money(report.paidCents),
      money(report.outstandingCents),
      money(report.creditCents),
    ]),
  );
  return `${lines.join("\n")}\n`;
}

export function reportFilename(kind: string, range: DateRange): string {
  return `${kind}-${range.from}-to-${range.to}.csv`;
}

function groupExpenses(rows: ExpenseLine[]) {
  const map = new Map<string, CategoryAmount & { group: CategoryGroup }>();
  for (const row of rows) {
    const amount = mustCents(row.amountCents);
    const tax = mustCents(row.taxPaidCents);
    const current = map.get(row.categoryId);
    if (current) {
      current.name = row.categoryName;
      current.archived = row.archived;
      current.group = row.categoryGroup;
      current.amountCents = addCents(current.amountCents, amount);
      current.taxPaidCents = addCents(current.taxPaidCents, tax);
      continue;
    }
    map.set(row.categoryId, {
      categoryId: row.categoryId,
      name: row.categoryName,
      archived: row.archived,
      group: row.categoryGroup,
      amountCents: amount,
      taxPaidCents: tax,
    });
  }
  const sorted = [...map.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.categoryId.localeCompare(b.categoryId),
  );
  const strip = (group: CategoryGroup): CategoryAmount[] =>
    sorted
      .filter((row) => row.group === group)
      .map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        archived: row.archived,
        amountCents: row.amountCents,
        taxPaidCents: row.taxPaidCents,
      }));
  return { cogs: strip("cogs"), expenses: strip("schedule_c") };
}

function sumAmounts(rows: CategoryAmount[]): number {
  return sumBy(rows, (row) => row.amountCents);
}

function sumTax(rows: CategoryAmount[]): number {
  return sumBy(rows, (row) => row.taxPaidCents);
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  let total = 0;
  for (const row of rows) total = addCents(total, pick(row));
  return total;
}

function parts(isoDate: string) {
  const [year, month, day] = assertIsoDate(isoDate).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day };
}

function iso(year: number, month: number, day: number): string {
  return assertIsoDate(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (((index % 12) + 12) % 12) + 1,
  };
}

function monthRange(year: number, month: number): DateRange {
  return {
    from: iso(year, month, 1),
    to: iso(year, month, lastDay(year, month)),
  };
}

function money(cents: number): string {
  return formatCents(mustCents(cents));
}

function categoryLine(label: string, category: CategoryAmount): string {
  return line([
    label,
    category.name,
    money(category.amountCents),
    category.archived ? "yes" : "no",
  ]);
}

function expenseLine(group: string, category: CategoryAmount): string {
  return line([
    group,
    category.name,
    money(category.amountCents),
    money(category.taxPaidCents),
    category.archived ? "yes" : "no",
  ]);
}

function line(values: (string | number)[]): string {
  return values.map(cell).join(",");
}

function cell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
