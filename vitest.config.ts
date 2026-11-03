import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20_000,
  },
});
