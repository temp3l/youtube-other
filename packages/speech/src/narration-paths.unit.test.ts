import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEpisodePathResolver, normalizeContentVariant, normalizeEpisodeId, normalizeLocaleCode } from "@mediaforge/shared";
import { createNarrationArtifactPaths } from "./narration-paths.js";

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

describe("createNarrationArtifactPaths", () => {
  const episodeRoot = path.join("/workspace", "009-mary-gloria-the-christmas-doll");
  const baseContext = {
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "es",
    variant: "full" as const,
    episodeRoot,
  };

  it("is deterministic for identical input and returns a frozen object", () => {
    const first = createNarrationArtifactPaths(baseContext);
    const second = createNarrationArtifactPaths(baseContext);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("resolves full narration artifact paths", () => {
    const paths = createNarrationArtifactPaths(baseContext);

    expect(paths.episodeRoot).toBe(episodeRoot);
    expect(paths.localeRoot).toBe(path.join(episodeRoot, "locales", "es"));
    expect(paths.localeVariantRoot).toBe(path.join(episodeRoot, "locales", "es", "full"));
    expect(paths.narrationRoot).toBe(path.join(episodeRoot, "locales", "es", "full", "audio", "narration"));
    expect(paths.spokenTextMarkdown).toBe(path.join(paths.narrationRoot, "spoken-text.md"));
    expect(paths.spokenTextJson).toBe(path.join(paths.narrationRoot, "spoken-text.json"));
    expect(paths.chunkManifest).toBe(path.join(paths.narrationRoot, "chunk-manifest.json"));
    expect(paths.performanceDirections).toBe(path.join(paths.narrationRoot, "performance-directions.json"));
    expect(paths.pronunciationTransforms).toBe(path.join(paths.narrationRoot, "pronunciation-transforms.json"));
    expect(paths.chunkAudioDir).toBe(path.join(paths.narrationRoot, "chunks"));
    expect(paths.chunkValidationDir).toBe(path.join(paths.narrationRoot, "chunks"));
    expect(paths.assemblyManifest).toBe(path.join(paths.narrationRoot, "assembly-manifest.json"));
    expect(paths.cleanNarration).toBe(path.join(paths.narrationRoot, "clean-narration.wav"));
    expect(paths.masteredNarration).toBe(path.join(paths.narrationRoot, "mastered-narration.wav"));
    expect(paths.qualityGateJson).toBe(path.join(paths.narrationRoot, "quality-gate.json"));
    expect(paths.qualityGateMarkdown).toBe(path.join(paths.narrationRoot, "quality-gate.md"));
    expect(paths.generationMetadata).toBe(path.join(paths.narrationRoot, "generation-metadata.json"));
    expect(paths.configSnapshot).toBe(path.join(paths.narrationRoot, "config-snapshot.json"));
  });

  it("resolves short narration paths", () => {
    const shortPaths = createNarrationArtifactPaths({
      ...baseContext,
      variant: "short",
    });

    expect(shortPaths.localeVariantRoot).toBe(path.join(episodeRoot, "locales", "es", "short"));
    expect(shortPaths.narrationRoot).toBe(path.join(episodeRoot, "locales", "es", "short", "audio", "narration"));
    expect(shortPaths.cleanNarration).toBe(path.join(shortPaths.narrationRoot, "clean-narration.wav"));
    expect(shortPaths.narrationRoot).not.toBe(createNarrationArtifactPaths(baseContext).narrationRoot);
  });

  it("normalizes valid locale input before resolving paths", () => {
    const normalizedPaths = createNarrationArtifactPaths({
      ...baseContext,
      locale: "ES-419",
    });
    const canonicalPaths = createNarrationArtifactPaths(baseContext);

    expect(normalizedPaths.localeRoot).toBe(canonicalPaths.localeRoot);
    expect(normalizedPaths.localeVariantRoot).toBe(canonicalPaths.localeVariantRoot);
    expect(normalizedPaths.compatibilityNarration).toBe(canonicalPaths.compatibilityNarration);
  });

  it("preserves the current compatibility narration output and keeps it separate from the staged root", () => {
    const paths = createNarrationArtifactPaths(baseContext);
    const resolver = createEpisodePathResolver(path.dirname(episodeRoot));
    const normalizedContext = {
      episodeId: normalizeEpisodeId(baseContext.episodeId),
      locale: normalizeLocaleCode(baseContext.locale),
      variant: normalizeContentVariant(baseContext.variant),
    };

    expect(paths.compatibilityNarration).toBe(resolver.audioNarration(normalizedContext));
    expect(paths.compatibilityNarration).toBe(
      path.join(episodeRoot, "locales", "es", "full", "audio", "narration.wav")
    );
    expect(paths.rootCompatibilityNarration).toBe(
      path.join(episodeRoot, "audio", "narration.wav")
    );
    expect(paths.compatibilityNarration).not.toBe(path.join(paths.narrationRoot, "narration.wav"));
    expect(path.dirname(paths.compatibilityNarration)).toBe(path.join(episodeRoot, "locales", "es", "full", "audio"));
  });

  it("keeps every staged path beneath the narration root", () => {
    const paths = createNarrationArtifactPaths(baseContext);
    const stagedPaths = [
      paths.spokenTextMarkdown,
      paths.spokenTextJson,
      paths.chunkManifest,
      paths.performanceDirections,
      paths.pronunciationTransforms,
      paths.chunkAudioDir,
      paths.chunkValidationDir,
      paths.assemblyManifest,
      paths.cleanNarration,
      paths.masteredNarration,
      paths.qualityGateJson,
      paths.qualityGateMarkdown,
      paths.generationMetadata,
      paths.configSnapshot,
    ];

    expect(stagedPaths.every((candidate) => isInsideRoot(paths.narrationRoot, candidate))).toBe(true);
    expect(isInsideRoot(paths.narrationRoot, paths.compatibilityNarration)).toBe(false);
    expect(isInsideRoot(path.join(episodeRoot, "locales", "es", "full", "audio"), paths.compatibilityNarration)).toBe(true);
    expect(isInsideRoot(episodeRoot, paths.rootCompatibilityNarration)).toBe(true);
    expect(isInsideRoot(paths.narrationRoot, paths.rootCompatibilityNarration)).toBe(false);
  });

  it.each([
    { label: "empty episode id", context: { ...baseContext, episodeId: "" } },
    { label: "whitespace episode id", context: { ...baseContext, episodeId: "   " } },
    { label: "unsupported variant", context: { ...baseContext, variant: "feature-length" as never } },
  ])("rejects invalid input", ({ context, label }) => {
    expect(() => createNarrationArtifactPaths(context)).toThrow(
      label === "unsupported variant"
        ? /Invalid narration artifact variant/
        : /Invalid narration artifact episodeId/
    );
  });

  it.each([
    "../episode",
    "../../tmp",
    "/absolute/path",
    "en/../../tmp",
    "de\\..\\tmp",
    ".",
    "..",
  ])("rejects traversal attempts in episodeId: %s", (episodeId) => {
    expect(() =>
      createNarrationArtifactPaths({
        ...baseContext,
        episodeId,
      })
    ).toThrow(/Invalid narration artifact episodeId/);
  });

  it.each([
    "../episode",
    "../../tmp",
    "/absolute/path",
    "en/../../tmp",
    "de\\..\\tmp",
    ".",
    "..",
  ])("rejects traversal attempts in locale: %s", (locale) => {
    expect(() =>
      createNarrationArtifactPaths({
        ...baseContext,
        locale,
      })
    ).toThrow(/Invalid narration artifact locale/);
  });

  it.each([
    "/absolute/variant",
    "../variant",
    "full/../short",
  ])("rejects invalid variant fragments: %s", (variant) => {
    expect(() =>
      createNarrationArtifactPaths({
        ...baseContext,
        variant: variant as never,
      })
    ).toThrow(/Invalid narration artifact variant/);
  });

  it("rejects missing episode roots", () => {
    expect(() =>
      createNarrationArtifactPaths({
        episodeId: baseContext.episodeId,
        locale: baseContext.locale,
        variant: baseContext.variant,
      } as never)
    ).toThrow(/require episodeRoot/);
  });
});
