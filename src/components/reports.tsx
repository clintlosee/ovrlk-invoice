import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import {
  type CategoryAmount,
  type ClientRevenue,
  type MonthBucket,
  PRESET_LABELS,
  type ProfitAndLoss,
  REPORT_PRESETS,
  type ReportQuery,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

export function saveCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportChrome({
  title,
  search,
  showBasis,
  definition,
  note,
  range,
  csv,
  filename,
  error,
  children,
}: {
  title: string;
  search: ReportQuery;
  showBasis: boolean;
  definition: string | null;
  note: string | null;
  range: { from: string; to: string } | null;
  csv: string | null;
  filename: string | null;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <ReportNav search={search} />
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-serif text-3xl">{title}</h1>
        <Button
          type="button"
          variant="outline"
          disabled={!csv || !filename}
          onClick={() => {
            if (csv && filename) saveCsv(filename, csv);
          }}
        >
          Download CSV
        </Button>
      </div>
      {definition ? (
        <p className="mt-3 text-sm text-muted-foreground">{definition}</p>
      ) : null}
      {note ? (
        <p className="mt-2 text-sm text-muted-foreground">{note}</p>
      ) : null}
      <PeriodBar search={search} />
      {showBasis ? <BasisBar search={search} /> : null}
      {range ? (
        <p className="mt-3 text-sm">
          {range.from} – {range.to}
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {children}
    </>
  );
}

export function ProfitTable({ report }: { report: ProfitAndLoss }) {
  return (
    <table className="mt-6 w-full text-sm">
      <tbody>
        <MoneyRow label="Gross income" cents={report.grossIncomeCents} strong />
        <Section label="Cost of Goods Sold" rows={report.cogs} />
        <MoneyRow label="Cost of Goods Sold total" cents={report.cogsCents} />
        <MoneyRow label="Gross profit" cents={report.grossProfitCents} strong />
        <Section label="Expenses" rows={report.expenses} />
        <MoneyRow label="Expenses total" cents={report.expenseCents} />
        <MoneyRow label="Net profit" cents={report.netProfitCents} strong />
      </tbody>
    </table>
  );
}

export function ExpenseTable({
  cogs,
  expenses,
  cogsCents,
  cogsTaxCents,
  expenseCents,
  expenseTaxCents,
  totalCents,
  taxPaidCents,
}: {
  cogs: CategoryAmount[];
  expenses: CategoryAmount[];
  cogsCents: number;
  cogsTaxCents: number;
  expenseCents: number;
  expenseTaxCents: number;
  totalCents: number;
  taxPaidCents: number;
}) {
  return (
    <table className="mt-6 w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-2 font-medium">Category</th>
          <th className="py-2 text-right font-medium">Amount</th>
          <th className="py-2 text-right font-medium">Tax paid</th>
        </tr>
      </thead>
      <tbody>
        <GroupHeading>Cost of Goods Sold</GroupHeading>
        {cogs.length === 0 ? (
          <EmptyRow columns={3} label="No Cost of Goods Sold in this period." />
        ) : (
          cogs.map((row) => <ExpenseRow key={row.categoryId} row={row} />)
        )}
        <TotalRow
          label="Cost of Goods Sold total"
          amount={cogsCents}
          tax={cogsTaxCents}
        />
        <GroupHeading>Schedule C</GroupHeading>
        {expenses.length === 0 ? (
          <EmptyRow
            columns={3}
            label="No Schedule C expenses in this period."
          />
        ) : (
          expenses.map((row) => <ExpenseRow key={row.categoryId} row={row} />)
        )}
        <TotalRow
          label="Schedule C total"
          amount={expenseCents}
          tax={expenseTaxCents}
        />
        <TotalRow label="Total" amount={totalCents} tax={taxPaidCents} strong />
      </tbody>
    </table>
  );
}

export function RevenueTable({
  rows,
  invoicedCents,
  paidCents,
  outstandingCents,
  creditCents,
  revenueCents,
}: {
  rows: ClientRevenue[];
  invoicedCents: number;
  paidCents: number;
  outstandingCents: number;
  creditCents: number;
  revenueCents: number;
}) {
  return (
    <>
      <p className="mt-4 text-sm">Revenue {formatUsd(revenueCents)}</p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm">No Clients in this period.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 font-medium">Client</th>
                <th className="py-2 text-right font-medium">Invoiced</th>
                <th className="py-2 text-right font-medium">Paid</th>
                <th className="py-2 text-right font-medium">Outstanding</th>
                <th className="py-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.clientId} className="border-b border-border">
                  <td className="py-2">{row.name}</td>
                  <td className="py-2 text-right">
                    {formatUsd(row.invoicedCents)}
                  </td>
                  <td className="py-2 text-right">
                    {formatUsd(row.paidCents)}
                  </td>
                  <td className="py-2 text-right">
                    {formatUsd(row.outstandingCents)}
                  </td>
                  <td className="py-2 text-right">
                    {formatUsd(row.creditCents)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-medium">Total</td>
                <td className="py-2 text-right font-medium">
                  {formatUsd(invoicedCents)}
                </td>
                <td className="py-2 text-right font-medium">
                  {formatUsd(paidCents)}
                </td>
                <td className="py-2 text-right font-medium">
                  {formatUsd(outstandingCents)}
                </td>
                <td className="py-2 text-right font-medium">
                  {formatUsd(creditCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function MonthBars({ months }: { months: MonthBucket[] }) {
  const peak = Math.max(
    1,
    ...months.map((month) => Math.max(month.incomeCents, month.expenseCents)),
  );
  const first = months[0]?.label;
  const last = months.at(-1)?.label;
  return (
    <figure className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl">Income and expenses</h2>
        <p className="text-sm text-muted-foreground">
          {first} – {last}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cash basis, by month. Income is Payments. Expenses include Cost of Goods
        Sold and Merchant fees.
      </p>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-foreground" /> Income
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-muted-foreground" /> Expenses
        </span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-1">
        {months.map((month) => (
          <div
            key={month.key}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
          >
            <div className="flex h-32 items-end justify-center gap-0.5">
              <Bar
                cents={month.incomeCents}
                peak={peak}
                className="bg-foreground"
                label={`${month.label} income ${formatUsd(month.incomeCents)}`}
              />
              <Bar
                cents={month.expenseCents}
                peak={peak}
                className="bg-muted-foreground"
                label={`${month.label} expenses ${formatUsd(month.expenseCents)}`}
              />
            </div>
            <span className="mt-1 truncate text-center text-[10px] text-muted-foreground">
              {month.shortLabel}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {months
          .map(
            (month) =>
              `${month.label}, income ${formatUsd(month.incomeCents)}, expenses ${formatUsd(month.expenseCents)}`,
          )
          .join(". ")}
      </figcaption>
    </figure>
  );
}

function Bar({
  cents,
  peak,
  className,
  label,
}: {
  cents: number;
  peak: number;
  className: string;
  label: string;
}) {
  const height = cents <= 0 ? 0 : Math.max(4, Math.round((cents / peak) * 100));
  return (
    <div
      className={cn("w-2 rounded-sm", className)}
      style={{ height: `${height}%` }}
      title={label}
    />
  );
}

function ReportNav({ search }: { search: ReportQuery }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const links = [
    { to: "/app/reports", label: "Profit and Loss" },
    { to: "/app/reports/expenses", label: "Expenses" },
    { to: "/app/reports/clients", label: "Revenue by client" },
  ] as const;
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {links.map((link) => {
        const current =
          link.to === "/app/reports"
            ? pathname === "/app/reports" || pathname === "/app/reports/"
            : pathname === link.to;
        return (
          <Link
            key={link.to}
            to={link.to}
            search={search}
            aria-current={current ? "page" : undefined}
            className={current ? "font-medium" : "underline"}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function PeriodBar({ search }: { search: ReportQuery }) {
  const navigate = useNavigate();
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  const [seenFrom, setSeenFrom] = useState(search.from);
  const [seenTo, setSeenTo] = useState(search.to);
  if (seenFrom !== search.from || seenTo !== search.to) {
    setSeenFrom(search.from);
    setSeenTo(search.to);
    setFrom(search.from);
    setTo(search.to);
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm">
        {REPORT_PRESETS.map((preset) => (
          <Link
            key={preset}
            to="."
            search={{ ...search, preset }}
            aria-current={search.preset === preset ? "page" : undefined}
            className={search.preset === preset ? "font-medium" : "underline"}
          >
            {PRESET_LABELS[preset]}
          </Link>
        ))}
      </div>
      {search.preset === "custom" ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              to: ".",
              search: { ...search, preset: "custom", from, to },
            });
          }}
        >
          <label className="text-sm" htmlFor="report-from">
            From
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
            />
          </label>
          <label className="text-sm" htmlFor="report-to">
            To
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
            />
          </label>
          <Button type="submit">Apply</Button>
        </form>
      ) : null}
    </div>
  );
}

function BasisBar({ search }: { search: ReportQuery }) {
  return (
    <div className="mt-3 flex gap-4 text-sm">
      <Link
        to="."
        search={{ ...search, basis: "cash" }}
        aria-current={search.basis === "cash" ? "page" : undefined}
        className={search.basis === "cash" ? "font-medium" : "underline"}
      >
        Cash basis
      </Link>
      <Link
        to="."
        search={{ ...search, basis: "accrual" }}
        aria-current={search.basis === "accrual" ? "page" : undefined}
        className={search.basis === "accrual" ? "font-medium" : "underline"}
      >
        Accrual basis
      </Link>
    </div>
  );
}

function Section({ label, rows }: { label: string; rows: CategoryAmount[] }) {
  return (
    <>
      <tr>
        <th className="pt-4 pb-1 text-left font-medium" colSpan={2}>
          {label}
        </th>
      </tr>
      {rows.length === 0 ? (
        <tr className="border-b border-border">
          <td className="py-2 pl-4 text-muted-foreground" colSpan={2}>
            None in this period.
          </td>
        </tr>
      ) : (
        rows.map((row) => (
          <tr key={row.categoryId} className="border-b border-border">
            <td className="py-2 pl-4">
              {row.name}
              {row.archived ? " (archived)" : ""}
            </td>
            <td className="py-2 text-right">{formatUsd(row.amountCents)}</td>
          </tr>
        ))
      )}
    </>
  );
}

function MoneyRow({
  label,
  cents,
  strong = false,
}: {
  label: string;
  cents: number;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-border">
      <th className={cn("py-2 text-left", strong && "font-medium")}>{label}</th>
      <td className={cn("py-2 text-right", strong && "font-medium")}>
        {formatUsd(cents)}
      </td>
    </tr>
  );
}

function GroupHeading({ children }: { children: string }) {
  return (
    <tr>
      <th className="pt-4 pb-1 text-left font-medium" colSpan={3}>
        {children}
      </th>
    </tr>
  );
}

function ExpenseRow({ row }: { row: CategoryAmount }) {
  return (
    <tr className="border-b border-border">
      <td className="py-2 pl-4">
        {row.name}
        {row.archived ? " (archived)" : ""}
      </td>
      <td className="py-2 text-right">{formatUsd(row.amountCents)}</td>
      <td className="py-2 text-right">{formatUsd(row.taxPaidCents)}</td>
    </tr>
  );
}

function TotalRow({
  label,
  amount,
  tax,
  strong = false,
}: {
  label: string;
  amount: number;
  tax: number;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-border">
      <td className={cn("py-2", strong && "font-medium")}>{label}</td>
      <td className={cn("py-2 text-right", strong && "font-medium")}>
        {formatUsd(amount)}
      </td>
      <td className={cn("py-2 text-right", strong && "font-medium")}>
        {formatUsd(tax)}
      </td>
    </tr>
  );
}

function EmptyRow({ label, columns }: { label: string; columns: number }) {
  return (
    <tr className="border-b border-border">
      <td className="py-2 pl-4 text-muted-foreground" colSpan={columns}>
        {label}
      </td>
    </tr>
  );
}
