import { describe, expect, it } from "vitest";
import { bulkActionState } from "../src/lib/invoice-bulk";

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
