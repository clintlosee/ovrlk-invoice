import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ClientFormValues = {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxExempt: boolean;
  note: string;
};

export function ClientForm({
  initial,
  pending,
  message,
  submitLabel,
  onSubmit,
}: {
  initial: ClientFormValues;
  pending: boolean;
  message: string | null;
  submitLabel: string;
  onSubmit: (values: ClientFormValues) => void;
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
          autoComplete="name"
          value={values.name}
          onChange={(event) =>
            setValues({ ...values, name: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={values.email}
          onChange={(event) =>
            setValues({ ...values, email: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(event) =>
            setValues({ ...values, phone: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          autoComplete="street-address"
          value={values.address}
          onChange={(event) =>
            setValues({ ...values, address: event.target.value })
          }
        />
      </div>
      <label className="flex items-start gap-2 text-sm" htmlFor="tax-exempt">
        <input
          id="tax-exempt"
          type="checkbox"
          className="mt-0.5 size-4 accent-foreground"
          checked={values.taxExempt}
          onChange={(event) =>
            setValues({ ...values, taxExempt: event.target.checked })
          }
        />
        <span>
          Tax-exempt
          <span className="mt-1 block text-muted-foreground">
            New Invoice Lines for this Client default to no tax.
          </span>
        </span>
      </label>
      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          value={values.note}
          placeholder="Exemption reason or certificate number"
          onChange={(event) =>
            setValues({ ...values, note: event.target.value })
          }
        />
      </div>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
