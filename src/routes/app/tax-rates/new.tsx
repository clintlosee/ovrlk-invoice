import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  TaxRateForm,
  type TaxRateFormValues,
} from "@/components/tax-rate-form";
import { Card } from "@/components/ui/card";
import { createTaxRate } from "@/server/catalog";

export const Route = createFileRoute("/app/tax-rates/new")({
  component: NewTaxRatePage,
});

function NewTaxRatePage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(values: TaxRateFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await createTaxRate({ data: values });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      await navigate({ to: "/app/tax-rates" });
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <>
      <Link to="/app/tax-rates" className="text-sm text-primary underline">
        Tax Rates
      </Link>
      <h1 className="mt-3 border-b-2 border-brass pb-3 font-serif text-3xl">
        New Tax Rate
      </h1>
      <Card>
        <TaxRateForm
          initial={{ name: "", rate: "" }}
          pending={pending}
          message={message}
          submitLabel="Save Tax Rate"
          onSubmit={(values) => void onSubmit(values)}
        />
      </Card>
    </>
  );
}
