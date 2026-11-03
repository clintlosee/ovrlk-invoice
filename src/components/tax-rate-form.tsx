import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TaxRateFormValues = {
  name: string;
  rate: string;
};

export function TaxRateForm({
  initial,
  pending,
  message,
  submitLabel,
  onSubmit,
}: {
  initial: TaxRateFormValues;
  pending: boolean;
  message: string | null;
  submitLabel: string;
  onSubmit: (values: TaxRateFormValues) => void;
}) {
  const [values, setValues] = useState(initial);

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
        <Label htmlFor="rate">Rate (percent)</Label>
        <Input
          id="rate"
          required
          inputMode="decimal"
          value={values.rate}
          placeholder="7.25"
          onChange={(event) =>
            setValues({ ...values, rate: event.target.value })
          }
        />
        <p className="text-sm text-muted">
          Up to two decimal places. 7.25 is stored as 725 basis points.
        </p>
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
