import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mediaforge/domain": path.resolve(
        import.meta.dirname,
        "packages/domain/src/index.ts"
      ),
      "@mediaforge/shared": path.resolve(
        import.meta.dirname,
        "packages/shared/src/index.ts"
      ),
      "@mediaforge/narrative-core": path.resolve(
        import.meta.dirname,
        "packages/narrative-core/src/index.ts"
      ),
      "@mediaforge/persistence": path.resolve(
        import.meta.dirname,
        "packages/persistence/src/index.ts"
      ),
      "@mediaforge/speech/locale-tts-segmentation.js": path.resolve(
        import.meta.dirname,
        "packages/speech/src/locale-tts-segmentation.ts"
      ),
      "@mediaforge/speech": path.resolve(
        import.meta.dirname,
        "packages/speech/src/index.ts"
      ),
      "@mediaforge/alignment/locale-tts-alignment.js": path.resolve(
        import.meta.dirname,
        "packages/alignment/src/locale-tts-alignment.ts"
      ),
      "@mediaforge/alignment": path.resolve(
        import.meta.dirname,
        "packages/alignment/src/index.ts"
      ),
      "@mediaforge/microdrama": path.resolve(
        import.meta.dirname,
        "packages/microdrama/src/index.ts"
      ),
      "@mediaforge/observability/log-redaction.js": path.resolve(
        import.meta.dirname,
        "packages/observability/src/log-redaction.ts"
      ),
      "@mediaforge/observability/telemetry.js": path.resolve(
        import.meta.dirname,
        "packages/observability/src/telemetry.ts"
      ),
      "@mediaforge/observability": path.resolve(
        import.meta.dirname,
        "packages/observability/src/index.ts"
      ),
      "@mediaforge/scene-planning": path.resolve(
        import.meta.dirname,
        "packages/scene-planning/src/index.ts"
      ),
      "@mediaforge/visual-planning": path.resolve(
        import.meta.dirname,
        "packages/visual-planning/src/index.ts"
      ),
      "@mediaforge/image-generation": path.resolve(
        import.meta.dirname,
        "packages/image-generation/src/index.ts"
      ),
    },
  },
  test: {
    include: [
      "packages/**/src/**/*.integration.test.ts",
      "apps/**/src/**/*.integration.test.ts"
    ],
    environment: "node"
  }
});
