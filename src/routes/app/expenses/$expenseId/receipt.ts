import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/expenses/$expenseId/receipt")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { signedInBusiness } = await import("@/server/membership");
        const { saveReceipt } = await import("@/server/files");
        const current = await signedInBusiness();
        if (!current) {
          return Response.json(
            { ok: false, message: "Sign in again." },
            { status: 401 },
          );
        }
        const form = await request.formData();
        const file = form.get("receipt");
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
          await saveReceipt(
            current.businessId,
            params.expenseId,
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
