import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Paper panel. The lift is the shadow; do not add a colored top edge. */
export const cardSurface =
  "rounded-lg border border-card-line bg-card text-card-foreground shadow-card";

export const cardList = cn(
  cardSurface,
  "divide-y divide-border overflow-hidden",
);

export const cardLift =
  "transition-transform duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transform-none";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardSurface, "p-6", className)} {...props} />;
}
