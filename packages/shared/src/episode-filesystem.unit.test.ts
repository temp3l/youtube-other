import { describe, expect, it } from "vitest";
import {
  createEpisodePathResolver,
  ensurePortableRelativePath,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
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
    expect(resolver.legacyGeneratedImagesDir(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/images"
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
});
