import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getClient, setClientArchived, updateClient } from "@/server/catalog";

export const Route = createFileRoute("/app/clients/$clientId")({
  loader: ({ params }) => getClient({ data: { id: params.clientId } }),
  component: EditClientPage,
});

function EditClientPage() {
  const client = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!client) return <p>That Client does not exist.</p>;

  async function onSubmit(values: ClientFormValues) {
    if (!client) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateClient({ data: { id: client.id, ...values } });
      setPending(false);
      setMessage(result.ok ? "Saved." : result.message);
      if (result.ok) await router.invalidate();
    } catch {
      setPending(false);
      setMessage("Could not save. Try again.");
    }
  }

  async function onArchive() {
    if (!client) return;
    const next = !client.archived;
    if (
      next &&
      !window.confirm(
        "Archive this Client? They stay on record and can be restored.",
      )
    ) {
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const result = await setClientArchived({
        data: { id: client.id, archived: next },
      });
      setPending(false);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await router.invalidate();
      await navigate({ to: "/app/clients" });
    } catch {
      setPending(false);
      setMessage("Could not update this Client. Try again.");
    }
  }

  return (
    <>
      <Link to="/app/clients" className="text-sm text-primary underline">
        Clients
      </Link>
      <h1 className="mt-3 border-b-2 border-brass pb-3 font-serif text-3xl">
        {client.name}
      </h1>
      {client.archived ? (
        <p className="mt-2 text-sm text-muted-foreground">Archived</p>
      ) : null}
      <Card>
        <ClientForm
          key={client.id}
          initial={{
            name: client.name,
            email: client.email,
            phone: client.phone,
            address: client.address,
            taxExempt: client.taxExempt,
            note: client.note,
          }}
          pending={pending}
          message={message}
          submitLabel="Save Client"
          onSubmit={(values) => void onSubmit(values)}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={pending}
          onClick={() => void onArchive()}
        >
          {client.archived ? "Unarchive" : "Archive"}
        </Button>
      </Card>
    </>
  );
}
