import { describe, expect, it } from "vitest";
import {
  assertInsideWorkspace,
  createEpisodePathResolver,
  ensurePortableRelativePath,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  normalizeSha256Fingerprint,
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeDirFromSceneOutputPath,
  resolveEpisodeCharacterRegistryPath,
  resolveEpisodeDerivedShotClipPath,
  resolveEpisodeDerivedShotManifestPath,
  resolveEpisodeDerivedShotsDir,
  resolveEpisodeFocalMetadataPath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImageManifestPathFromSceneOutputPath,
  resolveEpisodeImagePromptPath,
  resolveEpisodeShotPlanPath,
  resolveEpisodeShotValidationPath,
  resolveEpisodeVisualRetentionDir,
  resolveEpisodeVisualSourceScenesPath,
  resolveEpisodeImageVisualPlanPath,
  resolveSceneImageCandidatePaths,
} from "./episode-filesystem.js";

describe("episode filesystem helpers", () => {
  it("normalizes episode ids, locales, and variants", () => {
    expect(normalizeEpisodeId(" 009-mary-gloria ")).toBe("009-mary-gloria");
    expect(normalizeLocaleCode("DE")).toBe("de");
    expect(normalizeLocaleCode("es")).toBe("es");
    expect(normalizeLocaleCode("es-419")).toBe("es");
    expect(normalizeContentVariant("SHORT")).toBe("short");
  });

  it("rejects legacy sp locale tokens with an actionable error", () => {
    expect(() => normalizeLocaleCode("sp")).toThrow('Use "es" for Spanish.');
    expect(() => normalizeLocaleCode("sp-SP")).toThrow('Use "es" for Spanish.');
  });

  it("rejects unsafe portable paths", () => {
    expect(() => ensurePortableRelativePath("../escape.json")).toThrow();
    expect(() => ensurePortableRelativePath("/abs/path")).toThrow();
  });

  it("resolves canonical episode and locale paths", () => {
    const resolver = createEpisodePathResolver("/workspace");
    const episodeId = normalizeEpisodeId("009-mary-gloria-the-christmas-doll");
    const locale = normalizeLocaleCode("fr");
    const variant = normalizeContentVariant("full");

    expect(resolver.manifestPath(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/manifest.json"
    );
    expect(
      resolver.narrationScript({ episodeId, locale, variant })
    ).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/locales/fr/full/script.md"
    );
    expect(resolver.canonicalScenesPath(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/canonical/scenes.json"
    );
    expect(resolver.sharedGeneratedImagesDir(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/images/generated"
    );
    expect(resolver.sharedCharactersPath(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/characters.json"
    );
    expect(resolver.imageManifest(episodeId, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/manifests/scene-001.json"
    );
    expect(resolver.imagePrompt(episodeId, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/prompts/scene-001.txt"
    );
    expect(resolver.imageVisualPlan(episodeId, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/visual-plans/scene-001.json"
    );
    expect(resolver.generatedImage(episodeId, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/images/generated/scene-001.png"
    );
    expect(resolver.legacyGeneratedImagesDir(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/images"
    );
    expect(resolver.visualRetentionDir(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention"
    );
    expect(resolver.visualSourceScenes(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/source-scenes.json"
    );
    expect(resolver.focalMetadata(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/focal-metadata.json"
    );
    expect(resolver.shotPlan({ episodeId, locale, variant })).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/shot-plan.full.fr.json"
    );
    expect(resolver.shotValidation({ episodeId, locale, variant })).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/validation.full.fr.json"
    );
    expect(resolver.shotStoryboard({ episodeId, locale, variant })).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/storyboard.full.fr.html"
    );
    expect(resolver.shotContactSheet({ episodeId, locale, variant })).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/contact-sheet.full.fr.png"
    );
    expect(resolver.derivedShotsDir(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/render/derived-shots"
    );
  });

  it("resolves episode image artifact helper paths", () => {
    const episodeDir = "/workspace/009-mary-gloria-the-christmas-doll";
    expect(resolveEpisodeCharacterRegistryPath(episodeDir)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/characters.json"
    );
    expect(resolveEpisodeCharacterReferencePath(episodeDir, "daniel-mercer")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/images/character-references/daniel-mercer.png"
    );
    expect(resolveEpisodeImageManifestPath(episodeDir, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/manifests/scene-001.json"
    );
    expect(resolveEpisodeImagePromptPath(episodeDir, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/prompts/scene-001.txt"
    );
    expect(resolveEpisodeImageVisualPlanPath(episodeDir, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/visual-plans/scene-001.json"
    );
    expect(resolveEpisodeVisualRetentionDir(episodeDir)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention"
    );
    expect(resolveEpisodeVisualSourceScenesPath(episodeDir)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/source-scenes.json"
    );
    expect(resolveEpisodeFocalMetadataPath(episodeDir)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/focal-metadata.json"
    );
    expect(resolveEpisodeDerivedShotsDir(episodeDir)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/render/derived-shots"
    );
  });

  it("builds stable visual-retention paths across locales and variants", () => {
    const resolver = createEpisodePathResolver("/workspace");
    const episodeId = normalizeEpisodeId("009-mary-gloria-the-christmas-doll");
    const fullEn = {
      episodeId,
      locale: normalizeLocaleCode("en"),
      variant: normalizeContentVariant("full"),
    };
    const shortDe = {
      episodeId,
      locale: normalizeLocaleCode("de"),
      variant: normalizeContentVariant("short"),
    };

    expect(resolver.visualSourceScenes(episodeId)).toBe(
      resolver.visualSourceScenes(episodeId)
    );
    expect(resolver.focalMetadata(episodeId)).toBe(
      resolver.focalMetadata(episodeId)
    );
    expect(resolver.shotPlan(fullEn)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/shot-plan.full.en.json"
    );
    expect(resolver.shotPlan(shortDe)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/shot-plan.short.de.json"
    );
    expect(resolver.shotPlan(fullEn)).not.toBe(resolver.shotPlan(shortDe));
    expect(
      resolver.shotPlan({
        ...fullEn,
        locale: normalizeLocaleCode("fr"),
      })
    ).not.toBe(resolver.shotPlan(fullEn));
    expect(
      resolver.shotPlan({
        ...fullEn,
        variant: normalizeContentVariant("short"),
      })
    ).not.toBe(resolver.shotPlan(fullEn));
    expect(resolver.shotValidation(shortDe)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/visual-retention/validation.short.de.json"
    );
    expect(resolver.shotStoryboard(fullEn).endsWith(".html")).toBe(true);
    expect(resolver.shotContactSheet(shortDe).endsWith(".png")).toBe(true);
  });

  it("builds derived-shot clip and manifest paths from a shared fingerprint basename", () => {
    const resolver = createEpisodePathResolver("/workspace");
    const episodeId = normalizeEpisodeId("009-mary-gloria-the-christmas-doll");
    const fingerprint =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    expect(normalizeSha256Fingerprint(fingerprint.toUpperCase())).toBe(fingerprint);
    expect(resolver.derivedShotClip(episodeId, fingerprint)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/render/derived-shots/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.mp4"
    );
    expect(resolver.derivedShotManifest(episodeId, fingerprint)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/render/derived-shots/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.json"
    );
    expect(
      resolver.derivedShotClip(episodeId, fingerprint.toUpperCase())
    ).toBe(resolver.derivedShotClip(episodeId, fingerprint));
  });

  it("rejects unsafe locale, variant, and fingerprint inputs before path construction", () => {
    const episodeDir = "/workspace/009-mary-gloria-the-christmas-doll";

    expect(() => resolveEpisodeDerivedShotClipPath(episodeDir, "abc/def")).toThrow(
      "Invalid sha256 fingerprint"
    );
    expect(() => resolveEpisodeDerivedShotClipPath(episodeDir, "abc\\def")).toThrow(
      "Invalid sha256 fingerprint"
    );
    expect(() => resolveEpisodeDerivedShotClipPath(episodeDir, "../escape")).toThrow(
      "Invalid sha256 fingerprint"
    );
    expect(() => resolveEpisodeDerivedShotClipPath(episodeDir, "")).toThrow(
      "Invalid sha256 fingerprint"
    );
    expect(() => resolveEpisodeDerivedShotManifestPath(episodeDir, "not-a-hash")).toThrow(
      "Invalid sha256 fingerprint"
    );

    expect(() =>
      // @ts-expect-error runtime validation guards malformed locale inputs
      resolveEpisodeShotPlanPath({ episodeDir, locale: "../escape", variant: "full" })
    ).toThrow("Invalid locale code");
    expect(() =>
      // @ts-expect-error runtime validation guards malformed variant inputs
      resolveEpisodeShotValidationPath({ episodeDir, locale: "en", variant: "../escape" })
    ).toThrow("Invalid content variant");
  });

  it("keeps new artifact paths inside the episode workspace", () => {
    const resolver = createEpisodePathResolver("/workspace");
    const episodeId = normalizeEpisodeId("009-mary-gloria-the-christmas-doll");
    const fullEn = {
      episodeId,
      locale: normalizeLocaleCode("en"),
      variant: normalizeContentVariant("full"),
    };
    const fingerprint =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    const episodeRoot = resolver.episodeRoot(episodeId);
    const paths = [
      resolver.visualRetentionDir(episodeId),
      resolver.visualSourceScenes(episodeId),
      resolver.focalMetadata(episodeId),
      resolver.shotPlan(fullEn),
      resolver.shotValidation(fullEn),
      resolver.shotStoryboard(fullEn),
      resolver.shotContactSheet(fullEn),
      resolver.derivedShotsDir(episodeId),
      resolver.derivedShotClip(episodeId, fingerprint),
      resolver.derivedShotManifest(episodeId, fingerprint),
    ];

    for (const artifactPath of paths) {
      expect(assertInsideWorkspace(episodeRoot, artifactPath)).toBe(artifactPath);
    }
  });

  it("prefers canonical shared images but exposes legacy fallback paths", () => {
    expect(
      resolveSceneImageCandidatePaths({
        episodeDir: "/workspace/009-mary-gloria-the-christmas-doll",
        sceneId: "scene-001",
        expectedFilename: "scene-001__000000-000004__16x9.png",
      })
    ).toEqual({
      canonical:
        "/workspace/009-mary-gloria-the-christmas-doll/shared/images/generated/scene-001__000000-000004__16x9.png",
      legacyExpected:
        "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/images/scene-001__000000-000004__16x9.png",
      legacySceneId:
        "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/images/scene-001.png",
    });
  });

  it("resolves an episode directory and manifest path from canonical and legacy scene output paths", () => {
    const canonicalOutput =
      "/workspace/009-mary-gloria-the-christmas-doll/shared/images/generated/scene-001__000000-000004__16x9.png";
    const legacyOutput =
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/images/scene-001.png";

    expect(resolveEpisodeDirFromSceneOutputPath(canonicalOutput)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll"
    );
    expect(resolveEpisodeDirFromSceneOutputPath(legacyOutput)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll"
    );
    expect(
      resolveEpisodeImageManifestPathFromSceneOutputPath({
        outputPath: canonicalOutput,
        sceneId: "scene-001",
      })
    ).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/manifests/scene-001.json"
    );
    expect(
      resolveEpisodeImageManifestPathFromSceneOutputPath({
        outputPath: legacyOutput,
        sceneId: "scene-001",
      })
    ).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/manifests/scene-001.json"
    );
  });
});
