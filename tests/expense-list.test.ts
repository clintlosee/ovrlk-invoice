import { describe, expect, it } from "vitest";
import {
  filterExpenseRows,
  isCogs,
  recentExpenses,
} from "../src/lib/expense-list";

const rows = [
  {
    id: "a",
    merchant: "Photoshelter",
    categoryName: "Online services",
    categoryGroup: "schedule_c",
    clientName: null,
    note: "Website Gallery Hosting",
    updatedAt: "2026-10-28T12:00:00.000Z",
  },
  {
    id: "b",
    merchant: "ADC Fine Art",
    categoryName: "Print costs",
    categoryGroup: "cogs",
    clientName: "Clint Losee",
    note: "Canvas wrap",
    updatedAt: "2026-10-21T12:00:00.000Z",
  },
  {
    id: "c",
    merchant: "Stripe",
    categoryName: "Merchant fees",
    categoryGroup: "schedule_c",
    clientName: "Clint Losee",
    note: "Processing fee",
    updatedAt: "2026-10-19T12:00:00.000Z",
  },
  {
    id: "d",
    merchant: "State Farm",
    categoryName: "Insurance",
    categoryGroup: "schedule_c",
    clientName: null,
    note: "Monthly premium",
    updatedAt: "2026-10-06T12:00:00.000Z",
  },
  {
    id: "e",
    merchant: "FreshBooks",
    categoryName: "Office expense",
    categoryGroup: "schedule_c",
    clientName: null,
    note: "Accounting",
    updatedAt: "2026-10-10T12:00:00.000Z",
  },
];

describe("expense list", () => {
  it("keeps the four most recently updated Expenses", () => {
    expect(recentExpenses(rows).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);
  });

  it("breaks an updated-at tie by id", () => {
    const tied = [
      { id: "z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(recentExpenses(tied).map((row) => row.id)).toEqual(["a", "z"]);
  });

  it("matches merchant, category, client, and note", () => {
    expect(filterExpenseRows(rows, "canvas").map((row) => row.id)).toEqual([
      "b",
    ]);
    expect(filterExpenseRows(rows, "CLINT").map((row) => row.id)).toEqual([
      "b",
      "c",
    ]);
    expect(filterExpenseRows(rows, "  ")).toHaveLength(rows.length);
    expect(filterExpenseRows(rows, "nope")).toEqual([]);
  });

  it("treats the Cost of Goods Sold group as the card accent", () => {
    expect(isCogs("cogs")).toBe(true);
    expect(isCogs("schedule_c")).toBe(false);
  });
});
