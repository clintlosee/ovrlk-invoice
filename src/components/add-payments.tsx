import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isManualPaymentMethod,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
  paymentMethodLabel,
} from "@/lib/invoice";
import { applyToAll, type PaymentFormGroup } from "@/lib/invoice-bulk";
import { formatCents, formatUsd, parseDollarsToCents } from "@/lib/money";
import { recordInvoicePayments } from "@/server/payments";

const SKIP_REASON: Record<string, string> = {
  "no-email": "no email",
  "email-failed": "email failed",
};

const selectClass =
  "flex h-10 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type ScreenRow = {
  invoiceId: string;
  numberLabel: string;
  paidOn: string;
  note: string;
  method: ManualPaymentMethod;
  amount: string;
};

type ScreenGroup = { clientName: string; rows: ScreenRow[] };

export function AddPayments({
  groups: initialGroups,
  rejected,
}: {
  groups: PaymentFormGroup[];
  rejected: { id: string; clientName: string }[];
}) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ScreenGroup[]>(() =>
    initialGroups.map((group) => ({
      clientName: group.clientName,
      rows: group.rows.map((row) => ({
        invoiceId: row.invoiceId,
        numberLabel: row.numberLabel,
        paidOn: row.paidOn,
        note: row.note,
        method: row.method,
        amount: formatCents(row.amountCents),
      })),
    })),
  );
  const [applyPaidOn, setApplyPaidOn] = useState(
    () => initialGroups[0]?.rows[0]?.paidOn ?? "",
  );
  const [applyNote, setApplyNote] = useState("");
  const [applyMethod, setApplyMethod] = useState<ManualPaymentMethod>("check");
  const [notify, setNotify] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const included = groups.reduce(
    (total, group) => total + group.rows.length,
    0,
  );

  function patchRow(invoiceId: string, patch: Partial<ScreenRow>) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        rows: group.rows.map((row) =>
          row.invoiceId === invoiceId ? { ...row, ...patch } : row,
        ),
      })),
    );
  }

  function onApply() {
    const flattened = groups.flatMap((group) =>
      group.rows.map((row) => ({
        invoiceId: row.invoiceId,
        numberLabel: row.numberLabel,
        paidOn: row.paidOn,
        note: row.note,
        method: row.method,
        amountCents: 0,
      })),
    );
    const next = applyToAll(flattened, {
      paidOn: applyPaidOn,
      note: applyNote,
      method: applyMethod,
    });
    const byId = new Map(next.map((row) => [row.invoiceId, row]));
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        rows: group.rows.map((row) => {
          const updated = byId.get(row.invoiceId);
          if (!updated) return row;
          return {
            ...row,
            paidOn: updated.paidOn,
            note: updated.note,
            method: updated.method,
          };
        }),
      })),
    );
  }

  async function onSave() {
    setPending(true);
    setMessage(null);
    const rows = [];
    try {
      for (const group of groups) {
        for (const row of group.rows) {
          rows.push({
            invoiceId: row.invoiceId,
            amountCents: parseDollarsToCents(row.amount),
            paidOn: row.paidOn,
            method: row.method,
            note: row.note.trim() ? row.note.trim() : null,
          });
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Check the form and try again.",
      );
      setPending(false);
      return;
    }
    try {
      const result = await recordInvoicePayments({ data: { notify, rows } });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      const skipped = result.skipped.map((row) => {
        const reason = SKIP_REASON[row.reason] ?? row.reason;
        return `${row.clientName}: ${reason}.`;
      });
      if (skipped.length > 0) {
        setMessage(skipped.join(" "));
        setSaved(true);
        setPending(false);
        return;
      }
      await navigate({ to: "/app/invoices" });
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="border-b-2 border-solar pb-3 font-serif text-3xl">
        Add Payments <span className="font-bold">({included})</span>
      </h1>
      {rejected.length > 0 ? (
        <p className="mt-4 text-sm">
          Left out: {rejected.map((row) => row.clientName).join(", ")}.
        </p>
      ) : null}
      {message ? <p className="mt-4 text-sm">{message}</p> : null}
      {saved || included === 0 ? (
        <p className="mt-6">
          <Button asChild variant="outline">
            <Link to="/app/invoices">Cancel</Link>
          </Button>
        </p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="font-serif text-xl">Apply to all</h2>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-sm text-solar-ink" htmlFor="apply-paid-on">
                Date
                <Input
                  id="apply-paid-on"
                  type="date"
                  className="w-40"
                  value={applyPaidOn}
                  onChange={(event) => setApplyPaidOn(event.target.value)}
                />
              </label>
              <label className="text-sm text-solar-ink" htmlFor="apply-note">
                Notes
                <Input
                  id="apply-note"
                  className="min-w-80"
                  maxLength={500}
                  value={applyNote}
                  onChange={(event) => setApplyNote(event.target.value)}
                />
              </label>
              <label className="text-sm text-solar-ink" htmlFor="apply-method">
                Payment type
                <select
                  id="apply-method"
                  className={selectClass}
                  value={applyMethod}
                  onChange={(event) => {
                    if (isManualPaymentMethod(event.target.value)) {
                      setApplyMethod(event.target.value);
                    }
                  }}
                >
                  {MANUAL_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="outline" onClick={onApply}>
                Apply
              </Button>
            </div>
          </section>
          <form
            className="mt-8"
            onSubmit={(event) => {
              event.preventDefault();
              void onSave();
            }}
          >
            {groups.map((group) => (
              <section
                key={group.clientName}
                className="mt-6 border-b border-border pb-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <h2 className="font-serif text-xl">
                    {group.clientName}{" "}
                    <span className="font-bold">({group.rows.length})</span>
                  </h2>
                  <p className="text-sm font-medium">
                    {formatUsd(sumAmounts(group.rows))}
                  </p>
                </div>
                <ul className="mt-3 space-y-3">
                  {group.rows.map((row) => (
                    <li
                      key={row.invoiceId}
                      className="flex flex-wrap items-end justify-between gap-4"
                    >
                      <p className="font-medium tabular-nums">
                        {row.numberLabel}
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <label
                          className="text-sm text-solar-ink"
                          htmlFor={`paid-on-${row.invoiceId}`}
                        >
                          Date
                          <Input
                            id={`paid-on-${row.invoiceId}`}
                            type="date"
                            required
                            className="w-40"
                            value={row.paidOn}
                            onChange={(event) =>
                              patchRow(row.invoiceId, {
                                paidOn: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label
                          className="text-sm text-solar-ink"
                          htmlFor={`note-${row.invoiceId}`}
                        >
                          Notes
                          <Input
                            id={`note-${row.invoiceId}`}
                            className="min-w-80"
                            maxLength={500}
                            value={row.note}
                            onChange={(event) =>
                              patchRow(row.invoiceId, {
                                note: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label
                          className="text-sm text-solar-ink"
                          htmlFor={`method-${row.invoiceId}`}
                        >
                          Payment type
                          <select
                            id={`method-${row.invoiceId}`}
                            className={selectClass}
                            value={row.method}
                            onChange={(event) => {
                              if (isManualPaymentMethod(event.target.value)) {
                                patchRow(row.invoiceId, {
                                  method: event.target.value,
                                });
                              }
                            }}
                          >
                            {MANUAL_PAYMENT_METHODS.map((method) => (
                              <option key={method} value={method}>
                                {paymentMethodLabel(method)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label
                          className="text-sm text-solar-ink"
                          htmlFor={`amount-${row.invoiceId}`}
                        >
                          Amount
                          <Input
                            id={`amount-${row.invoiceId}`}
                            inputMode="decimal"
                            required
                            className="w-28"
                            value={row.amount}
                            onChange={(event) =>
                              patchRow(row.invoiceId, {
                                amount: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor="notify-clients"
              >
                <input
                  id="notify-clients"
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                />
                Send clients a payment notification email
              </label>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link to="/app/invoices">Cancel</Link>
                </Button>
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </>
  );
}

function sumAmounts(rows: { amount: string }[]) {
  return rows.reduce((total, row) => {
    try {
      return total + parseDollarsToCents(row.amount);
    } catch {
      return total;
    }
  }, 0);
}
