import { createFileRoute, Link } from "@tanstack/react-router";
import { MonthBars } from "@/components/reports";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { formatUsd } from "@/lib/money";
import type { ReportPreset, ReportQuery } from "@/lib/reports";
import { getDashboard } from "@/server/reports";

export const Route = createFileRoute("/app/")({
  loader: () => getDashboard(),
  component: AppHome,
});

function reportSearch(preset: ReportPreset): ReportQuery {
  return { preset, basis: "cash", from: "", to: "" };
}

function AppHome() {
  const home = Route.useLoaderData();
  if (!home) return <p>This account is not an Owner of a Business.</p>;
  const nudge = !home.totpEnabled || home.passkeyCount === 0;
  const overdueLabel = home.overdueCount === 1 ? "Invoice" : "Invoices";
  return (
    <>
      <h1 className="font-serif text-3xl">{home.businessName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cash basis · {home.currency} · {home.timeZone}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Today is {home.today}.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm text-muted-foreground">Outstanding</h2>
          <p className="mt-2 font-serif text-2xl">
            {formatUsd(home.outstandingCents)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Unpaid balance on Sent Invoices. Credit from an overpayment is not
            subtracted.
          </p>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm text-muted-foreground">Overdue</h2>
          <p className="mt-2 font-serif text-2xl">
            {formatUsd(home.overdueCents)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {home.overdueCount} {overdueLabel} past the due date, including
            Partially Paid.
          </p>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm text-muted-foreground">Paid</h2>
          <p className="mt-2 font-serif text-2xl">
            {formatUsd(home.paidThisMonthCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            <Link
              to="/app/reports"
              search={reportSearch("this_month")}
              className="underline"
            >
              This month
            </Link>{" "}
            · {home.thisMonth.from} – {home.thisMonth.to}
          </p>
          <p className="mt-3 font-serif text-xl">
            {formatUsd(home.paidYearToDateCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            <Link
              to="/app/reports"
              search={reportSearch("year_to_date")}
              className="underline"
            >
              Year to date
            </Link>{" "}
            · {home.yearToDate.from} – {home.yearToDate.to}
          </p>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm text-muted-foreground">Expenses</h2>
          <p className="mt-2 font-serif text-2xl">
            {formatUsd(home.expensesThisMonthCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            <Link
              to="/app/reports/expenses"
              search={reportSearch("this_month")}
              className="underline"
            >
              This month
            </Link>{" "}
            · includes Cost of Goods Sold
          </p>
          <p className="mt-3 font-serif text-xl">
            {formatUsd(home.expensesYearToDateCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            <Link
              to="/app/reports/expenses"
              search={reportSearch("year_to_date")}
              className="underline"
            >
              Year to date
            </Link>
          </p>
        </Card>
        <Card className="p-4 sm:col-span-2">
          <h2 className="text-sm text-muted-foreground">
            Net profit, year to date
          </h2>
          <p className="mt-2 font-serif text-2xl">
            {formatUsd(home.netProfitYearToDateCents)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cash basis: Payments minus Expenses, including Cost of Goods Sold
            and Merchant fees.{" "}
            <Link
              to="/app/reports"
              search={reportSearch("year_to_date")}
              className="underline"
            >
              Profit and Loss
            </Link>
          </p>
        </Card>
      </div>
      <MonthBars months={home.months} />
      <section className="mt-10">
        <h2 className="font-serif text-xl">Recent Invoices</h2>
        {home.recentInvoices.length === 0 ? (
          <p className="mt-3 text-sm">No Invoices yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {home.recentInvoices.map((invoice) => (
              <li key={invoice.id} className="px-4 py-3">
                <Link
                  to="/app/invoices/$invoiceId"
                  params={{ invoiceId: invoice.id }}
                  className="font-medium underline"
                >
                  {invoice.numberLabel} · {invoice.clientName}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {invoice.statusLabel} · Due {invoice.dueDate} ·{" "}
                  {formatUsd(invoice.totalCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="font-serif text-xl">Recent Payments</h2>
        {home.recentPayments.length === 0 ? (
          <p className="mt-3 text-sm">No Payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {home.recentPayments.map((payment) => (
              <li key={payment.id} className="px-4 py-3">
                <Link
                  to="/app/invoices/$invoiceId"
                  params={{ invoiceId: payment.invoiceId }}
                  className="font-medium underline"
                >
                  {payment.numberLabel} · {payment.clientName}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {payment.paidOn} · {formatUsd(payment.netCents)}
                  {payment.refundedCents > 0
                    ? ` · refunded ${formatUsd(payment.refundedCents)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {nudge ? (
        <Card className="mt-8">
          <p>
            Email codes are already required. An authenticator app or a passkey
            is optional, and worth adding when you have a minute.
          </p>
          <Link
            to="/app/security"
            className="mt-3 inline-block text-sm underline"
          >
            Security settings
          </Link>
        </Card>
      ) : (
        <p className="mt-8 text-sm">
          <Link to="/app/security" className="underline">
            Security settings
          </Link>
        </p>
      )}
      <button
        type="button"
        className="mt-6 text-sm underline"
        onClick={() => {
          void authClient.signOut().then(() => {
            window.location.href = "/";
          });
        }}
      >
        Sign out
      </button>
    </>
  );
}
