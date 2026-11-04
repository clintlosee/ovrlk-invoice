import { describe, expect, it } from "vitest";
import { isTheme, resolveTheme } from "../src/lib/theme";

describe("theme", () => {
  it("uses the saved theme on sign-in", () => {
    expect(resolveTheme("dark", "/sign-in")).toBe("dark");
    expect(resolveTheme("light", "/sign-in")).toBe("light");
    expect(resolveTheme("system", "/sign-in")).toBe("system");
  });

  it("keeps sign-up and Invoice Links on the device theme", () => {
    expect(resolveTheme("light", "/sign-up")).toBe("system");
    expect(resolveTheme("dark", "/p/token")).toBe("system");
    expect(resolveTheme("light", "/app")).toBe("light");
    expect(resolveTheme("dark", "/app/settings")).toBe("dark");
    expect(resolveTheme("system", "/")).toBe("system");
    expect(resolveTheme("dark", "/terms")).toBe("dark");
  });

  it("accepts only light, dark, and system", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("blue")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});
