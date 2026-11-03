import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/stripe/oauth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishStripeOAuth } = await import("@/server/stripe");
        return finishStripeOAuth(request);
      },
    },
  },
});
