import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cardSurface } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InvoiceStatus } from "@/lib/invoice";
import { bulkActionState } from "@/lib/invoice-bulk";
import { cn } from "@/lib/utils";
import {
  destroyInvoices,
  markInvoicesSent,
  sendInvoices,
} from "@/server/invoices";

export type BulkInvoice = {
  id: string;
  status: InvoiceStatus;
  clientName: string;
  numberLabel: string;
};

const SKIP_REASON: Record<string, string> = {
  void: "void",
  "no-lines": "no lines",
  "no-email": "no email",
  "email-failed": "email failed",
  "not-draft": "not a draft",
};

export function InvoiceBulkBar({
  invoices,
  onClear,
  onMessage,
}: {
  invoices: BulkInvoice[];
  onClear: () => void;
  onMessage: (message: string | null) => void;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const actions = bulkActionState(invoices);
  const ids = invoices.map((invoice) => invoice.id);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);

  async function finish(message: string | null) {
    onMessage(message);
    onClear();
    await router.invalidate();
  }

  async function onEdit() {
    const invoiceId = invoices[0]?.id;
    if (!invoiceId || !actions.edit) return;
    await navigate({
      to: "/app/invoices/$invoiceId",
      params: { invoiceId },
    });
  }

  function onDownload() {
    window.location.assign(`/app/invoices/pdfs?ids=${ids.join(",")}`);
    onClear();
  }

  async function onMarkSent() {
    setPending(true);
    onMessage(null);
    try {
      const result = await markInvoicesSent({ data: { ids } });
      setPending(false);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      const skipped = skipLines(result.skipped, invoices);
      const lead =
        result.sentIds.length === 0 ? "Nothing was marked sent." : "";
      await finish([lead, ...skipped].filter(Boolean).join(" ") || null);
    } catch {
      setPending(false);
      onMessage("Could not mark Invoices sent. Try again.");
    }
  }

  async function onDelete() {
    const n = invoices.length;
    if (
      !window.confirm(
        `Delete ${n} invoices? Payments recorded on them are removed too.`,
      )
    ) {
      return;
    }
    setPending(true);
    onMessage(null);
    try {
      const result = await destroyInvoices({ data: { ids } });
      setPending(false);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      await finish(null);
    } catch {
      setPending(false);
      onMessage("Could not delete Invoices. Try again.");
    }
  }

  async function onSend(attachPdf: boolean) {
    setSending(false);
    setPending(true);
    onMessage(null);
    try {
      const result = await sendInvoices({ data: { ids, attachPdf } });
      setPending(false);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      await finish(skipLines(result.skipped, invoices).join(" ") || null);
    } catch {
      setPending(false);
      onMessage("Could not send. Try again.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            Bulk Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={!actions.edit}
            onSelect={() => void onEdit()}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSending(true)}>
            Send by Email
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDownload}>
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onMarkSent()}>
            Mark as Sent
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!actions.addPayment}
            onSelect={() => {
              void navigate({
                to: "/app/invoices/payments",
                search: { ids: ids.join(",") },
              });
            }}
          >
            Add a Payment
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onDelete()}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {sending ? (
        <SendDialog
          pending={pending}
          onClose={() => setSending(false)}
          onConfirm={(attachPdf) => void onSend(attachPdf)}
        />
      ) : null}
    </>
  );
}

function skipLines(
  skipped: { invoiceId?: string; clientName?: string; reason: string }[],
  invoices: BulkInvoice[],
) {
  return skipped.map((row) => {
    const match = invoices.find((invoice) => invoice.id === row.invoiceId);
    const name = row.clientName ?? match?.clientName ?? match?.numberLabel;
    const reason = SKIP_REASON[row.reason] ?? row.reason;
    return name ? `${name}: ${reason}.` : `${reason}.`;
  });
}

function SendDialog({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: (attachPdf: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [attachPdf, setAttachPdf] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="send-invoices-title"
      className={cn(
        cardSurface,
        "m-auto w-[calc(100%-2rem)] max-w-md overflow-y-auto p-0 backdrop:bg-foreground/40",
      )}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(attachPdf);
        }}
      >
        <h2 id="send-invoices-title" className="font-serif text-xl">
          Send by Email
        </h2>
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor="attach-pdfs"
        >
          <input
            id="attach-pdfs"
            type="checkbox"
            className="size-4 accent-primary"
            checked={attachPdf}
            onChange={(event) => setAttachPdf(event.target.checked)}
          />
          Attach PDFs
        </label>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Send
          </Button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
