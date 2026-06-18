import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/src/**/*.e2e.test.ts",
      "apps/**/src/**/*.e2e.test.ts"
    ],
    environment: "node",
    testTimeout: 120000
  }
});
