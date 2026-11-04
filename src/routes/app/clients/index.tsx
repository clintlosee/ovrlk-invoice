import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cardSurface } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ClientListRow,
  clientMark,
  filterClientRows,
} from "@/lib/client-list";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getClientList } from "@/server/catalog";

export const Route = createFileRoute("/app/clients/")({
  loader: () => getClientList(),
  component: ClientsPage,
});

function ClientsPage() {
  const data = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  if (!data) return <p>Sign in again.</p>;

  const shown = filterClientRows(data.rows, query);
  const archived = filterClientRows(data.archived, query);
  const shownOutstanding = shown.reduce(
    (total, row) => total + row.outstandingCents,
    0,
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-brass pb-3">
        <h1 className="font-serif text-3xl">Clients</h1>
        <Button asChild>
          <Link to="/app/clients/new">New Client</Link>
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4 text-center">
        <Total label="overdue" cents={data.overdueCents} />
        <Total label="total outstanding" cents={data.outstandingCents} />
        <Total label="in draft" cents={data.draftCents} />
      </div>
      {data.recent.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-serif text-xl">Recently Active</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.recent.map((client) => (
              <li key={client.id} className="min-w-0">
                <Link
                  to="/app/clients/$clientId"
                  params={{ clientId: client.id }}
                  className={cn(cardSurface, "block h-full min-w-0 p-4")}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass text-xs font-medium text-brass-ink">
                      {clientMark(client.name)}
                    </span>
                    <span className="truncate font-medium">{client.name}</span>
                  </div>
                  <p className="mt-3 w-full truncate text-sm text-muted-foreground">
                    {client.email}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">All Clients</h2>
          {data.rows.length > 0 || data.archived.length > 0 ? (
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search Clients"
                className="w-56 pl-9"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          ) : null}
        </div>
        {data.rows.length === 0 && data.archived.length === 0 ? (
          <p className="mt-4 text-sm">No Clients yet.</p>
        ) : data.rows.length === 0 ? null : shown.length === 0 ? (
          <p className="mt-4 text-sm">No Clients match.</p>
        ) : (
          <ClientTable rows={shown} totalCents={shownOutstanding} />
        )}
        {data.archived.length > 0 ? (
          <div className="mt-4">
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => setShowArchived((open) => !open)}
            >
              {showArchived ? "Hide archived Clients" : "View archived Clients"}
            </button>
            {showArchived ? (
              archived.length === 0 ? (
                <p className="mt-4 text-sm">No Clients match.</p>
              ) : (
                <div className="mt-3">
                  <ClientTable rows={archived} />
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

function ClientTable({
  rows,
  totalCents,
}: {
  rows: ClientListRow[];
  totalCents?: number;
}) {
  return (
    <div className="mt-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Tax-exempt</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="text-right">Total Outstanding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((client) => (
            <TableRow key={client.id} className="relative hover:bg-accent">
              <TableCell>
                <Link
                  to="/app/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="font-medium after:absolute after:inset-0"
                >
                  {client.name}
                </Link>
                <p className="truncate text-muted-foreground">{client.email}</p>
              </TableCell>
              <TableCell>{client.taxExempt ? "Tax-exempt" : "—"}</TableCell>
              <TableCell className="max-w-64 truncate" title={client.note}>
                {client.note || "—"}
              </TableCell>
              <TableCell className="text-right">
                {formatUsd(client.outstandingCents)}
              </TableCell>
            </TableRow>
          ))}
          {totalCents === undefined ? null : (
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableCell colSpan={3} className="text-right font-medium">
                Total Outstanding
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatUsd(totalCents)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <p className="font-serif text-2xl text-foreground sm:text-3xl">
        {headlineUsd(cents)}
      </p>
      <p className="text-sm font-medium text-brass-ink">{label}</p>
    </div>
  );
}

function headlineUsd(value: number) {
  if (value % 100 !== 0) return formatUsd(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value) / 100}`;
}
