import { createFileRoute } from "@tanstack/react-router";
import { publicDocumentHeaders } from "@/server/security-headers";

export const Route = createFileRoute("/p/$token/logo")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { readPublicLogo } = await import("@/server/files");
        const logo = await readPublicLogo(params.token);
        if (!logo) {
          return new Response("Not found", {
            status: 404,
            headers: {
              ...publicDocumentHeaders(),
              "content-type": "text/plain; charset=utf-8",
            },
          });
        }
        return new Response(Buffer.from(logo.body), {
          headers: {
            ...publicDocumentHeaders(),
            "content-type": logo.contentType,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
