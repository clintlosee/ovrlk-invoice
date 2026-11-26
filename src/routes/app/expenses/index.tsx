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
import { useState } from "react";
import {
  ExpenseQuickEdit,
  type QuickExpense,
} from "@/components/expense-quick-edit";
import { HoverAction, HoverActions } from "@/components/hover-actions";
import { ActiveMark, Reveal, Swap } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cardLift, cardSurface } from "@/components/ui/card";
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
import {
  describeDuration,
  describeInterval,
  scheduleStatus,
} from "@/lib/recurring";
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
    tab: search.tab === "recurring" ? "recurring" : "expenses",
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
  const tab = search.tab;
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
  const shown = filterExpenseRows(data.expenses, query);
  const schedules = filterExpenseRows(data.schedules, query);
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
      <div className="flex items-center justify-between gap-4 border-b-2 border-solar pb-3">
        <h1 className="font-serif text-3xl">Expenses</h1>
        {tab === "recurring" ? (
          <Button asChild>
            <Link to="/app/expenses/recurring/new">New Recurring Expense</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/app/expenses/new">New Expense</Link>
          </Button>
        )}
      </div>
      {!data.storageConfigured ? (
        <p className="mt-6 text-sm">
          Receipt upload needs Cloudflare R2, which is not configured.
        </p>
      ) : null}
      {recent.length > 0 ? (
        <section className={data.storageConfigured ? "mt-6" : "mt-8"}>
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
        className={cn(
          "flex gap-2 border-b border-border",
          recent.length > 0 || !data.storageConfigured ? "mt-8" : "mt-6",
        )}
      >
        <TabButton
          selected={tab === "expenses"}
          onClick={() => {
            setEditingId(null);
            void navigate({
              to: "/app/expenses",
              search: { ...search, tab: "expenses" },
            });
          }}
        >
          Expenses
        </TabButton>
        <TabButton
          selected={tab === "recurring"}
          onClick={() => {
            setEditingId(null);
            void navigate({
              to: "/app/expenses",
              search: { ...search, tab: "recurring" },
            });
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
            {tab === "expenses" ? (
              <Button
                variant="outline"
                aria-expanded={advanced}
                onClick={() => setAdvanced((open) => !open)}
              >
                <ListFilter aria-hidden className="size-4" />
                Advanced Search
              </Button>
            ) : null}
            <Link
              to="/app/expenses/categories"
              className="text-sm text-primary underline"
            >
              Categories
            </Link>
          </div>
        </div>
        <Reveal show={advanced && tab === "expenses"}>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate({
                to: "/app/expenses",
                search: { from, to, category, tab },
              });
            }}
          >
            <label className="text-sm text-solar-ink" htmlFor="expense-from">
              From
              <Input
                id="expense-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="text-sm text-solar-ink" htmlFor="expense-to">
              To
              <Input
                id="expense-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <label
              className="text-sm text-solar-ink"
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
        </Reveal>
        {message ? (
          <p className="mt-4 text-sm text-destructive">{message}</p>
        ) : null}
        <Swap viewKey={`${tab}:${search.from}:${search.to}:${search.category}`}>
          {tab === "recurring" ? (
            data.schedules.length === 0 ? (
              <p className="mt-4 text-sm">No Recurring Expenses yet.</p>
            ) : schedules.length === 0 ? (
              <p className="mt-4 text-sm">No Recurring Expenses match.</p>
            ) : (
              <ScheduleTable schedules={schedules} />
            )
          ) : data.expenses.length === 0 ? (
            <p className="mt-4 text-sm">No Expenses yet.</p>
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
                    <TableHead className="text-right">
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
                      <TableRow
                        key={expense.id}
                        className="hover:bg-transparent"
                      >
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
                    <TableCell className="text-right font-medium">
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
        </Swap>
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
        cardLift,
        "flex h-full min-w-0 flex-col overflow-hidden",
      )}
    >
      <div className="flex flex-1 flex-col p-3 text-sm">
        <p className="flex items-center gap-1.5 text-muted-foreground">
          {cogs ? (
            <Package aria-hidden className="size-3.5 shrink-0 text-solar-ink" />
          ) : (
            <Receipt aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{expense.categoryName}</span>
        </p>
        <p className="truncate font-medium">{expense.merchant}</p>
        <p className="text-muted-foreground">{shortDate(expense.spentOn)}</p>
        {expense.recurringExpenseId ? (
          <p className="text-primary">Recurring</p>
        ) : null}
        <p className="mt-auto border-t border-border pt-2 text-right font-medium">
          {formatUsd(expense.amountCents)}
        </p>
      </div>
      {cogs ? (
        <p className="bg-solar/15 py-1.5 text-center text-xs font-medium text-solar-ink">
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
  onViewReceipt,
}: {
  expense: ExpenseRow;
  busy: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onViewReceipt: () => void;
}) {
  const cogs = isCogs(expense.categoryGroup);
  const fee = expense.paymentId != null;
  return (
    <TableRow className="group hover:bg-accent">
      <TableCell
        className={cn(
          "border-l-4",
          cogs ? "border-l-solar" : "border-l-transparent",
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
        {expense.recurringExpenseId ? (
          <Link
            to="/app/expenses/recurring/$recurringExpenseId"
            params={{ recurringExpenseId: expense.recurringExpenseId }}
            className="text-primary"
          >
            Recurring
          </Link>
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
      <TableCell className="relative text-right">
        <p>{formatUsd(expense.amountCents)}</p>
        <p className="text-muted-foreground">
          {expense.taxPaidCents > 0
            ? `${formatUsd(expense.taxPaidCents)} tax`
            : "—"}
        </p>
        <HoverActions>
          <HoverAction label="Edit" disabled={busy} onClick={onEdit}>
            <Pencil aria-hidden className="size-4" />
          </HoverAction>
          {expense.receiptKey ? (
            <HoverAction
              label="View Receipt"
              disabled={busy}
              onClick={onViewReceipt}
            >
              <Receipt aria-hidden className="size-4" />
            </HoverAction>
          ) : null}
          <HoverAction label="Copy" disabled={busy} onClick={onCopy}>
            <Copy aria-hidden className="size-4" />
          </HoverAction>
          {fee ? null : (
            <HoverAction label="Delete" disabled={busy} onClick={onDelete}>
              <Trash2 aria-hidden className="size-4" />
            </HoverAction>
          )}
        </HoverActions>
      </TableCell>
    </TableRow>
  );
}

function ScheduleTable({
  schedules,
}: {
  schedules: {
    id: string;
    merchant: string;
    categoryName: string;
    clientName: string | null;
    amountCents: number;
    intervalCount: number;
    intervalUnit: "day" | "week" | "month" | "year";
    nextOn: string;
    remainingCount: number | null;
    paused: boolean;
  }[];
}) {
  return (
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
            <TableHead>Client</TableHead>
            <TableHead>
              Frequency
              <span className="block font-normal text-muted-foreground">
                Duration
              </span>
            </TableHead>
            <TableHead className="text-right">
              Amount
              <span className="block font-normal text-muted-foreground">
                Status
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.map((schedule) => {
            const status = scheduleStatus(schedule);
            return (
              <TableRow key={schedule.id}>
                <TableCell>
                  <Link
                    to="/app/expenses/recurring/$recurringExpenseId"
                    params={{ recurringExpenseId: schedule.id }}
                    className="font-medium text-primary underline"
                  >
                    {schedule.merchant}
                  </Link>
                  <p className="text-muted-foreground">
                    {schedule.categoryName}
                  </p>
                </TableCell>
                <TableCell>{schedule.clientName || "—"}</TableCell>
                <TableCell>
                  <p>
                    {describeInterval(
                      schedule.intervalCount,
                      schedule.intervalUnit,
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {describeDuration(schedule.remainingCount)}
                    {status === "active"
                      ? ` · next ${shortDate(schedule.nextOn)}`
                      : ""}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <p>{formatUsd(schedule.amountCents)}</p>
                  <Badge
                    variant={
                      status === "active"
                        ? "default"
                        : status === "paused"
                          ? "secondary"
                          : "outline"
                    }
                    className="mt-1"
                  >
                    {status === "active"
                      ? "Active"
                      : status === "paused"
                        ? "Paused"
                        : "Finished"}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
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
        "relative -mb-px px-3 py-2 text-sm",
        selected ? "font-medium text-foreground" : "text-primary",
      )}
      onClick={onClick}
    >
      {children}
      {selected ? <ActiveMark layoutId="expense-tab" /> : null}
    </button>
  );
}

function shortDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}
