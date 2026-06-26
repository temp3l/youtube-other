import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildEpisodeLoadResult,
  buildScenePlan,
  createApprovalRecord,
  discoverEpisodeSources,
  generateCanonicalImages,
  generateNarrationAudio,
  generateMockNarrationAudio,
  parseEpisodeSourceFile,
  retimeScenePlan,
  buildSpeechPlan,
} from "./index.js";
import { scenePlanSchema } from "@mediaforge/domain";

const sourceRoot = path.resolve(
  "content-ideas/content/dark-truth-episodes-multilingual-production-pack"
);
const episode001EnglishFull = path.join(
  sourceRoot,
  "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
  "en",
  "001-the-forbidden-village-where-japan-s-laws-do-not-apply-en-full.md"
);
const episode001GermanFull = path.join(
  sourceRoot,
  "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
  "de",
  "001-the-forbidden-village-where-japan-s-laws-do-not-apply-de-full.md"
);
const episode001EnglishShort = path.join(
  sourceRoot,
  "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
  "en",
  "001-the-forbidden-village-where-japan-s-laws-do-not-apply-en-short.md"
);

describe("dark-truth workflow", () => {
  it("discovers episode source files in stable order", async () => {
    const discoveries = await discoverEpisodeSources(sourceRoot);
    const episode001 = discoveries.find(
      (entry) => entry.episodeNumber === "001"
    );
    expect(episode001).toBeTruthy();
    expect(
      episode001?.candidates.filter(
        (candidate) => candidate.status === "present"
      )
    ).toHaveLength(8);
    expect(
      episode001?.candidates.every(
        (candidate) => candidate.status === "present"
      )
    ).toBe(true);
  });

  it("parses the episode 001 English full source", async () => {
    const parsed = await parseEpisodeSourceFile(episode001EnglishFull);
    expect(parsed.language).toBe("en");
    expect(parsed.artifactType).toBe("full");
    expect(parsed.narration).toContain("Kurobane");
    expect(parsed.metadata.primaryTitle).toContain(
      "Forbidden Japanese Village"
    );
    expect(parsed.metadata.format.aspectRatio).toBe("16:9");
    expect(parsed.analysis.generationEligibility).toBe("eligible");
    expect(parsed.productionInstructions.instructions).toContain(
      "dark-documentary tone"
    );
  });

  it("parses the episode 001 German full source", async () => {
    const parsed = await parseEpisodeSourceFile(episode001GermanFull);
    expect(parsed.language).toBe("de");
    expect(parsed.artifactType).toBe("full");
    expect(parsed.narration.length).toBeGreaterThan(0);
    expect(parsed.metadata.primaryTitle).toContain("verbotene");
    expect(parsed.metadata.format.aspectRatio).toBe("16:9");
  });

  it("splits the English short narration into multiple TTS-safe chunks", async () => {
    const parsed = await parseEpisodeSourceFile(episode001EnglishShort);
    const speechPlan = await buildSpeechPlan(parsed);
    expect(speechPlan.segments.length).toBeGreaterThan(1);
    expect(speechPlan.segments.at(-1)?.text).toContain("You let the wrong one leave.");
    expect(speechPlan.segments.every((segment) => segment.wordCount <= 70)).toBe(true);
  });

  it("writes dry-run artifacts with sidecar subtitles only", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-"));
    const outputRoot = path.join(tempDir, "episodes");
    const result = await buildEpisodeLoadResult(
      episode001EnglishFull,
      outputRoot
    );
    expect(await fs.stat(result.paths.analysisJson)).toBeTruthy();
    expect(await fs.stat(result.paths.subtitlesSrt)).toBeTruthy();
    expect(await fs.stat(result.paths.subtitlesVtt)).toBeTruthy();
    expect(result.subtitleManifest.burnedInSubtitles).toBe(false);
    expect(result.subtitleManifest.subtitleVideoFiltersUsed).toBe(false);
    expect(result.subtitleManifest.sidecarFiles).toContain(
      result.paths.subtitlesSrt
    );
    expect(result.analysis.visualSceneTargetPer10Minutes).toBe(100);
    expect(result.analysis.estimatedVisualSceneCount).toBeGreaterThan(0);
  });

  it("copies a source-pack character registry into the generated episode workspace", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-characters-"));
    const sourceRoot = path.join(tempDir, "source");
    const outputRoot = path.join(tempDir, "episodes");
    const episodeSlug = "001-the-forbidden-village-where-japan-s-laws-do-not-apply";
    const sourceEpisodeDir = path.join(sourceRoot, episodeSlug);
    const sourceLanguageDir = path.join(sourceEpisodeDir, "en");
    await fs.mkdir(sourceLanguageDir, { recursive: true });
    const sourceFile = path.join(
      sourceLanguageDir,
      `${episodeSlug}-en-full.md`
    );
    await fs.copyFile(episode001EnglishFull, sourceFile);
    await fs.writeFile(
      path.join(sourceEpisodeDir, "characters.json"),
      JSON.stringify(
        {
          episodeId: episodeSlug,
          updatedAt: "2026-06-25T00:00:00.000Z",
          characters: [
            {
              id: "elena-ward",
              name: "Elena Ward",
              role: "main protagonist",
              physicalDescription: "A tired student with a practical late-night look.",
              ageRange: "20s",
              genderPresentation: "woman",
              face: {
                shape: "oval",
                skinTone: "light",
                eyeColor: "brown",
                eyebrows: "slightly arched",
                nose: "small",
                mouth: "neutral",
                distinguishingFeatures: ["subtle under-eye shadows"],
              },
              hair: {
                color: "dark brown",
                length: "medium",
                style: "slightly messy",
              },
              build: "slim",
              defaultWardrobe: {
                upperBody: "dark hoodie",
                lowerBody: "jeans",
                footwear: "sneakers",
                accessories: [],
                carriedObjects: ["phone"],
                colors: ["dark navy", "grey"],
              },
              continuityTraits: ["same tired expression"],
              referenceStatus: "missing",
            },
          ],
        },
        null,
        2
      )
    );

    await buildEpisodeLoadResult(sourceFile, outputRoot);

    const copiedCharacters = JSON.parse(
      await fs.readFile(
        path.join(outputRoot, episodeSlug, "characters.json"),
        "utf8"
      )
    ) as { characters: Array<{ id: string }> };
    expect(copiedCharacters.characters).toHaveLength(1);
    expect(copiedCharacters.characters[0]?.id).toBe("elena-ward");
  });

  it("creates approval records and preserves the approval state", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "dark-truth-review-")
    );
    const reviewDir = path.join(tempDir, "reviews", "en", "full");
    const approval = await createApprovalRecord(reviewDir, {
      episodeId: "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
      language: "en",
      artifactType: "full",
      artifactPath: path.join(tempDir, "generation-manifest.json"),
      artifactSha256: "a".repeat(64),
      generationManifestSha256: "a".repeat(64),
      sourceSha256: "b".repeat(64),
      reviewer: "steph",
      reviewedAt: new Date().toISOString(),
      decision: "approved",
    });
    expect(approval.approvalState).toBe("human-approved");
    expect(approval.stale).toBe(false);
    const approvalFile = JSON.parse(
      await fs.readFile(path.join(reviewDir, "approval.json"), "utf8")
    ) as { approvalState?: string };
    expect(approvalFile.approvalState).toBe("human-approved");
  });

  it("keeps narration synthesis local unless paid providers are explicitly enabled", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "dark-truth-paid-tts-")
    );
    const outputRoot = path.join(tempDir, "episodes");
    const result = await buildEpisodeLoadResult(
      episode001EnglishFull,
      outputRoot
    );
    try {
      vi.stubEnv("DARK_TRUTH_ENABLE_PAID_PROVIDERS", "true");
      vi.stubEnv("OPENAI_API_KEY", "");
      await expect(
        generateMockNarrationAudio(
          path.join(
            outputRoot,
            "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
            "en",
            "full"
          ),
          result.speechPlan
        )
      ).rejects.toThrow("OPENAI_API_KEY");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses episode narration generation unless paid providers are explicitly enabled", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "dark-truth-episode-tts-")
    );
    const outputRoot = path.join(tempDir, "episodes");
    const result = await buildEpisodeLoadResult(
      episode001EnglishFull,
      outputRoot
    );
    const episodeDir = path.join(
      outputRoot,
      "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
      "en",
      "full"
    );
    vi.stubEnv("DARK_TRUTH_ENABLE_PAID_PROVIDERS", "false");
    await expect(
      generateNarrationAudio(episodeDir, result.speechPlan)
    ).rejects.toThrow("DARK_TRUTH_ENABLE_PAID_PROVIDERS=true");
    vi.unstubAllEnvs();
  });

  it("cleans stale narration segments before regenerating audio", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "dark-truth-stale-segments-")
    );
    const outputRoot = path.join(tempDir, "episodes");
    const result = await buildEpisodeLoadResult(
      episode001EnglishFull,
      outputRoot
    );
    const episodeDir = path.join(
      outputRoot,
      "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
      "en",
      "full"
    );
    const segmentsDir = path.join(episodeDir, "audio", "segments-speech");
    await fs.mkdir(segmentsDir, { recursive: true });
    await fs.writeFile(path.join(segmentsDir, "segment-999.wav"), "stale");
    await fs.writeFile(
      path.join(segmentsDir, "segment-999.wav.tmp"),
      "temp"
    );
    const narrationPath = await generateMockNarrationAudio(
      episodeDir,
      result.speechPlan
    );
    expect((await fs.stat(narrationPath)).size).toBeGreaterThan(0);
    await expect(
      fs.stat(path.join(segmentsDir, "segment-999.wav"))
    ).rejects.toThrow();
    await expect(
      fs.stat(path.join(segmentsDir, "segment-999.wav.tmp"))
    ).rejects.toThrow();
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(episodeDir, "audio", "narration-manifest.json"),
        "utf8"
      )
    ) as { segmentCount: number; speechPlanHash: string };
    expect(manifest.segmentCount).toBe(result.speechPlan.segments.length);
    expect(manifest.speechPlanHash).toHaveLength(64);
  }, 120000);

  it("keeps canonical image generation local unless paid providers are explicitly enabled", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "dark-truth-paid-images-")
    );
    const outputRoot = path.join(tempDir, "episodes");
    const parsed = await parseEpisodeSourceFile(episode001EnglishFull);
    const scenePlan = buildScenePlan(
      parsed.narration,
      parsed.episodeId,
      parsed.artifactType
    );
    try {
      vi.stubEnv("DARK_TRUTH_ENABLE_PAID_PROVIDERS", "true");
      vi.stubEnv("OPENAI_API_KEY", "");
      await expect(
        generateCanonicalImages(
          path.join(
            outputRoot,
            "001-the-forbidden-village-where-japan-s-laws-do-not-apply",
            "shared"
          ),
          scenePlan
        )
      ).rejects.toThrow("OPENAI_API_KEY");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the shared scene density target when building Dark Truth scene plans", () => {
    const narration = Array.from({ length: 180 }, (_, index) => `word${index + 1}`).join(" ");
    vi.stubEnv("VISUAL_SCENE_TARGET_PER_10_MINUTES", "20");
    try {
      const scenePlan = buildScenePlan(narration, "episode-fixture", "full");
      expect(scenePlan.scenes).toHaveLength(2);
      expect(scenePlan.scenes.every((scene) => scene.estimatedDurationSeconds >= 25 && scene.estimatedDurationSeconds <= 35)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("retimes scene plans to the actual narration duration", () => {
    const scenePlan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "First scene.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "introduce the setting",
          textRequirement: { required: false },
          subject: "first scene",
          action: "shown",
          setting: "dark room",
          composition: "centered",
          cameraFraming: "wide shot",
          mood: "tense",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: [],
          aspectRatios: ["16:9"],
          imagePrompt: "first scene",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft",
        },
        {
          id: "scene-002",
          sequenceNumber: 2,
          canonicalNarration: "Second scene.",
          sourceSegmentIds: ["scene-002"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 4, endSeconds: 8 },
          visualPurpose: "close on the reveal",
          textRequirement: { required: false },
          subject: "second scene",
          action: "shown",
          setting: "dark room",
          composition: "centered",
          cameraFraming: "wide shot",
          mood: "tense",
          continuityReferences: ["scene-001"],
          onScreenText: "",
          negativeConstraints: [],
          aspectRatios: ["16:9"],
          imagePrompt: "second scene",
          expectedImageFilenames: ["scene-002__000004-000008__16x9.png"],
          qualityStatus: "draft",
        },
      ],
    });
    const retimed = retimeScenePlan(scenePlan, 10);
    expect(retimed.scenes[0]?.timing).toEqual({
      startSeconds: 0,
      endSeconds: 5,
    });
    expect(retimed.scenes[1]?.timing).toEqual({
      startSeconds: 5,
      endSeconds: 10,
    });
    expect(retimed.scenes[0]?.expectedImageFilenames[0]).toBe(
      "scene-001__000000-000005__16x9.png"
    );
    expect(retimed.scenes[1]?.expectedImageFilenames[0]).toBe(
      "scene-002__000005-000010__16x9.png"
    );
    expect(retimed.scenes[0]?.actualAudioDurationSeconds).toBe(5);
    expect(retimed.scenes[1]?.actualAudioDurationSeconds).toBe(5);
  });
});
