import { Link, useRouter } from "@tanstack/react-router";
import { Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoryGroupLabel } from "@/lib/expense-categories";
import { formatCents } from "@/lib/money";
import { RECEIPT_ACCEPT, uploadReceipt } from "@/lib/receipt-upload";
import { cn } from "@/lib/utils";
import { receiptUrl, updateExpense } from "@/server/expenses";

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm";

type CategoryChoice = {
  id: string;
  name: string;
  categoryGroup: string;
  archived: boolean;
};

type ClientChoice = { id: string; name: string; archived: boolean };

export type QuickExpense = {
  id: string;
  spentOn: string;
  merchant: string;
  amountCents: number;
  taxPaidCents: number;
  note: string | null;
  categoryId: string;
  categoryGroup: string;
  clientId: string | null;
  receiptKey: string | null;
  paymentId: string | null;
  recurring: boolean;
};

export function ExpenseQuickEdit({
  expense,
  categories,
  clients,
  storageConfigured,
  onClose,
}: {
  expense: QuickExpense;
  categories: CategoryChoice[];
  clients: ClientChoice[];
  storageConfigured: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const locked = expense.paymentId != null;
  const [values, setValues] = useState({
    spentOn: expense.spentOn,
    merchant: expense.merchant,
    amount: formatCents(expense.amountCents),
    categoryId: expense.categoryId,
    clientId: expense.clientId ?? "",
    taxPaid: expense.taxPaidCents > 0 ? formatCents(expense.taxPaidCents) : "",
    note: expense.note ?? "",
    recurring: expense.recurring,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasReceipt, setHasReceipt] = useState(expense.receiptKey != null);
  const selectedCategory = categories.find(
    (category) => category.id === values.categoryId,
  );
  const cogs =
    (selectedCategory?.categoryGroup ?? expense.categoryGroup) === "cogs";
  const choices = categories.filter(
    (category) => !category.archived || category.id === values.categoryId,
  );
  const fieldId = (name: string) => `${name}-${expense.id}`;

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const result = await updateExpense({
        data: { ...values, id: expense.id },
      });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      await router.invalidate();
      onClose();
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div
        className={cn(
          "min-w-0 flex-1 space-y-3 border-l-4 p-4",
          cogs ? "border-brass" : "border-border",
        )}
      >
        {locked ? (
          <p className="text-sm text-muted-foreground">
            This Merchant Fee follows its card Payment. You can change the note
            and Client.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={fieldId("merchant")}>Merchant</Label>
            <Input
              id={fieldId("merchant")}
              required
              disabled={locked}
              value={values.merchant}
              onChange={(event) =>
                setValues({ ...values, merchant: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("spentOn")}>Date</Label>
            <Input
              id={fieldId("spentOn")}
              type="date"
              required
              disabled={locked}
              value={values.spentOn}
              onChange={(event) =>
                setValues({ ...values, spentOn: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("taxPaid")}>Tax paid</Label>
            <Input
              id={fieldId("taxPaid")}
              inputMode="decimal"
              disabled={locked}
              placeholder="0.00"
              value={values.taxPaid}
              onChange={(event) =>
                setValues({ ...values, taxPaid: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("amount")}>Amount</Label>
            <Input
              id={fieldId("amount")}
              inputMode="decimal"
              required
              disabled={locked}
              value={values.amount}
              onChange={(event) =>
                setValues({ ...values, amount: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("categoryId")}>Category</Label>
            <select
              id={fieldId("categoryId")}
              required
              disabled={locked}
              className={selectClass}
              value={values.categoryId}
              onChange={(event) =>
                setValues({ ...values, categoryId: event.target.value })
              }
            >
              <option value="">Choose</option>
              <CategoryOptions
                label={categoryGroupLabel("schedule_c")}
                categories={choices.filter(
                  (category) => category.categoryGroup === "schedule_c",
                )}
              />
              <CategoryOptions
                label={categoryGroupLabel("cogs")}
                categories={choices.filter(
                  (category) => category.categoryGroup === "cogs",
                )}
              />
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId("clientId")}>Client</Label>
            <select
              id={fieldId("clientId")}
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
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("note")}>Note</Label>
          <Input
            id={fieldId("note")}
            value={values.note}
            onChange={(event) =>
              setValues({ ...values, note: event.target.value })
            }
          />
        </div>
        {locked ? null : (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={values.recurring}
              onChange={(event) =>
                setValues({ ...values, recurring: event.target.checked })
              }
            />
            Recurring
          </label>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <ReceiptControl
            expenseId={expense.id}
            hasReceipt={hasReceipt}
            storageConfigured={storageConfigured}
            pending={pending}
            onUploaded={() => setHasReceipt(true)}
            onMessage={setMessage}
          />
          <Link
            to="/app/expenses/$expenseId"
            params={{ expenseId: expense.id }}
            className="inline-flex items-center text-primary underline"
          >
            Advanced edit
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
      </div>
      <div className="flex sm:w-14 sm:flex-col">
        <Button
          type="submit"
          disabled={pending}
          aria-label="Save Expense"
          className="h-12 flex-1 rounded-none sm:h-auto"
        >
          <Check aria-hidden className="size-5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          aria-label="Cancel"
          className="h-12 flex-1 rounded-none sm:h-auto"
          onClick={onClose}
        >
          <X aria-hidden className="size-5" />
        </Button>
      </div>
    </form>
  );
}

function ReceiptControl({
  expenseId,
  hasReceipt,
  storageConfigured,
  pending,
  onUploaded,
  onMessage,
}: {
  expenseId: string;
  hasReceipt: boolean;
  storageConfigured: boolean;
  pending: boolean;
  onUploaded: () => void;
  onMessage: (message: string) => void;
}) {
  if (!storageConfigured) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasReceipt ? (
        <button
          type="button"
          className="text-primary underline"
          onClick={() => {
            void receiptUrl({ data: { id: expenseId } }).then((result) => {
              if (result.ok) window.open(result.url, "_blank", "noopener");
              else onMessage(result.message);
            });
          }}
        >
          View Receipt
        </button>
      ) : null}
      <label className="cursor-pointer text-primary underline">
        {hasReceipt ? "Replace Receipt" : "Attach Receipt"}
        <input
          type="file"
          accept={RECEIPT_ACCEPT}
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void uploadReceipt(expenseId, file).then((result) => {
              if (!result.ok) {
                onMessage(result.message);
                return;
              }
              onUploaded();
              onMessage("");
            });
          }}
        />
      </label>
    </div>
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
