import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mediaforge/domain/visual-retention/treatment-catalog.js": path.resolve(
        import.meta.dirname,
        "packages/domain/src/visual-retention/treatment-catalog.ts"
      ),
      "@mediaforge/domain": path.resolve(
        import.meta.dirname,
        "packages/domain/src/index.ts"
      ),
    },
  },
  test: {
    include: [
      "packages/**/src/**/*.unit.test.ts",
      "apps/**/src/**/*.unit.test.ts"
    ],
    environment: "node"
  }
});
