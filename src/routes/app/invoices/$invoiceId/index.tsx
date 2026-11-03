import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { InvoiceDocument } from "@/components/invoice-document";
import { InvoiceForm } from "@/components/invoice-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getClients, getItems, getTaxRates } from "@/server/catalog";
import {
  deleteInvoice,
  getInvoice,
  type InvoiceFormValues,
  regenerateInvoiceLink,
  remindInvoice,
  revokeInvoiceLinks,
  sendInvoice,
  updateInvoice,
  voidInvoice,
} from "@/server/invoices";

export const Route = createFileRoute("/app/invoices/$invoiceId/")({
  loader: async ({ params }) => {
    const [invoice, clients, items, taxRates] = await Promise.all([
      getInvoice({ data: { id: params.invoiceId } }),
      getClients(),
      getItems(),
      getTaxRates(),
    ]);
    return {
      invoice,
      clients: clients ?? [],
      items: items ?? [],
      taxRates: taxRates ?? [],
    };
  },
  component: InvoicePage,
});

function InvoicePage() {
  const { invoice, clients, items, taxRates } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (!invoice) return <p>That Invoice does not exist.</p>;

  async function onSave(values: InvoiceFormValues) {
    if (!invoice) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateInvoice({
        data: { id: invoice.id, ...values },
      });
      setPending(false);
      setMessage(result.ok ? "Saved." : result.message);
      if (result.ok) await router.invalidate();
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  async function onSend(values: InvoiceFormValues) {
    if (!invoice) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await sendInvoice({ data: { id: invoice.id, ...values } });
      setPending(false);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setLink(result.url);
      setMessage(result.emailed ? "Sent." : result.message);
      await router.invalidate();
    } catch {
      setMessage("Could not send. Try again.");
      setPending(false);
    }
  }

  async function onDelete() {
    if (!invoice) return;
    if (!window.confirm("Delete this draft?")) return;
    setPending(true);
    const result = await deleteInvoice({ data: { id: invoice.id } });
    if (!result.ok) {
      setMessage(result.message);
      setPending(false);
      return;
    }
    await navigate({ to: "/app/invoices" });
  }

  return (
    <>
      <Link to="/app/invoices" className="text-sm underline">
        Invoices
      </Link>
      <h1 className="mt-3 font-serif text-3xl">
        Invoice {invoice.numberLabel}
      </h1>
      {invoice.locked ? (
        <div className="mt-6 space-y-4">
          <InvoiceDocument
            document={invoice.document}
            displayStatus={invoice.displayStatus}
            voidReason={invoice.voidReason}
            amountDueCents={invoice.amountDueCents}
          />
          {invoice.firstViewedAt ? (
            <p className="text-sm text-muted">
              First viewed {invoice.firstViewedAt.slice(0, 10)}
            </p>
          ) : null}
          <p>
            <a
              className="text-sm underline"
              href={`/app/invoices/${invoice.id}/pdf`}
            >
              Download PDF
            </a>
          </p>
          {link ? (
            <label className="block space-y-2 text-sm" htmlFor="invoice-link">
              Invoice Link. It is shown once. Save it, or generate another.
              <Input id="invoice-link" readOnly value={link} />
            </label>
          ) : (
            <p className="text-sm text-muted">
              The Invoice Link is not stored. Generate a new one if you need it
              again.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void regenerateInvoiceLink({ data: { id: invoice.id } }).then(
                  async (result) => {
                    setPending(false);
                    if (!result.ok) {
                      setMessage(result.message);
                      return;
                    }
                    setLink(result.url);
                    setMessage(
                      "New link ready. The previous link no longer works.",
                    );
                  },
                );
              }}
            >
              New link
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void revokeInvoiceLinks({ data: { id: invoice.id } }).then(
                  (result) => {
                    setPending(false);
                    setLink(null);
                    setMessage(result.ok ? "Link revoked." : result.message);
                  },
                );
              }}
            >
              Revoke link
            </Button>
            {invoice.status === "sent" ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  void remindInvoice({ data: { id: invoice.id } }).then(
                    (result) => {
                      setPending(false);
                      if (!result.ok) {
                        setMessage(result.message);
                        return;
                      }
                      setLink(result.url);
                      setMessage("Reminder sent.");
                    },
                  );
                }}
              >
                Send reminder
              </Button>
            ) : null}
          </div>
          {invoice.status === "sent" || invoice.status === "paid" ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPending(true);
                void voidInvoice({
                  data: { id: invoice.id, reason },
                }).then(async (result) => {
                  setPending(false);
                  if (!result.ok) {
                    setMessage(result.message);
                    return;
                  }
                  setMessage("Voided.");
                  await router.invalidate();
                });
              }}
            >
              <div className="min-w-48 flex-1 space-y-2">
                <label className="text-sm font-medium" htmlFor="void-reason">
                  Void reason
                </label>
                <Input
                  id="void-reason"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" disabled={pending}>
                Void
              </Button>
            </form>
          ) : null}
          {message ? <p className="text-sm text-danger">{message}</p> : null}
        </div>
      ) : (
        <Card>
          <InvoiceForm
            initial={{
              clientId: invoice.clientId,
              issueDate: invoice.document.issueDate,
              dueDate: invoice.document.dueDate,
              reference: invoice.document.reference ?? "",
              notes: invoice.document.notes ?? "",
              terms: invoice.document.terms ?? "",
              lines: (invoice.editorLines ?? []).map((line) => ({
                ...line,
                key: crypto.randomUUID(),
              })),
            }}
            clients={clients}
            items={items}
            taxRates={taxRates}
            pending={pending}
            message={message}
            onSave={(values) => void onSave(values)}
            onSend={(values) => void onSend(values)}
          />
          <Button
            type="button"
            variant="ghost"
            className="mt-2"
            disabled={pending}
            onClick={() => void onDelete()}
          >
            Delete draft
          </Button>
        </Card>
      )}
    </>
  );
}
