import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cardList } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getItems } from "@/server/catalog";

export const Route = createFileRoute("/app/items/")({
  loader: () => getItems(),
  component: ItemsPage,
});

function ItemsPage() {
  const items = Route.useLoaderData();
  if (!items) return <p>Sign in again.</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-brass pb-3">
        <h1 className="font-serif text-3xl">Items</h1>
        <Button asChild>
          <Link to="/app/items/new">New Item</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Saved names and prices used to fill Invoice Lines.
      </p>
      {items.length === 0 ? (
        <p className="mt-6 text-sm">No Items yet.</p>
      ) : (
        <ul className={cn("mt-6", cardList)}>
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <Link
                  to="/app/items/$itemId"
                  params={{ itemId: item.id }}
                  className="font-medium text-primary underline"
                >
                  {item.name}
                </Link>
                <span className="text-sm">${item.unitPrice}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.taxRates.length === 0
                  ? "No default Tax Rates"
                  : item.taxRates
                      .map((rate) => `${rate.name} (${rate.rate}%)`)
                      .join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
