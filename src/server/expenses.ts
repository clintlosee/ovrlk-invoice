import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../db/client";
import { isCategoryGroup } from "../lib/expense-categories";
import { todayInTimeZone } from "../lib/invoice";
import { parseDollarsToCents } from "../lib/money";
import { clearReceipt, openReceipt } from "./files";
import { signedInBusiness } from "./membership";
import { discardObject, storageConfigured } from "./storage";
import { forBusiness } from "./tenancy";

const blank = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .transform((value) => (value.length === 0 ? null : value));

const expenseFields = z.object({
  spentOn: z.string(),
  merchant: z.string(),
  amount: z.string(),
  categoryId: z.string().min(1, "Choose a Category."),
  clientId: z.string(),
  taxPaid: z.string(),
  note: blank(2000, "Note"),
});

const scheduleFields = z.object({
  merchant: z.string(),
  amount: z.string(),
  categoryId: z.string().min(1, "Choose a Category."),
  clientId: z.string(),
  taxPaid: z.string(),
  note: blank(2000, "Note"),
  nextOn: z.string(),
  intervalCount: z.number().int().min(1).max(99),
  intervalUnit: z.enum(["day", "week", "month", "year"]),
  remainingCount: z.number().int().min(0).max(999).nullable(),
  paused: z.boolean(),
});

const idField = z.object({ id: z.string().min(1) });

export type ExpenseFormValues = z.input<typeof expenseFields>;
export type RecurringExpenseFormValues = z.input<typeof scheduleFields>;

function saveError(error: unknown): { ok: false; message: string } {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("Merchant") ||
    message.includes("Category") ||
    message.includes("Client") ||
    message.includes("amount") ||
    message.includes("date") ||
    message.includes("Note") ||
    message.includes("cents") ||
    message.includes("Expense") ||
    message.includes("Interval") ||
    message.includes("Payment") ||
    message.includes("File") ||
    message.includes("Receipt") ||
    message.includes("Logo")
  ) {
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  throw error;
}

function dollars(input: string, allowZero: boolean) {
  const trimmed = input.trim();
  if (!trimmed && allowZero) return 0;
  let amount: number;
  try {
    amount = parseDollarsToCents(trimmed);
  } catch {
    throw new Error(
      allowZero ? "Enter a tax amount like 1.25" : "Enter an amount like 12.50",
    );
  }
  if (!allowZero && amount <= 0) throw new Error("Enter an amount like 12.50");
  return amount;
}

async function scope() {
  const current = await signedInBusiness();
  if (!current) return null;
  return {
    db: forBusiness(getDb(), current.businessId),
    actorUserId: current.session.user.id,
    businessId: current.businessId,
  };
}

export const getExpenses = createServerFn({ method: "GET" })
  .validator((data: { from?: string; to?: string; category?: string }) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return null;
    const business = await current.db.business.get();
    if (!business) return null;
    await current.db.recurringExpenses.postDue(
      todayInTimeZone(business.timeZone),
    );
    const [rows, categories, clients, schedules] = await Promise.all([
      current.db.expenses.list({
        from: data.from || null,
        to: data.to || null,
        categoryId: data.category || null,
      }),
      current.db.categories.list(),
      current.db.clients.list(),
      current.db.recurringExpenses.list(),
    ]);
    return {
      expenses: rows,
      schedules,
      categories,
      clients: clients.map((row) => ({
        id: row.id,
        name: row.name,
        archived: row.archivedAt != null,
      })),
      storageConfigured: storageConfigured(),
    };
  });

export const getExpenseForm = createServerFn({ method: "GET" })
  .validator((data: { id?: string }) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return null;
    const business = await current.db.business.get();
    if (!business) return null;
    const [categories, clients, expense] = await Promise.all([
      current.db.categories.list(),
      current.db.clients.list(),
      data.id ? current.db.expenses.get(data.id) : Promise.resolve(null),
    ]);
    return {
      categories,
      clients: clients.map((row) => ({
        id: row.id,
        name: row.name,
        archived: row.archivedAt != null,
      })),
      expense,
      today: todayInTimeZone(business.timeZone),
      storageConfigured: storageConfigured(),
    };
  });

export const createExpense = createServerFn({ method: "POST" })
  .validator((data: ExpenseFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = expenseFields.safeParse(data);
    if (!parsed.success) {
      return {
        ok: false as const,
        message:
          parsed.error.issues[0]?.message ?? "Check the form and try again.",
      };
    }
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const saved = await current.db.expenses.create({
        spentOn: parsed.data.spentOn,
        merchant: parsed.data.merchant,
        amountCents: dollars(parsed.data.amount, false),
        categoryId: parsed.data.categoryId,
        clientId: parsed.data.clientId || null,
        taxPaidCents: dollars(parsed.data.taxPaid, true),
        note: parsed.data.note,
        actorUserId: current.actorUserId,
      });
      return { ok: true as const, id: saved.id };
    } catch (error) {
      return saveError(error);
    }
  });

export const updateExpense = createServerFn({ method: "POST" })
  .validator((data: ExpenseFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const parsed = expenseFields.safeParse(data);
    if (!parsed.success || !data.id) {
      return {
        ok: false as const,
        message: parsed.success
          ? "That Expense does not exist."
          : (parsed.error.issues[0]?.message ??
            "Check the form and try again."),
      };
    }
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const saved = await current.db.expenses.update(data.id, {
        spentOn: parsed.data.spentOn,
        merchant: parsed.data.merchant,
        amountCents: dollars(parsed.data.amount, false),
        categoryId: parsed.data.categoryId,
        clientId: parsed.data.clientId || null,
        taxPaidCents: dollars(parsed.data.taxPaid, true),
        note: parsed.data.note,
        actorUserId: current.actorUserId,
      });
      if (!saved)
        return { ok: false as const, message: "That Expense does not exist." };
      return { ok: true as const, id: saved.id };
    } catch (error) {
      return saveError(error);
    }
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const removed = await current.db.expenses.remove(
        data.id,
        current.actorUserId,
      );
      if (!removed) {
        return { ok: false as const, message: "That Expense does not exist." };
      }
      await discardObject(removed.receiptKey);
      return { ok: true as const };
    } catch (error) {
      return saveError(error);
    }
  });

function scheduleInput(
  data: z.infer<typeof scheduleFields>,
  actorUserId: string,
) {
  return {
    merchant: data.merchant,
    amountCents: dollars(data.amount, false),
    categoryId: data.categoryId,
    clientId: data.clientId || null,
    taxPaidCents: dollars(data.taxPaid, true),
    note: data.note,
    nextOn: data.nextOn,
    intervalCount: data.intervalCount,
    intervalUnit: data.intervalUnit,
    remainingCount: data.remainingCount,
    paused: data.paused,
    actorUserId,
  };
}

export const getRecurringExpense = createServerFn({ method: "GET" })
  .validator((data: { id?: string }) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return null;
    const business = await current.db.business.get();
    if (!business) return null;
    const [categories, clients, schedule] = await Promise.all([
      current.db.categories.list(),
      current.db.clients.list(),
      data.id
        ? current.db.recurringExpenses.get(data.id)
        : Promise.resolve(null),
    ]);
    return {
      categories,
      clients: clients.map((row) => ({
        id: row.id,
        name: row.name,
        archived: row.archivedAt != null,
      })),
      schedule,
      today: todayInTimeZone(business.timeZone),
    };
  });

export const createRecurringExpense = createServerFn({ method: "POST" })
  .validator((data: RecurringExpenseFormValues) => data)
  .handler(async ({ data }) => {
    const parsed = scheduleFields.safeParse(data);
    if (!parsed.success) {
      return {
        ok: false as const,
        message:
          parsed.error.issues[0]?.message ?? "Check the form and try again.",
      };
    }
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    const business = await current.db.business.get();
    if (!business) return { ok: false as const, message: "Sign in again." };
    try {
      const saved = await current.db.recurringExpenses.create(
        scheduleInput(parsed.data, current.actorUserId),
      );
      await current.db.recurringExpenses.postDue(
        todayInTimeZone(business.timeZone),
      );
      return { ok: true as const, id: saved.id };
    } catch (error) {
      return saveError(error);
    }
  });

export const updateRecurringExpense = createServerFn({ method: "POST" })
  .validator((data: RecurringExpenseFormValues & { id: string }) => data)
  .handler(async ({ data }) => {
    const parsed = scheduleFields.safeParse(data);
    if (!parsed.success || !data.id) {
      return {
        ok: false as const,
        message: parsed.success
          ? "That Recurring Expense does not exist."
          : (parsed.error.issues[0]?.message ??
            "Check the form and try again."),
      };
    }
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const saved = await current.db.recurringExpenses.update(
        data.id,
        scheduleInput(parsed.data, current.actorUserId),
      );
      if (!saved) {
        return {
          ok: false as const,
          message: "That Recurring Expense does not exist.",
        };
      }
      const business = await current.db.business.get();
      if (business) {
        await current.db.recurringExpenses.postDue(
          todayInTimeZone(business.timeZone),
        );
      }
      return { ok: true as const, id: saved.id };
    } catch (error) {
      return saveError(error);
    }
  });

export const deleteRecurringExpense = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    const removed = await current.db.recurringExpenses.remove(data.id);
    if (!removed) {
      return {
        ok: false as const,
        message: "That Recurring Expense does not exist.",
      };
    }
    return { ok: true as const };
  });

export const receiptUrl = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const url = await openReceipt(current.businessId, data.id);
      if (!url)
        return { ok: false as const, message: "That Receipt does not exist." };
      return { ok: true as const, url };
    } catch (error) {
      return saveError(error);
    }
  });

export const removeReceipt = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => idField.parse(data))
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    const removed = await clearReceipt(current.businessId, data.id);
    if (!removed) {
      return { ok: false as const, message: "That Expense does not exist." };
    }
    return { ok: true as const };
  });

const categoryFields = z.object({
  name: z.string(),
  group: z.string(),
});

export const createCategory = createServerFn({ method: "POST" })
  .validator((data: { name: string; group: string }) => data)
  .handler(async ({ data }) => {
    const parsed = categoryFields.safeParse(data);
    if (!parsed.success || !isCategoryGroup(parsed.data.group)) {
      return { ok: false as const, message: "Choose a Category group." };
    }
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      await current.db.categories.create(parsed.data.name, parsed.data.group);
      return { ok: true as const };
    } catch (error) {
      return saveError(error);
    }
  });

export const renameCategory = createServerFn({ method: "POST" })
  .validator((data: { id: string; name: string }) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const saved = await current.db.categories.rename(data.id, data.name);
      if (!saved) {
        return { ok: false as const, message: "That Category does not exist." };
      }
      return { ok: true as const };
    } catch (error) {
      return saveError(error);
    }
  });

export const setCategoryArchived = createServerFn({ method: "POST" })
  .validator((data: { id: string; archived: boolean }) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return { ok: false as const, message: "Sign in again." };
    try {
      const saved = await current.db.categories.setArchived(
        data.id,
        data.archived,
      );
      if (!saved) {
        return { ok: false as const, message: "That Category does not exist." };
      }
      return { ok: true as const };
    } catch (error) {
      return saveError(error);
    }
  });
