import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStripeWebhook } = await import("@/server/stripe");
        return handleStripeWebhook(request);
      },
    },
  },
});
