import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const MEASURE = {
  narrow: "max-w-lg",
  wide: "max-w-2xl",
  landing: "max-w-3xl",
} as const;

export function Shell({
  children,
  size = "narrow",
  themeToggle = false,
}: {
  children: ReactNode;
  size?: keyof typeof MEASURE;
  themeToggle?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen flex-col px-6 py-10",
        MEASURE[size],
      )}
    >
      <header className="mb-10 flex items-center justify-between gap-4 border-b-2 border-solar pb-4">
        <Link to="/" className="font-serif text-lg tracking-tight">
          ovrlk-invoice
        </Link>
        {themeToggle ? <ThemeToggle /> : null}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 flex gap-4 text-sm text-muted-foreground">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}

export function DraftNotice() {
  return (
    <p
      className="mb-6 rounded-md border border-destructive/30 bg-card px-3 py-2 text-sm text-destructive"
      role="note"
    >
      Draft — pending lawyer review. This is not legal advice and is not in
      effect.
    </p>
  );
}
