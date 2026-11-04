export const THEME_COOKIE = "ovrlk-theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/** Sign-up and public Invoice Links follow the device, not the saved choice. */
export function resolveTheme(saved: Theme, pathname: string): Theme {
  if (pathname === "/sign-up" || pathname.startsWith("/p/")) {
    return "system";
  }
  return saved;
}
