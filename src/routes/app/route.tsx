import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
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
    const pathname = useRouterState({
      select: (state) => state.location.pathname,
    });
    const broad = pathname === "/app" || pathname.startsWith("/app/reports");
    return (
      <Shell wide broad={broad} themeToggle>
        <AppNav />
        <Outlet />
      </Shell>
    );
  },
});
