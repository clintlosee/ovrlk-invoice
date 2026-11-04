import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { cardSurface } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { updateClient } from "@/server/catalog";

export type EditableClient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxExempt: boolean;
  note: string;
};

export function ClientQuickEdit({
  client,
  onClose,
}: {
  client: EditableClient;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function save(values: ClientFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await updateClient({ data: { id: client.id, ...values } });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      await router.invalidate();
      onClose();
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="edit-client-title"
      className={cn(
        cardSurface,
        "m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%-_2rem)] max-w-lg overflow-y-auto p-0 backdrop:bg-foreground/40",
      )}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="edit-client-title" className="font-serif text-xl">
          Edit Client
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 px-0"
          aria-label="Close"
          disabled={pending}
          onClick={onClose}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="p-4">
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
          onSubmit={(values) => void save(values)}
        />
      </div>
    </dialog>,
    document.body,
  );
}
