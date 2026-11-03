import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { BusinessForm } from "@/components/business-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type BusinessFormValues,
  disconnectConnectedAccount,
  getBusinessSettings,
  startStripeConnect,
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
      <StripeConnect settings={settings} />
    </>
  );
}

function StripeConnect({
  settings,
}: {
  settings: NonNullable<ReturnType<typeof Route.useLoaderData>>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const connected = Boolean(settings.stripeAccountId);
  const state = !connected
    ? "Not connected"
    : settings.stripeChargesEnabled
      ? "Connected · charges enabled"
      : "Connected · charges not enabled";

  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Stripe</h2>
      <p className="mt-2 text-sm text-muted">
        Card Payments settle in this Business's Connected Account.
      </p>
      <Card>
        <p className="text-sm">{state}</p>
        {connected ? (
          <p className="mt-1 text-sm text-muted">{settings.stripeAccountId}</p>
        ) : null}
        {!settings.stripeConfigured ? (
          <p className="mt-3 text-sm">Stripe is not configured.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setPending(true);
                setMessage(null);
                void startStripeConnect().then((result) => {
                  if (!result.ok) {
                    setMessage(result.message);
                    setPending(false);
                    return;
                  }
                  window.location.assign(result.url);
                });
              }}
            >
              {connected && !settings.stripeChargesEnabled
                ? "Finish Stripe setup"
                : connected
                  ? "Update Stripe"
                  : "Connect Stripe"}
            </Button>
            {connected ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Disconnect stops card Payments here. The Stripe account stays open. Connecting again creates a new Connected Account.",
                    )
                  ) {
                    return;
                  }
                  setPending(true);
                  void disconnectConnectedAccount().then(async (result) => {
                    setPending(false);
                    setMessage(result.ok ? "Disconnected." : result.message);
                    if (result.ok) await router.invalidate();
                  });
                }}
              >
                Disconnect
              </Button>
            ) : null}
          </div>
        )}
        {settings.stripeConfigured &&
        connected &&
        !settings.stripeDetailsSubmitted ? (
          <p className="mt-3 text-sm text-muted">
            Stripe still needs a few details before charges can be enabled.
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-danger">{message}</p> : null}
      </Card>
    </section>
  );
}
