import { readFileSync, writeFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";
import { routeFileIgnorePattern } from "./src/lib/dev-routes";

const routeTreePath = new URL("./src/routeTree.gen.ts", import.meta.url);
let devRouteTree: string | undefined;
let productionRouteTree: string | undefined;

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
      router: {
        routeFileIgnorePattern: routeFileIgnorePattern(mode),
      },
    }),
    viteReact(),
    tailwindcss(),
    nitro({ traceDeps: ["pdfkit"] }),
    restoreDevRouteTree(mode),
    mode === "production" ? omitStyleguideFromServerRoutes() : false,
  ],
}));

function omitStyleguideFromServerRoutes(): Plugin {
  return {
    name: "omit-styleguide-from-server-routes",
    apply: "build" as const,
    buildStart() {
      captureProductionRouteTree();
    },
    load(id: string) {
      if (this.environment.name === "client") return null;
      if (!id.includes("routeTree.gen.ts")) return null;
      captureProductionRouteTree();
      if (!productionRouteTree) {
        throw new Error("Production route tree still includes /dev/styleguide");
      }
      return productionRouteTree;
    },
  };
}

function captureProductionRouteTree() {
  const text = readFileSync(routeTreePath, "utf8");
  if (!text.includes("styleguide")) productionRouteTree = text;
}

// Production generation omits /dev/styleguide from src/routeTree.gen.ts while
// later environments are still bundling. Put the dev tree back on exit so
// typecheck still knows the route.
function restoreDevRouteTree(mode: string): false {
  if (mode !== "production" || devRouteTree !== undefined) return false;
  devRouteTree = readFileSync(routeTreePath, "utf8");
  process.once("exit", () => {
    if (devRouteTree !== undefined) writeFileSync(routeTreePath, devRouteTree);
  });
  return false;
}
