import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expense-form";
import { uploadReceipt } from "@/lib/receipt-upload";
import { createExpense, getExpenseForm } from "@/server/expenses";

export const Route = createFileRoute("/app/expenses/new")({
  loader: () => getExpenseForm({ data: {} }),
  component: NewExpensePage,
});

function NewExpensePage() {
  const form = Route.useLoaderData();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  if (!form) return <p>Sign in again.</p>;

  async function onSubmit(values: ExpenseFormValues) {
    setPending(true);
    setMessage(null);
    try {
      const result = await createExpense({ data: values });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      if (file) {
        const uploaded = await uploadReceipt(result.id, file);
        if (!uploaded.ok) {
          setSavedId(result.id);
          setMessage(`Saved the Expense. ${uploaded.message}`);
          setPending(false);
          return;
        }
      }
      await navigate({
        to: "/app/expenses/$expenseId",
        params: { expenseId: result.id },
      });
    } catch {
      setMessage("Could not save. Try again.");
      setPending(false);
    }
  }

  return savedId ? (
    <p className="text-sm">
      {message}{" "}
      <Link
        to="/app/expenses/$expenseId"
        params={{ expenseId: savedId }}
        className="text-primary underline"
      >
        Open the Expense
      </Link>
    </p>
  ) : (
    <ExpenseForm
      title="New Expense"
      initial={{
        spentOn: form.today,
        merchant: "",
        amount: "",
        categoryId: "",
        clientId: "",
        taxPaid: "",
        note: "",
      }}
      categories={form.categories}
      clients={form.clients}
      pending={pending}
      message={message}
      onSubmit={(values) => void onSubmit(values)}
      receipt={{
        configured: form.storageConfigured,
        file,
        onFile: setFile,
        onRemove: () => setFile(null),
        remoteContentType: null,
        remoteUrl: null,
      }}
    />
  );
}
