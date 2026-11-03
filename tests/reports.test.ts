import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { deriveDisplayStatus, todayInTimeZone } from "../src/lib/invoice";
import { cents } from "../src/lib/money";
import {
  type CategoryAmount,
  expenseCategoryCsv,
  type ProfitAndLoss,
  parseReportQuery,
  periodRange,
  profitAndLossCsv,
  revenueCsv,
} from "../src/lib/reports";
import type { InvoiceInput } from "../src/server/invoice-store";
import { forBusiness } from "../src/server/tenancy";
import { insertOwner } from "./helpers";

const DENVER_STILL_MARCH = new Date("2026-04-01T05:30:00.000Z");
const MARCH = { from: "2026-03-01", to: "2026-03-31" };

function invoiceInput(
  clientId: string,
  unitPriceCents: number,
  issueDate: string,
  dueDate: string,
): InvoiceInput {
  return {
    clientId,
    issueDate,
    dueDate,
    reference: null,
    notes: null,
    terms: null,
    lines: [
      {
        name: "Print",
        description: null,
        quantity: 1,
        unitPriceCents: cents(unitPriceCents),
        taxRateIds: [],
      },
    ],
  };
}

function stripeIds(prefix: string) {
  const id = crypto.randomUUID().replaceAll("-", "");
  return {
    checkoutSessionId: `cs_${prefix}${id}`,
    paymentIntentId: `pi_${prefix}${id}`,
    chargeId: `ch_${prefix}${id}`,
    balanceTransactionId: `txn_${prefix}${id}`,
    refundId: `re_${prefix}${id}`,
  };
}

function named(rows: CategoryAmount[], name: string) {
  return rows.find((row) => row.name === name);
}

describe("report periods", () => {
  it("uses the business-local calendar, including leap day and year boundaries", () => {
    expect(todayInTimeZone("America/Denver", DENVER_STILL_MARCH)).toBe(
      "2026-03-31",
    );
    expect(todayInTimeZone("UTC", DENVER_STILL_MARCH)).toBe("2026-04-01");
    expect(periodRange("this_month", "2026-03-31")).toEqual(MARCH);
    expect(periodRange("this_month", "2026-04-01")).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(periodRange("last_month", "2026-04-01")).toEqual(MARCH);
    expect(periodRange("last_month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(periodRange("this_quarter", "2026-03-31")).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(periodRange("this_quarter", "2026-11-03")).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
    expect(periodRange("year_to_date", "2026-11-03")).toEqual({
      from: "2026-01-01",
      to: "2026-11-03",
    });
    expect(periodRange("last_year", "2026-11-03")).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(periodRange("this_month", "2024-02-15")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(periodRange("last_month", "2024-03-01")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(
      periodRange("custom", "2026-03-31", {
        from: "2026-03-31",
        to: "2026-03-31",
      }),
    ).toEqual({ from: "2026-03-31", to: "2026-03-31" });
    expect(() =>
      periodRange("custom", "2026-03-31", { from: "", to: "" }),
    ).toThrow(/date/);
    expect(() =>
      periodRange("custom", "2026-03-31", {
        from: "2026-04-02",
        to: "2026-04-01",
      }),
    ).toThrow(/start date/);
    expect(() =>
      periodRange("custom", "2026-03-31", {
        from: "2026-02-31",
        to: "2026-03-01",
      }),
    ).toThrow(/date/);
    expect(parseReportQuery({ preset: "nope", basis: "nope" })).toEqual({
      preset: "this_month",
      basis: "cash",
      from: "",
      to: "",
    });
    expect(
      parseReportQuery({ basis: "accrual", from: "2026-01-01" }).basis,
    ).toBe("accrual");
  });

  it("quotes commas in CSV and keeps cents exact", () => {
    const report: ProfitAndLoss = {
      basis: "cash",
      from: "2026-03-01",
      to: "2026-03-31",
      definition: 'Cash basis. Say "hello"',
      grossIncomeCents: 13999,
      cogs: [],
      cogsCents: 0,
      grossProfitCents: 13999,
      expenses: [
        {
          categoryId: "supplies",
          name: 'Paper, "ream"',
          archived: true,
          amountCents: 1,
          taxPaidCents: 0,
        },
      ],
      expenseCents: 1,
      netProfitCents: -50,
    };
    const csv = profitAndLossCsv(report);
    expect(csv).toContain('"Cash basis. Say ""hello"""');
    expect(csv).toContain('"Paper, ""ream""",0.01,yes');
    expect(csv).toContain("Gross income,,139.99");
    expect(csv).toContain("Net profit,,-0.50");
    expect(
      expenseCategoryCsv({
        from: "2026-03-01",
        to: "2026-03-31",
        cogs: [],
        cogsCents: 0,
        cogsTaxCents: 0,
        expenses: [],
        expenseCents: 0,
        expenseTaxCents: 0,
        totalCents: 0,
        taxPaidCents: 0,
      }),
    ).toContain("Tax paid");
    expect(
      revenueCsv({
        basis: "cash",
        from: "2026-03-01",
        to: "2026-03-31",
        definition: "Cash basis.",
        note: 'Paid is Payments, "net"',
        rows: [],
        invoicedCents: 0,
        paidCents: 0,
        outstandingCents: 0,
        creditCents: 0,
        revenueCents: 0,
      }),
    ).toContain('"Paid is Payments, ""net"""');
  });
});

describe("reports", () => {
  it("keeps cash and accrual totals inside one Business", async () => {
    const db = getDb();
    const owner = await insertOwner("reports-a@example.com", "Report Prints");
    const other = await insertOwner("reports-b@example.com", "Other Reports");
    const scope = forBusiness(db, owner.businessId);
    const hidden = forBusiness(db, other.businessId);
    const client = async (name: string, email: string) =>
      scope.clients.create({
        name,
        email,
        phone: null,
        address: null,
        taxExempt: true,
        note: null,
      });
    const ada = await client("Ada", "ada-reports@example.com");
    const bea = await client('Bea, "Studio"', "bea-reports@example.com");
    const cara = await client("Cara", "cara-reports@example.com");
    const dee = await client("Dee", "dee-reports@example.com");
    const eli = await client("Eli", "eli-reports@example.com");
    const fae = await client("Fae", "fae-reports@example.com");
    const gus = await client("Gus", "gus-reports@example.com");
    const categories = await scope.categories.list();
    const supplies = categories.find((row) => row.systemKey === "supplies");
    const print = categories.find((row) => row.systemKey === "cogs_print");
    if (!supplies || !print) throw new Error("categories");

    const send = async (
      clientId: string,
      amount: number,
      issueDate: string,
      dueDate: string,
    ) => {
      const draft = await scope.invoices.create(
        invoiceInput(clientId, amount, issueDate, dueDate),
      );
      const sent = await scope.invoices.send(draft.id, owner.userId);
      if (!sent) throw new Error("send");
      return sent.invoice;
    };
    const card = async (
      invoiceId: string,
      amount: number,
      paidOn: string,
      feeCents: number,
      prefix: string,
    ) => {
      const ids = stripeIds(prefix);
      expect(
        await scope.payments.recordStripe({
          invoiceId,
          amountCents: cents(amount),
          paidOn,
          checkoutSessionId: ids.checkoutSessionId,
          paymentIntentId: ids.paymentIntentId,
          fee: {
            chargeId: ids.chargeId,
            balanceTransactionId: ids.balanceTransactionId,
            feeCents,
          },
        }),
      ).toBe("recorded");
      return ids;
    };

    const adaInvoice = await send(ada.id, 10000, "2026-03-15", "2026-03-20");
    await scope.payments.recordManual({
      invoiceId: adaInvoice.id,
      amountCents: cents(4000),
      paidOn: "2026-03-20",
      method: "check",
      note: null,
      actorUserId: owner.userId,
    });
    const beaInvoice = await send(bea.id, 5000, "2026-03-31", "2026-04-30");
    await scope.payments.recordManual({
      invoiceId: beaInvoice.id,
      amountCents: cents(8000),
      paidOn: "2026-03-31",
      method: "cash",
      note: null,
      actorUserId: owner.userId,
    });
    await send(cara.id, 3000, "2026-03-28", "2026-04-15");
    const deeInvoice = await send(dee.id, 2000, "2026-02-02", "2026-02-15");
    const deePay = await card(deeInvoice.id, 2000, "2026-03-01", 175, "dee");
    expect(
      await scope.payments.applyRefund({
        chargeId: deePay.chargeId,
        paymentIntentId: deePay.paymentIntentId,
        absoluteRefundedCents: 1,
        refundId: deePay.refundId,
        refundAmountCents: null,
        refundIds: [deePay.refundId],
        feeCents: 175,
      }),
    ).toBe("applied");
    await send(eli.id, 2200, "2026-02-10", "2026-02-20");
    const gusInvoice = await send(gus.id, 4000, "2026-03-08", "2026-03-18");
    const gusPay = await card(gusInvoice.id, 4000, "2026-03-08", 50, "gus");
    expect(
      await scope.payments.applyRefund({
        chargeId: gusPay.chargeId,
        paymentIntentId: gusPay.paymentIntentId,
        absoluteRefundedCents: 4000,
        refundId: gusPay.refundId,
        refundAmountCents: null,
        refundIds: [gusPay.refundId],
        feeCents: 50,
      }),
    ).toBe("applied");
    expect(
      await scope.invoices.voidInvoice(gusInvoice.id, "Refunded", owner.userId),
    ).not.toBeNull();
    const doomed = await send(ada.id, 7000, "2026-03-12", "2026-03-19");
    expect(
      await scope.invoices.voidInvoice(doomed.id, "Wrong", owner.userId),
    ).not.toBeNull();
    await scope.invoices.create(
      invoiceInput(ada.id, 9999, "2026-03-10", "2026-01-01"),
    );
    const faeInvoice = await send(fae.id, 6000, "2026-04-02", "2026-04-20");
    await scope.payments.recordManual({
      invoiceId: faeInvoice.id,
      amountCents: cents(6000),
      paidOn: "2026-04-02",
      method: "venmo",
      note: null,
      actorUserId: owner.userId,
    });
    await scope.expenses.create({
      spentOn: "2026-03-31",
      merchant: "Paper Co",
      amountCents: cents(2500),
      categoryId: supplies.id,
      clientId: ada.id,
      taxPaidCents: cents(125),
      note: null,
      actorUserId: owner.userId,
    });
    await scope.expenses.create({
      spentOn: "2026-04-01",
      merchant: "Paper Co",
      amountCents: cents(50),
      categoryId: supplies.id,
      clientId: null,
      taxPaidCents: 0,
      note: null,
      actorUserId: owner.userId,
    });
    await scope.expenses.create({
      spentOn: "2026-03-01",
      merchant: "Lab",
      amountCents: cents(1000),
      categoryId: print.id,
      clientId: null,
      taxPaidCents: 0,
      note: null,
      actorUserId: owner.userId,
    });
    expect(await scope.categories.setArchived(supplies.id, true)).toMatchObject(
      { archived: true },
    );

    const marchCash = await scope.reports.profitAndLoss("cash", MARCH);
    expect(marchCash).toMatchObject({
      grossIncomeCents: 13999,
      cogsCents: 1000,
      grossProfitCents: 12999,
      expenseCents: 2725,
      netProfitCents: 10274,
    });
    expect(named(marchCash.cogs, "Print costs")).toMatchObject({
      amountCents: 1000,
      archived: false,
    });
    expect(named(marchCash.expenses, "Supplies")).toMatchObject({
      amountCents: 2500,
      archived: true,
    });
    expect(named(marchCash.expenses, "Merchant fees")).toMatchObject({
      amountCents: 225,
    });
    expect(marchCash.cogs.some((row) => row.name === "Merchant fees")).toBe(
      false,
    );

    const marchAccrual = await scope.reports.profitAndLoss("accrual", MARCH);
    expect(marchAccrual).toMatchObject({
      grossIncomeCents: 18000,
      cogsCents: 1000,
      grossProfitCents: 17000,
      expenseCents: 2725,
      netProfitCents: 14275,
    });

    const day = { from: "2026-03-31", to: "2026-03-31" };
    expect(await scope.reports.profitAndLoss("cash", day)).toMatchObject({
      grossIncomeCents: 8000,
      cogsCents: 0,
      expenseCents: 2500,
      netProfitCents: 5500,
    });
    expect(await scope.reports.profitAndLoss("accrual", day)).toMatchObject({
      grossIncomeCents: 5000,
    });
    expect(
      await scope.reports.profitAndLoss("cash", {
        from: "2026-01-01",
        to: "2026-01-15",
      }),
    ).toMatchObject({ grossIncomeCents: 0, expenseCents: 0, cogsCents: 0 });

    const april = { from: "2026-04-01", to: "2026-04-30" };
    expect(await scope.reports.profitAndLoss("cash", april)).toMatchObject({
      grossIncomeCents: 6000,
      cogsCents: 0,
      expenseCents: 50,
      netProfitCents: 5950,
    });
    expect(await scope.reports.profitAndLoss("accrual", april)).toMatchObject({
      grossIncomeCents: 6000,
      netProfitCents: 5950,
    });
    expect(
      await scope.reports.profitAndLoss("cash", {
        from: "2026-02-01",
        to: "2026-02-28",
      }),
    ).toMatchObject({ grossIncomeCents: 0, netProfitCents: 0 });
    expect(
      await scope.reports.profitAndLoss("accrual", {
        from: "2026-02-01",
        to: "2026-02-28",
      }),
    ).toMatchObject({
      grossIncomeCents: 4200,
      expenseCents: 0,
      cogsCents: 0,
      netProfitCents: 4200,
    });

    const byCategory = await scope.reports.expensesByCategory(MARCH);
    expect(byCategory).toMatchObject({
      cogsCents: 1000,
      cogsTaxCents: 0,
      expenseCents: 2725,
      expenseTaxCents: 125,
      totalCents: 3725,
      taxPaidCents: 125,
    });
    expect(named(byCategory.expenses, "Supplies")?.taxPaidCents).toBe(125);
    expect(profitAndLossCsv(marchCash)).toContain("Supplies,25.00,yes");
    expect(expenseCategoryCsv(byCategory)).toContain("1.25,yes");

    const cashClients = await scope.reports.revenueByClient("cash", MARCH);
    expect(cashClients.revenueCents).toBe(13999);
    expect(cashClients.rows.map((row) => row.name)).toEqual([
      "Ada",
      'Bea, "Studio"',
      "Cara",
      "Dee",
    ]);
    expect(cashClients.rows).toEqual([
      expect.objectContaining({
        name: "Ada",
        invoicedCents: 10000,
        paidCents: 4000,
        outstandingCents: 6000,
        creditCents: 0,
      }),
      expect.objectContaining({
        name: 'Bea, "Studio"',
        invoicedCents: 5000,
        paidCents: 8000,
        outstandingCents: 0,
        creditCents: 3000,
      }),
      expect.objectContaining({
        name: "Cara",
        invoicedCents: 3000,
        paidCents: 0,
        outstandingCents: 3000,
        creditCents: 0,
      }),
      expect.objectContaining({
        name: "Dee",
        invoicedCents: 0,
        paidCents: 1999,
        outstandingCents: 0,
        creditCents: 0,
      }),
    ]);
    expect(revenueCsv(cashClients)).toContain('"Bea, ""Studio"""');

    const accrualClients = await scope.reports.revenueByClient(
      "accrual",
      MARCH,
    );
    expect(accrualClients.revenueCents).toBe(18000);
    expect(accrualClients.rows.map((row) => row.name)).toEqual([
      "Ada",
      'Bea, "Studio"',
      "Cara",
    ]);
    expect(accrualClients.rows[0]).toMatchObject({
      paidCents: 4000,
      outstandingCents: 6000,
    });
    const february = await scope.reports.revenueByClient("accrual", {
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(february.rows).toEqual([
      expect.objectContaining({
        name: "Dee",
        invoicedCents: 2000,
        paidCents: 1999,
        outstandingCents: 1,
        creditCents: 0,
      }),
      expect.objectContaining({
        name: "Eli",
        invoicedCents: 2200,
        paidCents: 0,
        outstandingCents: 2200,
        creditCents: 0,
      }),
    ]);

    const home = await scope.reports.dashboard(DENVER_STILL_MARCH);
    expect(home.today).toBe("2026-03-31");
    expect(home.thisMonth).toEqual(MARCH);
    expect(home.yearToDate).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(home).toMatchObject({
      outstandingCents: 11201,
      overdueCents: 8201,
      overdueCount: 3,
      paidThisMonthCents: 13999,
      paidYearToDateCents: 13999,
      expensesThisMonthCents: 3725,
      expensesYearToDateCents: 3725,
      netProfitYearToDateCents: 10274,
    });
    expect(home.months.find((month) => month.key === "2026-03")).toMatchObject({
      incomeCents: 13999,
      expenseCents: 3725,
    });
    expect(
      home.months.find((month) => month.key === "2026-04"),
    ).toBeUndefined();
    expect(home.months.find((month) => month.key === "2026-02")).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
    });
    expect(home.recentInvoices.length).toBeLessThanOrEqual(8);
    expect(home.recentInvoices.some((row) => row.clientName === "Ada")).toBe(
      true,
    );
    expect(
      home.recentPayments.some(
        (row) => row.clientName === "Dee" && row.refundedCents === 1,
      ),
    ).toBe(true);
    expect(
      home.recentPayments.find((row) => row.clientName === "Dee")?.netCents,
    ).toBe(1999);

    expect(await hidden.reports.profitAndLoss("cash", MARCH)).toMatchObject({
      grossIncomeCents: 0,
      cogsCents: 0,
      expenseCents: 0,
      netProfitCents: 0,
    });
    expect(await hidden.reports.profitAndLoss("accrual", MARCH)).toMatchObject({
      grossIncomeCents: 0,
    });
    expect((await hidden.reports.expensesByCategory(MARCH)).totalCents).toBe(0);
    expect(await hidden.reports.revenueByClient("cash", MARCH)).toMatchObject({
      rows: [],
      revenueCents: 0,
    });
    const otherHome = await hidden.reports.dashboard(DENVER_STILL_MARCH);
    expect(otherHome).toMatchObject({
      outstandingCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      paidThisMonthCents: 0,
      expensesThisMonthCents: 0,
      netProfitYearToDateCents: 0,
      recentInvoices: [],
      recentPayments: [],
    });
    expect(
      otherHome.months.every(
        (month) => month.incomeCents === 0 && month.expenseCents === 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(otherHome)).not.toContain(adaInvoice.id);

    await scope.business.update({ timeZone: "UTC" });
    const utc = await scope.reports.dashboard(DENVER_STILL_MARCH);
    expect(utc.today).toBe("2026-04-01");
    expect(utc.thisMonth).toEqual(april);
    expect(utc.paidThisMonthCents).toBe(6000);
    expect(utc.expensesThisMonthCents).toBe(50);
    expect(utc.paidYearToDateCents).toBe(13999);
    expect(utc.expensesYearToDateCents).toBe(3775);
    expect(utc.netProfitYearToDateCents).toBe(10224);
    expect(utc.months.find((month) => month.key === "2026-04")).toMatchObject({
      incomeCents: 6000,
      expenseCents: 50,
    });
  });
});

describe("overdue agrees with display status", () => {
  it("counts the same Invoices the badge calls overdue, including partial", async () => {
    const owner = await insertOwner(
      "display-overdue@example.com",
      "Display Prints",
    );
    const scope = forBusiness(getDb(), owner.businessId);
    const buyer = await scope.clients.create({
      name: "Ada",
      email: "ada-display@example.com",
      phone: null,
      address: null,
      taxExempt: true,
      note: null,
    });
    const send = async (amount: number, dueDate: string) => {
      const draft = await scope.invoices.create(
        invoiceInput(buyer.id, amount, "2026-03-01", dueDate),
      );
      const sent = await scope.invoices.send(draft.id, owner.userId);
      if (!sent) throw new Error("send");
      return sent.invoice;
    };
    const pay = async (invoiceId: string, amount: number, paidOn: string) => {
      await scope.payments.recordManual({
        invoiceId,
        amountCents: cents(amount),
        paidOn,
        method: "check",
        note: null,
        actorUserId: owner.userId,
      });
    };

    await send(1000, "2026-03-30");
    await send(500, "2026-03-31");
    await send(700, "2026-04-07");
    await send(800, "2026-04-08");
    const partial = await send(1000, "2026-03-20");
    await pay(partial.id, 400, "2026-03-20");
    const overpaid = await send(1000, "2026-01-15");
    await pay(overpaid.id, 1500, "2026-01-15");
    const voided = await send(900, "2026-01-01");
    expect(
      await scope.invoices.voidInvoice(voided.id, "Wrong", owner.userId),
    ).not.toBeNull();
    await scope.invoices.create(
      invoiceInput(buyer.id, 400, "2026-03-01", "2026-01-02"),
    );

    const home = await scope.reports.dashboard(DENVER_STILL_MARCH);
    const byDue = new Map(
      home.recentInvoices.map((row) => [row.dueDate, row.displayStatus]),
    );
    expect(byDue.get("2026-03-30")).toBe("overdue");
    expect(byDue.get("2026-03-31")).toBe("due-soon");
    expect(byDue.get("2026-04-07")).toBe("due-soon");
    expect(byDue.get("2026-04-08")).toBe("sent");
    expect(byDue.get("2026-03-20")).toBe(
      deriveDisplayStatus(
        {
          status: "partial",
          dueDate: "2026-03-20",
          totalCents: 1000,
          paidCents: 400,
          viewed: false,
        },
        DENVER_STILL_MARCH,
        "America/Denver",
      ),
    );
    expect(byDue.get("2026-01-15")).toBe("overpaid");
    expect(byDue.get("2026-01-01")).toBe("void");
    expect(byDue.get("2026-01-02")).toBe("draft");
    expect(home.overdueCount).toBe(
      home.recentInvoices.filter((row) => row.displayStatus === "overdue")
        .length,
    );
    expect(home.overdueCents).toBe(1600);

    await scope.business.update({ timeZone: "UTC" });
    const utc = await scope.reports.dashboard(DENVER_STILL_MARCH);
    const utcByDue = new Map(
      utc.recentInvoices.map((row) => [row.dueDate, row.displayStatus]),
    );
    expect(utcByDue.get("2026-03-31")).toBe("overdue");
    expect(utcByDue.get("2026-04-08")).toBe("due-soon");
    expect(utc.overdueCount).toBe(3);
    expect(utc.overdueCents).toBe(2100);
  });
});
