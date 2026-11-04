import { describe, expect, it } from "vitest";
import { landingCopy } from "../src/components/landing";

describe("landing", () => {
  it("uses the approved words and only offers sign-in", () => {
    expect(landingCopy.headline).toBe("Invoices, expenses, and the books.");
    expect(landingCopy.features.map((feature) => feature.title)).toEqual([
      "Invoices",
      "Invoice link",
      "Expenses",
      "Reports",
      "Items",
    ]);
    expect(landingCopy.ways.map((way) => way.title)).toEqual([
      "Your Business",
      "Your Clients",
      "Kept simple",
    ]);
    expect(landingCopy.signedOut).toEqual({
      label: "Sign in",
      to: "/sign-in",
    });
    expect(landingCopy.signedIn).toEqual({
      label: "Open the Business",
      to: "/app",
    });
    expect(landingCopy.signInArt).toBe("The books, kept here.");
    expect(JSON.stringify(landingCopy)).not.toMatch(/sign up/i);
  });
});
