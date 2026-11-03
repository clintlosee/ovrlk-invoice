import { createFileRoute, notFound } from "@tanstack/react-router";
import { InvoiceDocument } from "@/components/invoice-document";
import { Shell } from "@/components/shell";
import { loadPublicInvoice } from "@/server/public-page";

export const Route = createFileRoute("/p/$token/")({
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
  const result = Route.useLoaderData();
  return (
    <Shell>
      {result.status === 429 ? (
        <p>Too many requests. Wait a moment and try again.</p>
      ) : null}
      {result.status === 200 ? (
        <>
          <InvoiceDocument
            document={result.document}
            displayStatus={result.displayStatus}
            voidReason={result.voidReason}
            amountDueCents={result.amountDueCents}
          />
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
