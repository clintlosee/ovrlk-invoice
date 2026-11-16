import { describe, expect, it } from "vitest";
import { routeShift, shellKey, transitionTypes } from "../src/lib/motion";

describe("shell key", () => {
  it("keeps the signed-in app on one shell", () => {
    expect(shellKey("/app")).toBe("app");
    expect(shellKey("/app/")).toBe("app");
    expect(shellKey("/app/invoices/new")).toBe("app");
  });

  it("treats other routes as their own shell", () => {
    expect(shellKey("/")).toBe("/");
    expect(shellKey("/sign-in")).toBe("/sign-in");
    expect(shellKey("/p/abc")).toBe("/p/abc");
  });
});

describe("route shift", () => {
  it("reads depth along one branch", () => {
    expect(routeShift("/app/invoices", "/app/invoices/new")).toBe("deeper");
    expect(routeShift("/app", "/app/clients")).toBe("deeper");
    expect(routeShift("/app/invoices/abc", "/app/invoices")).toBe("shallower");
  });

  it("treats siblings as peers", () => {
    expect(routeShift("/app/clients", "/app/invoices")).toBe("peer");
    expect(routeShift("/app/invoices/new", "/app/clients")).toBe("peer");
    expect(routeShift("/app/reports", "/app/reports")).toBe("peer");
  });
});

describe("transition types", () => {
  it("skips search and hash updates", () => {
    expect(transitionTypes("/app/reports", "/app/reports", false)).toBe(false);
    expect(transitionTypes(undefined, "/app", true)).toBe(false);
  });

  it("names in-app moves separately from shell moves", () => {
    expect(transitionTypes("/app/invoices", "/app/clients", true)).toEqual([
      "app",
      "peer",
    ]);
    expect(transitionTypes("/app/invoices", "/app/invoices/new", true)).toEqual(
      ["app", "deeper"],
    );
    expect(transitionTypes("/", "/sign-in", true)).toEqual(["shell", "deeper"]);
    expect(transitionTypes("/app", "/sign-in", true)).toEqual([
      "shell",
      "peer",
    ]);
  });
});
