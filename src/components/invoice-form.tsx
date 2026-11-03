import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceFormValues } from "@/server/invoices";

type LineValues = InvoiceFormValues["lines"][number] & { key: string };

type Values = Omit<InvoiceFormValues, "lines"> & { lines: LineValues[] };

export function InvoiceForm({
  initial,
  clients,
  items,
  taxRates,
  pending,
  message,
  onSave,
  onSend,
}: {
  initial: Values;
  clients: {
    id: string;
    name: string;
    taxExempt: boolean;
    archived: boolean;
  }[];
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
  onSave: (values: InvoiceFormValues) => void;
  onSend?: (values: InvoiceFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const [itemId, setItemId] = useState("");
  const choices = clients.filter(
    (client) => !client.archived || client.id === values.clientId,
  );
  const selected = clients.find((client) => client.id === values.clientId);

  function setLine(key: string, patch: Partial<LineValues>) {
    setValues((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addLine(line: Omit<LineValues, "key">) {
    setValues((current) => ({
      ...current,
      lines: [...current.lines, { ...line, key: crypto.randomUUID() }],
    }));
  }

  function payload(): InvoiceFormValues {
    return {
      ...values,
      lines: values.lines.map(({ key: _key, ...line }) => line),
    };
  }

  return (
    <form
      className="mt-6 space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(payload());
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="client">Client</Label>
        <select
          id="client"
          required
          className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="issue-date">Issue date</Label>
          <Input
            id="issue-date"
            type="date"
            required
            value={values.issueDate}
            onChange={(event) =>
              setValues({ ...values, issueDate: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="due-date">Due date</Label>
          <Input
            id="due-date"
            type="date"
            required
            value={values.dueDate}
            onChange={(event) =>
              setValues({ ...values, dueDate: event.target.value })
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reference">Reference</Label>
        <Input
          id="reference"
          value={values.reference}
          placeholder="PO number or similar"
          onChange={(event) =>
            setValues({ ...values, reference: event.target.value })
          }
        />
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-2">
            <Label htmlFor="item">Add an Item</Label>
            <select
              id="item"
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
            >
              <option value="">Choose a saved Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const item = items.find((candidate) => candidate.id === itemId);
              if (!item) return;
              addLine({
                name: item.name,
                description: item.description,
                quantity: "1",
                unitPrice: item.unitPrice,
                taxRateIds: selected?.taxExempt ? [] : item.taxRateIds,
              });
              setItemId("");
            }}
          >
            Add Item
          </Button>
          <Button
            type="button"
            variant="outline"
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
            Custom line
          </Button>
        </div>
        {values.lines.map((line, index) => (
          <fieldset
            key={line.key}
            className="space-y-3 rounded-md border border-border p-3"
          >
            <legend className="px-1 text-sm font-medium">
              Line {index + 1}
            </legend>
            <div className="space-y-2">
              <Label htmlFor={`${line.key}-name`}>Name</Label>
              <Input
                id={`${line.key}-name`}
                required
                value={line.name}
                onChange={(event) =>
                  setLine(line.key, { name: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${line.key}-description`}>Description</Label>
              <Textarea
                id={`${line.key}-description`}
                value={line.description}
                onChange={(event) =>
                  setLine(line.key, { description: event.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${line.key}-qty`}>Quantity</Label>
                <Input
                  id={`${line.key}-qty`}
                  required
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) =>
                    setLine(line.key, { quantity: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${line.key}-price`}>Unit price (USD)</Label>
                <Input
                  id={`${line.key}-price`}
                  required
                  inputMode="decimal"
                  placeholder="12.50"
                  value={line.unitPrice}
                  onChange={(event) =>
                    setLine(line.key, { unitPrice: event.target.value })
                  }
                />
              </div>
            </div>
            {taxRates.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Tax Rates</legend>
                {taxRates.map((rate) => (
                  <label
                    key={rate.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-foreground"
                      checked={(line.taxRateIds ?? []).includes(rate.id)}
                      onChange={() => {
                        const current = line.taxRateIds ?? [];
                        const taxRateIds = current.includes(rate.id)
                          ? current.filter((id) => id !== rate.id)
                          : [...current, rate.id];
                        setLine(line.key, { taxRateIds });
                      }}
                    />
                    {rate.name} ({rate.rate}%)
                  </label>
                ))}
              </fieldset>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  lines: current.lines.filter(
                    (candidate) => candidate.key !== line.key,
                  ),
                }))
              }
            >
              Remove line
            </Button>
          </fieldset>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={values.notes}
          onChange={(event) =>
            setValues({ ...values, notes: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="terms">Terms</Label>
        <Textarea
          id="terms"
          value={values.terms}
          onChange={(event) =>
            setValues({ ...values, terms: event.target.value })
          }
        />
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        {onSend ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onSend(payload())}
          >
            Send
          </Button>
        ) : null}
      </div>
    </form>
  );
}
