import { describe, expect, it } from "vitest";
import { nextOccurrence } from "../src/lib/recurring";

describe("nextOccurrence", () => {
  it("keeps the anchor day across short months", () => {
    expect(nextOccurrence("2026-01-31", "2026-01-31", 1, "month")).toBe(
      "2026-02-28",
    );
    expect(nextOccurrence("2026-01-31", "2026-02-28", 1, "month")).toBe(
      "2026-03-31",
    );
    expect(nextOccurrence("2026-01-31", "2026-03-31", 1, "month")).toBe(
      "2026-04-30",
    );
  });

  it("returns Feb 29 again on the next leap year", () => {
    expect(nextOccurrence("2024-02-29", "2024-02-29", 1, "year")).toBe(
      "2025-02-28",
    );
    expect(nextOccurrence("2024-02-29", "2027-02-28", 1, "year")).toBe(
      "2028-02-29",
    );
  });

  it("steps weeks, days, and a custom month interval", () => {
    expect(nextOccurrence("2026-11-02", "2026-11-02", 1, "week")).toBe(
      "2026-11-09",
    );
    expect(nextOccurrence("2026-01-01", "2026-01-01", 10, "day")).toBe(
      "2026-01-11",
    );
    expect(nextOccurrence("2026-01-15", "2026-03-15", 2, "month")).toBe(
      "2026-05-15",
    );
  });
});
