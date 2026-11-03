import { createFileRoute } from "@tanstack/react-router";
import { formatInvoiceNumber } from "@/lib/invoice";
import { publicDocumentHeaders } from "@/server/security-headers";

export const Route = createFileRoute("/p/$token/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { openPublicInvoice } = await import("@/server/public-invoice");
        const { invoicePdfResponse, renderInvoicePdf } = await import(
          "@/lib/invoice-pdf"
        );
        const opened = await openPublicInvoice(request, params.token, {
          recordView: false,
        });
        if (opened.status === 429) {
          return new Response("Too many requests", {
            status: 429,
            headers: {
              ...publicDocumentHeaders(),
              "retry-after": String(Math.ceil(opened.retryAfterMs / 1000)),
              "content-type": "text/plain; charset=utf-8",
            },
          });
        }
        if (opened.status !== 200) {
          return new Response("Not found", {
            status: 404,
            headers: {
              ...publicDocumentHeaders(),
              "content-type": "text/plain; charset=utf-8",
            },
          });
        }
        const pdf = await renderInvoicePdf(opened.document, opened.statusValue);
        return invoicePdfResponse(
          pdf,
          `invoice-${formatInvoiceNumber(opened.document.number)}.pdf`,
          publicDocumentHeaders(),
        );
      },
    },
  },
});
