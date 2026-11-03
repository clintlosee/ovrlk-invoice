import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { InvoiceForm } from "@/components/invoice-form";
import { getBusinessSettings } from "@/server/business";
import { getClients, getItems, getTaxRates } from "@/server/catalog";
import {
  createInvoice,
  type InvoiceFormValues,
  sendInvoice,
} from "@/server/invoices";

export const Route = createFileRoute("/app/invoices/new")({
  loader: async () => {
    const [clients, items, taxRates, settings] = await Promise.all([
      getClients(),
      getItems(),
      getTaxRates(),
      getBusinessSettings(),
    ]);
    return {
      clients: clients ?? [],
      items: items ?? [],
      taxRates: taxRates ?? [],
      settings,
    };
  },
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const { clients, items, taxRates, settings } = Route.useLoaderData();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!settings) return <p>Sign in again.</p>;

  async function openInvoice(invoiceId: string, notice: string) {
    await navigate({
      to: "/app/invoices/$invoiceId",
      params: { invoiceId },
      replace: true,
      search: { notice },
    });
  }

  async function persist(values: InvoiceFormValues, send: boolean) {
    setPending(true);
    setMessage(null);
    let createdId: string | undefined;
    try {
      const created = await createInvoice({ data: values });
      if (!created.ok) {
        setMessage(created.message);
        setPending(false);
        return;
      }
      createdId = created.value.id;
      if (!send) {
        await openInvoice(createdId, "Saved.");
        return;
      }
      const sent = await sendInvoice({
        data: { id: createdId, ...values },
      });
      const notice = !sent.ok
        ? sent.message
        : sent.emailed
          ? "Sent."
          : sent.message;
      await openInvoice(createdId, notice);
    } catch {
      if (createdId) {
        await openInvoice(
          createdId,
          send
            ? "The Invoice was saved, but it was not sent. Try Send again."
            : "Saved.",
        );
        return;
      }
      setMessage(
        send ? "Could not send. Try again." : "Could not save. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      {clients.length === 0 ? (
        <>
          <h1 className="border-b-2 border-brass pb-3 font-serif text-2xl">
            New Invoice
          </h1>
          <p className="mt-4 text-sm">
            Add a{" "}
            <Link to="/app/clients/new" className="text-primary underline">
              Client
            </Link>{" "}
            before creating an Invoice.
          </p>
        </>
      ) : (
        <InvoiceForm
          title="New Invoice"
          numberLabel={null}
          letterhead={{
            name: settings.name,
            address: settings.address || null,
            taxId: settings.taxId || null,
            logoUrl: settings.hasLogo ? "/app/logo" : null,
          }}
          initial={{
            clientId: "",
            issueDate: settings.today,
            dueDate: settings.dueDate,
            reference: "",
            notes: "",
            terms: settings.defaultTerms,
            lines: [],
          }}
          clients={clients}
          items={items}
          taxRates={taxRates}
          pending={pending}
          message={message}
          onSave={(values) => void persist(values, false)}
          onSend={(values) => void persist(values, true)}
        />
      )}
    </div>
  );
}
