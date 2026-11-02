import { createFileRoute } from "@tanstack/react-router";
import { DraftNotice, Shell } from "@/components/shell";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <Shell>
      <DraftNotice />
      <h1 className="font-serif text-3xl">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p>
          This policy is a draft pending lawyer review. It describes what this
          version of the app stores. It is not in effect and it is not legal
          advice.
        </p>
        <p>
          We store the Owner&rsquo;s name, email, password hash, and optional
          authenticator or passkey credentials, plus the Business name,
          currency, and time zone. A session cookie keeps the Owner signed in.
          Sign-in codes are emailed and are not written to the audit log.
        </p>
        <p>
          We do not store bank account numbers or card numbers. Later payments
          go through Stripe, and we would keep only the provider ids Stripe
          returns. Files such as receipts and logos are not stored in this
          version.
        </p>
        <p>
          Audit records note sign-ins and later money changes: who, when, and
          which record. They are scoped to the Business. Hosting logs on Render
          may include IP addresses.
        </p>
        <p>
          Email is sent through Resend. The database is Turso. Secrets are kept
          in the host&rsquo;s environment, not in the repository.
        </p>
      </div>
    </Shell>
  );
}
