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
      "@mediaforge/narrative-core": path.resolve(
        import.meta.dirname,
        "packages/narrative-core/src/index.ts"
      ),
      "@mediaforge/microdrama": path.resolve(
        import.meta.dirname,
        "packages/microdrama/src/index.ts"
      ),
      "@mediaforge/scene-planning": path.resolve(
        import.meta.dirname,
        "packages/scene-planning/src/index.ts"
      ),
      "@mediaforge/visual-planning": path.resolve(
        import.meta.dirname,
        "packages/visual-planning/src/index.ts"
      ),
      "@mediaforge/persistence": path.resolve(
        import.meta.dirname,
        "packages/persistence/src/index.ts"
      ),
      "@mediaforge/image-generation": path.resolve(
        import.meta.dirname,
        "packages/image-generation/src/index.ts"
      ),
      "@mediaforge/speech": path.resolve(
        import.meta.dirname,
        "packages/speech/src/index.ts"
      ),
      "@mediaforge/observability/log-redaction.js": path.resolve(
        import.meta.dirname,
        "packages/observability/src/log-redaction.ts"
      ),
      "@mediaforge/observability": path.resolve(
        import.meta.dirname,
        "packages/observability/src/index.ts"
      ),
      "@mediaforge/shared": path.resolve(
        import.meta.dirname,
        "packages/shared/src/index.ts"
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
