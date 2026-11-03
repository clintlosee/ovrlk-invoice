import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STATUSES = [
  "paid",
  "sent",
  "viewed",
  "due-soon",
  "overdue",
  "draft",
  "partial",
  "void",
] as const;

const TEXT_SURFACES = [
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "accent",
] as const;

// Owner kept the brief's border even though it is under 3:1.
const BORDER_EXCEPTIONS = new Set([
  "light border/background",
  "light border/card",
  "light border/popover",
  "dark border/background",
  "dark border/card",
  "dark border/popover",
]);

type Pair = {
  name: string;
  foreground: string;
  background: string;
  minimum: number;
};

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.slice(1);
  const red = channel(Number.parseInt(raw.slice(0, 2), 16));
  const green = channel(Number.parseInt(raw.slice(2, 4), 16));
  const blue = channel(Number.parseInt(raw.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(color: string, background: string, alpha: number): string {
  const mix = (start: number) => {
    const fg = Number.parseInt(color.slice(start, start + 2), 16);
    const bg = Number.parseInt(background.slice(start, start + 2), 16);
    return Math.round(fg * alpha + bg * (1 - alpha));
  };
  return [1, 3, 5]
    .map((start) => mix(start).toString(16).padStart(2, "0"))
    .join("")
    .replace(/^/, "#");
}

function block(css: string, name: string): Record<string, string> {
  const marker = `/* token-block: ${name} */`;
  const start = css.indexOf(marker);
  const next = css.indexOf("/* token-block:", start + marker.length);
  const slice = css.slice(start, next === -1 ? css.length : next);
  const props: Record<string, string> = {};
  for (const match of slice.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const key = match[1];
    const value = match[2];
    if (key && value) props[key] = value.replace(/\s+/g, "");
  }
  return props;
}

function tintAlpha(value: string): number {
  const match = /(\d+)%/.exec(value);
  if (!match?.[1]) throw new Error(`Missing tint alpha in ${value}`);
  return Number(match[1]) / 100;
}

function textPairs(mode: string, tokens: Record<string, string>): Pair[] {
  const pairs: Pair[] = [];
  const add = (name: string, foreground: string, background: string) => {
    const fg = tokens[foreground];
    const bg = tokens[background];
    if (!fg || !bg) throw new Error(`Missing ${foreground} or ${background}`);
    pairs.push({
      name: `${mode} ${name}`,
      foreground: fg,
      background: bg,
      minimum: 4.5,
    });
  };
  for (const surface of TEXT_SURFACES)
    add(`foreground/${surface}`, "foreground", surface);
  add("card-foreground/card", "card-foreground", "card");
  add("popover-foreground/popover", "popover-foreground", "popover");
  add("primary-foreground/primary", "primary-foreground", "primary");
  add(
    "primary-foreground/primary-hover",
    "primary-foreground",
    "primary-hover",
  );
  add("secondary-foreground/secondary", "secondary-foreground", "secondary");
  for (const surface of TEXT_SURFACES) {
    add(`muted-foreground/${surface}`, "muted-foreground", surface);
  }
  add("accent-foreground/accent", "accent-foreground", "accent");
  add(
    "destructive-foreground/destructive",
    "destructive-foreground",
    "destructive",
  );
  add("brass-foreground/brass", "brass-foreground", "brass");
  for (const surface of TEXT_SURFACES)
    add(`brass-ink/${surface}`, "brass-ink", surface);
  return pairs;
}

function uiPairs(mode: string, tokens: Record<string, string>): Pair[] {
  const surfaces = {
    border: ["background", "card", "popover"],
    input: ["background", "card"],
    ring: ["background", "card", "popover"],
  } as const;
  const pairs: Pair[] = [];
  for (const token of ["border", "input", "ring"] as const) {
    for (const surface of surfaces[token]) {
      const foreground = tokens[token];
      const background = tokens[surface];
      if (!foreground || !background) throw new Error(`Missing ${token}`);
      pairs.push({
        name: `${mode} ${token}/${surface}`,
        foreground,
        background,
        minimum: 3,
      });
    }
  }
  return pairs;
}

function statusPairs(mode: string, tokens: Record<string, string>): Pair[] {
  const pairs: Pair[] = [];
  for (const status of STATUSES) {
    const text = tokens[`status-${status}-foreground`];
    const chroma = tokens[`status-${status}`];
    const alpha = tintAlpha(tokens[`status-${status}-bg`] ?? "");
    if (!text || !chroma) throw new Error(`Missing status ${status}`);
    for (const surface of ["background", "card"] as const) {
      const base = tokens[surface];
      if (!base) throw new Error(`Missing ${surface}`);
      pairs.push({
        name: `${mode} status-${status}/${surface}`,
        foreground: text,
        background: composite(chroma, base, alpha),
        minimum: 4.5,
      });
    }
  }
  return pairs;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("color contrast", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const light = block(css, "light");
  const dark = block(css, "dark");
  const system = block(css, "system");

  it("copies the dark values into the system media query", () => {
    expect(system).toEqual(dark);
  });

  it("meets AA except the border the owner left unchanged", () => {
    const pairs = [
      ...textPairs("light", light),
      ...textPairs("dark", dark),
      ...uiPairs("light", light),
      ...uiPairs("dark", dark),
      ...statusPairs("light", light),
      ...statusPairs("dark", dark),
    ];
    const failed = pairs
      .filter(
        (pair) => contrast(pair.foreground, pair.background) < pair.minimum,
      )
      .map((pair) => pair.name)
      .sort();
    expect(failed).toEqual([...BORDER_EXCEPTIONS].sort());
  });

  it("keeps brass a fill and components free of hardcoded colors", () => {
    const brass = light.brass;
    const background = light.background;
    if (!brass || !background) throw new Error("Missing brass");
    expect(contrast(brass, background)).toBeLessThan(4.5);
    const sources = [
      ...sourceFiles("src/components"),
      ...sourceFiles("src/routes"),
    ].map((file) => readFileSync(file, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/text-brass(?!-(?:foreground|ink)\b)/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
