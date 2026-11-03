import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { resolveTheme, type Theme } from "@/lib/theme";
import { readSavedTheme, saveTheme } from "@/server/theme";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  beforeLoad: async () => {
    const savedTheme = await readSavedTheme();
    return { savedTheme };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ovrlk-invoice" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  errorComponent: () => (
    <p className="p-8">Something went wrong. Try again from the home page.</p>
  ),
  notFoundComponent: () => <p className="p-8">That page does not exist.</p>,
});

function RootComponent() {
  const { savedTheme } = Route.useRouteContext();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [saved, setSaved] = useState(savedTheme);
  const theme = resolveTheme(saved, pathname);

  async function choose(next: Theme) {
    const previous = saved;
    setSaved(next);
    try {
      await saveTheme({ data: { theme: next } });
    } catch {
      setSaved(previous);
    }
  }

  return (
    <html lang="en" className={theme} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider theme={saved} setTheme={choose}>
          <Outlet />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
