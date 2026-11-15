import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expense-form";
import { ReceiptDropzone } from "@/components/receipt-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import { uploadReceipt } from "@/lib/receipt-upload";
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
      <h1 className="mt-3 border-b-2 border-solar pb-3 font-serif text-3xl">
        {expense.merchant}
      </h1>
      <Card className="mt-6">
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
            recurring: expense.recurring,
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
          receiptKey={expense.receiptKey}
          receiptContentType={expense.receiptContentType}
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
  receiptKey,
  receiptContentType,
  hasReceipt,
  storageConfigured,
}: {
  expenseId: string;
  receiptKey: string | null;
  receiptContentType: string | null;
  hasReceipt: boolean;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!receiptKey) {
      setRemoteUrl(null);
      return;
    }
    let cancelled = false;
    void receiptUrl({ data: { id: expenseId } }).then((result) => {
      if (cancelled) return;
      if (result.ok) setRemoteUrl(result.url);
      else setMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [expenseId, receiptKey]);

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
      <ReceiptDropzone
        file={file}
        remoteContentType={hasReceipt ? receiptContentType : null}
        remoteUrl={remoteUrl}
        pending={pending}
        onFile={(next) => {
          setFile(next);
          setPending(true);
          setMessage(null);
          void uploadReceipt(expenseId, next).then(async (result) => {
            setPending(false);
            setMessage(result.ok ? "Saved." : result.message);
            if (!result.ok) return;
            setFile(null);
            await router.invalidate();
          });
        }}
      />
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
                  if (!result.ok) return;
                  setFile(null);
                  await router.invalidate();
                },
              );
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
