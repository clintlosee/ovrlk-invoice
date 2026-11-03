import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/client";
import { todayInTimeZone } from "../lib/invoice";
import {
  expenseCategoryCsv,
  parseReportQuery,
  periodRange,
  profitAndLossCsv,
  type ReportQuery,
  reportFilename,
  revenueCsv,
} from "../lib/reports";
import { signedInBusiness } from "./membership";
import { ownerFactors } from "./session";
import { forBusiness } from "./tenancy";

async function scope() {
  const current = await signedInBusiness();
  if (!current) return null;
  const db = forBusiness(getDb(), current.businessId);
  const business = await db.business.get();
  if (!business) return null;
  return { db, business, userId: current.session.user.id };
}

function reportError(error: unknown): { ok: false; message: string } {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("date") ||
    message.includes("Report") ||
    message.includes("Money") ||
    message.includes("cents")
  ) {
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  throw error;
}

function resolvedRange(timeZone: string, query: ReportQuery) {
  return periodRange(query.preset, todayInTimeZone(timeZone), {
    from: query.from,
    to: query.to,
  });
}

export const getProfitAndLoss = createServerFn({ method: "GET" })
  .validator((data: ReportQuery) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return null;
    const query = parseReportQuery(data);
    try {
      const range = resolvedRange(current.business.timeZone, query);
      const report = await current.db.reports.profitAndLoss(query.basis, range);
      return {
        ok: true as const,
        report,
        csv: profitAndLossCsv(report),
        filename: reportFilename("profit-and-loss", range),
      };
    } catch (error) {
      return reportError(error);
    }
  });

export const getExpenseReport = createServerFn({ method: "GET" })
  .validator((data: ReportQuery) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return null;
    const query = parseReportQuery(data);
    try {
      const range = resolvedRange(current.business.timeZone, query);
      const report = await current.db.reports.expensesByCategory(range);
      return {
        ok: true as const,
        report,
        csv: expenseCategoryCsv(report),
        filename: reportFilename("expenses-by-category", range),
      };
    } catch (error) {
      return reportError(error);
    }
  });

export const getRevenueReport = createServerFn({ method: "GET" })
  .validator((data: ReportQuery) => data)
  .handler(async ({ data }) => {
    const current = await scope();
    if (!current) return null;
    const query = parseReportQuery(data);
    try {
      const range = resolvedRange(current.business.timeZone, query);
      const report = await current.db.reports.revenueByClient(
        query.basis,
        range,
      );
      return {
        ok: true as const,
        report,
        csv: revenueCsv(report),
        filename: reportFilename("revenue-by-client", range),
      };
    } catch (error) {
      return reportError(error);
    }
  });

export const getDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const current = await scope();
    if (!current) return null;
    const [dashboard, factors] = await Promise.all([
      current.db.reports.dashboard(),
      ownerFactors(current.userId),
    ]);
    return { ...dashboard, ...factors };
  },
);
