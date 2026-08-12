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
      {
        find: "@mediaforge/persistence",
        replacement: path.resolve(
          import.meta.dirname,
          "packages/persistence/src/index.ts"
        ),
      },
      {
        find: "@mediaforge/microdrama",
        replacement: path.resolve(
          import.meta.dirname,
          "packages/microdrama/src/index.ts"
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
