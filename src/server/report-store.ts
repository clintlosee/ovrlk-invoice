import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { AppDb } from "../db/client";
import {
  business,
  client,
  expense,
  expenseCategory,
  invoice,
  payment,
} from "../db/schema";
import { isCategoryGroup } from "../lib/expense-categories";
import {
  amountDueCents,
  deriveDisplayStatus,
  formatInvoiceNumber,
  isInvoiceStatus,
  todayInTimeZone,
} from "../lib/invoice";
import {
  addCents,
  type CashPayment,
  type DateRange,
  type ExpenseLine,
  expenseCategoryReport,
  fillMonths,
  type IssuedInvoice,
  monthSeries,
  mustCents,
  netCents,
  periodRange,
  profitAndLoss,
  type ReportBasis,
  revenueReport,
  sumInRange,
} from "../lib/reports";

const OPEN_STATUSES = ["sent", "partial"] as const;
const ISSUED_STATUSES = ["sent", "partial", "paid"] as const;
const RECENT_LIMIT = 8;

export function reportMethods(db: AppDb, businessId: string) {
  return {
    async profitAndLoss(basis: ReportBasis, range: DateRange) {
      const [incomeCents, expenses] = await Promise.all([
        basis === "cash"
          ? cashIncome(db, businessId, range)
          : accrualIncome(db, businessId, range),
        expenseLines(db, businessId, range),
      ]);
      return profitAndLoss({ basis, range, incomeCents, expenses });
    },
    async expensesByCategory(range: DateRange) {
      return expenseCategoryReport(
        range,
        await expenseLines(db, businessId, range),
      );
    },
    async revenueByClient(basis: ReportBasis, range: DateRange) {
      const [issued, payments] = await Promise.all([
        issuedInvoices(db, businessId, range),
        basis === "cash"
          ? paymentsInRange(db, businessId, range)
          : Promise.resolve([] as CashPayment[]),
      ]);
      return revenueReport({ basis, range, issued, payments });
    },
    async dashboard(now = new Date()) {
      const businessRow = await businessOf(db, businessId);
      const today = todayInTimeZone(businessRow.timeZone, now);
      const thisMonth = periodRange("this_month", today);
      const yearToDate = periodRange("year_to_date", today);
      const months = monthSeries(today);
      const window = {
        from: months[0]?.from ?? thisMonth.from,
        to: months.at(-1)?.to ?? thisMonth.to,
      };
      const [open, recentInvoices, recentPayments, paymentRows, expenseRows] =
        await Promise.all([
          openBalances(db, businessId),
          recentInvoiceRows(db, businessId, now, businessRow.timeZone),
          recentPaymentRows(db, businessId),
          paymentNets(db, businessId, window),
          expenseAmounts(db, businessId, window),
        ]);
      let outstandingCents = 0;
      let overdueCents = 0;
      let overdueCount = 0;
      for (const row of open) {
        outstandingCents = addCents(outstandingCents, row.dueCents);
        if (deriveDisplayStatus(row, now, businessRow.timeZone) === "overdue") {
          overdueCents = addCents(overdueCents, row.dueCents);
          overdueCount += 1;
        }
      }
      const paidRows = paymentRows.map((row) => ({
        date: row.paidOn,
        amountCents: row.netCents,
      }));
      const spentRows = expenseRows.map((row) => ({
        date: row.spentOn,
        amountCents: row.amountCents,
      }));
      const paidYearToDateCents = sumInRange(paidRows, yearToDate);
      const expensesYearToDateCents = sumInRange(spentRows, yearToDate);
      return {
        today,
        timeZone: businessRow.timeZone,
        currency: businessRow.currency,
        businessName: businessRow.name,
        thisMonth,
        yearToDate,
        outstandingCents,
        overdueCents,
        overdueCount,
        paidThisMonthCents: sumInRange(paidRows, thisMonth),
        paidYearToDateCents,
        expensesThisMonthCents: sumInRange(spentRows, thisMonth),
        expensesYearToDateCents,
        netProfitYearToDateCents: addCents(
          paidYearToDateCents,
          -expensesYearToDateCents,
        ),
        recentInvoices,
        recentPayments,
        months: fillMonths(months, paymentRows, expenseRows),
      };
    },
  };
}

async function businessOf(db: AppDb, businessId: string) {
  const rows = await db
    .select({
      name: business.name,
      currency: business.currency,
      timeZone: business.timeZone,
    })
    .from(business)
    .where(eq(business.id, businessId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("A signed-in Business is required");
  return row;
}

async function cashIncome(db: AppDb, businessId: string, range: DateRange) {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${payment.amountCents} - ${payment.refundedCents}), 0)`,
    })
    .from(payment)
    .where(
      and(
        eq(payment.businessId, businessId),
        gte(payment.paidOn, range.from),
        lte(payment.paidOn, range.to),
      ),
    );
  return mustCents(rows[0]?.total ?? 0);
}

async function accrualIncome(db: AppDb, businessId: string, range: DateRange) {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${invoice.totalCents}), 0)`,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.businessId, businessId),
        inArray(invoice.status, [...ISSUED_STATUSES]),
        gte(invoice.issueDate, range.from),
        lte(invoice.issueDate, range.to),
      ),
    );
  return mustCents(rows[0]?.total ?? 0);
}

async function expenseLines(
  db: AppDb,
  businessId: string,
  range: DateRange,
): Promise<ExpenseLine[]> {
  const rows = await db
    .select({
      categoryId: expense.categoryId,
      categoryName: expenseCategory.name,
      categoryGroup: expenseCategory.categoryGroup,
      archivedAt: expenseCategory.archivedAt,
      amountCents: sql<number>`sum(${expense.amountCents})`,
      taxPaidCents: sql<number>`sum(${expense.taxPaidCents})`,
    })
    .from(expense)
    .innerJoin(
      expenseCategory,
      and(
        eq(expenseCategory.id, expense.categoryId),
        eq(expenseCategory.businessId, businessId),
      ),
    )
    .where(
      and(
        eq(expense.businessId, businessId),
        gte(expense.spentOn, range.from),
        lte(expense.spentOn, range.to),
      ),
    )
    .groupBy(expense.categoryId);
  return rows.map((row) => {
    if (!isCategoryGroup(row.categoryGroup)) {
      throw new Error("Category group is not valid");
    }
    return {
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryGroup: row.categoryGroup,
      archived: row.archivedAt != null,
      amountCents: mustCents(row.amountCents),
      taxPaidCents: mustCents(row.taxPaidCents),
    };
  });
}

async function issuedInvoices(
  db: AppDb,
  businessId: string,
  range: DateRange,
): Promise<IssuedInvoice[]> {
  const rows = await db
    .select({
      clientId: client.id,
      clientName: client.name,
      status: invoice.status,
      totalCents: invoice.totalCents,
      paidCents: sql<number>`coalesce(sum(${payment.amountCents} - ${payment.refundedCents}), 0)`,
    })
    .from(invoice)
    .innerJoin(
      client,
      and(eq(client.id, invoice.clientId), eq(client.businessId, businessId)),
    )
    .leftJoin(
      payment,
      and(
        eq(payment.invoiceId, invoice.id),
        eq(payment.businessId, businessId),
      ),
    )
    .where(
      and(
        eq(invoice.businessId, businessId),
        inArray(invoice.status, [...ISSUED_STATUSES]),
        gte(invoice.issueDate, range.from),
        lte(invoice.issueDate, range.to),
      ),
    )
    .groupBy(invoice.id, client.id);
  return rows.map((row) => {
    if (!isInvoiceStatus(row.status)) {
      throw new Error("Invoice status is not valid");
    }
    return {
      clientId: row.clientId,
      clientName: row.clientName,
      status: row.status,
      totalCents: mustCents(row.totalCents),
      paidCents: mustCents(row.paidCents),
    };
  });
}

async function paymentsInRange(
  db: AppDb,
  businessId: string,
  range: DateRange,
): Promise<CashPayment[]> {
  const rows = await db
    .select({
      clientId: client.id,
      clientName: client.name,
      amountCents: payment.amountCents,
      refundedCents: payment.refundedCents,
    })
    .from(payment)
    .innerJoin(
      invoice,
      and(
        eq(invoice.id, payment.invoiceId),
        eq(invoice.businessId, businessId),
      ),
    )
    .innerJoin(
      client,
      and(eq(client.id, invoice.clientId), eq(client.businessId, businessId)),
    )
    .where(
      and(
        eq(payment.businessId, businessId),
        gte(payment.paidOn, range.from),
        lte(payment.paidOn, range.to),
      ),
    );
  return rows.map((row) => ({
    clientId: row.clientId,
    clientName: row.clientName,
    netCents: netCents(row.amountCents, row.refundedCents),
  }));
}

async function openBalances(db: AppDb, businessId: string) {
  const rows = await db
    .select({
      dueDate: invoice.dueDate,
      totalCents: invoice.totalCents,
      status: invoice.status,
      firstViewedAt: invoice.firstViewedAt,
      paidCents: sql<number>`coalesce(sum(${payment.amountCents} - ${payment.refundedCents}), 0)`,
    })
    .from(invoice)
    .leftJoin(
      payment,
      and(
        eq(payment.invoiceId, invoice.id),
        eq(payment.businessId, businessId),
      ),
    )
    .where(
      and(
        eq(invoice.businessId, businessId),
        inArray(invoice.status, [...OPEN_STATUSES]),
      ),
    )
    .groupBy(invoice.id);
  return rows.map((row) => {
    if (!isInvoiceStatus(row.status)) {
      throw new Error("Invoice status is not valid");
    }
    const totalCents = mustCents(row.totalCents);
    const paidCents = mustCents(row.paidCents);
    return {
      status: row.status,
      dueDate: row.dueDate,
      totalCents,
      paidCents,
      viewed: row.firstViewedAt != null,
      dueCents: amountDueCents(row.status, totalCents, paidCents),
    };
  });
}

async function recentInvoiceRows(
  db: AppDb,
  businessId: string,
  now: Date,
  timeZone: string,
) {
  const rows = await db
    .select({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      dueDate: invoice.dueDate,
      totalCents: invoice.totalCents,
      firstViewedAt: invoice.firstViewedAt,
      clientName: client.name,
      paidCents: sql<number>`coalesce(sum(${payment.amountCents} - ${payment.refundedCents}), 0)`,
    })
    .from(invoice)
    .innerJoin(
      client,
      and(eq(client.id, invoice.clientId), eq(client.businessId, businessId)),
    )
    .leftJoin(
      payment,
      and(
        eq(payment.invoiceId, invoice.id),
        eq(payment.businessId, businessId),
      ),
    )
    .where(eq(invoice.businessId, businessId))
    .groupBy(invoice.id, client.id)
    .orderBy(desc(invoice.updatedAt))
    .limit(RECENT_LIMIT);
  return rows.map((row) => {
    if (!isInvoiceStatus(row.status)) {
      throw new Error("Invoice status is not valid");
    }
    const total = mustCents(row.totalCents);
    const paid = mustCents(row.paidCents);
    const displayStatus = deriveDisplayStatus(
      {
        status: row.status,
        dueDate: row.dueDate,
        totalCents: total,
        paidCents: paid,
        viewed: row.firstViewedAt != null,
      },
      now,
      timeZone,
    );
    return {
      id: row.id,
      numberLabel: formatInvoiceNumber(row.number),
      clientName: row.clientName,
      displayStatus,
      totalCents: total,
      dueDate: row.dueDate,
    };
  });
}

async function recentPaymentRows(db: AppDb, businessId: string) {
  const rows = await db
    .select({
      id: payment.id,
      paidOn: payment.paidOn,
      amountCents: payment.amountCents,
      refundedCents: payment.refundedCents,
      invoiceId: invoice.id,
      number: invoice.number,
      clientName: client.name,
    })
    .from(payment)
    .innerJoin(
      invoice,
      and(
        eq(invoice.id, payment.invoiceId),
        eq(invoice.businessId, businessId),
      ),
    )
    .innerJoin(
      client,
      and(eq(client.id, invoice.clientId), eq(client.businessId, businessId)),
    )
    .where(eq(payment.businessId, businessId))
    .orderBy(desc(payment.paidOn), desc(payment.createdAt))
    .limit(RECENT_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    paidOn: row.paidOn,
    netCents: netCents(row.amountCents, row.refundedCents),
    refundedCents: mustCents(row.refundedCents),
    clientName: row.clientName,
    invoiceId: row.invoiceId,
    numberLabel: formatInvoiceNumber(row.number),
  }));
}

async function paymentNets(db: AppDb, businessId: string, range: DateRange) {
  const rows = await db
    .select({
      paidOn: payment.paidOn,
      amountCents: payment.amountCents,
      refundedCents: payment.refundedCents,
    })
    .from(payment)
    .where(
      and(
        eq(payment.businessId, businessId),
        gte(payment.paidOn, range.from),
        lte(payment.paidOn, range.to),
      ),
    );
  return rows.map((row) => ({
    paidOn: row.paidOn,
    netCents: netCents(row.amountCents, row.refundedCents),
  }));
}

async function expenseAmounts(db: AppDb, businessId: string, range: DateRange) {
  return db
    .select({
      spentOn: expense.spentOn,
      amountCents: expense.amountCents,
    })
    .from(expense)
    .where(
      and(
        eq(expense.businessId, businessId),
        gte(expense.spentOn, range.from),
        lte(expense.spentOn, range.to),
      ),
    );
}
