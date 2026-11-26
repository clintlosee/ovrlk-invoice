import { addCalendarDays, assertIsoDate } from "./invoice";

export const INTERVAL_UNITS = ["day", "week", "month", "year"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export const MAX_INTERVAL_COUNT = 99;
export const MAX_REMAINING = 999;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isIntervalUnit(value: string): value is IntervalUnit {
  return (INTERVAL_UNITS as readonly string[]).includes(value);
}

/** The first date strictly after `from`, stepping from `anchor` so short months do not stick. */
export function nextOccurrence(
  anchor: string,
  from: string,
  count: number,
  unit: IntervalUnit,
): string {
  const origin = assertIsoDate(anchor);
  const after = assertIsoDate(from);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Interval is not valid");
  }
  if (origin > after) return origin;
  if (unit === "day" || unit === "week") {
    const step = unit === "week" ? count * 7 : count;
    const span = daysBetween(origin, after);
    return addCalendarDays(origin, (Math.floor(span / step) + 1) * step);
  }
  let steps = 0;
  if (unit === "month") {
    const start = parts(origin);
    const end = parts(after);
    steps = Math.floor(((end.y - start.y) * 12 + (end.m - start.m)) / count);
  } else {
    steps = Math.floor((parts(after).y - parts(origin).y) / count);
  }
  let cursor = shift(origin, steps * count, unit);
  while (cursor <= after) {
    steps += 1;
    cursor = shift(origin, steps * count, unit);
  }
  return cursor;
}

export function describeInterval(count: number, unit: IntervalUnit): string {
  if (count === 1) {
    if (unit === "day") return "Every day";
    if (unit === "week") return "Every week";
    if (unit === "month") return "Every month";
    return "Every year";
  }
  return `Every ${count} ${unit}s`;
}

export function describeDuration(remaining: number | null): string {
  if (remaining === null) return "Infinite";
  if (remaining === 0) return "Finished";
  if (remaining === 1) return "1 left";
  return `${remaining} left`;
}

export function scheduleStatus(row: {
  paused: boolean;
  remainingCount: number | null;
}): "active" | "paused" | "finished" {
  if (row.remainingCount === 0) return "finished";
  if (row.paused) return "paused";
  return "active";
}

export function scheduleSentence(
  count: number,
  unit: IntervalUnit,
  nextOn: string,
): string {
  const cadence = describeInterval(count, unit).replace(/^Every/, "every");
  return `An Expense will be created ${cadence} starting ${longDate(nextOn)}.`;
}

export function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

function shift(anchor: string, amount: number, unit: IntervalUnit): string {
  if (unit === "year") return addYears(anchor, amount);
  return addMonths(anchor, amount);
}

function addMonths(anchor: string, months: number): string {
  const { y, m, d } = parts(anchor);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return iso(year, month, Math.min(d, daysInMonth(year, month)));
}

function addYears(anchor: string, years: number): string {
  const { y, m, d } = parts(anchor);
  const year = y + years;
  return iso(year, m, Math.min(d, daysInMonth(year, m)));
}

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysBetween(start: string, end: string): number {
  const a = parts(start);
  const b = parts(end);
  const from = Date.UTC(a.y, a.m - 1, a.d);
  const to = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((to - from) / 86_400_000);
}
