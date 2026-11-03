import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/items")({
  component: () => <Outlet />,
});
