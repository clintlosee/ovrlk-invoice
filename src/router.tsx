import { createRouter } from "@tanstack/react-router";
import { transitionTypes } from "@/lib/motion";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    scrollToTopSelectors: ['[data-scroll-restoration-id="app-main"]'],
    defaultPreload: "intent",
    defaultViewTransition: {
      types: ({ fromLocation, toLocation, pathChanged }) =>
        transitionTypes(
          fromLocation?.pathname,
          toLocation.pathname,
          pathChanged,
        ),
    },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
