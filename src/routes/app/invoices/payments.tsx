import { createFileRoute } from "@tanstack/react-router";
import { AddPayments } from "@/components/add-payments";
import { todayInTimeZone } from "@/lib/invoice";
import { paymentFormRows } from "@/lib/invoice-bulk";
import { getPaymentInvoices } from "@/server/payments";

export const Route = createFileRoute("/app/invoices/payments")({
  validateSearch: (search: Record<string, unknown>): { ids: string } => ({
    ids: typeof search.ids === "string" ? search.ids : "",
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const data = await getPaymentInvoices({ data: { ids: deps.ids } });
    if (!data) return null;
    return paymentFormRows(data.invoices, todayInTimeZone(data.timeZone));
  },
  component: PaymentsPage,
});

function PaymentsPage() {
  const data = Route.useLoaderData();
  if (!data) return <p>Sign in again.</p>;
  return <AddPayments groups={data.groups} rejected={data.rejected} />;
}
