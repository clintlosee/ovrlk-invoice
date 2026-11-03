import { createFileRoute } from "@tanstack/react-router";
import { ProfitTable, ReportChrome } from "@/components/reports";
import { reportSearch, TAX_PAID_TEXT } from "@/lib/reports";
import { getProfitAndLoss } from "@/server/reports";

export const Route = createFileRoute("/app/reports/")({
  validateSearch: reportSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getProfitAndLoss({ data: deps }),
  component: ProfitAndLossPage,
});

function ProfitAndLossPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  if (!data) return <p>Sign in again.</p>;
  return (
    <ReportChrome
      title="Profit and Loss"
      search={search}
      showBasis
      definition={data.ok ? data.report.definition : null}
      note={data.ok ? TAX_PAID_TEXT : null}
      range={data.ok ? { from: data.report.from, to: data.report.to } : null}
      csv={data.ok ? data.csv : null}
      filename={data.ok ? data.filename : null}
      error={data.ok ? null : data.message}
    >
      {data.ok ? <ProfitTable report={data.report} /> : null}
    </ReportChrome>
  );
}
