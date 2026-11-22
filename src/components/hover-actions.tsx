import type { ReactNode } from "react";

export function HoverActions({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-1/2 right-2 z-10 flex -translate-y-1/2 rounded-md border border-border bg-card opacity-0 shadow-card group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
      {children}
    </div>
  );
}

export function HoverAction({
  label,
  ariaLabel = label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="group/tip relative inline-flex size-8 items-center justify-center text-muted-foreground first:rounded-l-md last:rounded-r-md hover:bg-primary hover:text-primary-foreground focus-visible:z-20 focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-card group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}
