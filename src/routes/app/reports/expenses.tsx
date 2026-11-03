import { createFileRoute } from "@tanstack/react-router";
import { ExpenseTable, ReportChrome } from "@/components/reports";
import {
  EXPENSE_REPORT_TEXT,
  reportSearch,
  TAX_PAID_TEXT,
} from "@/lib/reports";
import { getExpenseReport } from "@/server/reports";

export const Route = createFileRoute("/app/reports/expenses")({
  validateSearch: reportSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getExpenseReport({ data: deps }),
  component: ExpenseReportPage,
});

function ExpenseReportPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  if (!data) return <p>Sign in again.</p>;
  return (
    <ReportChrome
      title="Expenses by category"
      search={search}
      showBasis={false}
      definition={data.ok ? EXPENSE_REPORT_TEXT : null}
      note={data.ok ? TAX_PAID_TEXT : null}
      range={data.ok ? { from: data.report.from, to: data.report.to } : null}
      csv={data.ok ? data.csv : null}
      filename={data.ok ? data.filename : null}
      error={data.ok ? null : data.message}
    >
      {data.ok ? <ExpenseTable {...data.report} /> : null}
    </ReportChrome>
  );
}
