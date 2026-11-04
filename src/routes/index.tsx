import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/landing";
import { getSessionUser } from "@/server/session";

export const Route = createFileRoute("/")({
  loader: () => getSessionUser(),
  component: Home,
});

function Home() {
  const session = Route.useLoaderData();
  return <Landing signedIn={session !== null} />;
}
