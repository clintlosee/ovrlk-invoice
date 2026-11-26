import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoryGroupLabel } from "@/lib/expense-categories";
import { formatCents } from "@/lib/money";
import {
  type IntervalUnit,
  isIntervalUnit,
  scheduleSentence,
} from "@/lib/recurring";
import { cn } from "@/lib/utils";

export type RecurringDraft = {
  merchant: string;
  amount: string;
  categoryId: string;
  clientId: string;
  taxPaid: string;
  note: string;
  nextOn: string;
  preset: "week" | "month" | "year" | "custom";
  intervalCount: string;
  intervalUnit: IntervalUnit;
  ends: "infinite" | "count";
  remainingCount: string;
  paused: boolean;
};

type CategoryChoice = {
  id: string;
  name: string;
  categoryGroup: string;
  archived: boolean;
};

type ClientChoice = { id: string; name: string; archived: boolean };

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm";

export function RecurringExpenseForm({
  title,
  initial,
  categories,
  clients,
  pending,
  message,
  onSubmit,
  onDelete,
}: {
  title: string;
  initial: RecurringDraft;
  categories: CategoryChoice[];
  clients: ClientChoice[];
  pending: boolean;
  message: string | null;
  onSubmit: (values: RecurringDraft) => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const choices = categories.filter(
    (category) => !category.archived || category.id === values.categoryId,
  );
  const quiet = message === "Saved.";
  const sentence = preview(values);

  return (
    <form
      className="mx-auto w-full max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">{title}</h1>
        <div className="flex items-center gap-4">
          <Link
            to="/app/expenses"
            search={{ from: "", to: "", category: "", tab: "recurring" }}
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
            quiet ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {message}
        </p>
      ) : null}
      <Card className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category</Label>
          <select
            id="categoryId"
            required
            className={selectClass}
            value={values.categoryId}
            onChange={(event) =>
              setValues({ ...values, categoryId: event.target.value })
            }
          >
            <option value="">Choose a category</option>
            <Options
              label={categoryGroupLabel("schedule_c")}
              categories={choices.filter(
                (category) => category.categoryGroup === "schedule_c",
              )}
            />
            <Options
              label={categoryGroupLabel("cogs")}
              categories={choices.filter(
                (category) => category.categoryGroup === "cogs",
              )}
            />
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="merchant">Merchant</Label>
          <Input
            id="merchant"
            required
            value={values.merchant}
            onChange={(event) =>
              setValues({ ...values, merchant: event.target.value })
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              required
              placeholder="0.00"
              value={values.amount}
              onChange={(event) =>
                setValues({ ...values, amount: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxPaid">Tax paid</Label>
            <Input
              id="taxPaid"
              inputMode="decimal"
              placeholder="0.00"
              value={values.taxPaid}
              onChange={(event) =>
                setValues({ ...values, taxPaid: event.target.value })
              }
            />
          </div>
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
          <Label htmlFor="note">Note</Label>
          <Input
            id="note"
            value={values.note}
            onChange={(event) =>
              setValues({ ...values, note: event.target.value })
            }
          />
        </div>
        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="font-serif text-xl">Recurring schedule</legend>
          <div className="space-y-2">
            <Label htmlFor="preset">How often?</Label>
            <select
              id="preset"
              className={selectClass}
              value={values.preset}
              onChange={(event) => {
                const preset = event.target.value;
                if (
                  preset !== "week" &&
                  preset !== "month" &&
                  preset !== "year" &&
                  preset !== "custom"
                ) {
                  return;
                }
                setValues({
                  ...values,
                  preset,
                  intervalCount:
                    preset === "custom" ? values.intervalCount : "1",
                  intervalUnit:
                    preset === "custom" ? values.intervalUnit : preset,
                });
              }}
            >
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {values.preset === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="intervalCount">Every</Label>
                <Input
                  id="intervalCount"
                  inputMode="numeric"
                  required
                  min={1}
                  max={99}
                  value={values.intervalCount}
                  onChange={(event) =>
                    setValues({ ...values, intervalCount: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="intervalUnit">Unit</Label>
                <select
                  id="intervalUnit"
                  className={selectClass}
                  value={values.intervalUnit}
                  onChange={(event) => {
                    if (!isIntervalUnit(event.target.value)) return;
                    setValues({ ...values, intervalUnit: event.target.value });
                  }}
                >
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month">Months</option>
                  <option value="year">Years</option>
                </select>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="nextOn">Next expense date</Label>
            <Input
              id="nextOn"
              type="date"
              required
              value={values.nextOn}
              onChange={(event) =>
                setValues({ ...values, nextOn: event.target.value })
              }
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Number of expenses</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="ends"
                className="size-4 accent-primary"
                checked={values.ends === "infinite"}
                onChange={() => setValues({ ...values, ends: "infinite" })}
              />
              Infinite
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="ends"
                className="size-4 accent-primary"
                checked={values.ends === "count"}
                onChange={() => setValues({ ...values, ends: "count" })}
              />
              A specific number
            </label>
            {values.ends === "count" ? (
              <Input
                aria-label="Expenses still to create"
                inputMode="numeric"
                required
                min={0}
                max={999}
                className="w-32"
                value={values.remainingCount}
                onChange={(event) =>
                  setValues({ ...values, remainingCount: event.target.value })
                }
              />
            ) : null}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={values.paused}
              onChange={(event) =>
                setValues({ ...values, paused: event.target.checked })
              }
            />
            Paused
          </label>
          {sentence ? (
            <p className="text-sm text-muted-foreground">{sentence}</p>
          ) : null}
        </fieldset>
        {onDelete ? (
          <button
            type="button"
            className="text-sm text-destructive underline disabled:opacity-60"
            disabled={pending}
            onClick={onDelete}
          >
            Delete Recurring Expense
          </button>
        ) : null}
      </Card>
    </form>
  );
}

export function toScheduleInput(values: RecurringDraft) {
  const interval =
    values.preset === "custom"
      ? { count: Number(values.intervalCount), unit: values.intervalUnit }
      : { count: 1, unit: values.preset };
  return {
    merchant: values.merchant,
    amount: values.amount,
    categoryId: values.categoryId,
    clientId: values.clientId,
    taxPaid: values.taxPaid,
    note: values.note,
    nextOn: values.nextOn,
    intervalCount: interval.count,
    intervalUnit: interval.unit,
    remainingCount:
      values.ends === "infinite" ? null : Number(values.remainingCount),
    paused: values.paused,
  };
}

export function draftFromSchedule(schedule: {
  merchant: string;
  amountCents: number;
  categoryId: string;
  clientId: string | null;
  taxPaidCents: number;
  note: string | null;
  nextOn: string;
  intervalCount: number;
  intervalUnit: IntervalUnit;
  remainingCount: number | null;
  paused: boolean;
}): RecurringDraft {
  const preset =
    schedule.intervalCount === 1 &&
    (schedule.intervalUnit === "week" ||
      schedule.intervalUnit === "month" ||
      schedule.intervalUnit === "year")
      ? schedule.intervalUnit
      : "custom";
  return {
    merchant: schedule.merchant,
    amount: formatCents(schedule.amountCents),
    categoryId: schedule.categoryId,
    clientId: schedule.clientId ?? "",
    taxPaid:
      schedule.taxPaidCents > 0 ? formatCents(schedule.taxPaidCents) : "",
    note: schedule.note ?? "",
    nextOn: schedule.nextOn,
    preset,
    intervalCount: String(schedule.intervalCount),
    intervalUnit: schedule.intervalUnit,
    ends: schedule.remainingCount === null ? "infinite" : "count",
    remainingCount:
      schedule.remainingCount === null ? "" : String(schedule.remainingCount),
    paused: schedule.paused,
  };
}

function preview(values: RecurringDraft): string | null {
  if (values.ends === "count" && values.remainingCount === "0") {
    return "This schedule is finished.";
  }
  if (values.paused) {
    return "Paused. Dates that pass are skipped until you turn this back on.";
  }
  const count = values.preset === "custom" ? Number(values.intervalCount) : 1;
  const unit = values.preset === "custom" ? values.intervalUnit : values.preset;
  if (!Number.isInteger(count) || count < 1 || !values.nextOn) return null;
  return scheduleSentence(count, unit, values.nextOn);
}

function Options({
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
