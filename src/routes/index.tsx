import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/server/session";

export const Route = createFileRoute("/")({
  loader: () => getSessionUser(),
  component: Home,
});

function Home() {
  const session = Route.useLoaderData();
  return (
    <Shell>
      <h1 className="font-serif text-4xl tracking-tight">
        Invoicer by OVRLK Labs.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Clients, invoices, expenses, and reports for your business,
        walled off so other businesses can be opened later.
      </p>
      <div className="mt-8">
        {session ? (
          <Link to="/app">
            <Button>Open {session.name}&rsquo;s Business</Button>
          </Link>
        ) : (
          <Link to="/sign-in">
            <Button>Sign in</Button>
          </Link>
        )}
      </div>
    </Shell>
  );
}
