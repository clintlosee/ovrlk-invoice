import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { getExpenses, receiptUrl } from "@/server/expenses";

export const Route = createFileRoute("/app/expenses/")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" ? search.from : "",
    to: typeof search.to === "string" ? search.to : "",
    category: typeof search.category === "string" ? search.category : "",
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getExpenses({ data: deps }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  const [category, setCategory] = useState(search.category);
  if (!data) return <p>Sign in again.</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-brass pb-3">
        <h1 className="font-serif text-3xl">Expenses</h1>
        <Button asChild>
          <Link to="/app/expenses/new">New Expense</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Dates are in this Business's time zone.{" "}
        <Link to="/app/expenses/categories" className="text-primary underline">
          Categories
        </Link>
      </p>
      {!data.storageConfigured ? (
        <p className="mt-3 text-sm">
          Receipt upload needs Cloudflare R2, which is not configured.
        </p>
      ) : null}
      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({
            to: "/app/expenses",
            search: { from, to, category },
          });
        }}
      >
        <label className="text-sm text-primary" htmlFor="expense-from">
          From
          <Input
            id="expense-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm text-primary" htmlFor="expense-to">
          To
          <Input
            id="expense-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="text-sm text-primary" htmlFor="expense-category">
          Category
          <select
            id="expense-category"
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All</option>
            {data.categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Filter</Button>
      </form>
      {data.expenses.length === 0 ? (
        <p className="mt-6 text-sm">No Expenses in this filter.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border border-t-[6px] border-t-brass bg-card">
          {data.expenses.map((expense) => (
            <li key={expense.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <Link
                  to="/app/expenses/$expenseId"
                  params={{ expenseId: expense.id }}
                  className="font-medium text-primary underline"
                >
                  {expense.merchant}
                </Link>
                <span>{formatUsd(expense.amountCents)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {expense.spentOn} · {expense.categoryName}
                {expense.clientName ? ` · ${expense.clientName}` : ""}
                {expense.taxPaidCents > 0
                  ? ` · tax ${formatUsd(expense.taxPaidCents)}`
                  : ""}
                {expense.paymentId ? " · Merchant fee" : ""}
              </p>
              {expense.receiptKey ? (
                <button
                  type="button"
                  className="mt-1 text-sm text-primary underline"
                  onClick={() => {
                    void receiptUrl({ data: { id: expense.id } }).then(
                      (result) => {
                        if (result.ok)
                          window.open(result.url, "_blank", "noopener");
                      },
                    );
                  }}
                >
                  View Receipt
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
