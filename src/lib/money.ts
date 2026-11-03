declare const centsBrand: unique symbol;

/** Integer minor units. ADR 0006. One currency per Business; v1 is USD. */
export type Cents = number & { readonly [centsBrand]: true };

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Money must be an integer number of cents");
  }
  return value as Cents;
}

/** "12.50" or "12" → integer cents. At most two decimal places. No floats. */
export function parseDollarsToCents(input: string): Cents {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match || match[1].length > 13) {
    throw new Error("Enter a unit price like 12.50");
  }
  const dollars = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  return cents(dollars * 100 + frac);
}

/** 1250 → "12.50". The sign is included; there is no currency symbol. */
export function formatCents(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${dollars}.${frac}`;
}
