import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Repeat,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ReceiptDropzone } from "@/components/receipt-dropzone";
import { Button } from "@/components/ui/button";
import { categoryGroupLabel } from "@/lib/expense-categories";
import { formatUsd, parseDollarsToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ExpenseFormValues = {
  spentOn: string;
  merchant: string;
  amount: string;
  categoryId: string;
  clientId: string;
  taxPaid: string;
  note: string;
  recurring: boolean;
};

type CategoryChoice = {
  id: string;
  name: string;
  categoryGroup: string;
  archived: boolean;
};

type ClientChoice = { id: string; name: string; archived: boolean };

type ReceiptProps = {
  configured: boolean;
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  remoteContentType: string | null;
  remoteUrl: string | null;
};

const field =
  "w-full border-0 bg-transparent px-0 py-1 text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-60";

const boxed =
  "w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

export function ExpenseForm({
  title,
  initial,
  categories,
  clients,
  lockedFee = false,
  pending,
  message,
  onSubmit,
  onDelete,
  receipt,
}: {
  title: string;
  initial: ExpenseFormValues;
  categories: CategoryChoice[];
  clients: ClientChoice[];
  lockedFee?: boolean;
  pending: boolean;
  message: string | null;
  onSubmit: (values: ExpenseFormValues) => void;
  onDelete?: () => void;
  receipt?: ReceiptProps;
}) {
  const [values, setValues] = useState(initial);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(initial.taxPaid.trim() !== "");
  const subtotalCents = subtotalBeforeTax(values.amount, values.taxPaid);
  const choices = categories.filter(
    (category) => !category.archived || category.id === values.categoryId,
  );
  const schedule = choices.filter(
    (category) => category.categoryGroup === "schedule_c",
  );
  const cogs = choices.filter((category) => category.categoryGroup === "cogs");
  const quietMessage = message === "Saved." || message === "Removed.";

  return (
    <form
      className="pr-14"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="mx-auto w-full max-w-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl">{title}</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/app/expenses"
              search={{ from: "", to: "", category: "" }}
              className="text-sm text-primary"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {message ? (
          <p
            className={cn(
              "mt-3 text-sm",
              quietMessage ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-6">
          <ReceiptSheet>
            {lockedFee ? (
              <p className="mb-4 text-sm text-muted-foreground">
                This Merchant Fee follows its card Payment. You can change the
                note and Client.
              </p>
            ) : null}
            <div className="flex min-h-0 flex-col sm:min-h-[28rem]">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-1">
                    <label
                      className="text-sm font-medium text-solar-ink"
                      htmlFor="categoryId"
                    >
                      Category
                    </label>
                    <div className="relative">
                      <select
                        id="categoryId"
                        required
                        disabled={lockedFee}
                        className={cn(boxed, "h-10 appearance-none pr-8")}
                        value={values.categoryId}
                        onChange={(event) =>
                          setValues({
                            ...values,
                            categoryId: event.target.value,
                          })
                        }
                      >
                        <option value="">Choose a category</option>
                        <CategoryOptions
                          label={categoryGroupLabel("schedule_c")}
                          categories={schedule}
                        />
                        <CategoryOptions
                          label={categoryGroupLabel("cogs")}
                          categories={cogs}
                        />
                      </select>
                      <ChevronRight
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 rotate-90 text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="sr-only" htmlFor="spentOn">
                      Date
                    </label>
                    <input
                      id="spentOn"
                      type="date"
                      required
                      disabled={lockedFee}
                      className={cn(field, "w-40 text-sm")}
                      value={values.spentOn}
                      onChange={(event) =>
                        setValues({ ...values, spentOn: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="sr-only" htmlFor="merchant">
                      Merchant
                    </label>
                    <input
                      id="merchant"
                      required
                      disabled={lockedFee}
                      placeholder="Add merchant"
                      className={cn(field, "font-serif text-3xl")}
                      value={values.merchant}
                      onChange={(event) =>
                        setValues({ ...values, merchant: event.target.value })
                      }
                    />
                  </div>
                </div>
                {receipt?.configured ? (
                  <div className="w-28 shrink-0">
                    <ReceiptSlot receipt={receipt} pending={pending} />
                  </div>
                ) : null}
              </div>
              {receipt && !receipt.configured ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Receipt upload needs Cloudflare R2, which is not configured.
                </p>
              ) : null}
              <div className="mt-4 space-y-1">
                <label
                  className="text-sm font-medium text-solar-ink"
                  htmlFor="note"
                >
                  Note
                </label>
                <textarea
                  id="note"
                  rows={2}
                  placeholder="Optional"
                  className={cn(boxed, "min-h-20 w-full resize-y py-2")}
                  value={values.note}
                  onChange={(event) =>
                    setValues({ ...values, note: event.target.value })
                  }
                />
              </div>
              <div className="mt-auto space-y-3 pt-10">
                {subtotalCents != null ? (
                  <div className="flex items-center justify-between text-sm">
                    <span>Subtotal</span>
                    <span>{formatUsd(subtotalCents)}</span>
                  </div>
                ) : null}
                {taxOpen ? (
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="taxPaid" className="text-sm text-primary">
                      Tax paid
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-28 items-center rounded-md border border-input bg-card px-2">
                        <span className="text-sm text-muted-foreground">$</span>
                        <input
                          id="taxPaid"
                          inputMode="decimal"
                          disabled={lockedFee}
                          placeholder="0.00"
                          className="w-full border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                          value={values.taxPaid}
                          onChange={(event) =>
                            setValues({
                              ...values,
                              taxPaid: event.target.value,
                            })
                          }
                        />
                      </div>
                      {lockedFee ? null : (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Remove tax"
                          onClick={() => {
                            setValues({ ...values, taxPaid: "" });
                            setTaxOpen(false);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                ) : lockedFee ? null : (
                  <button
                    type="button"
                    className="text-sm text-primary"
                    onClick={() => setTaxOpen(true)}
                  >
                    Add Taxes
                  </button>
                )}
                <div className="flex items-end justify-between gap-4 border-t border-border pt-4">
                  <label htmlFor="amount" className="pb-2 text-sm">
                    Grand total (USD)
                  </label>
                  <div className="flex items-baseline gap-1">
                    <span
                      aria-hidden
                      className="font-serif text-3xl text-muted-foreground"
                    >
                      $
                    </span>
                    <input
                      id="amount"
                      inputMode="decimal"
                      required
                      disabled={lockedFee}
                      placeholder="0.00"
                      className={cn(field, "w-28 font-serif text-3xl")}
                      value={values.amount}
                      onChange={(event) =>
                        setValues({ ...values, amount: event.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </ReceiptSheet>
        </div>
      </div>
      <ExpenseSettings
        open={settingsOpen}
        onToggle={() => setSettingsOpen((open) => !open)}
        values={values}
        clients={clients}
        lockedFee={lockedFee}
        pending={pending}
        onClient={(clientId) => setValues({ ...values, clientId })}
        onRecurring={(recurring) => setValues({ ...values, recurring })}
        onDelete={onDelete}
      />
    </form>
  );
}

function ExpenseSettings({
  open,
  onToggle,
  values,
  clients,
  lockedFee,
  pending,
  onClient,
  onRecurring,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  values: ExpenseFormValues;
  clients: ClientChoice[];
  lockedFee: boolean;
  pending: boolean;
  onClient: (clientId: string) => void;
  onRecurring: (recurring: boolean) => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-30 flex h-screen transition-transform duration-200 ease-out motion-reduce:transition-none",
        open ? "translate-x-0" : "translate-x-80",
      )}
    >
      <button
        type="button"
        className="mt-24 flex h-10 items-center gap-1 self-start rounded-l-md border border-r-0 border-border bg-card px-2 text-muted-foreground shadow-sm hover:text-foreground"
        aria-expanded={open}
        aria-controls="expense-settings"
        aria-label={open ? "Close Expense settings" : "Expense settings"}
        onClick={onToggle}
      >
        <ChevronLeft
          aria-hidden
          className={cn(
            "size-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
        <SlidersHorizontal aria-hidden className="size-4" />
      </button>
      <div
        id="expense-settings"
        inert={!open}
        aria-hidden={!open}
        className="flex h-full w-80 flex-col border-l border-border bg-card shadow-card"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <SlidersHorizontal aria-hidden className="size-4" />
          <h2 className="font-serif text-xl">Expense settings</h2>
        </div>
        <div className="flex-1 divide-y divide-border overflow-y-auto px-5">
          <div className="flex gap-3 py-4">
            <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="clientId">
                Client
              </label>
              <p className="text-sm text-muted-foreground">
                Assign this Expense to a Client.
              </p>
              <select
                id="clientId"
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={values.clientId}
                onChange={(event) => onClient(event.target.value)}
              >
                <option value="">None</option>
                {clients
                  .filter(
                    (client) =>
                      !client.archived || client.id === values.clientId,
                  )
                  .map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {lockedFee ? null : (
            <div className="flex gap-3 py-4">
              <Repeat aria-hidden className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <label
                  className="flex items-center gap-2 text-sm font-medium"
                  htmlFor="recurring"
                >
                  <input
                    id="recurring"
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={values.recurring}
                    onChange={(event) => onRecurring(event.target.checked)}
                  />
                  Recurring
                </label>
                <p className="text-sm text-muted-foreground">
                  Shows with the other repeating Expenses. Nothing is posted
                  ahead.
                </p>
              </div>
            </div>
          )}
          {onDelete ? (
            <div className="py-4">
              <button
                type="button"
                className="text-sm text-destructive underline disabled:opacity-60"
                disabled={pending}
                onClick={onDelete}
              >
                Delete Expense
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReceiptSheet({ children }: { children: ReactNode }) {
  return (
    <div className="pb-3">
      <div className="bg-card shadow-card">
        <div className="h-1 bg-solar" aria-hidden />
        <div className="px-6 py-6 sm:px-8">{children}</div>
      </div>
      <div
        aria-hidden
        className="-mt-px h-3"
        style={{
          backgroundImage:
            "linear-gradient(-45deg, transparent 8px, var(--card) 0), linear-gradient(45deg, transparent 8px, var(--card) 0)",
          backgroundSize: "16px 12px",
          backgroundRepeat: "repeat-x",
        }}
      />
    </div>
  );
}

function ReceiptSlot({
  receipt,
  pending,
}: {
  receipt: ReceiptProps;
  pending: boolean;
}) {
  if (!receipt.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Receipt upload needs Cloudflare R2, which is not configured.
      </p>
    );
  }
  return (
    <ReceiptDropzone
      file={receipt.file}
      remoteContentType={receipt.remoteContentType}
      remoteUrl={receipt.remoteUrl}
      pending={pending}
      onFile={receipt.onFile}
      onRemove={receipt.onRemove}
    />
  );
}

/** Grand total is the amount paid. Tax paid is part of that amount. */
export function subtotalBeforeTax(
  amount: string,
  taxPaid: string,
): number | null {
  const total = dollarsOrNull(amount);
  const tax = dollarsOrNull(taxPaid);
  if (total == null || tax == null || tax <= 0) return null;
  return total - tax;
}

function dollarsOrNull(input: string): number | null {
  try {
    return parseDollarsToCents(input);
  } catch {
    return null;
  }
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
