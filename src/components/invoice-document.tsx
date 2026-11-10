import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { cardSurface } from "@/components/ui/card";
import {
  formatInvoiceNumber,
  type InvoiceDisplayStatus,
  type InvoiceSnapshot,
} from "@/lib/invoice";
import { formatUsd } from "@/lib/money";
import { formatBps } from "@/lib/tax";
import { cn } from "@/lib/utils";

export function InvoiceDocument({
  document,
  displayStatus,
  voidReason,
  amountDueCents,
  paidCents = 0,
  logoUrl = null,
}: {
  document: InvoiceSnapshot;
  displayStatus: InvoiceDisplayStatus;
  voidReason: string | null;
  amountDueCents: number;
  paidCents?: number;
  logoUrl?: string | null;
}) {
  const accent = document.business.accentColor;
  return (
    <article className={cn(cardSurface, "overflow-hidden")}>
      <div className="h-2" style={{ backgroundColor: accent }} />
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="mb-3 h-12 w-auto object-contain"
              />
            ) : null}
            <h1 className="font-serif text-3xl">{document.business.name}</h1>
            {document.business.address ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {document.business.address}
              </p>
            ) : null}
            {document.business.taxId ? (
              <p className="text-sm text-muted-foreground">
                Tax ID {document.business.taxId}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="font-serif text-2xl text-foreground">
              Invoice {formatInvoiceNumber(document.number)}
            </p>
            <div className="mt-2 flex justify-end">
              <InvoiceStatusBadge status={displayStatus} />
            </div>
          </div>
        </header>
        {displayStatus === "void" ? (
          <p className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
            This Invoice is void.{voidReason ? ` ${voidReason}` : ""}
          </p>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="text-sm font-medium text-muted-foreground">
              Bill to
            </h2>
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
              <p className="text-sm text-muted-foreground">Tax-exempt</p>
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
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {line.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {line.quantity} × {formatUsd(line.unitPriceCents)}
                  </p>
                  {line.taxes.map((tax) => (
                    <p
                      key={`${tax.name}-${tax.rateBps}`}
                      className="text-sm text-muted-foreground"
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
          <div className="flex justify-between gap-6 border-b-2 border-solar pb-1 font-medium">
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
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {document.terms}
          </p>
        ) : null}
        {document.business.footer ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {document.business.footer}
          </p>
        ) : null}
      </div>
    </article>
  );
}
