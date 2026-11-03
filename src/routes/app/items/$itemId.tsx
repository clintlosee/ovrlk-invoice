import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { ItemForm, type ItemFormValues } from "@/components/item-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteItem, getItem, getTaxRates, updateItem } from "@/server/catalog";

export const Route = createFileRoute("/app/items/$itemId")({
  loader: async ({ params }) => {
    const [item, taxRates] = await Promise.all([
      getItem({ data: { id: params.itemId } }),
      getTaxRates(),
    ]);
    return { item, taxRates: taxRates ?? [] };
  },
  component: EditItemPage,
});

function EditItemPage() {
  const { item, taxRates } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!item) return <p>That Item does not exist.</p>;

  async function onSubmit(values: ItemFormValues) {
    if (!item) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateItem({ data: { id: item.id, ...values } });
      setPending(false);
      setMessage(result.ok ? "Saved." : result.message);
      if (result.ok) await router.invalidate();
    } catch {
      setPending(false);
      setMessage("Could not save. Try again.");
    }
  }

  async function onDelete() {
    if (!item) return;
    if (!window.confirm("Delete this Item?")) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await deleteItem({ data: { id: item.id } });
      if (!result.ok) {
        setPending(false);
        setMessage(result.message);
        return;
      }
      await navigate({ to: "/app/items" });
    } catch {
      setPending(false);
      setMessage("Could not delete this Item. Try again.");
    }
  }

  return (
    <>
      <Link to="/app/items" className="text-sm underline">
        Items
      </Link>
      <h1 className="mt-3 font-serif text-3xl">{item.name}</h1>
      <Card>
        <ItemForm
          key={item.id}
          initial={{
            name: item.name,
            description: item.description,
            unitPrice: item.unitPrice,
            taxRateIds: item.taxRateIds,
          }}
          taxRates={taxRates}
          pending={pending}
          message={message}
          submitLabel="Save Item"
          onSubmit={(values) => void onSubmit(values)}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={pending}
          onClick={() => void onDelete()}
        >
          Delete
        </Button>
      </Card>
    </>
  );
}
