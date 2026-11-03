import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ItemFormValues = {
  name: string;
  description: string;
  unitPrice: string;
  taxRateIds: string[];
};

export function ItemForm({
  initial,
  taxRates,
  pending,
  message,
  submitLabel,
  onSubmit,
}: {
  initial: ItemFormValues;
  taxRates: { id: string; name: string; rate: string }[];
  pending: boolean;
  message: string | null;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => void;
}) {
  const [values, setValues] = useState(initial);

  function toggle(id: string) {
    setValues((current) => ({
      ...current,
      taxRateIds: current.taxRateIds.includes(id)
        ? current.taxRateIds.filter((rateId) => rateId !== id)
        : [...current.taxRateIds, id],
    }));
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          value={values.name}
          onChange={(event) =>
            setValues({ ...values, name: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={values.description}
          onChange={(event) =>
            setValues({ ...values, description: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="unit-price">Unit price (USD)</Label>
        <Input
          id="unit-price"
          required
          inputMode="decimal"
          value={values.unitPrice}
          placeholder="12.50"
          onChange={(event) =>
            setValues({ ...values, unitPrice: event.target.value })
          }
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Default Tax Rates</legend>
        {taxRates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Tax Rates yet.{" "}
            <Link to="/app/tax-rates" className="underline">
              Add one
            </Link>
          </p>
        ) : (
          taxRates.map((rate) => (
            <label key={rate.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={values.taxRateIds.includes(rate.id)}
                onChange={() => toggle(rate.id)}
              />
              {rate.name} ({rate.rate}%)
            </label>
          ))
        )}
      </fieldset>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
