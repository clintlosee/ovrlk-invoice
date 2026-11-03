import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessFormValues } from "@/server/business";

export function BusinessForm({
  initial,
  pending,
  message,
  onSubmit,
}: {
  initial: BusinessFormValues;
  pending: boolean;
  message: string | null;
  onSubmit: (values: BusinessFormValues) => void;
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
        <Label htmlFor="business-name">Business name</Label>
        <Input
          id="business-name"
          required
          value={values.name}
          onChange={(event) =>
            setValues({ ...values, name: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="business-address">Address</Label>
        <Textarea
          id="business-address"
          value={values.address}
          onChange={(event) =>
            setValues({ ...values, address: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tax-id">Tax ID</Label>
        <Input
          id="tax-id"
          value={values.taxId}
          placeholder="EIN or sales-tax number"
          onChange={(event) =>
            setValues({ ...values, taxId: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="default-terms">Default terms</Label>
        <Textarea
          id="default-terms"
          value={values.defaultTerms}
          onChange={(event) =>
            setValues({ ...values, defaultTerms: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footer">Footer</Label>
        <Textarea
          id="footer"
          value={values.footer}
          onChange={(event) =>
            setValues({ ...values, footer: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="accent">Accent color</Label>
        <Input
          id="accent"
          type="color"
          value={values.accentColor || "#1c1917"}
          onChange={(event) =>
            setValues({ ...values, accentColor: event.target.value })
          }
        />
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
