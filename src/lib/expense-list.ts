export const RECENT_EXPENSE_LIMIT = 4;

export function recentExpenses<T extends { id: string; updatedAt: string }>(
  rows: T[],
): T[] {
  return [...rows]
    .sort((a, b) => {
      const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
      if (byUpdated !== 0) return byUpdated;
      return a.id.localeCompare(b.id);
    })
    .slice(0, RECENT_EXPENSE_LIMIT);
}

export function filterExpenseRows<
  T extends {
    merchant: string;
    categoryName: string;
    clientName: string | null;
    note: string | null;
  },
>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.merchant, row.categoryName, row.clientName ?? "", row.note ?? ""]
      .join("\n")
      .toLowerCase()
      .includes(needle),
  );
}

export function isCogs(categoryGroup: string) {
  return categoryGroup === "cogs";
}
