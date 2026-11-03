import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { getShellBusiness } from "@/server/business";
import { getSessionUser } from "@/server/session";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSessionUser();
    if (!session) throw redirect({ to: "/sign-in" });
    return { session };
  },
  loader: () => getShellBusiness(),
  headers: () => ({ "cache-control": "no-store" }),
  component: function AppLayout() {
    const business = Route.useLoaderData();
    return (
      <AppShell businessName={business?.name ?? null}>
        <Outlet />
      </AppShell>
    );
  },
});
