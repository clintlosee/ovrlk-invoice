import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { categoryGroupLabel } from "@/lib/expense-categories";

export type ExpenseFormValues = {
  spentOn: string;
  merchant: string;
  amount: string;
  categoryId: string;
  clientId: string;
  taxPaid: string;
  note: string;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm";

export function ExpenseForm({
  initial,
  categories,
  clients,
  lockedFee = false,
  pending,
  message,
  submitLabel,
  onSubmit,
}: {
  initial: ExpenseFormValues;
  categories: {
    id: string;
    name: string;
    categoryGroup: string;
    archived: boolean;
  }[];
  clients: { id: string; name: string; archived: boolean }[];
  lockedFee?: boolean;
  pending: boolean;
  message: string | null;
  submitLabel: string;
  onSubmit: (values: ExpenseFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const choices = categories.filter(
    (category) => !category.archived || category.id === values.categoryId,
  );
  const schedule = choices.filter(
    (category) => category.categoryGroup === "schedule_c",
  );
  const cogs = choices.filter((category) => category.categoryGroup === "cogs");

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      {lockedFee ? (
        <p className="text-sm text-muted">
          This Merchant Fee follows its card Payment. You can change the note
          and Client.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="spentOn">Date</Label>
        <Input
          id="spentOn"
          type="date"
          required
          disabled={lockedFee}
          value={values.spentOn}
          onChange={(event) =>
            setValues({ ...values, spentOn: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="merchant">Merchant</Label>
        <Input
          id="merchant"
          required
          disabled={lockedFee}
          value={values.merchant}
          onChange={(event) =>
            setValues({ ...values, merchant: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          inputMode="decimal"
          required
          disabled={lockedFee}
          value={values.amount}
          onChange={(event) =>
            setValues({ ...values, amount: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          required
          disabled={lockedFee}
          className={selectClass}
          value={values.categoryId}
          onChange={(event) =>
            setValues({ ...values, categoryId: event.target.value })
          }
        >
          <option value="">Choose</option>
          <CategoryOptions
            label={categoryGroupLabel("schedule_c")}
            categories={schedule}
          />
          <CategoryOptions
            label={categoryGroupLabel("cogs")}
            categories={cogs}
          />
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="clientId">Client</Label>
        <select
          id="clientId"
          className={selectClass}
          value={values.clientId}
          onChange={(event) =>
            setValues({ ...values, clientId: event.target.value })
          }
        >
          <option value="">None</option>
          {clients
            .filter(
              (client) => !client.archived || client.id === values.clientId,
            )
            .map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="taxPaid">Tax paid</Label>
        <Input
          id="taxPaid"
          inputMode="decimal"
          disabled={lockedFee}
          placeholder="0.00"
          value={values.taxPaid}
          onChange={(event) =>
            setValues({ ...values, taxPaid: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          value={values.note}
          onChange={(event) =>
            setValues({ ...values, note: event.target.value })
          }
        />
      </div>
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </form>
  );
}

function CategoryOptions({
  label,
  categories,
}: {
  label: string;
  categories: { id: string; name: string; archived: boolean }[];
}) {
  if (categories.length === 0) return null;
  return (
    <optgroup label={label}>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
          {category.archived ? " (archived)" : ""}
        </option>
      ))}
    </optgroup>
  );
}
