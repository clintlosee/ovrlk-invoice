import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  Copy,
  ListFilter,
  Package,
  Pencil,
  Receipt,
  Search,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  ExpenseQuickEdit,
  type QuickExpense,
} from "@/components/expense-quick-edit";
import { Button } from "@/components/ui/button";
import { cardSurface } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { filterExpenseRows, isCogs, recentExpenses } from "@/lib/expense-list";
import { formatCents, formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  createExpense,
  deleteExpense,
  getExpenses,
  receiptUrl,
} from "@/server/expenses";

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

type ExpenseRow = QuickExpense & {
  categoryName: string;
  clientName: string | null;
  updatedAt: string;
};

function ExpensesPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"expenses" | "recurring">("expenses");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(
    Boolean(search.from || search.to || search.category),
  );
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  const [category, setCategory] = useState(search.category);
  if (!data) return <p>Sign in again.</p>;

  const recent = recentExpenses(data.expenses);
  const pool =
    tab === "recurring"
      ? data.expenses.filter((expense) => expense.recurring)
      : data.expenses;
  const shown = filterExpenseRows(pool, query);
  const totalCents = shown.reduce((sum, row) => sum + row.amountCents, 0);
  const taxCents = shown.reduce((sum, row) => sum + row.taxPaidCents, 0);

  async function refresh() {
    await router.invalidate();
  }

  async function copyExpense(expense: ExpenseRow) {
    setBusyId(expense.id);
    setMessage(null);
    try {
      const result = await createExpense({
        data: {
          spentOn: expense.spentOn,
          merchant: expense.merchant,
          amount: formatCents(expense.amountCents),
          categoryId: expense.categoryId,
          clientId: expense.clientId ?? "",
          taxPaid:
            expense.taxPaidCents > 0 ? formatCents(expense.taxPaidCents) : "",
          note: expense.note ?? "",
          recurring: expense.recurring,
        },
      });
      if (!result.ok) {
        setMessage(result.message);
        setBusyId(null);
        return;
      }
      await refresh();
      setBusyId(null);
    } catch {
      setMessage("Could not copy that Expense.");
      setBusyId(null);
    }
  }

  async function removeExpense(expense: ExpenseRow) {
    if (!window.confirm("Delete this Expense?")) return;
    setBusyId(expense.id);
    setMessage(null);
    try {
      const result = await deleteExpense({ data: { id: expense.id } });
      if (!result.ok) {
        setMessage(result.message);
        setBusyId(null);
        return;
      }
      if (editingId === expense.id) setEditingId(null);
      await refresh();
      setBusyId(null);
    } catch {
      setMessage("Could not delete that Expense.");
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b-2 border-brass pb-3">
        <h1 className="font-serif text-3xl">Expenses</h1>
        <Button asChild>
          <Link to="/app/expenses/new">New Expense</Link>
        </Button>
      </div>
      {!data.storageConfigured ? (
        <p className="mt-3 text-sm">
          Receipt upload needs Cloudflare R2, which is not configured.
        </p>
      ) : null}
      {recent.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-serif text-xl">Recently Updated</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((expense) => (
              <li key={expense.id} className="min-w-0">
                <RecentCard expense={expense} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div
        role="tablist"
        aria-label="Expenses"
        className="mt-8 flex gap-2 border-b border-border"
      >
        <TabButton
          selected={tab === "expenses"}
          onClick={() => {
            setTab("expenses");
            setEditingId(null);
          }}
        >
          Expenses
        </TabButton>
        <TabButton
          selected={tab === "recurring"}
          onClick={() => {
            setTab("recurring");
            setEditingId(null);
          }}
        >
          Recurring Expenses
        </TabButton>
      </div>
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">
            {tab === "recurring" ? "Recurring Expenses" : "All Expenses"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search Expenses"
                className="w-56 pl-9"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              aria-expanded={advanced}
              onClick={() => setAdvanced((open) => !open)}
            >
              <ListFilter aria-hidden className="size-4" />
              Advanced Search
            </Button>
            <Link
              to="/app/expenses/categories"
              className="text-sm text-primary underline"
            >
              Categories
            </Link>
          </div>
        </div>
        {advanced ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate({
                to: "/app/expenses",
                search: { from, to, category },
              });
            }}
          >
            <label className="text-sm text-brass-ink" htmlFor="expense-from">
              From
              <Input
                id="expense-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="text-sm text-brass-ink" htmlFor="expense-to">
              To
              <Input
                id="expense-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <label
              className="text-sm text-brass-ink"
              htmlFor="expense-category"
            >
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
            <p className="pb-2 text-sm text-muted-foreground">
              Dates are in this Business's time zone.
            </p>
          </form>
        ) : null}
        {message ? (
          <p className="mt-4 text-sm text-destructive">{message}</p>
        ) : null}
        {data.expenses.length === 0 ? (
          <p className="mt-4 text-sm">No Expenses yet.</p>
        ) : pool.length === 0 ? (
          <p className="mt-4 text-sm">No recurring Expenses.</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 text-sm">No Expenses match.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    Merchant
                    <span className="block font-normal text-muted-foreground">
                      Category
                    </span>
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>
                    Client
                    <span className="block font-normal text-muted-foreground">
                      Note
                    </span>
                  </TableHead>
                  <TableHead className="pr-32 text-right">
                    Amount
                    <span className="block font-normal text-muted-foreground">
                      Tax
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((expense) =>
                  editingId === expense.id ? (
                    <TableRow key={expense.id} className="hover:bg-transparent">
                      <TableCell colSpan={4} className="p-0">
                        <ExpenseQuickEdit
                          expense={expense}
                          categories={data.categories}
                          clients={data.clients}
                          storageConfigured={data.storageConfigured}
                          onClose={() => setEditingId(null)}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    <ExpenseTableRow
                      key={expense.id}
                      expense={expense}
                      busy={busyId === expense.id}
                      onEdit={() => {
                        setMessage(null);
                        setEditingId(expense.id);
                      }}
                      onCopy={() => void copyExpense(expense)}
                      onDelete={() => void removeExpense(expense)}
                      onRecurring={() => {
                        setTab("recurring");
                        setEditingId(null);
                      }}
                      onViewReceipt={() => {
                        void receiptUrl({ data: { id: expense.id } }).then(
                          (result) => {
                            if (result.ok) {
                              window.open(result.url, "_blank", "noopener");
                            } else setMessage(result.message);
                          },
                        );
                      }}
                    />
                  ),
                )}
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={3} className="text-right font-medium">
                    Total
                  </TableCell>
                  <TableCell className="pr-32 text-right font-medium">
                    <p>{formatUsd(totalCents)}</p>
                    {taxCents > 0 ? (
                      <p className="font-normal text-muted-foreground">
                        {formatUsd(taxCents)} tax
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}

function RecentCard({ expense }: { expense: ExpenseRow }) {
  const cogs = isCogs(expense.categoryGroup);
  return (
    <Link
      to="/app/expenses/$expenseId"
      params={{ expenseId: expense.id }}
      className={cn(
        cardSurface,
        "flex h-full min-w-0 flex-col overflow-hidden",
      )}
    >
      <div className="flex flex-1 flex-col p-3 text-sm">
        <p className="flex items-center gap-1.5 text-muted-foreground">
          {cogs ? (
            <Package aria-hidden className="size-3.5 shrink-0 text-brass-ink" />
          ) : (
            <Receipt aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{expense.categoryName}</span>
        </p>
        <p className="truncate font-medium">{expense.merchant}</p>
        <p className="text-muted-foreground">{shortDate(expense.spentOn)}</p>
        {expense.recurring ? <p className="text-primary">Recurring</p> : null}
        <p className="mt-auto border-t border-border pt-2 text-right font-medium">
          {formatUsd(expense.amountCents)}
        </p>
      </div>
      {cogs ? (
        <p className="bg-brass/15 py-1.5 text-center text-xs font-medium text-brass-ink">
          Cost of Goods Sold
        </p>
      ) : null}
    </Link>
  );
}

function ExpenseTableRow({
  expense,
  busy,
  onEdit,
  onCopy,
  onDelete,
  onRecurring,
  onViewReceipt,
}: {
  expense: ExpenseRow;
  busy: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRecurring: () => void;
  onViewReceipt: () => void;
}) {
  const cogs = isCogs(expense.categoryGroup);
  const fee = expense.paymentId != null;
  return (
    <TableRow className="group hover:bg-accent">
      <TableCell
        className={cn(
          "border-l-4",
          cogs ? "border-l-brass" : "border-l-transparent",
        )}
      >
        <Link
          to="/app/expenses/$expenseId"
          params={{ expenseId: expense.id }}
          className="font-medium text-primary underline"
        >
          {expense.merchant}
        </Link>
        <p className="text-muted-foreground">
          {expense.categoryName}
          {fee ? " · Merchant fee" : ""}
        </p>
      </TableCell>
      <TableCell>
        <p>{shortDate(expense.spentOn)}</p>
        {expense.recurring ? (
          <button type="button" className="text-primary" onClick={onRecurring}>
            Recurring
          </button>
        ) : null}
      </TableCell>
      <TableCell>
        <p>{expense.clientName || "—"}</p>
        <p
          className="max-w-64 truncate text-muted-foreground"
          title={expense.note ?? ""}
        >
          {expense.note || "—"}
        </p>
      </TableCell>
      <TableCell className="relative pr-32 text-right">
        <p>{formatUsd(expense.amountCents)}</p>
        <p className="text-muted-foreground">
          {expense.taxPaidCents > 0
            ? `${formatUsd(expense.taxPaidCents)} tax`
            : "—"}
        </p>
        <div className="pointer-events-none absolute top-1/2 right-2 z-10 flex -translate-y-1/2 rounded-md border border-border bg-card opacity-0 shadow-card group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <ActionButton label="Edit" disabled={busy} onClick={onEdit}>
            <Pencil aria-hidden className="size-4" />
          </ActionButton>
          {expense.receiptKey ? (
            <ActionButton
              label="View Receipt"
              disabled={busy}
              onClick={onViewReceipt}
            >
              <Receipt aria-hidden className="size-4" />
            </ActionButton>
          ) : null}
          <ActionButton label="Copy" disabled={busy} onClick={onCopy}>
            <Copy aria-hidden className="size-4" />
          </ActionButton>
          {fee ? null : (
            <ActionButton label="Delete" disabled={busy} onClick={onDelete}>
              <Trash2 aria-hidden className="size-4" />
            </ActionButton>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="group/tip relative inline-flex size-8 items-center justify-center text-muted-foreground first:rounded-l-md last:rounded-r-md hover:bg-primary hover:text-primary-foreground focus-visible:z-20 focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium whitespace-nowrap text-foreground opacity-0 shadow-card group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm",
        selected
          ? "border-brass font-medium text-foreground"
          : "border-transparent text-primary",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function shortDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}
