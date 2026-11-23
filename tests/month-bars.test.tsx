import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthBars } from "../src/components/reports";
import type { MonthBucket } from "../src/lib/reports";

const months: MonthBucket[] = [
  {
    key: "2026-01",
    label: "Jan 2026",
    shortLabel: "Jan",
    from: "2026-01-01",
    to: "2026-01-31",
    incomeCents: 120000,
    expenseCents: 4500,
  },
  {
    key: "2026-02",
    label: "Feb 2026",
    shortLabel: "Feb",
    from: "2026-02-01",
    to: "2026-02-28",
    incomeCents: 0,
    expenseCents: 800,
  },
];

describe("MonthBars", () => {
  it("frames the chart and names each month on hover", () => {
    const html = renderToStaticMarkup(createElement(MonthBars, { months }));
    expect(html).toContain("bg-card");
    expect(html).toContain("bg-background");
    expect(html).toContain("Jan 2026");
    expect(html).toContain("Feb 2026");
    expect(html).toContain("$1200.00");
    expect(html).toContain("$45.00");
    expect(html).toContain("$0.00");
    expect(html).toContain("$8.00");
    expect(html).toContain("Income");
    expect(html).toContain("Expenses");
    expect(html).not.toContain("title=");
  });
});
