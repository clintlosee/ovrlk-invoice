import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { InvoiceForm } from "@/components/invoice-form";
import { Card } from "@/components/ui/card";
import { getBusinessSettings } from "@/server/business";
import { getClients, getItems, getTaxRates } from "@/server/catalog";
import { createInvoice, type InvoiceFormValues } from "@/server/invoices";

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

  async function onSave(values: InvoiceFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await createInvoice({ data: values });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      await navigate({
        to: "/app/invoices/$invoiceId",
        params: { invoiceId: result.value.id },
      });
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <>
      <Link to="/app/invoices" className="text-sm underline">
        Invoices
      </Link>
      <h1 className="mt-3 font-serif text-3xl">New Invoice</h1>
      {clients.length === 0 ? (
        <p className="mt-4 text-sm">
          Add a{" "}
          <Link to="/app/clients/new" className="underline">
            Client
          </Link>{" "}
          before creating an Invoice.
        </p>
      ) : (
        <Card>
          <InvoiceForm
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
            onSave={(values) => void onSave(values)}
          />
        </Card>
      )}
    </>
  );
}
