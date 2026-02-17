import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/e2e/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 10_000,
    env: {},
  },
  resolve: {
    alias: {
      "@/": resolve(__dirname, "src/"),
    },
  },
});
