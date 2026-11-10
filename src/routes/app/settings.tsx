import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { BusinessForm } from "@/components/business-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type BusinessFormValues,
  clearBusinessLogo,
  disconnectConnectedAccount,
  getBusinessSettings,
  startStripeConnect,
  startStripeOAuth,
  updateBusinessSettings,
} from "@/server/business";

export const Route = createFileRoute("/app/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    stripe:
      search.stripe === "rejected" || search.stripe === "denied"
        ? search.stripe
        : undefined,
  }),
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
      <h1 className="border-b-2 border-solar pb-3 font-serif text-3xl">
        Business
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Shown on Invoices. {settings.currency} · {settings.timeZone}
      </p>
      <section className="mt-8">
        <h2 className="font-serif text-2xl">Appearance</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Light, dark, or match this device. Sign-in and Invoice Links stay on
          the device theme.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>
      <Card className="mt-8">
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
      <Logo settings={settings} />
      <StripeConnect settings={settings} />
    </>
  );
}

function Logo({
  settings,
}: {
  settings: NonNullable<ReturnType<typeof Route.useLoaderData>>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!settings.storageConfigured) {
    return (
      <section className="mt-8">
        <h2 className="font-serif text-2xl">Logo</h2>
        <p className="mt-2 text-sm">
          Logo upload needs Cloudflare R2, which is not configured.
        </p>
      </section>
    );
  }
  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Logo</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        JPEG or PNG, up to 10 MB. Shown on the Invoice and its PDF.
      </p>
      <Card>
        {settings.hasLogo ? (
          <img src="/app/logo" alt="" className="mb-4 h-16 w-auto" />
        ) : (
          <p className="text-sm">No logo yet.</p>
        )}
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("logo");
            if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
              return;
            }
            const form = event.currentTarget;
            const body = new FormData();
            body.set("logo", input.files[0]);
            setPending(true);
            setMessage(null);
            void fetch("/app/logo", { method: "POST", body })
              .then(async (response) => {
                const result = (await response.json()) as {
                  ok: boolean;
                  message?: string;
                };
                setPending(false);
                setMessage(
                  result.ok
                    ? "Saved."
                    : (result.message ?? "Could not upload."),
                );
                if (result.ok) {
                  form.reset();
                  await router.invalidate();
                }
              })
              .catch(() => {
                setPending(false);
                setMessage("Could not upload.");
              });
          }}
        >
          <input
            name="logo"
            type="file"
            accept="image/jpeg,image/png"
            required
            className="text-sm"
          />
          <Button type="submit" disabled={pending}>
            Upload logo
          </Button>
        </form>
        {settings.hasLogo ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void clearBusinessLogo().then(async (result) => {
                setPending(false);
                setMessage(result.ok ? "Removed." : result.message);
                if (result.ok) await router.invalidate();
              });
            }}
          >
            Remove logo
          </Button>
        ) : null}
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </Card>
    </section>
  );
}

function StripeConnect({
  settings,
}: {
  settings: NonNullable<ReturnType<typeof Route.useLoaderData>>;
}) {
  const router = useRouter();
  const { stripe } = Route.useSearch();
  const [message, setMessage] = useState<string | null>(
    stripe === "rejected"
      ? "That Stripe connection was rejected."
      : stripe === "denied"
        ? "The Stripe connection was canceled."
        : null,
  );
  const [pending, setPending] = useState(false);
  const connected = Boolean(settings.stripeAccountId);
  const state = !connected
    ? "Not connected"
    : settings.stripeChargesEnabled
      ? "Connected · charges enabled"
      : "Connected · charges not enabled";
  const method =
    settings.stripeConnectMethod === "oauth"
      ? "Linked existing account"
      : settings.stripeConnectMethod === "account_link"
        ? "New Stripe account"
        : null;

  function openStripe(
    start: () => Promise<{ ok: boolean; url?: string; message?: string }>,
  ) {
    setPending(true);
    setMessage(null);
    void start().then((result) => {
      if (!result.ok || !result.url) {
        setMessage(result.message ?? "Could not open Stripe. Try again.");
        setPending(false);
        return;
      }
      window.location.assign(result.url);
    });
  }

  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Stripe</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Card Payments settle in this Business's Connected Account.
      </p>
      <Card>
        <p className="text-sm">{state}</p>
        {connected ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {settings.stripeAccountId}
            {method ? ` · ${method}` : ""}
          </p>
        ) : null}
        {!settings.stripeConfigured ? (
          <p className="mt-3 text-sm">Stripe is not configured.</p>
        ) : connected ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {settings.stripeConnectMethod !== "oauth" &&
            !settings.stripeChargesEnabled ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => openStripe(() => startStripeConnect())}
              >
                Finish Stripe setup
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const oauth = settings.stripeConnectMethod === "oauth";
                if (
                  !window.confirm(
                    oauth
                      ? "Disconnect stops card Payments here and revokes this app on the Stripe account."
                      : "Disconnect stops card Payments here. The Stripe account stays open.",
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
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium">
                Create a new Stripe account
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Stripe hosts a new Standard account for this Business. Card
                Payments settle there.
              </p>
              <Button
                type="button"
                className="mt-2"
                disabled={pending}
                onClick={() => openStripe(() => startStripeConnect())}
              >
                Create a new Stripe account
              </Button>
            </div>
            {settings.stripeOauthConfigured ? (
              <div>
                <h3 className="text-sm font-medium">
                  Link my existing Stripe account
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect a Stripe account you already have. Card Payments
                  settle there.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  disabled={pending}
                  onClick={() => openStripe(() => startStripeOAuth())}
                >
                  Link my existing Stripe account
                </Button>
              </div>
            ) : null}
          </div>
        )}
        {settings.stripeConfigured &&
        connected &&
        !settings.stripeDetailsSubmitted ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Stripe still needs a few details before charges can be enabled.
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-destructive">{message}</p>
        ) : null}
      </Card>
    </section>
  );
}
