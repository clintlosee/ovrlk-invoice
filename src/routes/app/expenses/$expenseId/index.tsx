import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expense-form";
import { formatCents } from "@/lib/money";
import { uploadReceipt } from "@/lib/receipt-upload";
import {
  deleteExpense,
  getExpenseForm,
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
  const [file, setFile] = useState<File | null>(null);
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

  async function onReceipt(next: File) {
    setFile(next);
    setPending(true);
    setMessage(null);
    const result = await uploadReceipt(expenseId, next);
    setPending(false);
    setMessage(result.ok ? "Saved." : result.message);
    if (!result.ok) return;
    await router.invalidate();
    setFile(null);
  }

  async function onRemoveReceipt() {
    setPending(true);
    setMessage(null);
    if (!expense?.receiptKey) {
      setFile(null);
      setPending(false);
      return;
    }
    const result = await removeReceipt({ data: { id: expenseId } });
    setPending(false);
    setMessage(result.ok ? "Removed." : result.message);
    if (!result.ok) return;
    setFile(null);
    await router.invalidate();
  }

  return (
    <ExpenseForm
      key={expenseId}
      title="Edit Expense"
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
      onSubmit={(values) => void onSubmit(values)}
      onDelete={
        expense.paymentId
          ? undefined
          : () => {
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
            }
      }
      receipt={{
        configured: form.storageConfigured,
        file,
        onFile: (next) => void onReceipt(next),
        onRemove: () => void onRemoveReceipt(),
        remoteContentType: expense.receiptKey
          ? expense.receiptContentType
          : null,
        remoteUrl: expense.receiptKey
          ? `/app/expenses/${expenseId}/receipt?v=${encodeURIComponent(expense.updatedAt)}`
          : null,
      }}
    />
  );
}
