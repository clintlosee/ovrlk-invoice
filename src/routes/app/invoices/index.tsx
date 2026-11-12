import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useState } from "react";
import {
  type BulkInvoice,
  InvoiceBulkBar,
} from "@/components/invoice-bulk-bar";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import { cardSurface } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type InvoiceDisplayStatus,
  type InvoiceStatus,
  statusLabel,
} from "@/lib/invoice";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getInvoices } from "@/server/invoices";

export const Route = createFileRoute("/app/invoices/")({
  loader: () => getInvoices(),
  component: InvoicesPage,
});

const STATUSES: InvoiceDisplayStatus[] = [
  "draft",
  "sent",
  "viewed",
  "due-soon",
  "overdue",
  "partial",
  "paid",
  "overpaid",
  "void",
];

type InvoiceRow = NonNullable<
  Awaited<ReturnType<typeof getInvoices>>
>["invoices"][number];

function InvoicesPage() {
  const data = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceDisplayStatus>("all");
  const [newestIssueFirst, setNewestIssueFirst] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  if (!data) return <p>Sign in again.</p>;

  const invoices = data.invoices;
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
  const recent = [...invoices]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  const needle = query.trim().toLowerCase();
  const shown = invoices
    .filter((invoice) => status === "all" || invoice.displayStatus === status)
    .filter((invoice) => {
      if (!needle) return true;
      return [invoice.clientName, invoice.numberLabel, invoice.summary]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => {
      const byDate = a.issueDate.localeCompare(b.issueDate);
      const dated = newestIssueFirst ? -byDate : byDate;
      if (dated !== 0) return dated;
      return b.numberLabel.localeCompare(a.numberLabel);
    });
  const selected = selectedIds.flatMap((id) => {
    const invoice = shown.find((row) => row.id === id);
    if (!invoice) return [];
    const row: BulkInvoice = {
      id: invoice.id,
      status: listStatus(invoice.displayStatus),
      clientName: invoice.clientName,
      numberLabel: invoice.numberLabel,
    };
    return [row];
  });

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-solar pb-3">
        <h1 className="font-serif text-3xl">Invoices</h1>
        <Button asChild>
          <Link to="/app/invoices/new">New Invoice</Link>
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <Total label="overdue" cents={overdueCents} />
        <Total label="total outstanding" cents={outstandingCents} />
        <Total label="in draft" cents={draftCents} />
      </div>
      {invoices.length === 0 ? (
        <p className="mt-8 text-sm">No Invoices yet.</p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="font-serif text-xl">Recently Updated</h2>
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {recent.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    to="/app/invoices/$invoiceId"
                    params={{ invoiceId: invoice.id }}
                    className={cn(
                      cardSurface,
                      "flex h-full flex-col overflow-hidden",
                    )}
                  >
                    <div className="flex flex-1 flex-col p-3 text-sm">
                      <p className="text-muted-foreground">
                        {invoice.numberLabel}
                      </p>
                      <p className="truncate font-medium">
                        {invoice.clientName}
                      </p>
                      <p className="text-muted-foreground">
                        {shortDate(invoice.issueDate)}
                      </p>
                      <p className="mt-4 border-t border-border pt-2 text-right font-medium">
                        {formatUsd(invoice.totalCents)}
                      </p>
                    </div>
                    <InvoiceStatusBadge
                      status={invoice.displayStatus}
                      className="w-full justify-center rounded-none py-1.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-serif text-xl">
                  {selected.length > 0
                    ? `Selected ${selected.length}`
                    : "All Invoices"}
                </h2>
                {selected.length > 0 ? (
                  <InvoiceBulkBar
                    invoices={selected}
                    onClear={() => setSelectedIds([])}
                    onMessage={setMessage}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    aria-label="Search Invoices"
                    className="w-56 pl-9"
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <select
                  aria-label="Status"
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target.value as "all" | InvoiceDisplayStatus,
                    )
                  }
                >
                  <option value="all">All statuses</option>
                  {STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {message ? <p className="mt-4 text-sm">{message}</p> : null}
            {shown.length === 0 ? (
              <p className="mt-4 text-sm">No Invoices match.</p>
            ) : (
              <div className="mt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead className="w-full">
                        Client / Invoice Number
                      </TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead
                        className="whitespace-nowrap"
                        aria-sort={
                          newestIssueFirst ? "descending" : "ascending"
                        }
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() => setNewestIssueFirst((value) => !value)}
                        >
                          Issued Date
                          {newestIssueFirst ? (
                            <ChevronDown aria-hidden className="size-4" />
                          ) : (
                            <ChevronUp aria-hidden className="size-4" />
                          )}
                        </button>
                        <span className="block font-normal text-muted-foreground">
                          Due Date
                        </span>
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-right">
                        Amount
                        <span className="block font-normal text-muted-foreground">
                          Status
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((invoice) => (
                      <InvoiceTableRow
                        key={invoice.id}
                        invoice={invoice}
                        today={data.today}
                        selected={selectedIds.includes(invoice.id)}
                        onToggle={() => toggleSelected(invoice.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <p className="font-serif text-2xl text-foreground sm:text-3xl">
        {headlineUsd(cents)}
      </p>
      <p className="text-sm font-medium text-solar-ink">{label}</p>
    </div>
  );
}

function InvoiceTableRow({
  invoice,
  today,
  selected,
  onToggle,
}: {
  invoice: InvoiceRow;
  today: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className="relative hover:bg-accent">
      <TableCell className="relative z-10 w-10">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={selected}
          aria-label={`Select ${invoice.numberLabel}`}
          onChange={onToggle}
        />
      </TableCell>
      <TableCell className="w-full">
        <Link
          to="/app/invoices/$invoiceId"
          params={{ invoiceId: invoice.id }}
          className="font-medium after:absolute after:inset-0"
        >
          {invoice.clientName}
        </Link>
        <p className="text-muted-foreground">{invoice.numberLabel}</p>
      </TableCell>
      <TableCell className="max-w-64 truncate" title={invoice.summary}>
        {invoice.summary || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <p>{shortDate(invoice.issueDate)}</p>
        <p className="text-muted-foreground">
          {dueLine(invoice.displayStatus, invoice.dueDate, today)}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        <p>{formatUsd(invoice.totalCents)}</p>
        <InvoiceStatusBadge status={invoice.displayStatus} />
      </TableCell>
    </TableRow>
  );
}

function listStatus(display: InvoiceDisplayStatus): InvoiceStatus {
  if (display === "draft" || display === "partial" || display === "void") {
    return display;
  }
  if (display === "paid" || display === "overpaid") return "paid";
  return "sent";
}

function sum(rows: InvoiceRow[], pick: (row: InvoiceRow) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function headlineUsd(value: number) {
  if (value % 100 !== 0) return formatUsd(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value) / 100}`;
}

function shortDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function dueLine(status: InvoiceDisplayStatus, dueDate: string, today: string) {
  if (status === "paid" || status === "void" || status === "overpaid") {
    return "—";
  }
  const days = calendarDays(today, dueDate);
  if (days === 0) return "Due today";
  if (days === 1) return "Due in 1 day";
  if (days === -1) return "Due 1 day ago";
  if (days > 1) return `Due in ${days} days`;
  return `Due ${-days} days ago`;
}

function calendarDays(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}
