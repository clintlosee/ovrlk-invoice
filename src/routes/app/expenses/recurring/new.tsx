import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  type RecurringDraft,
  RecurringExpenseForm,
  toScheduleInput,
} from "@/components/recurring-expense-form";
import { createRecurringExpense, getRecurringExpense } from "@/server/expenses";

export const Route = createFileRoute("/app/expenses/recurring/new")({
  loader: () => getRecurringExpense({ data: {} }),
  component: NewRecurringExpensePage,
});

function NewRecurringExpensePage() {
  const form = Route.useLoaderData();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!form) return <p>Sign in again.</p>;

  async function onSubmit(values: RecurringDraft) {
    setPending(true);
    setMessage(null);
    const result = await createRecurringExpense({
      data: toScheduleInput(values),
    });
    if (!result.ok) {
      setMessage(result.message);
      setPending(false);
      return;
    }
    await navigate({
      to: "/app/expenses",
      search: { from: "", to: "", category: "", tab: "recurring" },
    });
  }

  return (
    <RecurringExpenseForm
      title="New Recurring Expense"
      initial={{
        merchant: "",
        amount: "",
        categoryId: "",
        clientId: "",
        taxPaid: "",
        note: "",
        nextOn: form.today,
        preset: "month",
        intervalCount: "1",
        intervalUnit: "month",
        ends: "infinite",
        remainingCount: "",
        paused: false,
      }}
      categories={form.categories}
      clients={form.clients}
      pending={pending}
      message={message}
      onSubmit={(values) => void onSubmit(values)}
    />
  );
}
