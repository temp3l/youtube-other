import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNarrationArtifactPaths,
  NARRATION_ARTIFACT_SCHEMA_VERSION,
} from "@mediaforge/speech";
import { hashText } from "@mediaforge/shared";
import {
  validateEpisodeCrossManifestIntegrity,
  type CrossManifestValidationResult,
} from "./episode-cross-manifest-validator.js";

const createdAt = "2026-07-03T00:00:00.000Z";
const hashA = hashText("a");
const hashB = hashText("b");

type FixtureLanguage = "en" | "de";
type FixtureVariant = "full" | "short";

interface Fixture {
  readonly episodeDir: string;
  readonly episodeSlug: string;
  readonly language: FixtureLanguage;
  readonly variant: FixtureVariant;
  readonly generationManifestPath: string;
  readonly expectedSource: {
    readonly episodeId: string;
    readonly language: FixtureLanguage;
    readonly variant: FixtureVariant;
    readonly relativePath: string;
    readonly contentHash: string;
    readonly resolverVersion: string;
    readonly cacheIdentity: string;
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function mutateJson(filePath: string, mutate: (value: Record<string, unknown>) => void): Promise<void> {
  const value = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  mutate(value);
  await writeJson(filePath, value);
}

function codes(results: readonly CrossManifestValidationResult[]): Set<string> {
  return new Set(results.map((result) => result.validationCode));
}

function scenePlan(episodeSlug: string) {
  return {
    sourceId: episodeSlug,
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "The forest answered once.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 3,
        timing: { startSeconds: 0, endSeconds: 3 },
        visualPurpose: "hook",
        textRequirement: { required: false },
        subject: "forest",
        action: "answers",
        setting: "trees",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "dark forest",
        expectedImageFilenames: ["scene-001.png"],
        qualityStatus: "draft",
      },
    ],
  };
}

function visualPlan(episodeSlug: string, language: FixtureLanguage, variant: FixtureVariant, sceneId = "scene-001") {
  return {
    episodeId: episodeSlug,
    language,
    artifactType: variant,
    generatedAt: createdAt,
    scenes: [
      {
        sceneId,
        sequenceNumber: 1,
        startSeconds: 0,
        endSeconds: 3,
        narration: "The forest answered once.",
        visualPurpose: "hook",
        aspectRatios: ["16:9"],
        expectedImageFilenames: ["scene-001.png"],
      },
    ],
  };
}

function sourceFor(episodeSlug: string, language: FixtureLanguage, variant: FixtureVariant): Fixture["expectedSource"] {
  const relativePath =
    variant === "short"
      ? `episodes/${episodeSlug}/languages/short/script-${language}.md`
      : `episodes/${episodeSlug}/languages/script-${language}.md`;
  return {
    episodeId: episodeSlug,
    language,
    variant,
    relativePath,
    contentHash: hashA,
    resolverVersion: "authored-script-resolver-v2",
    cacheIdentity: `authored-script-resolver-v2:${episodeSlug}:${language}:${variant}:${relativePath}:${hashA}`,
  };
}

function youtubeMetadata(language: FixtureLanguage, sceneCount = 1) {
  return {
    schemaVersion: "1.0",
    source: {
      sourceId: "001",
      sceneCount,
      durationSeconds: 3,
      language,
    },
    seo: {
      primaryKeyword: "forest",
      secondaryKeywords: ["woods"],
      viewerSearchIntent: "scary story",
    },
    title: {
      recommended: "The Forest Answered",
      alternatives: ["Forest Answer", "Dark Forest", "Woods Reply", "Night Woods", "Tree Line"],
    },
    description: "A short horror story in the woods.",
    chapters: {
      text: "00:00 Opening\n00:01 Forest\n00:02 Answer",
      characterCount: 33,
      items: [
        { timestamp: "00:00", startSeconds: 0, title: "Opening" },
        { timestamp: "00:01", startSeconds: 1, title: "Forest" },
        { timestamp: "00:02", startSeconds: 2, title: "Answer" },
      ],
    },
    tags: {
      text: "forest, horror",
      characterCount: 14,
      items: ["forest", "horror"],
    },
    hashtags: ["#forest"],
    thumbnail: {
      recommendedText: "It Answered",
      alternativeTexts: ["The Woods", "A Reply", "In The Trees", "After Dark"],
      imagePrompt: "dark forest",
    },
    uploadSettings: {
      filename: "forest.mp4",
      category: "Entertainment",
      videoLanguage: language,
      captionLanguage: language,
      madeForKids: false,
      licence: "standard",
      playlists: ["Horror"],
      comments: "enabled",
      automaticChapters: true,
    },
    pinnedComment: "What did you hear?",
    socialTeaser: "The woods answered.",
    contentSummary: "A forest answers once.",
    corrections: [],
    verificationWarnings: [],
  };
}

function renderManifest(episodeSlug: string, language: FixtureLanguage, variant: FixtureVariant, cleanPath: string) {
  return {
    stageIdentity: {
      episodeId: episodeSlug,
      language,
      locale: language,
      variant,
      owner: "render",
    },
    renderFingerprint: hashText(`render-${language}-${variant}`),
    renderProfile: {
      id: variant,
      label: variant,
      width: variant === "short" ? 1080 : 1920,
      height: variant === "short" ? 1920 : 1080,
      fps: 30,
      aspectRatio: variant === "short" ? "9:16" : "16:9",
    },
    cleanPath,
    validation: {
      valid: true,
      width: variant === "short" ? 1080 : 1920,
      height: variant === "short" ? 1920 : 1080,
      durationSeconds: 3,
      videoCodec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      issues: [],
    },
    status: "generated",
    generatedAt: createdAt,
  };
}

async function createFixture(language: FixtureLanguage, variant: FixtureVariant): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cross-manifest-"));
  const episodeSlug = "001-cross-manifest-fixture";
  const episodeDir = path.join(root, "episodes", episodeSlug);
  const artifactDir = path.join(episodeDir, language, variant);
  const expectedSource = sourceFor(episodeSlug, language, variant);
  const generationManifestPath = path.join(artifactDir, "generation-manifest.json");
  const imagePath = path.join(episodeDir, "shared", "images", "scene-001.png");
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, "image", "utf8");
  await writeJson(path.join(artifactDir, "scenes.json"), scenePlan(episodeSlug));
  await writeJson(path.join(artifactDir, "visual-plan.json"), visualPlan(episodeSlug, language, variant));
  await writeJson(path.join(episodeDir, "shared", variant === "short" ? "shorts-image-manifest.json" : "image-manifest.json"), [
    {
      sceneId: "scene-001",
      sourcePath: "shared/images/scene-001.png",
      width: 1920,
      height: 1080,
      mimeType: "image/png",
      checksumSha256: hashText(`image-${language}-${variant}`),
      validated: true,
    },
  ]);
  const narrationPaths = createNarrationArtifactPaths({
    episodeId: episodeSlug,
    locale: language,
    variant,
    episodeRoot: episodeDir,
  });
  await writeJson(narrationPaths.chunkManifest, {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: episodeSlug,
    locale: language,
    variant,
    sourceSpokenTextHash: hashB,
    segmentationConfig: { mode: "deterministic", version: "test-v1" },
    chunks: [
      {
        chunkId: "narr-chunk-001",
        sequence: 0,
        text: "The forest answered once.",
        textHash: hashText("The forest answered once."),
        role: "hook",
        estimatedWordCount: 4,
        estimatedDurationMs: 1000,
        estimatedDurationSeconds: 1,
        previousContextExcerpt: "",
        nextContextExcerpt: "",
        flowIntent: "concludes",
      },
    ],
    manifestFingerprint: hashText("chunk-manifest"),
    createdAt,
  });
  await writeJson(narrationPaths.performanceDirections, {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    manifestFingerprint: hashText("chunk-manifest"),
    plannerMode: "deterministic",
    plannerVersion: "test-v1",
    fallbackUsage: { used: false },
    directions: [
      {
        chunkId: "narr-chunk-001",
        role: "hook",
        mood: "intimate",
        pace: "measured",
        intensity: 0.4,
        restraint: 0.8,
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        emphasisTargets: [],
        deliveryNote: "Quiet.",
        negativeConstraints: [],
        continuityGuidance: "Continue.",
        flowIntent: "concludes",
      },
    ],
    setFingerprint: hashText("directions"),
    createdAt,
  });
  await writeJson(path.join(artifactDir, "metadata.json"), {
    episode: "001",
    language,
    artifactType: variant,
    format: { aspectRatio: variant === "short" ? "9:16" : "16:9" },
  });
  await writeJson(generationManifestPath, {
    schemaVersion: 1,
    episodeId: episodeSlug,
    language,
    artifactType: variant,
    sourceSha256: hashA,
    source: {
      episodeId: expectedSource.episodeId,
      language: expectedSource.language,
      variant: expectedSource.variant,
      canonicalRelativePath: expectedSource.relativePath,
      contentHash: expectedSource.contentHash,
      resolverVersion: expectedSource.resolverVersion,
      cacheIdentity: expectedSource.cacheIdentity,
    },
    generatedAt: createdAt,
  });
  return { episodeDir, episodeSlug, language, variant, generationManifestPath, expectedSource };
}

async function validateFixture(fixture: Fixture): Promise<readonly CrossManifestValidationResult[]> {
  return validateEpisodeCrossManifestIntegrity({
    episodeDir: fixture.episodeDir,
    episodeSlug: fixture.episodeSlug,
    language: fixture.language,
    variant: fixture.variant,
    generationManifestPath: fixture.generationManifestPath,
    expectedSource: fixture.expectedSource,
  });
}

describe("episode cross-manifest validator", () => {
  it("accepts a valid full/en workspace", async () => {
    const fixture = await createFixture("en", "full");
    const results = await validateFixture(fixture);
    expect(results.every((result) => result.state === "valid")).toBe(true);
    expect(codes(results)).toContain("VALID");
  });

  it("accepts a valid short/de workspace", async () => {
    const fixture = await createFixture("de", "short");
    const results = await validateFixture(fixture);
    expect(results.every((result) => result.state === "valid")).toBe(true);
  });

  it("reports missing scene references", async () => {
    const fixture = await createFixture("en", "full");
    await writeJson(path.join(fixture.episodeDir, "en", "full", "visual-plan.json"), visualPlan(fixture.episodeSlug, "en", "full", "scene-999"));
    expect(codes(await validateFixture(fixture))).toContain("MISSING_SCENE");
  });

  it("reports wrong language and variant", async () => {
    const wrongLanguage = await createFixture("en", "full");
    await mutateJson(wrongLanguage.generationManifestPath, (manifest) => {
      manifest["language"] = "de";
    });
    expect(codes(await validateFixture(wrongLanguage))).toContain("WRONG_LANGUAGE");

    const wrongVariant = await createFixture("de", "short");
    await mutateJson(wrongVariant.generationManifestPath, (manifest) => {
      manifest["artifactType"] = "full";
    });
    expect(codes(await validateFixture(wrongVariant))).toContain("WRONG_VARIANT");
  });

  it("reports stale source identity", async () => {
    const fixture = await createFixture("en", "full");
    await mutateJson(fixture.generationManifestPath, (manifest) => {
      manifest["sourceSha256"] = hashText("stale");
    });
    expect(codes(await validateFixture(fixture))).toContain("STALE_SOURCE_IDENTITY");
  });

  it("reports unsupported schema versions", async () => {
    const fixture = await createFixture("en", "full");
    await mutateJson(fixture.generationManifestPath, (manifest) => {
      manifest["schemaVersion"] = 2;
    });
    expect(codes(await validateFixture(fixture))).toContain("UNSUPPORTED_SCHEMA_VERSION");
  });

  it("reports path escapes", async () => {
    const fixture = await createFixture("en", "full");
    await mutateJson(fixture.generationManifestPath, (manifest) => {
      manifest["imageManifestPath"] = "../outside.json";
    });
    expect(codes(await validateFixture(fixture))).toContain("PATH_ESCAPE");
  });

  it("reports missing image assets", async () => {
    const fixture = await createFixture("en", "full");
    await fs.rm(path.join(fixture.episodeDir, "shared", "images", "scene-001.png"));
    expect(codes(await validateFixture(fixture))).toContain("MISSING_IMAGE_ASSET");
  });

  it("reports unknown narration segments", async () => {
    const fixture = await createFixture("en", "full");
    const narrationPaths = createNarrationArtifactPaths({
      episodeId: fixture.episodeSlug,
      locale: fixture.language,
      variant: fixture.variant,
      episodeRoot: fixture.episodeDir,
    });
    await mutateJson(narrationPaths.performanceDirections, (directions) => {
      const entries = directions["directions"] as Array<Record<string, unknown>>;
      entries[0]!["chunkId"] = "narr-chunk-999";
    });
    expect(codes(await validateFixture(fixture))).toContain("UNKNOWN_NARRATION_SEGMENT");
  });

  it("validates current YouTube metadata schema when present", async () => {
    const fixture = await createFixture("en", "full");
    await writeJson(path.join(fixture.episodeDir, "output", "youtube-metadata.json"), youtubeMetadata("en", 2));
    expect(codes(await validateFixture(fixture))).toContain("ARTIFACT_MISMATCH");
  });

  it("validates render manifests with the rendering package schema", async () => {
    const fixture = await createFixture("de", "short");
    const videoPath = path.join(fixture.episodeDir, "de", "short", "video", "clean.mp4");
    const renderPath = path.join(path.dirname(videoPath), "render.json");
    await fs.mkdir(path.dirname(videoPath), { recursive: true });
    await fs.writeFile(videoPath, "video", "utf8");
    await writeJson(renderPath, renderManifest(fixture.episodeSlug, "en", "short", videoPath));
    await mutateJson(fixture.generationManifestPath, (manifest) => {
      manifest["videoPath"] = videoPath;
      manifest["renderManifestPath"] = renderPath;
    });
    expect(codes(await validateFixture(fixture))).toContain("WRONG_LANGUAGE");
  });
});
