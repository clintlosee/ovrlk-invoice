import { describe, expect, it } from "vitest";
import { subtotalBeforeTax } from "../src/components/expense-form";

describe("expense subtotal", () => {
  it("subtracts tax paid from the amount paid", () => {
    expect(subtotalBeforeTax("13.92", "0.93")).toBe(1299);
  });

  it("stays hidden until a tax amount is entered", () => {
    expect(subtotalBeforeTax("13.92", "")).toBeNull();
    expect(subtotalBeforeTax("13.92", "0")).toBeNull();
    expect(subtotalBeforeTax("", "0.93")).toBeNull();
  });
});
