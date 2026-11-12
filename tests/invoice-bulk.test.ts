import { describe, expect, it } from "vitest";
import {
  applyToAll,
  bulkActionState,
  paymentFormRows,
} from "../src/lib/invoice-bulk";

describe("bulkActionState", () => {
  it("decides edit and add a Payment from status list", () => {
    expect(bulkActionState([{ id: "a", status: "sent" }])).toEqual({
      edit: true,
      addPayment: true,
    });
    expect(bulkActionState([{ id: "a", status: "paid" }]).edit).toBe(false);
    expect(bulkActionState([{ id: "a", status: "void" }]).edit).toBe(false);
    expect(
      bulkActionState([
        { id: "a", status: "sent" },
        { id: "b", status: "partial" },
      ]).edit,
    ).toBe(false);
    expect(
      bulkActionState([
        { id: "a", status: "sent" },
        { id: "b", status: "paid" },
      ]).addPayment,
    ).toBe(false);
    expect(bulkActionState([{ id: "a", status: "draft" }]).addPayment).toBe(
      false,
    );
    expect(bulkActionState([{ id: "a", status: "void" }]).addPayment).toBe(
      false,
    );
    expect(bulkActionState([]).addPayment).toBe(false);
  });
});

it("starts each row at the remaining balance and groups by Client", () => {
  const rows = paymentFormRows(
    [
      {
        id: "a",
        clientName: "Ada",
        numberLabel: "0000001",
        amountDueCents: 12000,
        status: "sent",
      },
      {
        id: "b",
        clientName: "Ada",
        numberLabel: "0000002",
        amountDueCents: 4000,
        status: "partial",
      },
      {
        id: "c",
        clientName: "Bea",
        numberLabel: "0000003",
        amountDueCents: 500,
        status: "paid",
      },
    ],
    "2026-11-11",
  );
  expect(rows.rejected.map((row) => row.id)).toEqual(["c"]);
  expect(rows.groups).toEqual([
    {
      clientName: "Ada",
      rows: [
        {
          invoiceId: "a",
          numberLabel: "0000001",
          paidOn: "2026-11-11",
          note: "",
          method: "check",
          amountCents: 12000,
        },
        {
          invoiceId: "b",
          numberLabel: "0000002",
          paidOn: "2026-11-11",
          note: "",
          method: "check",
          amountCents: 4000,
        },
      ],
    },
  ]);
});

it("copies date, note, and method onto every row and leaves amounts", () => {
  const rows = paymentFormRows(
    [
      {
        id: "a",
        clientName: "Ada",
        numberLabel: "0000001",
        amountDueCents: 12000,
        status: "sent",
      },
      {
        id: "b",
        clientName: "Ada",
        numberLabel: "0000002",
        amountDueCents: 4000,
        status: "partial",
      },
      {
        id: "c",
        clientName: "Bea",
        numberLabel: "0000003",
        amountDueCents: 500,
        status: "paid",
      },
    ],
    "2026-11-11",
  ).groups.flatMap((group) => group.rows);
  const next = applyToAll(rows, {
    paidOn: "2026-11-01",
    note: "1042",
    method: "cash",
  });
  expect(
    next.every(
      (row) =>
        row.paidOn === "2026-11-01" &&
        row.note === "1042" &&
        row.method === "cash",
    ),
  ).toBe(true);
  expect(next.map((row) => row.amountCents)).toEqual([12000, 4000]);
});
