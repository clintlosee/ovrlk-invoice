import { createFileRoute } from "@tanstack/react-router";
import { DraftNotice, Shell } from "@/components/shell";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <Shell>
      <DraftNotice />
      <h1 className="border-b-2 border-brass pb-3 font-serif text-3xl">
        Terms of Service
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p>
          These terms are a draft for the owner of a photography print business
          and any later Business that uses ovrlk-invoice. They are not in effect
          until a lawyer reviews them.
        </p>
        <p>
          The Owner is responsible for the accuracy of Clients, Invoices, and
          Expenses entered for their Business. Another Business cannot see that
          data. Clients do not receive accounts; they will be able to view an
          Invoice through a private link in a later release.
        </p>
        <p>
          Payments, when they are added, are processed by Stripe. ovrlk-invoice
          does not store bank account numbers or card numbers. Fees charged by
          Stripe are between the Owner and Stripe.
        </p>
        <p>
          The service is provided as-is while it is being built. The owner of
          the software may suspend access, close sign-up, or change these terms
          after lawyer review.
        </p>
      </div>
    </Shell>
  );
}
