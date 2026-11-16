import { describe, expect, it } from "vitest";
import { shellKey, transitionTypes } from "../src/lib/motion";

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

describe("transition types", () => {
  it("skips search and hash updates", () => {
    expect(transitionTypes("/app/reports", "/app/reports", false)).toBe(false);
    expect(transitionTypes(undefined, "/app", true)).toBe(false);
  });

  it("names in-app moves separately from shell moves", () => {
    expect(transitionTypes("/app/invoices", "/app/clients", true)).toEqual([
      "app",
    ]);
    expect(transitionTypes("/app/invoices", "/app/invoices/new", true)).toEqual(
      ["app"],
    );
    expect(transitionTypes("/", "/sign-in", true)).toEqual(["shell"]);
    expect(transitionTypes("/app", "/sign-in", true)).toEqual(["shell"]);
  });
});
