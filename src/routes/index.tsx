import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSessionUser } from "@/server/session";

const OVERVIEW = [
  {
    title: "Clients",
    body: "People and companies this Business bills. They never sign in.",
  },
  {
    title: "Invoices",
    body: "Numbered requests for payment, opened through a private link.",
  },
  {
    title: "Expenses",
    body: "Money the Business spent, with a category and an optional receipt.",
  },
  {
    title: "Reports",
    body: "Cash-basis profit, outstanding balances, and who has paid.",
  },
] as const;

export const Route = createFileRoute("/")({
  loader: () => getSessionUser(),
  component: Home,
});

function Home() {
  const session = Route.useLoaderData();
  return (
    <Shell size="landing">
      <h1 className="font-serif text-4xl tracking-tight">
        Invoicer by OVRLK Labs.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Clients, invoices, expenses, and reports for your business, walled off
        so other businesses can be opened later.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {OVERVIEW.map((block) => (
          <Card key={block.title} className="p-4">
            <h2 className="font-serif text-xl text-primary">{block.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{block.body}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8">
        {session ? (
          <Link to="/app">
            <Button>Open the Business</Button>
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
