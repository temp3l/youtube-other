import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import {
  buildPerformanceDirections,
  buildPerformancePlannerRequest,
  validateEmphasisTargets,
  type NarrationChunkManifest,
} from "./index.js";

const createdAt = "2026-01-02T03:04:05.000Z";

function chunkManifest(): NarrationChunkManifest {
  const chunks = [
    {
      chunkId: "narr-chunk-001",
      sequence: 0,
      text: "Mary Gloria heard the whisper behind the bedroom wall.",
      textHash: hashText("Mary Gloria heard the whisper behind the bedroom wall."),
      role: "hook" as const,
      estimatedWordCount: 9,
      estimatedDurationMs: 3_000,
      estimatedDurationSeconds: 3,
      previousContextExcerpt: "",
      nextContextExcerpt: "The house had been empty for years.",
      sourceParagraphRange: { start: 0, end: 0 },
      sourceSentenceRange: { start: 0, end: 0 },
      flowIntent: "leads_next" as const,
      warnings: [],
    },
    {
      chunkId: "narr-chunk-002",
      sequence: 1,
      text: "The house had been empty for years, but the radio was warm.",
      textHash: hashText("The house had been empty for years, but the radio was warm."),
      role: "reveal" as const,
      estimatedWordCount: 12,
      estimatedDurationMs: 4_000,
      estimatedDurationSeconds: 4,
      previousContextExcerpt: "behind the bedroom wall",
      nextContextExcerpt: "",
      sourceParagraphRange: { start: 1, end: 1 },
      sourceSentenceRange: { start: 0, end: 0 },
      flowIntent: "concludes" as const,
      warnings: [],
    },
  ];
  return {
    schemaVersion: "narration-artifact-v1",
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "en",
    variant: "full",
    sourceSpokenTextHash: hashText("spoken text"),
    segmentationConfig: {
      mode: "deterministic",
      version: "segmentation-v1",
      maxWordsPerChunk: 120,
      targetDurationMs: 12_000,
      fingerprint: hashText("segmentation"),
    },
    chunks,
    manifestFingerprint: hashText(JSON.stringify(chunks)),
    createdAt,
  };
}

async function tempEpisodeDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "speech-direction-"));
  return path.join(root, "009-mary-gloria-the-christmas-doll");
}

describe("performance direction planner", () => {
  it("builds deterministic directions with inherited negative constraints", async () => {
    const episodeDir = await tempEpisodeDir();
    const result = await buildPerformanceDirections({
      episodeDir,
      manifest: chunkManifest(),
      language: "en",
      createdAt,
    });

    expect(result.directionSet.plannerMode).toBe("deterministic");
    expect(result.directionSet.fallbackUsage.used).toBe(false);
    expect(result.directionSet.directions).toHaveLength(2);
    expect(result.directionSet.directions[0]).toMatchObject({
      chunkId: "narr-chunk-001",
      mood: "intimate",
      pace: "measured",
      flowIntent: "leads_next",
    });
    expect(result.directionSet.directions[0]?.negativeConstraints).toContain("No movie-trailer voice.");
    expect(result.directionSet.setFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("validates emphasis targets against chunk text", () => {
    const manifest = chunkManifest();
    const invalid = validateEmphasisTargets(manifest.chunks[0], ["Mary Gloria", "attic"]);

    expect(invalid).toEqual(["attic"]);
  });

  it("builds one optional planner request for the language variant", () => {
    const request = buildPerformancePlannerRequest({
      manifest: chunkManifest(),
      language: "en",
      config: { mode: "openai-assisted", model: "gpt-test" },
    });

    expect(request.model).toBe("gpt-test");
    expect(request.locale).toBe("en");
    expect(request.variant).toBe("full");
    expect(request.chunks).toHaveLength(2);
    expect(request.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("persists fallback metadata and warnings for openai-assisted fallback", async () => {
    const episodeDir = await tempEpisodeDir();
    const outputPath = path.join(episodeDir, "directions.json");
    const result = await buildPerformanceDirections({
      episodeDir,
      manifest: chunkManifest(),
      language: "en",
      outputPath,
      createdAt,
      config: {
        mode: "openai-assisted",
        fallbackToDeterministic: true,
        negativeConstraints: ["No whispered horror performance."],
      },
    });
    const persisted = JSON.parse(await fs.readFile(outputPath, "utf8")) as unknown;

    expect(result.plannerRequest?.chunks).toHaveLength(2);
    expect(result.directionSet.plannerMode).toBe("openai-assisted");
    expect(result.directionSet.fallbackUsage).toMatchObject({
      used: true,
      from: "openai-assisted",
      to: "deterministic",
    });
    expect(result.directionSet.plannerRequestFingerprint).toBe(result.plannerRequest?.requestFingerprint);
    expect(result.directionSet.directions[0]?.negativeConstraints).toContain("No whispered horror performance.");
    expect(persisted).toMatchObject({ setFingerprint: result.directionSet.setFingerprint });
  });
});
