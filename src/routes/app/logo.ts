import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/logo")({
  server: {
    handlers: {
      GET: async () => {
        const { signedInBusiness } = await import("@/server/membership");
        const { readLogo } = await import("@/server/files");
        const current = await signedInBusiness();
        if (!current) {
          return new Response("Sign in", {
            status: 401,
            headers: { "cache-control": "private, no-store" },
          });
        }
        const logo = await readLogo(current.businessId);
        if (!logo) {
          return new Response("Not found", {
            status: 404,
            headers: { "cache-control": "private, no-store" },
          });
        }
        return new Response(Buffer.from(logo.body), {
          headers: {
            "content-type": logo.contentType,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
      POST: async ({ request }) => {
        const { signedInBusiness } = await import("@/server/membership");
        const { saveLogo } = await import("@/server/files");
        const current = await signedInBusiness();
        if (!current) {
          return Response.json(
            { ok: false, message: "Sign in again." },
            { status: 401 },
          );
        }
        const form = await request.formData();
        const file = form.get("logo");
        if (!(file instanceof File)) {
          return Response.json(
            { ok: false, message: "Choose a file." },
            { status: 400 },
          );
        }
        if (file.size > 10 * 1024 * 1024) {
          return Response.json(
            { ok: false, message: "File must be 10 MB or smaller." },
            { status: 400 },
          );
        }
        try {
          await saveLogo(
            current.businessId,
            new Uint8Array(await file.arrayBuffer()),
            file.type,
          );
          return Response.json({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          return Response.json(
            {
              ok: false,
              message: message
                ? message.endsWith(".")
                  ? message
                  : `${message}.`
                : "Could not upload.",
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
