import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CategoryGroup,
  categoryGroupLabel,
} from "@/lib/expense-categories";
import {
  createCategory,
  getExpenseForm,
  renameCategory,
  setCategoryArchived,
} from "@/server/expenses";

export const Route = createFileRoute("/app/expenses/categories")({
  loader: () => getExpenseForm({ data: {} }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const form = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [group, setGroup] = useState<CategoryGroup>("schedule_c");
  const [message, setMessage] = useState<string | null>(null);
  if (!form) return <p>Sign in again.</p>;
  const active = form.categories.filter((category) => !category.archived);
  const archived = form.categories.filter((category) => category.archived);

  async function refresh(result: { ok: boolean; message?: string }) {
    setMessage(result.ok ? "Saved." : (result.message ?? "Could not save."));
    if (result.ok) await router.invalidate();
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
        Categories
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Schedule C defaults and Cost of Goods Sold. Archive a Category that is
        in use. Merchant fees stays available for card Payments.
      </p>
      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void createCategory({ data: { name, group } }).then(
            async (result) => {
              await refresh(result);
              if (result.ok) setName("");
            },
          );
        }}
      >
        <label className="text-sm text-solar-ink" htmlFor="category-name">
          Name
          <Input
            id="category-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="text-sm text-solar-ink" htmlFor="category-group">
          Group
          <select
            id="category-group"
            className="flex h-10 rounded-md border border-border bg-card px-3 text-sm"
            value={group}
            onChange={(event) =>
              setGroup(event.target.value === "cogs" ? "cogs" : "schedule_c")
            }
          >
            <option value="schedule_c">
              {categoryGroupLabel("schedule_c")}
            </option>
            <option value="cogs">{categoryGroupLabel("cogs")}</option>
          </select>
        </label>
        <Button type="submit">Add Category</Button>
      </form>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      <CategoryList
        title="Schedule C"
        categories={active.filter(
          (category) => category.categoryGroup === "schedule_c",
        )}
        onDone={(result) => void refresh(result)}
      />
      <CategoryList
        title="Cost of Goods Sold"
        categories={active.filter(
          (category) => category.categoryGroup === "cogs",
        )}
        onDone={(result) => void refresh(result)}
      />
      {archived.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-medium text-solar-ink">Archived</h2>
          <ul className="mt-3 space-y-2">
            {archived.map((category) => (
              <li key={category.id} className="flex items-center gap-3 text-sm">
                <span>{category.name}</span>
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => {
                    void setCategoryArchived({
                      data: { id: category.id, archived: false },
                    }).then((result) => void refresh(result));
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function CategoryList({
  title,
  categories,
  onDone,
}: {
  title: string;
  categories: { id: string; name: string; systemKey: string | null }[];
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-medium text-solar-ink">{title}</h2>
      <ul className="mt-3 space-y-3">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} onDone={onDone} />
        ))}
      </ul>
    </section>
  );
}

function CategoryRow({
  category,
  onDone,
}: {
  category: { id: string; name: string; systemKey: string | null };
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [name, setName] = useState(category.name);
  return (
    <li className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        aria-label={`Rename ${category.name}`}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void renameCategory({ data: { id: category.id, name } }).then(onDone);
        }}
      >
        Rename
      </Button>
      {category.systemKey === "merchant_fees" ? null : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void setCategoryArchived({
              data: { id: category.id, archived: true },
            }).then(onDone);
          }}
        >
          Archive
        </Button>
      )}
    </li>
  );
}
