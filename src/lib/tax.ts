import { type Cents, cents } from "./money";

export type LineTaxRate = {
  id: string;
  /** Basis points. 100 bps = 1%. 725 = 7.25%. */
  rateBps: number;
};

export type LineTax = {
  rates: { id: string; taxCents: Cents }[];
  totalCents: Cents;
};

/**
 * Tax for one line, in integer cents. For Invoice Lines in a later change.
 *
 * Each Tax Rate applies to the full line amount. Rates are not compounded,
 * and the line is not rounded once at the end.
 *
 * Rounding is half up per Tax Rate, toward positive infinity:
 * floor((amountCents * rateBps + 5000) / 10000), done with integer division.
 * 72.5 cents becomes 73, -72.5 becomes -72, and 72.4 stays 72.
 * rateBps is basis points (10_000 bps = 100%). A tax-exempt Client pays 0.
 */
export function lineTax(input: {
  amountCents: number;
  rates: LineTaxRate[];
  taxExempt: boolean;
}): LineTax {
  const amount = cents(input.amountCents);
  for (const rate of input.rates) assertRateBps(rate.rateBps);
  if (input.taxExempt) {
    return {
      rates: input.rates.map((rate) => ({ id: rate.id, taxCents: cents(0) })),
      totalCents: cents(0),
    };
  }
  const rates = input.rates.map((rate) => ({
    id: rate.id,
    taxCents: cents(taxCentsForRate(amount, rate.rateBps)),
  }));
  const total = rates.reduce((sum, rate) => sum + rate.taxCents, 0);
  return { rates, totalCents: cents(total) };
}

function assertRateBps(rateBps: number) {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new Error(
      "Tax Rate must be a non-negative integer number of basis points",
    );
  }
}

/** "7.25" percent → 725 basis points. At most two decimal places. No floats. */
export function parsePercentToBps(input: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new Error("Enter a rate like 7.25");
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + frac;
  if (!Number.isSafeInteger(bps) || bps > 10_000) {
    throw new Error("Enter a rate like 7.25");
  }
  return bps;
}

/** 725 → "7.25". Drops a trailing zero so 720 is "7.2". */
export function formatBps(bps: number): string {
  const whole = Math.floor(Math.abs(bps) / 100);
  const frac = Math.abs(bps) % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

function taxCentsForRate(amountCents: number, rateBps: number): number {
  const product = amountCents * rateBps;
  if (!Number.isSafeInteger(product))
    throw new Error("Tax amount is too large");
  return divideRoundHalfUp(product, 10_000);
}

/** floor((numerator + denominator/2) / denominator) for denominator > 0. */
function divideRoundHalfUp(numerator: number, denominator: number): number {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const biased = n + d / 2n;
  const towardZero = biased / d;
  if (biased >= 0n || biased % d === 0n) return Number(towardZero);
  return Number(towardZero - 1n);
}
