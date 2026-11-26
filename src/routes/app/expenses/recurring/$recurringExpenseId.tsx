import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  draftFromSchedule,
  type RecurringDraft,
  RecurringExpenseForm,
  toScheduleInput,
} from "@/components/recurring-expense-form";
import {
  deleteRecurringExpense,
  getRecurringExpense,
  updateRecurringExpense,
} from "@/server/expenses";

export const Route = createFileRoute(
  "/app/expenses/recurring/$recurringExpenseId",
)({
  loader: ({ params }) =>
    getRecurringExpense({ data: { id: params.recurringExpenseId } }),
  component: EditRecurringExpensePage,
});

function EditRecurringExpensePage() {
  const form = Route.useLoaderData();
  const { recurringExpenseId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!form) return <p>Sign in again.</p>;
  const schedule = form.schedule;
  if (!schedule) return <p>That Recurring Expense does not exist.</p>;

  async function onSubmit(values: RecurringDraft) {
    setPending(true);
    setMessage(null);
    const result = await updateRecurringExpense({
      data: { id: recurringExpenseId, ...toScheduleInput(values) },
    });
    setPending(false);
    setMessage(result.ok ? "Saved." : result.message);
    if (result.ok) await router.invalidate();
  }

  return (
    <RecurringExpenseForm
      key={recurringExpenseId}
      title="Edit Recurring Expense"
      initial={draftFromSchedule(schedule)}
      categories={form.categories}
      clients={form.clients}
      pending={pending}
      message={message}
      onSubmit={(values) => void onSubmit(values)}
      onDelete={() => {
        if (
          !window.confirm(
            "Delete this Recurring Expense? Expenses already added stay.",
          )
        ) {
          return;
        }
        setPending(true);
        void deleteRecurringExpense({ data: { id: recurringExpenseId } }).then(
          async (result) => {
            if (!result.ok) {
              setMessage(result.message);
              setPending(false);
              return;
            }
            await navigate({
              to: "/app/expenses",
              search: { from: "", to: "", category: "", tab: "recurring" },
            });
          },
        );
      }}
    />
  );
}
