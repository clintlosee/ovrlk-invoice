import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppNav, Shell } from "@/components/shell";
import { getSessionUser } from "@/server/session";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSessionUser();
    if (!session) throw redirect({ to: "/sign-in" });
    return { session };
  },
  headers: () => ({ "cache-control": "no-store" }),
  component: function AppLayout() {
    return (
      <Shell wide>
        <AppNav />
        <Outlet />
      </Shell>
    );
  },
});
