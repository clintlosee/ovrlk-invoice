declare const centsBrand: unique symbol;

/** Integer minor units. ADR 0006. One currency per Business; v1 is USD. */
export type Cents = number & { readonly [centsBrand]: true };

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Money must be an integer number of cents");
  }
  return value as Cents;
}
