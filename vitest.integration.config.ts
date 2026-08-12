import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@mediaforge/narrative-core",
        replacement: path.resolve(
          import.meta.dirname,
          "packages/narrative-core/src/index.ts"
        ),
      },
    ],
  },
  test: {
    include: [
      "packages/**/src/**/*.integration.test.ts",
      "apps/**/src/**/*.integration.test.ts"
    ],
    environment: "node"
  }
});
