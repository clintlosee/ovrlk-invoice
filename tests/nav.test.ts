import { describe, expect, it } from "vitest";
import {
  activeSection,
  invoiceGroupOpen,
  NO_BUSINESS_LABEL,
  settingsGroupOpen,
  sidebarIdentity,
} from "../src/lib/nav";

describe("active section", () => {
  it("lights Dashboard only on the app home", () => {
    expect(activeSection("/app")).toBe("/app");
    expect(activeSection("/app/")).toBe("/app");
  });

  it("lights the section for list, new, and detail pages", () => {
    expect(activeSection("/app/clients")).toBe("/app/clients");
    expect(activeSection("/app/clients/new")).toBe("/app/clients");
    expect(activeSection("/app/clients/abc")).toBe("/app/clients");
    expect(activeSection("/app/invoices/new")).toBe("/app/invoices");
    expect(activeSection("/app/expenses/categories")).toBe("/app/expenses");
    expect(activeSection("/app/reports/clients")).toBe("/app/reports");
    expect(activeSection("/app/items/abc")).toBe("/app/items");
    expect(activeSection("/app/tax-rates/new")).toBe("/app/tax-rates");
    expect(activeSection("/app/settings")).toBe("/app/settings");
    expect(activeSection("/app/security")).toBe("/app/security");
  });

  it("leaves routes outside those sections unlit", () => {
    expect(activeSection("/app/stripe/return")).toBeNull();
    expect(activeSection("/sign-in")).toBeNull();
  });
});

describe("settings group", () => {
  it("opens on Business and Security unless the Owner closed it", () => {
    expect(settingsGroupOpen("/app/settings", null)).toBe(true);
    expect(settingsGroupOpen("/app/security", null)).toBe(true);
    expect(settingsGroupOpen("/app/settings", false)).toBe(false);
  });

  it("stays closed on the working pages unless the Owner opened it", () => {
    expect(settingsGroupOpen("/app", null)).toBe(false);
    expect(settingsGroupOpen("/app/invoices", null)).toBe(false);
    expect(settingsGroupOpen("/app/clients", true)).toBe(true);
  });
});

describe("invoice group", () => {
  it("opens on Items and Tax Rates unless the Owner closed it", () => {
    expect(invoiceGroupOpen("/app/items", null)).toBe(true);
    expect(invoiceGroupOpen("/app/items/abc", null)).toBe(true);
    expect(invoiceGroupOpen("/app/tax-rates/new", null)).toBe(true);
    expect(invoiceGroupOpen("/app/items", false)).toBe(false);
  });

  it("stays closed on the Invoice list unless the Owner opened it", () => {
    expect(invoiceGroupOpen("/app/invoices", null)).toBe(false);
    expect(invoiceGroupOpen("/app", null)).toBe(false);
    expect(invoiceGroupOpen("/app/invoices", true)).toBe(true);
  });
});

describe("sidebar identity", () => {
  it("shows the Business name and Owner", () => {
    expect(sidebarIdentity("Alpine Art & Frame")).toEqual({
      title: "Alpine Art & Frame",
      showOwner: true,
    });
  });

  it("uses one sentence when there is no Business", () => {
    expect(sidebarIdentity(null)).toEqual({
      title: NO_BUSINESS_LABEL,
      showOwner: false,
    });
    expect(sidebarIdentity("  ")).toEqual({
      title: NO_BUSINESS_LABEL,
      showOwner: false,
    });
  });
});
