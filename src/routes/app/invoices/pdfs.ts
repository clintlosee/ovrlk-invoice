import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/invoices/pdfs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { ownedInvoiceForPdf } = await import("@/server/public-invoice");
        const { renderInvoicePdf } = await import("@/lib/invoice-pdf");
        const { zipStored } = await import("@/lib/zip");
        const { signedInBusiness } = await import("@/server/membership");
        const current = await signedInBusiness();
        if (!current) {
          return new Response("Sign in", {
            status: 401,
            headers: { "cache-control": "no-store" },
          });
        }
        const ids = new URL(request.url).searchParams
          .getAll("ids")
          .flatMap((value) => value.split(","))
          .map((id) => id.trim())
          .filter(Boolean);
        if (ids.length === 0) {
          return new Response("Select invoices", {
            status: 400,
            headers: { "cache-control": "no-store" },
          });
        }
        const { readLogo } = await import("@/server/files");
        const logo = await readLogo(current.businessId);
        const files: { name: string; data: Uint8Array }[] = [];
        const seen = new Set<string>();
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const found = await ownedInvoiceForPdf(id);
          if (found.status === 401) {
            return new Response("Sign in", {
              status: 401,
              headers: { "cache-control": "no-store" },
            });
          }
          if (found.status !== 200) continue;
          const pdf = await renderInvoicePdf(
            found.view.document,
            found.view.status,
            logo?.body ?? null,
          );
          files.push({
            name: `invoice-${found.view.numberLabel}.pdf`,
            data: pdf,
          });
        }
        const zip = zipStored(files);
        return new Response(Buffer.from(zip), {
          headers: {
            "content-type": "application/zip",
            "content-disposition": 'attachment; filename="invoices.zip"',
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});
