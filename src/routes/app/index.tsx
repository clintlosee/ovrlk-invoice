import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { getHome } from "@/server/session";

export const Route = createFileRoute("/app/")({
  loader: () => getHome(),
  component: AppHome,
});

function AppHome() {
  const home = Route.useLoaderData();
  if (!home) return <p>This account is not an Owner of a Business.</p>;
  const nudge = !home.totpEnabled || home.passkeyCount === 0;
  return (
    <>
      <h1 className="font-serif text-3xl">{home.businessName}</h1>
      <p className="mt-2 text-sm text-muted">
        {home.currency} · {home.timeZone}
      </p>
      {nudge ? (
        <Card className="mt-6">
          <p>
            Email codes are already required. An authenticator app or a passkey
            is optional, and worth adding when you have a minute.
          </p>
          <Link
            to="/app/security"
            className="mt-3 inline-block text-sm underline"
          >
            Security settings
          </Link>
        </Card>
      ) : (
        <p className="mt-6 text-sm">
          <Link to="/app/security" className="underline">
            Security settings
          </Link>
        </p>
      )}
      <p className="mt-8 text-sm">
        <Link to="/app/invoices" className="underline">
          Invoices
        </Link>
      </p>
      <p className="mt-4 text-sm text-muted">Expenses and reports are next.</p>
      <button
        type="button"
        className="mt-6 text-sm underline"
        onClick={() => {
          void authClient.signOut().then(() => {
            window.location.href = "/";
          });
        }}
      >
        Sign out
      </button>
    </>
  );
}
