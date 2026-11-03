import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/stripe/refresh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { signedStripeRedirect } = await import("@/server/stripe");
        return signedStripeRedirect("refresh", request);
      },
    },
  },
});
