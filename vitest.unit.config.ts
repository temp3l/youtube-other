import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/src/**/*.unit.test.ts",
      "apps/**/src/**/*.unit.test.ts"
    ],
    environment: "node"
  }
});
