import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { BusinessForm } from "@/components/business-form";
import { Card } from "@/components/ui/card";
import {
  type BusinessFormValues,
  getBusinessSettings,
  updateBusinessSettings,
} from "@/server/business";

export const Route = createFileRoute("/app/settings")({
  loader: () => getBusinessSettings(),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = Route.useLoaderData();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!settings) return <p>Sign in again.</p>;

  async function onSubmit(values: BusinessFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await updateBusinessSettings({ data: values });
      setPending(false);
      setMessage(result.ok ? "Saved." : result.message);
      if (result.ok) await router.invalidate();
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-3xl">Business</h1>
      <p className="mt-2 text-sm text-muted">
        Shown on Invoices. {settings.currency} · {settings.timeZone}
      </p>
      <Card>
        <BusinessForm
          initial={{
            name: settings.name,
            address: settings.address,
            taxId: settings.taxId,
            defaultTerms: settings.defaultTerms,
            footer: settings.footer,
            accentColor: settings.accentColor,
          }}
          pending={pending}
          message={message}
          onSubmit={(values) => void onSubmit(values)}
        />
      </Card>
    </>
  );
}
