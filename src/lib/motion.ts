function normalize(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Stable across pages inside the signed-in app, so that shell does not remount. */
export function shellKey(pathname: string) {
  const path = normalize(pathname);
  if (path === "/app" || path.startsWith("/app/")) return "app";
  return path;
}

/** View-transition types. `false` skips the snapshot so in-page motion can run. */
export function transitionTypes(
  from: string | undefined,
  to: string,
  pathChanged: boolean,
): string[] | false {
  if (!from || !pathChanged) return false;
  return shellKey(from) === "app" && shellKey(to) === "app"
    ? ["app"]
    : ["shell"];
}
