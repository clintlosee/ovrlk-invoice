import { createFileRoute, notFound } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { StyleguideSamples } from "@/components/styleguide";
import { isProduction } from "@/lib/config";

export const Route = createFileRoute("/dev/styleguide")({
  beforeLoad: () => {
    if (isProduction()) throw notFound();
  },
  component: StyleguidePage,
});

function StyleguidePage() {
  return (
    <Shell wide themeToggle>
      <h1 className="font-serif text-3xl">Styleguide</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Dev only. Tokens, components, and status badges in both modes.
      </p>
      <StyleguideSamples />
    </Shell>
  );
}
