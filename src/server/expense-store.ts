import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { AppDb } from "../db/client";
import {
  auditLog,
  client,
  expense,
  expenseCategory,
  invoice,
  payment,
} from "../db/schema";
import {
  EXPENSE_CATEGORY_SEEDS,
  isCategoryGroup,
  MERCHANT_FEES_KEY,
} from "../lib/expense-categories";
import { keyOwnedBy } from "../lib/files";
import { assertIsoDate, formatInvoiceNumber } from "../lib/invoice";
import { cents } from "../lib/money";

export type ExpenseInput = {
  spentOn: string;
  merchant: string;
  amountCents: number;
  categoryId: string;
  clientId: string | null;
  taxPaidCents: number;
  note: string | null;
  /** Omitted means not recurring. */
  recurring?: boolean;
  actorUserId: string;
};

export type ExpenseFilter = {
  from: string | null;
  to: string | null;
  categoryId: string | null;
};

export type ExpenseView = {
  id: string;
  spentOn: string;
  merchant: string;
  amountCents: number;
  taxPaidCents: number;
  note: string | null;
  categoryId: string;
  categoryName: string;
  categoryGroup: string;
  clientId: string | null;
  clientName: string | null;
  receiptKey: string | null;
  receiptContentType: string | null;
  paymentId: string | null;
  recurring: boolean;
  updatedAt: string;
};

export type CategoryView = {
  id: string;
  name: string;
  categoryGroup: string;
  systemKey: string | null;
  archived: boolean;
};

type Executor = Pick<AppDb, "select" | "insert" | "update" | "delete">;

const NAME_MAX = 80;
const MERCHANT_MAX = 200;
const NOTE_MAX = 2000;

export async function seedExpenseCategories(db: AppDb, businessId: string) {
  const existing = await db
    .select({ systemKey: expenseCategory.systemKey })
    .from(expenseCategory)
    .where(eq(expenseCategory.businessId, businessId));
  const have = new Set(existing.map((row) => row.systemKey));
  const missing = EXPENSE_CATEGORY_SEEDS.filter(
    (seed) => !have.has(seed.systemKey),
  );
  if (missing.length === 0) return;
  const now = new Date();
  await db.insert(expenseCategory).values(
    missing.map((seed) => ({
      id: crypto.randomUUID(),
      businessId,
      name: seed.name,
      categoryGroup: seed.group,
      systemKey: seed.systemKey,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

export function categoryMethods(db: AppDb, businessId: string) {
  return {
    async list(): Promise<CategoryView[]> {
      const rows = await db
        .select()
        .from(expenseCategory)
        .where(eq(expenseCategory.businessId, businessId))
        .orderBy(asc(expenseCategory.name));
      return rows.map(toCategory);
    },
    async create(name: string, group: string) {
      const label = categoryName(name);
      const categoryGroup = categoryGroupOf(group);
      await assertUniqueName(db, businessId, label, null);
      const now = new Date();
      const rows = await db
        .insert(expenseCategory)
        .values({
          id: crypto.randomUUID(),
          businessId,
          name: label,
          categoryGroup,
          systemKey: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Could not save the Category");
      return toCategory(row);
    },
    async rename(categoryId: string, name: string) {
      const label = categoryName(name);
      const current = await oneCategory(db, businessId, categoryId);
      if (!current) return null;
      await assertUniqueName(db, businessId, label, current.id);
      const rows = await db
        .update(expenseCategory)
        .set({ name: label, updatedAt: new Date() })
        .where(
          and(
            eq(expenseCategory.id, categoryId),
            eq(expenseCategory.businessId, businessId),
          ),
        )
        .returning();
      return rows[0] ? toCategory(rows[0]) : null;
    },
    async setArchived(categoryId: string, archived: boolean) {
      const current = await oneCategory(db, businessId, categoryId);
      if (!current) return null;
      if (archived && current.systemKey === MERCHANT_FEES_KEY) {
        throw new Error("Merchant fees stays available for card Payments");
      }
      const rows = await db
        .update(expenseCategory)
        .set({
          archivedAt: archived ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(expenseCategory.id, categoryId),
            eq(expenseCategory.businessId, businessId),
          ),
        )
        .returning();
      return rows[0] ? toCategory(rows[0]) : null;
    },
  };
}

export function expenseMethods(db: AppDb, businessId: string) {
  return {
    async list(filter: ExpenseFilter): Promise<ExpenseView[]> {
      const from = filter.from ? assertIsoDate(filter.from) : null;
      const to = filter.to ? assertIsoDate(filter.to) : null;
      return selectExpenses(
        db,
        businessId,
        and(
          eq(expense.businessId, businessId),
          from ? gte(expense.spentOn, from) : undefined,
          to ? lte(expense.spentOn, to) : undefined,
          filter.categoryId
            ? eq(expense.categoryId, filter.categoryId)
            : undefined,
        ),
      );
    },
    async get(expenseId: string): Promise<ExpenseView | null> {
      const rows = await selectExpenses(
        db,
        businessId,
        and(eq(expense.businessId, businessId), eq(expense.id, expenseId)),
      );
      return rows[0] ?? null;
    },
    async findByReceiptKey(key: string) {
      const rows = await db
        .select({ id: expense.id })
        .from(expense)
        .where(
          and(eq(expense.businessId, businessId), eq(expense.receiptKey, key)),
        )
        .limit(1);
      return rows[0] ?? null;
    },
    async create(input: ExpenseInput) {
      const fields = await normalize(db, businessId, input, null);
      const now = new Date();
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(expense).values({
          id,
          businessId,
          ...fields,
          receiptKey: null,
          receiptContentType: null,
          paymentId: null,
          createdAt: now,
          updatedAt: now,
        });
        await writeAudit(tx, {
          businessId,
          actorUserId: input.actorUserId,
          action: "expense.created",
          expenseId: id,
          amountCents: fields.amountCents,
        });
      });
      const saved = await this.get(id);
      if (!saved) throw new Error("Could not save the Expense");
      return saved;
    },
    async update(expenseId: string, input: ExpenseInput) {
      const current = await oneExpense(db, businessId, expenseId);
      if (!current) return null;
      const fields = await normalize(db, businessId, input, current.categoryId);
      const recurring = current.paymentId ? false : fields.recurring;
      if (current.paymentId) {
        if (
          fields.spentOn !== current.spentOn ||
          fields.merchant !== current.merchant ||
          fields.amountCents !== current.amountCents ||
          fields.categoryId !== current.categoryId ||
          fields.taxPaidCents !== current.taxPaidCents
        ) {
          throw new Error("A Merchant Fee follows its Payment");
        }
      }
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(expense)
          .set({ ...fields, recurring, updatedAt: new Date() })
          .where(
            and(eq(expense.id, expenseId), eq(expense.businessId, businessId)),
          )
          .returning({ id: expense.id });
        if (!updated[0]) return;
        await writeAudit(tx, {
          businessId,
          actorUserId: input.actorUserId,
          action: "expense.updated",
          expenseId,
          amountCents: fields.amountCents,
        });
      });
      return this.get(expenseId);
    },
    async remove(expenseId: string, actorUserId: string) {
      const current = await oneExpense(db, businessId, expenseId);
      if (!current) return null;
      if (current.paymentId) {
        throw new Error("A Merchant Fee follows its Payment");
      }
      await db.transaction(async (tx) => {
        const removed = await tx
          .delete(expense)
          .where(
            and(eq(expense.id, expenseId), eq(expense.businessId, businessId)),
          )
          .returning({ id: expense.id });
        if (!removed[0]) return;
        await writeAudit(tx, {
          businessId,
          actorUserId,
          action: "expense.deleted",
          expenseId,
          amountCents: current.amountCents,
        });
      });
      return { receiptKey: current.receiptKey };
    },
    async attachReceipt(
      expenseId: string,
      key: string,
      contentType: string,
    ): Promise<{ previousKey: string | null } | null> {
      if (!keyOwnedBy(businessId, key, "receipts")) {
        throw new Error("That file does not belong to this Business");
      }
      const current = await oneExpense(db, businessId, expenseId);
      if (!current) return null;
      await db
        .update(expense)
        .set({
          receiptKey: key,
          receiptContentType: contentType,
          updatedAt: new Date(),
        })
        .where(
          and(eq(expense.id, expenseId), eq(expense.businessId, businessId)),
        );
      return { previousKey: current.receiptKey };
    },
    async clearReceipt(
      expenseId: string,
    ): Promise<{ previousKey: string | null } | null> {
      const current = await oneExpense(db, businessId, expenseId);
      if (!current) return null;
      await db
        .update(expense)
        .set({
          receiptKey: null,
          receiptContentType: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(expense.id, expenseId), eq(expense.businessId, businessId)),
        );
      return { previousKey: current.receiptKey };
    },
  };
}

/**
 * Net fee on the Payment becomes the Merchant Fee amount.
 * fee_cents null leaves the Expense alone. Zero removes it.
 * Returns a receipt key to delete after the transaction commits.
 */
export async function syncMerchantFee(
  tx: Executor,
  businessId: string,
  paymentId: string,
): Promise<string | null> {
  const rows = await tx
    .select()
    .from(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.businessId, businessId)))
    .limit(1);
  const row = rows[0];
  if (row?.method !== "stripe") return null;
  const existing = await tx
    .select()
    .from(expense)
    .where(
      and(eq(expense.paymentId, paymentId), eq(expense.businessId, businessId)),
    )
    .limit(1);
  const current = existing[0];
  if (row.feeCents == null) return null;
  if (row.feeCents === 0) {
    if (!current) return null;
    await tx
      .delete(expense)
      .where(
        and(eq(expense.id, current.id), eq(expense.businessId, businessId)),
      );
    await writeAudit(tx, {
      businessId,
      actorUserId: null,
      action: "expense.deleted",
      expenseId: current.id,
      amountCents: current.amountCents,
      metadata: { paymentId, source: "stripe_fee" },
    });
    return current.receiptKey;
  }
  const fee = cents(row.feeCents);
  if (current) {
    if (current.amountCents === fee) return null;
    await tx
      .update(expense)
      .set({ amountCents: fee, updatedAt: new Date() })
      .where(
        and(eq(expense.id, current.id), eq(expense.businessId, businessId)),
      );
    await writeAudit(tx, {
      businessId,
      actorUserId: null,
      action: "expense.updated",
      expenseId: current.id,
      amountCents: fee,
      metadata: { paymentId, source: "stripe_fee" },
    });
    return null;
  }
  const categoryId = await merchantFeeCategoryId(tx, businessId);
  const invoices = await tx
    .select({
      number: invoice.number,
      clientId: invoice.clientId,
    })
    .from(invoice)
    .where(
      and(eq(invoice.id, row.invoiceId), eq(invoice.businessId, businessId)),
    )
    .limit(1);
  const target = invoices[0];
  if (!target) return null;
  const now = new Date();
  const id = crypto.randomUUID();
  await tx.insert(expense).values({
    id,
    businessId,
    spentOn: row.paidOn,
    merchant: "Stripe",
    amountCents: fee,
    categoryId,
    clientId: target.clientId,
    taxPaidCents: 0,
    note: `Processing fee for Invoice ${formatInvoiceNumber(target.number)}`,
    recurring: false,
    receiptKey: null,
    receiptContentType: null,
    paymentId: row.id,
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit(tx, {
    businessId,
    actorUserId: null,
    action: "expense.created",
    expenseId: id,
    amountCents: fee,
    metadata: { paymentId: row.id, source: "stripe_fee" },
  });
  return null;
}

async function merchantFeeCategoryId(tx: Executor, businessId: string) {
  const found = await tx
    .select({ id: expenseCategory.id })
    .from(expenseCategory)
    .where(
      and(
        eq(expenseCategory.businessId, businessId),
        eq(expenseCategory.systemKey, MERCHANT_FEES_KEY),
      ),
    )
    .limit(1);
  if (found[0]) return found[0].id;
  const now = new Date();
  const id = crypto.randomUUID();
  await tx.insert(expenseCategory).values({
    id,
    businessId,
    name: "Merchant fees",
    categoryGroup: "schedule_c",
    systemKey: MERCHANT_FEES_KEY,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function normalize(
  db: AppDb,
  businessId: string,
  input: ExpenseInput,
  currentCategoryId: string | null,
) {
  const spentOn = assertIsoDate(input.spentOn);
  const merchant = input.merchant.trim();
  if (!merchant || merchant.length > MERCHANT_MAX) {
    throw new Error("Merchant is required");
  }
  const amount = cents(input.amountCents);
  if (amount <= 0) throw new Error("Enter an amount");
  const taxPaid = cents(input.taxPaidCents);
  if (taxPaid < 0) throw new Error("Enter a tax amount");
  const note = boundedNote(input.note);
  const category = await oneCategory(db, businessId, input.categoryId);
  if (!category) throw new Error("Choose a Category");
  if (category.archivedAt && category.id !== currentCategoryId) {
    throw new Error("Choose a Category");
  }
  let clientId: string | null = null;
  if (input.clientId) {
    const rows = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(eq(client.id, input.clientId), eq(client.businessId, businessId)),
      )
      .limit(1);
    if (!rows[0])
      throw new Error("That Client does not belong to this Business");
    clientId = rows[0].id;
  }
  return {
    spentOn,
    merchant,
    amountCents: amount,
    taxPaidCents: taxPaid,
    note,
    categoryId: category.id,
    clientId,
    recurring: input.recurring === true,
  };
}

async function selectExpenses(
  db: AppDb,
  businessId: string,
  where: ReturnType<typeof and>,
): Promise<ExpenseView[]> {
  const rows = await db
    .select({
      id: expense.id,
      spentOn: expense.spentOn,
      merchant: expense.merchant,
      amountCents: expense.amountCents,
      taxPaidCents: expense.taxPaidCents,
      note: expense.note,
      categoryId: expense.categoryId,
      categoryName: expenseCategory.name,
      categoryGroup: expenseCategory.categoryGroup,
      clientId: expense.clientId,
      clientName: client.name,
      receiptKey: expense.receiptKey,
      receiptContentType: expense.receiptContentType,
      paymentId: expense.paymentId,
      recurring: expense.recurring,
      updatedAt: expense.updatedAt,
    })
    .from(expense)
    .innerJoin(
      expenseCategory,
      and(
        eq(expenseCategory.id, expense.categoryId),
        eq(expenseCategory.businessId, businessId),
      ),
    )
    .leftJoin(
      client,
      and(eq(client.id, expense.clientId), eq(client.businessId, businessId)),
    )
    .where(where)
    .orderBy(desc(expense.spentOn), desc(expense.createdAt));
  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function toCategory(row: typeof expenseCategory.$inferSelect): CategoryView {
  return {
    id: row.id,
    name: row.name,
    categoryGroup: row.categoryGroup,
    systemKey: row.systemKey,
    archived: row.archivedAt != null,
  };
}

function categoryName(name: string) {
  const label = name.trim();
  if (!label || label.length > NAME_MAX)
    throw new Error("Category name is required");
  return label;
}

function categoryGroupOf(group: string) {
  if (!isCategoryGroup(group)) throw new Error("Choose a Category group");
  return group;
}

async function assertUniqueName(
  db: AppDb,
  businessId: string,
  name: string,
  exceptId: string | null,
) {
  const rows = await db
    .select({ id: expenseCategory.id, name: expenseCategory.name })
    .from(expenseCategory)
    .where(
      and(
        eq(expenseCategory.businessId, businessId),
        isNull(expenseCategory.archivedAt),
      ),
    );
  const taken = rows.some(
    (row) =>
      row.id !== exceptId && row.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new Error("That Category name is already used");
}

async function oneCategory(db: AppDb, businessId: string, categoryId: string) {
  const rows = await db
    .select()
    .from(expenseCategory)
    .where(
      and(
        eq(expenseCategory.id, categoryId),
        eq(expenseCategory.businessId, businessId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function oneExpense(db: AppDb, businessId: string, expenseId: string) {
  const rows = await db
    .select()
    .from(expense)
    .where(and(eq(expense.id, expenseId), eq(expense.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

function boundedNote(value: string | null) {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTE_MAX) throw new Error("Note is too long");
  return trimmed;
}

async function writeAudit(
  tx: Executor,
  input: {
    businessId: string;
    actorUserId: string | null;
    action: string;
    expenseId: string;
    amountCents: number;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLog).values({
    id: crypto.randomUUID(),
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "expense",
    entityId: input.expenseId,
    amountCents: input.amountCents,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    ip: null,
    userAgent: null,
    createdAt: new Date(),
  });
}
