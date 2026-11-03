import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  TaxRateForm,
  type TaxRateFormValues,
} from "@/components/tax-rate-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteTaxRate, getTaxRate, updateTaxRate } from "@/server/catalog";

export const Route = createFileRoute("/app/tax-rates/$taxRateId")({
  loader: ({ params }) => getTaxRate({ data: { id: params.taxRateId } }),
  component: EditTaxRatePage,
});

function EditTaxRatePage() {
  const taxRate = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!taxRate) return <p>That Tax Rate does not exist.</p>;

  async function onSubmit(values: TaxRateFormValues) {
    if (!taxRate) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateTaxRate({
        data: { id: taxRate.id, ...values },
      });
      setPending(false);
      setMessage(result.ok ? "Saved." : result.message);
      if (result.ok) await router.invalidate();
    } catch {
      setPending(false);
      setMessage("Could not save. Try again.");
    }
  }

  async function onDelete() {
    if (!taxRate) return;
    if (!window.confirm("Delete this Tax Rate?")) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await deleteTaxRate({ data: { id: taxRate.id } });
      if (!result.ok) {
        setPending(false);
        setMessage(result.message);
        return;
      }
      await navigate({ to: "/app/tax-rates" });
    } catch {
      setPending(false);
      setMessage("Could not delete this Tax Rate. Try again.");
    }
  }

  return (
    <>
      <Link to="/app/tax-rates" className="text-sm underline">
        Tax Rates
      </Link>
      <h1 className="mt-3 font-serif text-3xl">{taxRate.name}</h1>
      <Card>
        <TaxRateForm
          key={taxRate.id}
          initial={{ name: taxRate.name, rate: taxRate.rate }}
          pending={pending}
          message={message}
          submitLabel="Save Tax Rate"
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
