import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expense-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import {
  deleteExpense,
  getExpenseForm,
  receiptUrl,
  removeReceipt,
  updateExpense,
} from "@/server/expenses";

export const Route = createFileRoute("/app/expenses/$expenseId/")({
  loader: ({ params }) => getExpenseForm({ data: { id: params.expenseId } }),
  component: ExpensePage,
});

function ExpensePage() {
  const form = Route.useLoaderData();
  const { expenseId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!form) return <p>Sign in again.</p>;
  const expense = form.expense;
  if (!expense) return <p>That Expense does not exist.</p>;

  async function onSubmit(values: ExpenseFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await updateExpense({
        data: { ...values, id: expenseId },
      });
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
      <Link
        to="/app/expenses"
        search={{ from: "", to: "", category: "" }}
        className="text-sm text-primary underline"
      >
        Expenses
      </Link>
      <h1 className="mt-3 border-b-2 border-brass pb-3 font-serif text-3xl">
        {expense.merchant}
      </h1>
      <Card>
        <ExpenseForm
          initial={{
            spentOn: expense.spentOn,
            merchant: expense.merchant,
            amount: formatCents(expense.amountCents),
            categoryId: expense.categoryId,
            clientId: expense.clientId ?? "",
            taxPaid:
              expense.taxPaidCents > 0 ? formatCents(expense.taxPaidCents) : "",
            note: expense.note ?? "",
          }}
          categories={form.categories}
          clients={form.clients}
          lockedFee={expense.paymentId != null}
          pending={pending}
          message={message}
          submitLabel="Save Expense"
          onSubmit={(values) => void onSubmit(values)}
        />
        <Receipt
          expenseId={expenseId}
          hasReceipt={expense.receiptKey != null}
          storageConfigured={form.storageConfigured}
        />
        {expense.paymentId ? null : (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Delete this Expense?")) return;
              setPending(true);
              void deleteExpense({ data: { id: expenseId } }).then(
                async (result) => {
                  if (!result.ok) {
                    setMessage(result.message);
                    setPending(false);
                    return;
                  }
                  await navigate({
                    to: "/app/expenses",
                    search: { from: "", to: "", category: "" },
                  });
                },
              );
            }}
          >
            Delete Expense
          </Button>
        )}
      </Card>
    </>
  );
}

function Receipt({
  expenseId,
  hasReceipt,
  storageConfigured,
}: {
  expenseId: string;
  hasReceipt: boolean;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!storageConfigured) {
    return (
      <p className="mt-6 text-sm">
        Receipt upload needs Cloudflare R2, which is not configured.
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-4">
      <h2 className="font-medium">Receipt</h2>
      <p className="text-sm text-muted-foreground">
        Image or PDF, up to 10 MB.
      </p>
      {hasReceipt ? (
        <div className="flex gap-3">
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => {
              void receiptUrl({ data: { id: expenseId } }).then((result) => {
                if (result.ok) window.open(result.url, "_blank", "noopener");
                else setMessage(result.message);
              });
            }}
          >
            View Receipt
          </button>
          <button
            type="button"
            className="text-sm text-primary underline"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void removeReceipt({ data: { id: expenseId } }).then(
                async (result) => {
                  setPending(false);
                  setMessage(result.ok ? "Removed." : result.message);
                  if (result.ok) await router.invalidate();
                },
              );
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("receipt");
          if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
          const form = event.currentTarget;
          const body = new FormData();
          body.set("receipt", input.files[0]);
          setPending(true);
          setMessage(null);
          void fetch(`/app/expenses/${expenseId}/receipt`, {
            method: "POST",
            body,
          })
            .then(async (response) => {
              const result = (await response.json()) as {
                ok: boolean;
                message?: string;
              };
              setPending(false);
              setMessage(
                result.ok ? "Saved." : (result.message ?? "Could not upload."),
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
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          required
          className="text-sm"
        />
        <Button type="submit" disabled={pending}>
          {hasReceipt ? "Replace Receipt" : "Upload Receipt"}
        </Button>
      </form>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
