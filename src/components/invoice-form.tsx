import { Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { ClientQuickEdit } from "@/components/client-quick-edit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatUsd, parseDollarsToCents } from "@/lib/money";
import { lineTax, parsePercentToBps } from "@/lib/tax";
import { cn } from "@/lib/utils";
import type { InvoiceFormValues } from "@/server/invoices";

type LineValues = InvoiceFormValues["lines"][number] & { key: string };

type Values = Omit<InvoiceFormValues, "lines"> & { lines: LineValues[] };

type Letterhead = {
  name: string;
  address: string | null;
  taxId: string | null;
  logoUrl: string | null;
};

type ClientChoice = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxExempt: boolean;
  note: string;
  archived: boolean;
};

const selectClass =
  "h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const labelClass = "text-xs font-medium text-solar-ink";

export function InvoiceForm({
  title,
  numberLabel,
  letterhead,
  badge,
  initial,
  clients,
  items,
  taxRates,
  pending,
  message,
  messageTone = "error",
  onSave,
  onSend,
  onDelete,
}: {
  title: string;
  numberLabel: string | null;
  letterhead: Letterhead;
  badge?: ReactNode;
  initial: Values;
  clients: ClientChoice[];
  items: {
    id: string;
    name: string;
    description: string;
    unitPrice: string;
    taxRateIds: string[];
  }[];
  taxRates: { id: string; name: string; rate: string }[];
  pending: boolean;
  message: string | null;
  messageTone?: "ok" | "error";
  onSave: (values: InvoiceFormValues) => void;
  onSend: (values: InvoiceFormValues) => void;
  onDelete?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initial);
  const [itemId, setItemId] = useState("");
  const [editingClient, setEditingClient] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [seenMessage, setSeenMessage] = useState(message);
  if (message !== seenMessage) {
    setSeenMessage(message);
    setLocalMessage(null);
  }
  const choices = clients.filter(
    (client) => !client.archived || client.id === values.clientId,
  );
  const selected = clients.find((client) => client.id === values.clientId);
  const taxExempt = selected?.taxExempt ?? false;
  const priced = values.lines.map((line) =>
    priceLine(line, taxRates, taxExempt),
  );
  const subtotalCents = priced.reduce(
    (sum, row) => sum + (row?.amountCents ?? 0),
    0,
  );
  const taxCents = priced.reduce((sum, row) => sum + (row?.taxCents ?? 0), 0);
  const totalCents = subtotalCents + taxCents;
  const shown = localMessage ?? message;
  const tone = localMessage ? "error" : messageTone;

  function setLine(key: string, patch: Partial<LineValues>) {
    setValues((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addLine(line: Omit<LineValues, "key">) {
    const key = crypto.randomUUID();
    setFocusKey(key);
    setValues((current) => ({
      ...current,
      lines: [...current.lines, { ...line, key }],
    }));
  }

  function payload(): InvoiceFormValues {
    return {
      ...values,
      lines: values.lines.map(({ key: _key, ...line }) => line),
    };
  }

  function send() {
    setLocalMessage(null);
    if (!formRef.current?.reportValidity()) return;
    if (values.lines.length === 0) {
      setLocalMessage("Add an Invoice Line before sending.");
      return;
    }
    onSend(payload());
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        // The Client dialog renders through a portal, but React still bubbles
        // its submit event here. Ignore submits from outside this form.
        if (!formRef.current?.contains(event.target as Node)) return;
        event.preventDefault();
        if (pending) return;
        setLocalMessage(null);
        onSave(payload());
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl text-foreground">{title}</h1>
          {badge}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/app/invoices"
            className="px-2 text-sm font-medium text-primary hover:underline"
          >
            Cancel
          </Link>
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={onDelete}
            >
              Delete draft
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={pending}
            className="bg-solar text-solar-foreground hover:bg-solar hover:brightness-95"
          >
            Save
          </Button>
          <Button type="button" disabled={pending} onClick={send}>
            Send
          </Button>
        </div>
      </div>
      {shown ? (
        <p
          className={cn(
            "text-sm",
            tone === "ok" ? "text-primary" : "text-destructive",
          )}
        >
          {shown}
        </p>
      ) : null}
      <Card className="overflow-hidden p-0">
        <div className="space-y-4 p-4">
          <LetterheadBlock letterhead={letterhead} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="client" className={labelClass}>
                  Bill to
                </Label>
                {selected ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setEditingClient(true)}
                  >
                    Edit Client
                  </button>
                ) : null}
              </div>
              <select
                id="client"
                required
                className={cn(selectClass, "w-full")}
                value={values.clientId}
                onChange={(event) =>
                  setValues({ ...values, clientId: event.target.value })
                }
              >
                <option value="">Choose a Client</option>
                {choices.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.taxExempt ? " (tax-exempt)" : ""}
                  </option>
                ))}
              </select>
              <Label htmlFor="reference" className={labelClass}>
                Reference
              </Label>
              <Input
                id="reference"
                className="h-9 px-2"
                value={values.reference}
                placeholder="PO number or similar"
                onChange={(event) =>
                  setValues({ ...values, reference: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-date" className={labelClass}>
                Issue date
              </Label>
              <Input
                id="issue-date"
                className="h-9 px-2"
                type="date"
                required
                value={values.issueDate}
                onChange={(event) =>
                  setValues({ ...values, issueDate: event.target.value })
                }
              />
              <Label htmlFor="due-date" className={labelClass}>
                Due date
              </Label>
              <Input
                id="due-date"
                className="h-9 px-2"
                type="date"
                required
                value={values.dueDate}
                onChange={(event) =>
                  setValues({ ...values, dueDate: event.target.value })
                }
              />
            </div>
            <div>
              <p className={labelClass}>Invoice number</p>
              <p className="mt-2 text-sm tabular-nums">
                {numberLabel ?? "Assigned on save"}
              </p>
            </div>
            <div className="text-right">
              <p className={labelClass}>Amount due (USD)</p>
              <p className="mt-1 font-serif text-3xl leading-none tabular-nums text-foreground">
                {formatUsd(totalCents)}
              </p>
            </div>
          </div>
          <div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-solar text-left">
                    <th className={cn(labelClass, "py-1.5 pr-2 font-medium")}>
                      Description
                    </th>
                    <th
                      className={cn(
                        labelClass,
                        "w-28 px-2 py-1.5 text-right font-medium",
                      )}
                    >
                      Unit price
                    </th>
                    <th
                      className={cn(
                        labelClass,
                        "w-16 px-2 py-1.5 text-right font-medium",
                      )}
                    >
                      Qty
                    </th>
                    <th
                      className={cn(labelClass, "w-40 px-2 py-1.5 font-medium")}
                    >
                      Tax Rate
                    </th>
                    <th
                      className={cn(
                        labelClass,
                        "w-24 px-2 py-1.5 text-right font-medium",
                      )}
                    >
                      Line total
                    </th>
                    <th className="w-10 px-1 py-1.5">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {values.lines.map((line, index) => {
                    const money = priced[index];
                    return (
                      <tr key={line.key} className="border-b border-border">
                        <td className="py-1.5 pr-2 align-top">
                          <Input
                            aria-label={`Invoice Line ${index + 1} name`}
                            className="h-9 px-2"
                            required
                            autoFocus={line.key === focusKey}
                            value={line.name}
                            placeholder="Name"
                            onChange={(event) =>
                              setLine(line.key, { name: event.target.value })
                            }
                          />
                          <Textarea
                            aria-label={`Invoice Line ${index + 1} description`}
                            rows={2}
                            className="mt-1 min-h-8 resize-y px-2 py-1 text-xs"
                            value={line.description}
                            placeholder="Description"
                            onChange={(event) =>
                              setLine(line.key, {
                                description: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input
                            aria-label={`Invoice Line ${index + 1} unit price`}
                            className="h-9 px-2 text-right tabular-nums"
                            required
                            inputMode="decimal"
                            placeholder="0.00"
                            value={line.unitPrice}
                            onChange={(event) =>
                              setLine(line.key, {
                                unitPrice: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Input
                            aria-label={`Invoice Line ${index + 1} quantity`}
                            className="h-9 px-2 text-right tabular-nums"
                            required
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(event) =>
                              setLine(line.key, {
                                quantity: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <TaxChoices
                            line={line}
                            taxRates={taxRates}
                            taxExempt={taxExempt}
                            onChange={(taxRateIds) =>
                              setLine(line.key, { taxRateIds })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right align-middle text-sm tabular-nums">
                          {money ? formatUsd(money.amountCents) : "—"}
                        </td>
                        <td className="px-1 py-1.5 align-middle">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-md border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            aria-label={`Remove Invoice Line ${index + 1}`}
                            onClick={() =>
                              setValues((current) => ({
                                ...current,
                                lines: current.lines.filter(
                                  (candidate) => candidate.key !== line.key,
                                ),
                              }))
                            }
                          >
                            <X aria-hidden className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="item">
                Add an Item
              </label>
              <select
                id="item"
                className={cn(selectClass, "w-56 max-w-full")}
                value={itemId}
                disabled={items.length === 0}
                onChange={(event) => setItemId(event.target.value)}
              >
                <option value="">
                  {items.length === 0
                    ? "No saved Items"
                    : "Choose a saved Item"}
                </option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!itemId}
                onClick={() => {
                  const item = items.find(
                    (candidate) => candidate.id === itemId,
                  );
                  if (!item) return;
                  addLine({
                    name: item.name,
                    description: item.description,
                    quantity: "1",
                    unitPrice: item.unitPrice,
                    taxRateIds: taxExempt ? [] : item.taxRateIds,
                  });
                  setItemId("");
                }}
              >
                Add Item
              </Button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent"
                onClick={() =>
                  addLine({
                    name: "",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    taxRateIds: [],
                  })
                }
              >
                <Plus aria-hidden className="size-4" />
                Custom line
              </button>
            </div>
            {items.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <Link
                  to="/app/items/new"
                  className="font-medium text-primary underline"
                >
                  Add a saved Item
                </Link>{" "}
              </p>
            ) : null}
            {taxRates.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <Link
                  to="/app/tax-rates/new"
                  className="font-medium text-primary underline"
                >
                  Add a Tax Rate
                </Link>{" "}
                to tax an Invoice Line.
              </p>
            ) : null}
          </div>
          <dl className="ml-auto w-full max-w-xs space-y-1 text-sm tabular-nums">
            <div className="flex justify-between gap-6">
              <dt>Subtotal</dt>
              <dd>{formatUsd(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt>Tax</dt>
              <dd>{formatUsd(taxCents)}</dd>
            </div>
            <div className="flex justify-between gap-6 rounded-md bg-solar px-2 py-1 font-medium text-solar-foreground">
              <dt>Total</dt>
              <dd>{formatUsd(totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-6 px-2 font-medium">
              <dt className="text-solar-ink">Amount due</dt>
              <dd>{formatUsd(totalCents)}</dd>
            </div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="notes" className={labelClass}>
                Notes
              </Label>
              <Textarea
                id="notes"
                rows={2}
                className="min-h-16"
                value={values.notes}
                onChange={(event) =>
                  setValues({ ...values, notes: event.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="terms" className={labelClass}>
                Terms
              </Label>
              <Textarea
                id="terms"
                rows={2}
                className="min-h-16"
                value={values.terms}
                onChange={(event) =>
                  setValues({ ...values, terms: event.target.value })
                }
              />
            </div>
          </div>
        </div>
      </Card>
      {editingClient && selected ? (
        <ClientQuickEdit
          client={selected}
          onClose={() => setEditingClient(false)}
        />
      ) : null}
    </form>
  );
}

function LetterheadBlock({ letterhead }: { letterhead: Letterhead }) {
  const address = letterhead.address?.trim() ?? "";
  const taxId = letterhead.taxId?.trim() ?? "";
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {letterhead.logoUrl ? (
          <img
            src={letterhead.logoUrl}
            alt=""
            className="h-10 w-auto max-w-40 object-contain"
          />
        ) : (
          <p className="font-serif text-xl leading-tight">{letterhead.name}</p>
        )}
      </div>
      <div className="text-right text-xs leading-5">
        {letterhead.logoUrl ? (
          <p className="font-medium">{letterhead.name}</p>
        ) : null}
        {address ? <p className="whitespace-pre-wrap">{address}</p> : null}
        {taxId ? <p>Tax ID {taxId}</p> : null}
      </div>
    </div>
  );
}

function TaxChoices({
  line,
  taxRates,
  taxExempt,
  onChange,
}: {
  line: LineValues;
  taxRates: { id: string; name: string; rate: string }[];
  taxExempt: boolean;
  onChange: (taxRateIds: string[]) => void;
}) {
  if (taxExempt) {
    return <p className="pt-2 text-xs text-muted-foreground">Tax-exempt</p>;
  }
  if (taxRates.length === 0) {
    return <p className="pt-2 text-xs text-muted-foreground">—</p>;
  }
  const selected = line.taxRateIds ?? [];
  return (
    <div className="flex flex-col gap-1 pt-2">
      {taxRates.map((rate) => (
        <label
          key={rate.id}
          className="flex items-center gap-1.5 text-xs leading-4"
        >
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={selected.includes(rate.id)}
            onChange={() => {
              const taxRateIds = selected.includes(rate.id)
                ? selected.filter((id) => id !== rate.id)
                : [...selected, rate.id];
              onChange(taxRateIds);
            }}
          />
          {rate.name} ({rate.rate}%)
        </label>
      ))}
    </div>
  );
}

function priceLine(
  line: Pick<LineValues, "quantity" | "unitPrice" | "taxRateIds">,
  taxRates: { id: string; rate: string }[],
  taxExempt: boolean,
): { amountCents: number; taxCents: number } | null {
  try {
    if (!/^\d{1,7}$/.test(line.quantity.trim())) return null;
    const quantity = Number(line.quantity.trim());
    if (quantity < 1) return null;
    const unitPriceCents = parseDollarsToCents(line.unitPrice);
    const amountCents = quantity * unitPriceCents;
    if (!Number.isSafeInteger(amountCents)) return null;
    const rates = taxRates
      .filter((rate) => (line.taxRateIds ?? []).includes(rate.id))
      .map((rate) => ({
        id: rate.id,
        rateBps: parsePercentToBps(rate.rate),
      }));
    const tax = lineTax({ amountCents, rates, taxExempt });
    return { amountCents, taxCents: tax.totalCents };
  } catch {
    return null;
  }
}
