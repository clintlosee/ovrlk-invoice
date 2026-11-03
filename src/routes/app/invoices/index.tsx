import { createFileRoute, Link } from "@tanstack/react-router";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { getInvoices } from "@/server/invoices";

export const Route = createFileRoute("/app/invoices/")({
  loader: () => getInvoices(),
  component: InvoicesPage,
});

function InvoicesPage() {
  const invoices = Route.useLoaderData();
  if (!invoices) return <p>Sign in again.</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl">Invoices</h1>
        <Button asChild>
          <Link to="/app/invoices/new">New Invoice</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        A sent Invoice is locked. Overdue is calculated from the due date.
      </p>
      {invoices.length === 0 ? (
        <p className="mt-6 text-sm">No Invoices yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="px-4 py-3">
              <Link
                to="/app/invoices/$invoiceId"
                params={{ invoiceId: invoice.id }}
                className="font-medium underline"
              >
                {invoice.numberLabel} · {invoice.clientName}
              </Link>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <InvoiceStatusBadge status={invoice.displayStatus} />
                <span>
                  Due {invoice.dueDate} · {formatUsd(invoice.totalCents)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
