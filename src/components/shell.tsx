import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppNav() {
  return (
    <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <Link to="/app" className="underline">
        Home
      </Link>
      <Link to="/app/invoices" className="underline">
        Invoices
      </Link>
      <Link
        to="/app/expenses"
        search={{ from: "", to: "", category: "" }}
        className="underline"
      >
        Expenses
      </Link>
      <Link
        to="/app/reports"
        search={{ preset: "this_month", basis: "cash", from: "", to: "" }}
        className="underline"
      >
        Reports
      </Link>
      <Link to="/app/clients" className="underline">
        Clients
      </Link>
      <Link to="/app/items" className="underline">
        Items
      </Link>
      <Link to="/app/tax-rates" className="underline">
        Tax Rates
      </Link>
      <Link
        to="/app/settings"
        search={{ stripe: undefined }}
        className="underline"
      >
        Business
      </Link>
      <Link to="/app/security" className="underline">
        Security
      </Link>
    </nav>
  );
}

export function Shell({
  children,
  wide = false,
  broad = false,
}: {
  children: ReactNode;
  wide?: boolean;
  broad?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen flex-col px-6 py-10",
        broad ? "max-w-5xl" : wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      <header className="mb-10">
        <Link to="/" className="font-serif text-lg tracking-tight">
          ovrlk-invoice
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 flex gap-4 text-sm text-muted">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}

export function DraftNotice() {
  return (
    <p
      className="mb-6 rounded-md border border-danger/30 bg-card px-3 py-2 text-sm text-danger"
      role="note"
    >
      Draft — pending lawyer review. This is not legal advice and is not in
      effect.
    </p>
  );
}
