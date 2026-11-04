import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { landingCopy } from "@/components/landing";

export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative flex min-h-80 items-end overflow-hidden bg-primary text-primary-foreground lg:min-h-screen">
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 800 1000"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <circle cx="90" cy="150" r="430" className="fill-primary-hover" />
          <circle cx="80" cy="760" r="390" className="fill-foreground/25" />
          <ellipse
            cx="690"
            cy="540"
            rx="310"
            ry="190"
            className="fill-brass/40"
          />
          <path
            d="M460 -80 L920 240 L920 -80 Z"
            className="fill-primary-foreground/15"
          />
        </svg>
        <div className="relative z-10 px-8 pt-16 pb-10 lg:px-12 lg:pb-12">
          <Link to="/" className="mb-4 flex items-center gap-2.5 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-brass font-serif text-xl leading-none text-brass-foreground">
              I
            </span>
            {landingCopy.product}
          </Link>
          <p className="font-serif text-5xl tracking-tight sm:text-6xl">
            {landingCopy.signInArt.split(", ")[0]},
            <br />
            {landingCopy.signInArt.split(", ")[1]}
          </p>
        </div>
      </div>
      <div className="flex items-center px-6 py-14 lg:px-14">
        <div className="w-full max-w-sm">
          {children}
          <p className="mt-10 flex gap-4 text-sm text-muted-foreground">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
