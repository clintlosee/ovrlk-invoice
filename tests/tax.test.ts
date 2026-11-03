import { describe, expect, it } from "vitest";
import { formatBps, lineTax, parsePercentToBps } from "../src/lib/tax";

describe("line tax", () => {
  it("rounds half up per rate and skips tax for an exempt Client", () => {
    expect(
      lineTax({
        amountCents: 1000,
        rates: [{ id: "utah", rateBps: 725 }],
        taxExempt: false,
      }),
    ).toEqual({
      rates: [{ id: "utah", taxCents: 73 }],
      totalCents: 73,
    });
    expect(
      lineTax({
        amountCents: 1000,
        rates: [{ id: "city", rateBps: 825 }],
        taxExempt: false,
      }).totalCents,
    ).toBe(83);
    expect(
      lineTax({
        amountCents: 1,
        rates: [{ id: "half", rateBps: 5000 }],
        taxExempt: false,
      }).totalCents,
    ).toBe(1);
    expect(
      lineTax({
        amountCents: 1,
        rates: [{ id: "under", rateBps: 4999 }],
        taxExempt: false,
      }).totalCents,
    ).toBe(0);
    expect(
      lineTax({
        amountCents: 1000,
        rates: [{ id: "exact", rateBps: 700 }],
        taxExempt: false,
      }).totalCents,
    ).toBe(70);

    const split = lineTax({
      amountCents: 1,
      rates: [
        { id: "a", rateBps: 5000 },
        { id: "b", rateBps: 5000 },
      ],
      taxExempt: false,
    });
    expect(split.rates.map((rate) => rate.taxCents)).toEqual([1, 1]);
    expect(split.totalCents).toBe(2);

    expect(
      lineTax({
        amountCents: -1000,
        rates: [{ id: "utah", rateBps: 725 }],
        taxExempt: false,
      }).totalCents,
    ).toBe(-72);
    expect(
      lineTax({
        amountCents: -1,
        rates: [{ id: "half", rateBps: 5000 }],
        taxExempt: false,
      }).totalCents,
    ).toBe(0);

    const exempt = lineTax({
      amountCents: 1000,
      rates: [
        { id: "utah", rateBps: 725 },
        { id: "city", rateBps: 100 },
      ],
      taxExempt: true,
    });
    expect(exempt.rates).toEqual([
      { id: "utah", taxCents: 0 },
      { id: "city", taxCents: 0 },
    ]);
    expect(exempt.totalCents).toBe(0);
    expect(
      lineTax({ amountCents: 1000, rates: [], taxExempt: false }).totalCents,
    ).toBe(0);

    expect(() =>
      lineTax({ amountCents: 10.5, rates: [], taxExempt: false }),
    ).toThrow(/integer/);
    expect(() =>
      lineTax({
        amountCents: 1000,
        rates: [{ id: "bad", rateBps: 7.25 }],
        taxExempt: true,
      }),
    ).toThrow(/basis points/);
    expect(() =>
      lineTax({
        amountCents: Number.MAX_SAFE_INTEGER,
        rates: [{ id: "big", rateBps: 2 }],
        taxExempt: false,
      }),
    ).toThrow(/too large/);
  });

  it("converts a percent string to basis points without floats", () => {
    expect(parsePercentToBps("7.25")).toBe(725);
    expect(parsePercentToBps("7.2")).toBe(720);
    expect(parsePercentToBps("7")).toBe(700);
    expect(parsePercentToBps("0.5")).toBe(50);
    expect(parsePercentToBps("100")).toBe(10_000);
    expect(formatBps(725)).toBe("7.25");
    expect(formatBps(720)).toBe("7.2");
    expect(formatBps(700)).toBe("7");
    expect(formatBps(5)).toBe("0.05");
    expect(parsePercentToBps(formatBps(720))).toBe(720);
    expect(() => parsePercentToBps("7.255")).toThrow(/7\.25/);
    expect(() => parsePercentToBps("100.01")).toThrow(/7\.25/);
    expect(() => parsePercentToBps("-1")).toThrow(/7\.25/);
  });
});
