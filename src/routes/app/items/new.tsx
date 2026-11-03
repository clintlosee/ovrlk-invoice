import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ItemForm, type ItemFormValues } from "@/components/item-form";
import { Card } from "@/components/ui/card";
import { createItem, getTaxRates } from "@/server/catalog";

export const Route = createFileRoute("/app/items/new")({
  loader: () => getTaxRates(),
  component: NewItemPage,
});

function NewItemPage() {
  const taxRates = Route.useLoaderData() ?? [];
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(values: ItemFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await createItem({ data: values });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      await navigate({ to: "/app/items" });
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <>
      <Link to="/app/items" className="text-sm text-primary underline">
        Items
      </Link>
      <h1 className="mt-3 border-b-2 border-brass pb-3 font-serif text-3xl">
        New Item
      </h1>
      <Card>
        <ItemForm
          initial={{ name: "", description: "", unitPrice: "", taxRateIds: [] }}
          taxRates={taxRates}
          pending={pending}
          message={message}
          submitLabel="Save Item"
          onSubmit={(values) => void onSubmit(values)}
        />
      </Card>
    </>
  );
}
