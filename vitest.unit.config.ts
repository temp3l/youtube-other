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
      "@mediaforge/image-generation/microdrama-visual-generation": path.resolve(
        import.meta.dirname,
        "packages/image-generation/src/microdrama-visual-generation/index.ts"
      ),
      "@mediaforge/application": path.resolve(
        import.meta.dirname,
        "packages/application/src/index.ts"
      ),
      "@mediaforge/tiktok-publishing": path.resolve(
        import.meta.dirname,
        "packages/tiktok-publishing/src/index.ts"
      ),
      "@mediaforge/image-generation": path.resolve(
        import.meta.dirname,
        "packages/image-generation/src/index.ts"
      ),
      "@mediaforge/speech/locale-tts-segmentation.js": path.resolve(
        import.meta.dirname,
        "packages/speech/src/locale-tts-segmentation.ts"
      ),
      "@mediaforge/speech": path.resolve(
        import.meta.dirname,
        "packages/speech/src/index.ts"
      ),
      "@mediaforge/video-generation": path.resolve(
        import.meta.dirname,
        "packages/video-generation/src/index.ts"
      ),
      "@mediaforge/alignment/locale-tts-alignment.js": path.resolve(
        import.meta.dirname,
        "packages/alignment/src/locale-tts-alignment.ts"
      ),
      "@mediaforge/alignment": path.resolve(
        import.meta.dirname,
        "packages/alignment/src/index.ts"
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
      "@mediaforge/workflow-engine": path.resolve(
        import.meta.dirname,
        "packages/workflow-engine/src/index.ts"
      ),
      "@mediaforge/metadata/delivery-bundle": path.resolve(
        import.meta.dirname,
        "packages/metadata/src/delivery-bundle.ts"
      ),
      "@mediaforge/metadata/microdrama-youtube-locale-metadata": path.resolve(
        import.meta.dirname,
        "packages/metadata/src/microdrama-youtube-locale-metadata.ts"
      ),
      "@mediaforge/metadata/tiktok-locale-metadata.js": path.resolve(
        import.meta.dirname,
        "packages/metadata/src/tiktok-locale-metadata.ts"
      ),
      "@mediaforge/metadata": path.resolve(
        import.meta.dirname,
        "packages/metadata/src/index.ts"
      ),
      "@mediaforge/youtube-upload/microdrama-youtube-coexistence": path.resolve(
        import.meta.dirname,
        "packages/youtube-upload/src/microdrama-youtube-coexistence.ts"
      ),
      "@mediaforge/youtube-upload/publication-intent": path.resolve(
        import.meta.dirname,
        "packages/youtube-upload/src/publication-intent.ts"
      ),
      "@mediaforge/youtube-upload": path.resolve(
        import.meta.dirname,
        "packages/youtube-upload/src/index.ts"
      ),
      "@mediaforge/performance": path.resolve(
        import.meta.dirname,
        "packages/performance/src/index.ts"
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
