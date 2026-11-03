/** Filename pattern the production route generator skips. */
export const STYLEGUIDE_IGNORE_PATTERN = "styleguide";

export function routeFileIgnorePattern(mode: string): string | undefined {
  return mode === "production" ? STYLEGUIDE_IGNORE_PATTERN : undefined;
}
