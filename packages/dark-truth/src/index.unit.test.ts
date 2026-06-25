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
  generateMockNarrationAudio,
  parseEpisodeSourceFile,
  buildSpeechPlan,
} from "./index.js";

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
});
