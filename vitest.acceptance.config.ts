import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/history/test/acceptance/**/*.acceptance.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
