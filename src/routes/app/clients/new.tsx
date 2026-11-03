import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Card } from "@/components/ui/card";
import { createClient } from "@/server/catalog";

const empty: ClientFormValues = {
  name: "",
  email: "",
  phone: "",
  address: "",
  taxExempt: false,
  note: "",
};

export const Route = createFileRoute("/app/clients/new")({
  component: NewClientPage,
});

function NewClientPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(values: ClientFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await createClient({ data: values });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      await navigate({ to: "/app/clients" });
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <>
      <Link to="/app/clients" className="text-sm underline">
        Clients
      </Link>
      <h1 className="mt-3 font-serif text-3xl">New Client</h1>
      <Card>
        <ClientForm
          initial={empty}
          pending={pending}
          message={message}
          submitLabel="Save Client"
          onSubmit={(values) => void onSubmit(values)}
        />
      </Card>
    </>
  );
}
