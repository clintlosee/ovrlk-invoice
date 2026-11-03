import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  routeFileIgnorePattern,
  STYLEGUIDE_IGNORE_PATTERN,
} from "../src/lib/dev-routes";

type RouteNode = { filePath: string; routePath: string };

type GetRouteNodes = (
  config: {
    routesDirectory: string;
    routeFileIgnorePrefix?: string;
    routeFileIgnorePattern?: string;
    disableLogging?: boolean;
    routeToken?: string;
    indexToken?: string;
  },
  root: string,
  tokens: {
    indexTokenSegmentRegex: RegExp;
    routeTokenSegmentRegex: RegExp;
  },
) => Promise<{ routeNodes: RouteNode[] }>;

const tokens = {
  indexTokenSegmentRegex: /^index$/,
  routeTokenSegmentRegex: /^\$$/,
};

function loadGetRouteNodes(): GetRouteNodes {
  const fromStart = createRequire(
    resolve("node_modules/@tanstack/react-start/package.json"),
  );
  const plugin = fromStart.resolve("@tanstack/start-plugin-core/package.json");
  const fromPlugin = createRequire(plugin);
  const generator = fromPlugin("@tanstack/router-generator") as {
    physicalGetRouteNodes: GetRouteNodes;
  };
  return generator.physicalGetRouteNodes;
}

async function routeFiles(pattern: string | undefined): Promise<string[]> {
  const getRouteNodes = loadGetRouteNodes();
  const result = await getRouteNodes(
    {
      routesDirectory: resolve("src/routes"),
      routeFileIgnorePrefix: "-",
      routeFileIgnorePattern: pattern,
      disableLogging: true,
      routeToken: "$",
      indexToken: "index",
    },
    resolve("."),
    tokens,
  );
  return result.routeNodes.map((node) => node.filePath);
}

describe("styleguide route", () => {
  it("is generated in dev and omitted from the production route tree", async () => {
    const dev = await routeFiles(routeFileIgnorePattern("development"));
    const prod = await routeFiles(routeFileIgnorePattern("production"));
    expect(dev.some((file) => file.endsWith("styleguide.tsx"))).toBe(true);
    expect(prod.some((file) => file.includes("styleguide"))).toBe(false);
    expect(routeFileIgnorePattern("production")).toBe(
      STYLEGUIDE_IGNORE_PATTERN,
    );
    expect(readFileSync("vite.config.ts", "utf8")).toContain(
      "routeFileIgnorePattern(mode)",
    );
  });
});
