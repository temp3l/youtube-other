import { describe, expect, it } from "vitest";
import {
  createEpisodePathResolver,
  ensurePortableRelativePath,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeDirFromSceneOutputPath,
  resolveEpisodeCharacterRegistryPath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImageManifestPathFromSceneOutputPath,
  resolveEpisodeImagePromptPath,
  resolveEpisodeImageVisualPlanPath,
  resolveSceneImageCandidatePaths,
} from "./episode-filesystem.js";

describe("episode filesystem helpers", () => {
  it("normalizes episode ids, locales, and variants", () => {
    expect(normalizeEpisodeId(" 009-mary-gloria ")).toBe("009-mary-gloria");
    expect(normalizeLocaleCode("DE")).toBe("de");
    expect(normalizeContentVariant("SHORT")).toBe("short");
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
