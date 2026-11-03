import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$token/pay")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { startPublicCheckout } = await import("@/server/stripe");
        return startPublicCheckout(request, params.token);
      },
    },
  },
});
