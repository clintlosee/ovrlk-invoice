import {
  formatInvoiceNumber,
  type InvoiceDisplayStatus,
  type InvoiceSnapshot,
  statusLabel,
} from "@/lib/invoice";
import { formatUsd } from "@/lib/money";
import { formatBps } from "@/lib/tax";

export function InvoiceDocument({
  document,
  displayStatus,
  voidReason,
  amountDueCents,
  paidCents = 0,
}: {
  document: InvoiceSnapshot;
  displayStatus: InvoiceDisplayStatus;
  voidReason: string | null;
  amountDueCents: number;
  paidCents?: number;
}) {
  const accent = document.business.accentColor;
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="h-2" style={{ backgroundColor: accent }} />
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl">{document.business.name}</h1>
            {document.business.address ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                {document.business.address}
              </p>
            ) : null}
            {document.business.taxId ? (
              <p className="text-sm text-muted">
                Tax ID {document.business.taxId}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="font-serif text-2xl" style={{ color: accent }}>
              Invoice {formatInvoiceNumber(document.number)}
            </p>
            <p className="mt-1 text-sm">{statusLabel(displayStatus)}</p>
          </div>
        </header>
        {displayStatus === "void" ? (
          <p className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">
            This Invoice is void.{voidReason ? ` ${voidReason}` : ""}
          </p>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="text-sm font-medium text-muted">Bill to</h2>
            <p className="mt-1 font-medium">{document.client.name}</p>
            <p className="text-sm">{document.client.email}</p>
            {document.client.phone ? (
              <p className="text-sm">{document.client.phone}</p>
            ) : null}
            {document.client.address ? (
              <p className="whitespace-pre-wrap text-sm">
                {document.client.address}
              </p>
            ) : null}
            {document.client.taxExempt ? (
              <p className="text-sm text-muted">Tax-exempt</p>
            ) : null}
          </section>
          <section className="text-sm">
            <p>Issued {document.issueDate}</p>
            <p>Due {document.dueDate}</p>
            {document.reference ? <p>Reference {document.reference}</p> : null}
          </section>
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {document.lines.map((line, lineNumber) => (
            // A snapshot line has no id, and two lines can be identical.
            // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity
            <li key={lineNumber} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{line.name}</p>
                  {line.description ? (
                    <p className="whitespace-pre-wrap text-sm text-muted">
                      {line.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted">
                    {line.quantity} × {formatUsd(line.unitPriceCents)}
                  </p>
                  {line.taxes.map((tax) => (
                    <p
                      key={`${tax.name}-${tax.rateBps}`}
                      className="text-sm text-muted"
                    >
                      {tax.name} {formatBps(tax.rateBps)}% ·{" "}
                      {formatUsd(tax.taxCents)}
                    </p>
                  ))}
                </div>
                <p className="text-sm">{formatUsd(line.amountCents)}</p>
              </div>
            </li>
          ))}
        </ul>
        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between gap-6">
            <dt>Subtotal</dt>
            <dd>{formatUsd(document.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt>Tax</dt>
            <dd>{formatUsd(document.taxCents)}</dd>
          </div>
          <div className="flex justify-between gap-6 font-medium">
            <dt>Total</dt>
            <dd>{formatUsd(document.totalCents)}</dd>
          </div>
          {paidCents > 0 ? (
            <div className="flex justify-between gap-6">
              <dt>Paid</dt>
              <dd>{formatUsd(paidCents)}</dd>
            </div>
          ) : null}
          {paidCents > document.totalCents ? (
            <div className="flex justify-between gap-6 font-medium">
              <dt>Credit</dt>
              <dd>{formatUsd(paidCents - document.totalCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-6 font-medium">
            <dt>Balance</dt>
            <dd>{formatUsd(amountDueCents)}</dd>
          </div>
        </dl>
        {document.notes ? (
          <p className="whitespace-pre-wrap text-sm">{document.notes}</p>
        ) : null}
        {document.terms ? (
          <p className="whitespace-pre-wrap text-sm text-muted">
            {document.terms}
          </p>
        ) : null}
        {document.business.footer ? (
          <p className="whitespace-pre-wrap text-sm text-muted">
            {document.business.footer}
          </p>
        ) : null}
      </div>
    </article>
  );
}
