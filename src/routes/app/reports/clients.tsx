import { createFileRoute } from "@tanstack/react-router";
import { ReportChrome, RevenueTable } from "@/components/reports";
import { reportSearch } from "@/lib/reports";
import { getRevenueReport } from "@/server/reports";

export const Route = createFileRoute("/app/reports/clients")({
  validateSearch: reportSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getRevenueReport({ data: deps }),
  component: RevenuePage,
});

function RevenuePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  if (!data) return <p>Sign in again.</p>;
  return (
    <ReportChrome
      title="Revenue by client"
      search={search}
      showBasis
      definition={data.ok ? data.report.definition : null}
      note={data.ok ? data.report.note : null}
      range={data.ok ? { from: data.report.from, to: data.report.to } : null}
      csv={data.ok ? data.csv : null}
      filename={data.ok ? data.filename : null}
      error={data.ok ? null : data.message}
    >
      {data.ok ? <RevenueTable {...data.report} /> : null}
    </ReportChrome>
  );
}
