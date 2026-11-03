import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-10">
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
