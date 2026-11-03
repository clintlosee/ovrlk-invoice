import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getTaxRates } from "@/server/catalog";

export const Route = createFileRoute("/app/tax-rates/")({
  loader: () => getTaxRates(),
  component: TaxRatesPage,
});

function TaxRatesPage() {
  const taxRates = Route.useLoaderData();
  if (!taxRates) return <p>Sign in again.</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-brass pb-3">
        <h1 className="font-serif text-3xl">Tax Rates</h1>
        <Button asChild>
          <Link to="/app/tax-rates/new">New Tax Rate</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Named percentages applied to Invoice Lines.
      </p>
      {taxRates.length === 0 ? (
        <p className="mt-6 text-sm">No Tax Rates yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border border-t-[6px] border-t-brass bg-card">
          {taxRates.map((rate) => (
            <li
              key={rate.id}
              className="flex items-baseline justify-between gap-4 px-4 py-3"
            >
              <Link
                to="/app/tax-rates/$taxRateId"
                params={{ taxRateId: rate.id }}
                className="font-medium text-primary underline"
              >
                {rate.name}
              </Link>
              <span className="text-sm text-muted-foreground">
                {rate.rate}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
