export type RouteShift = "deeper" | "shallower" | "peer";

function normalize(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function segments(pathname: string) {
  return normalize(pathname).split("/").filter(Boolean);
}

function isPrefix(shorter: string[], longer: string[]) {
  return (
    longer.length > shorter.length &&
    longer
      .slice(0, shorter.length)
      .every((part, index) => part === shorter[index])
  );
}

/** Stable across pages inside the signed-in app, so that shell does not remount. */
export function shellKey(pathname: string) {
  const path = normalize(pathname);
  if (path === "/app" || path.startsWith("/app/")) return "app";
  return path;
}

/** How the next page sits relative to the one being left. */
export function routeShift(from: string, to: string): RouteShift {
  const previous = segments(from);
  const next = segments(to);
  if (isPrefix(previous, next)) return "deeper";
  if (isPrefix(next, previous)) return "shallower";
  return "peer";
}

/** View-transition types. `false` skips the snapshot so in-page motion can run. */
export function transitionTypes(
  from: string | undefined,
  to: string,
  pathChanged: boolean,
): string[] | false {
  if (!from || !pathChanged) return false;
  const scope =
    shellKey(from) === "app" && shellKey(to) === "app" ? "app" : "shell";
  return [scope, routeShift(from, to)];
}
