import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuthoredScriptResolverError,
  authoredScriptResolverVersion,
  assertInsideWorkspace,
  buildAuthoredScriptCacheIdentity,
  createEpisodePathResolver,
  ensurePortableRelativePath,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  normalizeSha256Fingerprint,
  resolveCanonicalVisualImageDir,
  resolveCanonicalVisualImagePath,
  resolveCanonicalVisualManifestPath,
  resolveAuthoredScript,
  resolveEpisodeCharacterReferencePath,
  resolveEpisodeDirFromSceneOutputPath,
  resolveEpisodeCharacterRegistryPath,
  resolveEpisodeContainedFilePath,
  resolveEpisodeDerivedShotClipPath,
  resolveEpisodeDerivedShotManifestPath,
  resolveEpisodeDerivedShotsDir,
  resolveEpisodeFocalMetadataPath,
  resolveEpisodeImageBatchErrorPath,
  resolveEpisodeImageBatchInputPath,
  resolveEpisodeImageBatchManifestFilePath,
  resolveEpisodeImageBatchReportPath,
  resolveEpisodeImageBatchResultPath,
  resolveEpisodeImageManifestPath,
  resolveEpisodeImageManifestPathFromSceneOutputPath,
  resolveEpisodeImagePromptPath,
  resolveEpisodeSharedShortGeneratedImagePath,
  resolveShortSceneImageCandidatePaths,
  resolveEpisodeShortsImageManifestPath,
  resolveEpisodeShotPlanPath,
  resolveEpisodeShotValidationPath,
  resolveEpisodeVisualRetentionDir,
  resolveEpisodeVisualSourceScenesPath,
  resolveEpisodeImageVisualPlanPath,
  resolveLocalizedAlignmentPath,
  resolveLocalizedAudioPath,
  resolveLocalizedScriptPath,
  resolveLocalizedVisualValidationPath,
  resolveSceneImageCandidatePaths,
  toEpisodeRelativeDisplayPath,
  type AuthoredScriptSourceIdentity,
} from "./episode-filesystem.js";

async function createTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "episode-filesystem-"));
}

async function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content: string
): Promise<string> {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

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
    expect(resolver.sharedShortGeneratedImagesDir(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/short/images/generated"
    );
    expect(resolver.shortsImageManifest(episodeId)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/short/images/shorts-image-manifest.json"
    );
    expect(resolver.shortGeneratedImage(episodeId, "scene-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/short/images/generated/scene-001.png"
    );
    expect(resolver.imageBatchInput(episodeId, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/inputs/batch-imgb-001.jsonl"
    );
    expect(resolver.imageBatchManifestFile(episodeId, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/manifests/batch-imgb-001.manifest.json"
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

  it("resolves variant-isolated canonical visual paths", () => {
    const resolver = createEpisodePathResolver("/workspace");
    const episodeId = normalizeEpisodeId("022-the-whistler-in-the-woods");
    const episodeDir = "/workspace/022-the-whistler-in-the-woods";

    expect(resolveCanonicalVisualManifestPath({ episodeDir, variant: "full" })).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/full/scene-plan.json"
    );
    expect(resolveCanonicalVisualManifestPath({ episodeDir, variant: "short" })).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/short/scene-plan.json"
    );
    expect(resolveCanonicalVisualImageDir({ episodeDir, variant: "full" })).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/full/images"
    );
    expect(resolveCanonicalVisualImageDir({ episodeDir, variant: "short" })).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/short/images"
    );
    expect(resolveCanonicalVisualImagePath({ episodeDir, variant: "short", sceneId: "scene-001" })).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/short/images/scene-001.png"
    );
    expect(resolveCanonicalVisualImagePath({ episodeDir, variant: "full", sceneId: "scene-001" })).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/full/images/scene-001.png"
    );
    expect(resolver.canonicalVisualManifest(episodeId, "full")).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/full/scene-plan.json"
    );
    expect(resolver.canonicalVisualImage(episodeId, "short", "scene-001")).toBe(
      "/workspace/022-the-whistler-in-the-woods/visuals/short/images/scene-001.png"
    );
    expect(resolveCanonicalVisualImagePath({ episodeDir, variant: "short", sceneId: "scene-001" })).not.toContain(
      "/visuals/full/"
    );
    expect(resolveCanonicalVisualImagePath({ episodeDir, variant: "full", sceneId: "scene-001" })).not.toContain(
      "/visuals/short/"
    );
  });

  it("resolves localized shared-visual artifacts for every supported language and variant", () => {
    const episodeDir = "/workspace/022-the-whistler-in-the-woods";
    const languages = ["de", "es", "fr", "pt"] as const;

    for (const language of languages) {
      expect(resolveLocalizedScriptPath({ episodeDir, language, variant: "full" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/full/script.md`
      );
      expect(resolveLocalizedAudioPath({ episodeDir, language, variant: "full" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/full/audio.mp3`
      );
      expect(resolveLocalizedAlignmentPath({ episodeDir, language, variant: "full" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/full/alignment.json`
      );
      expect(resolveLocalizedVisualValidationPath({ episodeDir, language, variant: "full" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/full/visual-validation.json`
      );
      expect(resolveLocalizedScriptPath({ episodeDir, language, variant: "short" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/short/script.md`
      );
      expect(resolveLocalizedAudioPath({ episodeDir, language, variant: "short" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/short/audio.mp3`
      );
      expect(resolveLocalizedAlignmentPath({ episodeDir, language, variant: "short" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/short/alignment.json`
      );
      expect(resolveLocalizedVisualValidationPath({ episodeDir, language, variant: "short" })).toBe(
        `/workspace/022-the-whistler-in-the-woods/languages/${language}/short/visual-validation.json`
      );
    }
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
    expect(resolveEpisodeSharedShortGeneratedImagePath({
      episodeDir,
      sceneId: "scene-001",
      expectedFilename: "scene-001__000000-000004__9x16.png",
    })).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/short/images/generated/scene-001__000000-000004__9x16.png"
    );
    expect(resolveEpisodeShortsImageManifestPath(episodeDir)).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/shared/short/images/shorts-image-manifest.json"
    );
    expect(resolveEpisodeImageBatchInputPath(episodeDir, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/inputs/batch-imgb-001.jsonl"
    );
    expect(resolveEpisodeImageBatchResultPath(episodeDir, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/results/batch-imgb-001.output.jsonl"
    );
    expect(resolveEpisodeImageBatchErrorPath(episodeDir, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/errors/batch-imgb-001.errors.jsonl"
    );
    expect(resolveEpisodeImageBatchManifestFilePath(episodeDir, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/manifests/batch-imgb-001.manifest.json"
    );
    expect(resolveEpisodeImageBatchReportPath(episodeDir, "imgb-001")).toBe(
      "/workspace/009-mary-gloria-the-christmas-doll/state/image-generation/.batch/reports/batch-imgb-001.summary.json"
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

  it("keeps multilingual narration scripts on distinct locale roots for episode 022", () => {
    const resolver = createEpisodePathResolver("/workspace");
    const episodeId = normalizeEpisodeId("022-the-whistler-in-the-woods");
    const englishFull = {
      episodeId,
      locale: normalizeLocaleCode("en"),
      variant: normalizeContentVariant("full"),
    };
    const germanFull = {
      episodeId,
      locale: normalizeLocaleCode("de"),
      variant: normalizeContentVariant("full"),
    };
    const germanShort = {
      episodeId,
      locale: normalizeLocaleCode("de"),
      variant: normalizeContentVariant("short"),
    };

    expect(resolver.localeRoot(englishFull)).toBe(
      "/workspace/022-the-whistler-in-the-woods/locales/en"
    );
    expect(resolver.localeVariantRoot(englishFull)).toBe(
      "/workspace/022-the-whistler-in-the-woods/locales/en/full"
    );
    expect(resolver.narrationScript(englishFull)).toBe(
      "/workspace/022-the-whistler-in-the-woods/locales/en/full/script.md"
    );
    expect(resolver.localeVariantRoot(germanFull)).toBe(
      "/workspace/022-the-whistler-in-the-woods/locales/de/full"
    );
    expect(resolver.narrationScript(germanFull)).toBe(
      "/workspace/022-the-whistler-in-the-woods/locales/de/full/script.md"
    );
    expect(resolver.narrationScript(germanShort)).toBe(
      "/workspace/022-the-whistler-in-the-woods/locales/de/short/script.md"
    );
    expect(resolver.narrationScript(englishFull)).not.toBe(
      resolver.narrationScript(germanFull)
    );
    expect(resolver.narrationScript(germanFull)).not.toBe(
      resolver.narrationScript(germanShort)
    );
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

  it("resolves canonical short image candidates alongside compatibility fallbacks", () => {
    expect(
      resolveShortSceneImageCandidatePaths({
        episodeDir: "/workspace/009-mary-gloria-the-christmas-doll",
        sceneId: "scene-001",
        expectedFilename: "scene-001__000000-000004__9x16.png",
      })
    ).toEqual({
      canonical:
        "/workspace/009-mary-gloria-the-christmas-doll/shared/short/images/generated/scene-001__000000-000004__9x16.png",
      legacyExpected:
        "/workspace/009-mary-gloria-the-christmas-doll/images/generated/scene-001__000000-000004__9x16.png",
      legacySceneId:
        "/workspace/009-mary-gloria-the-christmas-doll/images/generated/scene-001.png",
    });
  });

  it("builds episode-relative display paths for canonical assets", () => {
    expect(
      toEpisodeRelativeDisplayPath(
        "/workspace/009-mary-gloria-the-christmas-doll",
        "/workspace/009-mary-gloria-the-christmas-doll/shared/images/generated/scene-001.png"
      )
    ).toBe("shared/images/generated/scene-001.png");
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

  it("resolves canonical authored full and Short scripts with deterministic identities", async () => {
    const workspaceRoot = await createTempWorkspace();
    await writeWorkspaceFile(
      workspaceRoot,
      "episodes/022-the-whistler-in-the-woods/languages/script-en.md",
      "English full script"
    );
    await writeWorkspaceFile(
      workspaceRoot,
      "episodes/022-the-whistler-in-the-woods/languages/short/script-de.md",
      "German short script"
    );

    const full = await resolveAuthoredScript({
      workspaceRoot,
      episode: "022-the-whistler-in-the-woods",
      language: "en",
      variant: "full",
    });
    const short = await resolveAuthoredScript({
      workspaceRoot,
      episode: "022-the-whistler-in-the-woods",
      language: "de",
      variant: "short",
    });

    expect(full.relativePath).toBe(
      "episodes/022-the-whistler-in-the-woods/languages/script-en.md"
    );
    expect(short.relativePath).toBe(
      "episodes/022-the-whistler-in-the-woods/languages/short/script-de.md"
    );
    expect(full.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(full.identity).toEqual({
      resolverVersion: authoredScriptResolverVersion,
      episodeId: "022-the-whistler-in-the-woods",
      language: "en",
      variant: "full",
      relativePath:
        "episodes/022-the-whistler-in-the-woods/languages/script-en.md",
      contentHash: full.contentHash,
    });
    expect(full.cacheIdentity).toBe(
      `${authoredScriptResolverVersion}:022-the-whistler-in-the-woods:en:full:episodes/022-the-whistler-in-the-woods/languages/script-en.md:${full.contentHash}`
    );
    expect(full.logContext).toMatchObject({
      episodeId: "022-the-whistler-in-the-woods",
      language: "en",
      variant: "full",
      relativePath:
        "episodes/022-the-whistler-in-the-woods/languages/script-en.md",
      contentHash: full.contentHash,
      cacheIdentity: full.cacheIdentity,
      resolverVersion: authoredScriptResolverVersion,
    });
    await expect(
      resolveAuthoredScript({
        workspaceRoot,
        episode: "022-the-whistler-in-the-woods",
        language: "de",
        variant: "full",
      })
    ).rejects.toMatchObject({ code: "MISSING_SCRIPT" });
  });

  it("builds deterministic authored script identities and invalidates on every identity field", () => {
    const baseIdentity: AuthoredScriptSourceIdentity = {
      resolverVersion: authoredScriptResolverVersion,
      episodeId: normalizeEpisodeId("022-the-whistler-in-the-woods"),
      language: normalizeLocaleCode("en"),
      variant: normalizeContentVariant("full"),
      relativePath: ensurePortableRelativePath(
        "episodes/022-the-whistler-in-the-woods/languages/script-en.md"
      ),
      contentHash: normalizeSha256Fingerprint("a".repeat(64)),
    };
    const baseCacheIdentity = buildAuthoredScriptCacheIdentity(baseIdentity);

    expect(buildAuthoredScriptCacheIdentity({ ...baseIdentity })).toBe(
      baseCacheIdentity
    );
    expect(baseCacheIdentity.startsWith("authored-script-resolver-v2:")).toBe(
      true
    );
    expect(baseCacheIdentity).not.toBe(
      `authored-script-resolver-v1:022-the-whistler-in-the-woods:en:full:${baseIdentity.contentHash}`
    );

    const mutations: readonly AuthoredScriptSourceIdentity[] = [
      {
        ...baseIdentity,
        resolverVersion: "authored-script-resolver-v3",
      },
      {
        ...baseIdentity,
        episodeId: normalizeEpisodeId("023-the-other-episode"),
        relativePath: ensurePortableRelativePath(
          "episodes/023-the-other-episode/languages/script-en.md"
        ),
      },
      {
        ...baseIdentity,
        language: normalizeLocaleCode("de"),
        relativePath: ensurePortableRelativePath(
          "episodes/022-the-whistler-in-the-woods/languages/script-de.md"
        ),
      },
      {
        ...baseIdentity,
        variant: normalizeContentVariant("short"),
        relativePath: ensurePortableRelativePath(
          "episodes/022-the-whistler-in-the-woods/languages/short/script-en.md"
        ),
      },
      {
        ...baseIdentity,
        relativePath: ensurePortableRelativePath(
          "episodes/022-the-whistler-in-the-woods/languages/short/script-en.md"
        ),
      },
      {
        ...baseIdentity,
        contentHash: normalizeSha256Fingerprint("b".repeat(64)),
      },
    ];

    for (const mutation of mutations) {
      expect(buildAuthoredScriptCacheIdentity(mutation)).not.toBe(
        baseCacheIdentity
      );
    }
  });

  it("rejects invalid authored script request values without falling back to English", async () => {
    const workspaceRoot = await createTempWorkspace();
    await writeWorkspaceFile(
      workspaceRoot,
      "episodes/022-the-whistler-in-the-woods/languages/script-en.md",
      "English full script"
    );

    await expect(
      resolveAuthoredScript({
        workspaceRoot,
        episode: "../022-the-whistler-in-the-woods",
        language: "en",
        variant: "full",
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      resolveAuthoredScript({
        workspaceRoot,
        episode: "022-the-whistler-in-the-woods",
        language: "sp",
        variant: "full",
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      resolveAuthoredScript({
        workspaceRoot,
        episode: "022-the-whistler-in-the-woods",
        language: "de",
        variant: "feature",
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("rejects directories and symlink escapes for canonical authored scripts", async () => {
    const workspaceRoot = await createTempWorkspace();
    const canonicalDir = path.join(
      workspaceRoot,
      "episodes/022-the-whistler-in-the-woods/languages/script-en.md"
    );
    await fs.mkdir(canonicalDir, { recursive: true });

    await expect(
      resolveAuthoredScript({
        workspaceRoot,
        episode: "022-the-whistler-in-the-woods",
        language: "en",
        variant: "full",
      })
    ).rejects.toMatchObject({ code: "NOT_A_FILE" });

    await fs.rm(canonicalDir, { recursive: true });
    const outsideFile = path.join(await createTempWorkspace(), "script-en.md");
    await fs.writeFile(outsideFile, "outside", "utf8");
    await fs.symlink(outsideFile, canonicalDir);

    await expect(
      resolveAuthoredScript({
        workspaceRoot,
        episode: "022-the-whistler-in-the-woods",
        language: "en",
        variant: "full",
      })
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  it("rejects traversal and symlink escapes for contained episode artifact paths", async () => {
    const episodeDir = await createTempWorkspace();
    await expect(
      resolveEpisodeContainedFilePath({
        episodeDir,
        relativePath: "../escape.txt",
      })
    ).rejects.toThrow(/Invalid portable relative path|Path escapes workspace/u);

    const outsideRoot = await createTempWorkspace();
    const outsideFile = path.join(outsideRoot, "escape.txt");
    await fs.writeFile(outsideFile, "escape", "utf8");
    const symlinkDir = path.join(episodeDir, "shared", "images");
    await fs.mkdir(path.dirname(symlinkDir), { recursive: true });
    await fs.symlink(outsideRoot, symlinkDir);

    await expect(
      resolveEpisodeContainedFilePath({
        episodeDir,
        relativePath: "shared/images/output.png",
      })
    ).rejects.toThrow(/Path escapes workspace via symlink/u);
  });

  it("rejects stale authored script layouts without reading them as fallbacks", async () => {
    const identicalWorkspace = await createTempWorkspace();
    await writeWorkspaceFile(
      identicalWorkspace,
      "episodes/022-the-whistler-in-the-woods/languages/script-en.md",
      "same script"
    );
    await writeWorkspaceFile(
      identicalWorkspace,
      "episodes/022-the-whistler-in-the-woods/en/full/script.md",
      "same script"
    );

    await expect(
      resolveAuthoredScript({
        workspaceRoot: identicalWorkspace,
        episode: "022-the-whistler-in-the-woods",
        language: "en",
        variant: "full",
      })
    ).rejects.toMatchObject({
      code: "STALE_LAYOUT",
      details: {
        candidates: [
          "episodes/022-the-whistler-in-the-woods/en/full/script.md",
        ],
      },
      message: expect.stringContaining(
        "Use episodes/022-the-whistler-in-the-woods/languages/script-en.md"
      ),
    });

    const divergentWorkspace = await createTempWorkspace();
    await writeWorkspaceFile(
      divergentWorkspace,
      "episodes/022-the-whistler-in-the-woods/languages/script-de.md",
      "canonical script"
    );
    await writeWorkspaceFile(
      divergentWorkspace,
      "episodes/022-the-whistler-in-the-woods/de/full/script.md",
      "different script"
    );

    await expect(
      resolveAuthoredScript({
        workspaceRoot: divergentWorkspace,
        episode: "022-the-whistler-in-the-woods",
        language: "de",
        variant: "full",
      })
    ).rejects.toMatchObject({
      code: "STALE_LAYOUT",
      details: {
        canonicalRelativePath:
          "episodes/022-the-whistler-in-the-woods/languages/script-de.md",
        candidates: [
          "episodes/022-the-whistler-in-the-woods/de/full/script.md",
        ],
      },
    });
  });

  it("exposes structured resolver errors for missing authored scripts", async () => {
    const workspaceRoot = await createTempWorkspace();

    try {
      await resolveAuthoredScript({
        workspaceRoot,
        episode: "022-the-whistler-in-the-woods",
        language: "en",
        variant: "full",
      });
      throw new Error("Expected resolver to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoredScriptResolverError);
      expect(error).toMatchObject({
        code: "MISSING_SCRIPT",
        details: {
          canonicalRelativePath:
            "episodes/022-the-whistler-in-the-woods/languages/script-en.md",
        },
      });
    }
  });
});
