import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cardList } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getClients } from "@/server/catalog";

export const Route = createFileRoute("/app/clients/")({
  loader: () => getClients(),
  component: ClientsPage,
});

function ClientsPage() {
  const clients = Route.useLoaderData();
  if (!clients) return <p>Sign in again.</p>;
  const active = clients.filter((client) => !client.archived);
  const archived = clients.filter((client) => client.archived);

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-brass pb-3">
        <h1 className="font-serif text-3xl">Clients</h1>
        <Button asChild>
          <Link to="/app/clients/new">New Client</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Who this Business bills. Clients never sign in.
      </p>
      <ClientList clients={active} empty="No Clients yet." />
      {archived.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-medium text-brass-ink">Archived</h2>
          <ClientList clients={archived} empty="" />
        </section>
      ) : null}
    </>
  );
}

function ClientList({
  clients,
  empty,
}: {
  clients: {
    id: string;
    name: string;
    email: string;
    taxExempt: boolean;
  }[];
  empty: string;
}) {
  if (clients.length === 0) return <p className="mt-6 text-sm">{empty}</p>;
  return (
    <ul className={cn("mt-6", cardList)}>
      {clients.map((client) => (
        <li key={client.id} className="px-4 py-3">
          <Link
            to="/app/clients/$clientId"
            params={{ clientId: client.id }}
            className="font-medium text-primary underline"
          >
            {client.name}
          </Link>
          <p className="text-sm text-muted-foreground">
            {client.email}
            {client.taxExempt ? " · Tax-exempt" : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
