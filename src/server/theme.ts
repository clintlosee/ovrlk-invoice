import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { isProduction } from "@/lib/config";
import { isTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export const readSavedTheme = createServerFn({ method: "GET" }).handler(
  (): Theme => {
    const value = getCookie(THEME_COOKIE);
    return isTheme(value) ? value : "system";
  },
);

export const saveTheme = createServerFn({ method: "POST" })
  .validator((data: { theme: string }): { theme: Theme } => {
    if (!isTheme(data.theme)) throw new Error("Choose light, dark, or system.");
    return { theme: data.theme };
  })
  .handler(({ data }) => {
    setCookie(THEME_COOKIE, data.theme, {
      path: "/",
      maxAge: YEAR_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: isProduction(),
    });
    return data.theme;
  });
