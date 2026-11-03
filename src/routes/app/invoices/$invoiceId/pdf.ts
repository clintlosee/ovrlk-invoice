import { createFileRoute } from "@tanstack/react-router";
import { formatInvoiceNumber } from "@/lib/invoice";

export const Route = createFileRoute("/app/invoices/$invoiceId/pdf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { ownedInvoiceForPdf } = await import("@/server/public-invoice");
        const { invoicePdfResponse, renderInvoicePdf } = await import(
          "@/lib/invoice-pdf"
        );
        const found = await ownedInvoiceForPdf(params.invoiceId);
        if (found.status === 401) {
          return new Response("Sign in", {
            status: 401,
            headers: { "cache-control": "no-store" },
          });
        }
        if (found.status === 404) {
          return new Response("Not found", {
            status: 404,
            headers: { "cache-control": "no-store" },
          });
        }
        const { readLogo } = await import("@/server/files");
        const { signedInBusiness } = await import("@/server/membership");
        const current = await signedInBusiness();
        const logo = current ? await readLogo(current.businessId) : null;
        const pdf = await renderInvoicePdf(
          found.view.document,
          found.view.status,
          logo?.body ?? null,
        );
        return invoicePdfResponse(
          pdf,
          `invoice-${formatInvoiceNumber(found.view.number)}.pdf`,
        );
      },
    },
  },
});
