import { createFileRoute, notFound } from "@tanstack/react-router";
import { InvoiceDocument } from "@/components/invoice-document";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { paymentMethodLabel } from "@/lib/invoice";
import { formatUsd } from "@/lib/money";
import { loadPublicInvoice } from "@/server/public-page";

export const Route = createFileRoute("/p/$token/")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout:
      search.checkout === "success" || search.checkout === "cancel"
        ? search.checkout
        : undefined,
  }),
  loader: async ({ params }) => {
    const result = await loadPublicInvoice({ data: { token: params.token } });
    if (result.status === 404) throw notFound();
    return result;
  },
  notFoundComponent: () => (
    <Shell>
      <p>This Invoice Link is not valid.</p>
    </Shell>
  ),
  head: () => ({
    meta: [
      { title: "Invoice" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  headers: () => ({
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
  }),
  component: PublicInvoicePage,
});

function PublicInvoicePage() {
  const { token } = Route.useParams();
  const { checkout } = Route.useSearch();
  const result = Route.useLoaderData();
  return (
    <Shell>
      {result.status === 429 ? (
        <p>Too many requests. Wait a moment and try again.</p>
      ) : null}
      {result.status === 200 ? (
        <>
          {checkout === "success" ? (
            <p className="mb-4 text-sm">
              Stripe has not confirmed this payment yet. The balance updates
              when the confirmation arrives.
            </p>
          ) : null}
          {checkout === "cancel" ? (
            <p className="mb-4 text-sm">
              Payment canceled. Nothing was recorded.
            </p>
          ) : null}
          <InvoiceDocument
            document={result.document}
            displayStatus={result.displayStatus}
            voidReason={result.voidReason}
            amountDueCents={result.amountDueCents}
            paidCents={result.paidCents}
          />
          {result.payments.length > 0 ? (
            <section className="mt-4">
              <h2 className="text-sm font-medium">Payments</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {result.payments.map((item) => (
                  <li key={item.id}>
                    {item.paidOn} · {paymentMethodLabel(item.method)} ·{" "}
                    {formatUsd(item.amountCents)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {result.canPay ? (
            <form className="mt-4" method="post" action={`/p/${token}/pay`}>
              <Button type="submit">
                Pay {formatUsd(result.amountDueCents)}
              </Button>
            </form>
          ) : null}
          <p className="mt-4">
            <a className="text-sm underline" href={`/p/${token}/pdf`}>
              Download PDF
            </a>
          </p>
        </>
      ) : null}
    </Shell>
  );
}
