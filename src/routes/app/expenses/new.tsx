import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expense-form";
import { Card } from "@/components/ui/card";
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
      await navigate({
        to: "/app/expenses/$expenseId",
        params: { expenseId: result.id },
      });
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
        className="text-sm underline"
      >
        Expenses
      </Link>
      <h1 className="mt-3 font-serif text-3xl">New Expense</h1>
      <Card>
        <ExpenseForm
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
          submitLabel="Save Expense"
          onSubmit={(values) => void onSubmit(values)}
        />
      </Card>
    </>
  );
}
