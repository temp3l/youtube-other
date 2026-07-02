import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPipeline } from "./index.js";
import {
  createEpisodePathResolver,
  normalizeEpisodeId,
} from "@mediaforge/shared";

function smallVisualRetentionConfig(args: {
  readonly shotCount: number;
  readonly sourceImageCount: number;
}) {
  return {
    pacingProfiles: {
      balanced: {
        id: "balanced" as const,
        shotDurationMs: { minMs: 1000, maxMs: 2000 },
        staticShotDurationMs: { minMs: 1000, maxMs: 2000 },
        movingShotDurationMs: { minMs: 1000, maxMs: 2000 },
        openingCadenceMs: { minMs: 1000, maxMs: 2000 },
        climaxCadenceMs: { minMs: 100, maxMs: 500 },
      },
    },
    defaults: {
      full: [
        {
          id: "full-4-6m" as const,
          pacingProfileId: "balanced" as const,
          narrationDurationMs: { minMs: 0, maxMs: 120000 },
          budget: {
            sourceImageCount: {
              min: args.sourceImageCount,
              max: args.sourceImageCount,
            },
            shotCount: { min: args.shotCount, max: args.shotCount },
            shotsPerImage: { min: 1, max: Math.max(1, args.shotCount) },
            maxConsecutiveSourceImageUses: Math.max(1, args.shotCount),
            maxTotalSourceImageUses: Math.max(1, args.shotCount),
            cropLimits: {
              minCropArea: 0.35,
              minFaceMargin: 0.08,
              maxCropZoom: 1.6,
              minOutputHeightPx: 64,
              maxAdjacentSameImageCropIou: 0.95,
            },
            motionLimits: {
              minShotDurationMs: 1000,
              pushInScaleRange: { min: 1.02, max: 1.08 },
              fastPushInScaleRange: { min: 1.04, max: 1.12 },
              panTravelFractionOfImage: { min: 0.02, max: 0.08 },
              rotationDegreesRange: { min: -0.5, max: 0.5 },
              dissolveDurationMs: { minMs: 100, maxMs: 200 },
              dipToBlackDurationMs: { minMs: 100, maxMs: 300 },
            },
            effectCaps: [],
          },
        },
      ],
    },
  };
}

function createLocalFixture(args: {
  readonly baseDir: string;
  readonly slug: string;
  readonly segments: readonly string[];
}): { readonly sourcePath: string; readonly transcriptPath: string } {
  const sourcePath = path.join(args.baseDir, `${args.slug}.wav`);
  const transcriptPath = path.join(args.baseDir, `${args.slug}.transcript.json`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=24000:cl=mono",
      "-t",
      String(args.segments.length * 2),
      sourcePath,
    ],
    { stdio: "ignore" }
  );
  writeFileSync(
    transcriptPath,
    JSON.stringify(
      {
        sourceId: args.slug,
        language: "en",
        text: args.segments.join(" "),
        segments: args.segments.map((text, index) => ({
          id: `scene-${String(index + 1).padStart(3, "0")}`,
          startSeconds: index * 2,
          endSeconds: index * 2 + 2,
          text,
          words: [],
        })),
        words: [],
      },
      null,
      2
    )
  );
  return { sourcePath, transcriptPath };
}

describe("MediaForgePipeline audio reuse", () => {
  it("regenerates stale scene audio when the scene hash changes", async () => {
    const baseDir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-pipeline-audio-")
    );
    const sourcePath = path.join(baseDir, "source.wav");
    const transcriptPath = path.join(baseDir, "source.transcript.json");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "4",
        sourcePath,
      ],
      {
        stdio: "ignore",
      }
    );
    writeFileSync(
      transcriptPath,
      JSON.stringify(
        {
          sourceId: "episode-fixture",
          language: "en",
          text: "This is a local fixture. It exercises audio reuse. The final sentence should be regenerated.",
          segments: [
            {
              id: "scene-001",
              startSeconds: 0,
              endSeconds: 4,
              text: "This is a local fixture. It exercises audio reuse. The final sentence should be regenerated.",
              words: [],
            },
          ],
          words: [],
        },
        null,
        2
      )
    );

    const pipeline = await createPipeline({
      workspaceDir: path.join(baseDir, "workspace"),
      dbPath: path.join(baseDir, "db.sqlite"),
      transcriptionProvider: "mock",
      ttsProvider: "mock",
      imageProvider: "placeholder",
      textProvider: "mock",
    });
    const manifest = await pipeline.createEpisode({
      filePath: sourcePath,
      transcriptPath,
      slug: "episode-fixture",
    });

    const episodeDir = path.join(baseDir, "workspace", "episode-fixture");
    const resolver = createEpisodePathResolver(path.join(baseDir, "workspace"));
    const episodeId = normalizeEpisodeId("episode-fixture");
    const staleAudioPath = path.join(
      resolver.audioSegmentsDir({
        episodeId,
        locale: "en",
        variant: "full",
      }),
      "scene-001.wav"
    );
    await fs.mkdir(path.dirname(staleAudioPath), { recursive: true });
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        "0.5",
        staleAudioPath,
      ],
      { stdio: "ignore" }
    );
    await fs.writeFile(
      path.join(episodeDir, "audio", "segments", "scene-001.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          sceneId: "scene-001",
          sceneHash: "stale-scene-hash",
          promptHash: "stale-prompt-hash",
          voiceProfileHash: "stale-voice-hash",
          outputPath: staleAudioPath,
          outputSha256: "stale-output-sha256",
          durationSeconds: 0.5,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    const result = await pipeline.runEpisode(manifest.episodeId, {
      untilStage: "concatenate-audio",
    });
    expect(result.outputPaths).toContain(
      path.join(episodeDir, "audio", "narration.wav")
    );
    const manifestJson = JSON.parse(
      await fs.readFile(
        path.join(path.dirname(staleAudioPath), "scene-001.json"),
        "utf8"
      )
    ) as {
      sceneHash: string;
      promptHash: string;
      outputSha256: string;
    };
    expect(manifestJson.sceneHash).not.toBe("stale-scene-hash");
    expect(manifestJson.promptHash).not.toBe("stale-prompt-hash");
    expect(manifestJson.outputSha256).not.toBe("stale-output-sha256");
  }, 120000);
});

describe("MediaForgePipeline visual retention", () => {
  it("preserves legacy pipeline behavior by default", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-legacy-"));
    const { sourcePath, transcriptPath } = createLocalFixture({
      baseDir,
      slug: "episode-fixture",
      segments: [
        "A local fixture opens.",
        "It stays on the legacy path.",
        "The final scene keeps compatibility.",
      ],
    });
    const workspaceDir = path.join(baseDir, "workspace");
    const pipeline = await createPipeline({
      workspaceDir,
      dbPath: path.join(baseDir, "db.sqlite"),
      transcriptionProvider: "mock",
      ttsProvider: "mock",
      imageProvider: "placeholder",
      textProvider: "mock",
    });
    const manifest = await pipeline.createEpisode({
      filePath: sourcePath,
      transcriptPath,
      slug: "episode-fixture",
    });

    await pipeline.runEpisode(manifest.episodeId, {
      untilStage: "validate-output",
    });

    const resolver = createEpisodePathResolver(workspaceDir);
    const episodeId = normalizeEpisodeId("episode-fixture");
    await expect(fs.access(resolver.shotPlan({
      episodeId,
      locale: "en",
      variant: "full",
    }))).rejects.toThrow();
  }, 60000);

  it("creates shot artifacts and reuses derived clips when explicitly enabled", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-shots-"));
    const { sourcePath, transcriptPath } = createLocalFixture({
      baseDir,
      slug: "episode-fixture",
      segments: [
        "A local fixture opens.",
        "It exercises source image reuse.",
        "The final scene validates the render.",
      ],
    });
    const workspaceDir = path.join(baseDir, "workspace");
    const pipeline = await createPipeline({
      workspaceDir,
      dbPath: path.join(baseDir, "db.sqlite"),
      transcriptionProvider: "mock",
      ttsProvider: "mock",
      imageProvider: "placeholder",
      textProvider: "mock",
      visualRetention: smallVisualRetentionConfig({
        shotCount: 6,
        sourceImageCount: 1,
      }),
    });
    const manifest = await pipeline.createEpisode({
      filePath: sourcePath,
      transcriptPath,
      slug: "episode-fixture",
    });
    const resolver = createEpisodePathResolver(workspaceDir);
    const episodeId = normalizeEpisodeId("episode-fixture");
    const context = { episodeId, locale: "en" as const, variant: "full" as const };

    await pipeline.runEpisode(manifest.episodeId, {
      untilStage: "validate-output",
      visualRetention: { enabled: true, profile: "balanced" },
    });

    const sourceScenes = JSON.parse(
      await fs.readFile(resolver.visualSourceScenes(episodeId), "utf8")
    ) as readonly unknown[];
    const shotPlan = JSON.parse(
      await fs.readFile(resolver.shotPlan(context), "utf8")
    ) as { readonly shots: readonly unknown[] };
    const validation = JSON.parse(
      await fs.readFile(resolver.shotValidation(context), "utf8")
    ) as { readonly valid: boolean };
    expect(sourceScenes).toHaveLength(1);
    expect(shotPlan.shots).toHaveLength(6);
    expect(validation.valid).toBe(true);

    const derivedManifests = (
      await fs.readdir(resolver.derivedShotsDir(episodeId))
    ).filter((entry) => entry.endsWith(".json"));
    expect(derivedManifests.length).toBeGreaterThanOrEqual(6);
    const firstManifestPath = path.join(
      resolver.derivedShotsDir(episodeId),
      derivedManifests[0] ?? ""
    );
    const firstMtime = (await fs.stat(firstManifestPath)).mtimeMs;
    await pipeline.runEpisode(manifest.episodeId, {
      untilStage: "validate-output",
      visualRetention: { enabled: true, profile: "balanced" },
    });
    expect((await fs.stat(firstManifestPath)).mtimeMs).toBe(firstMtime);
  }, 120000);

  it("blocks shot-aware rendering when strict validation rejects issues", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-shot-error-"));
    const { sourcePath, transcriptPath } = createLocalFixture({
      baseDir,
      slug: "episode-fixture",
      segments: ["A local fixture has strict visual validation warnings."],
    });
    const pipeline = await createPipeline({
      workspaceDir: path.join(baseDir, "workspace"),
      dbPath: path.join(baseDir, "db.sqlite"),
      transcriptionProvider: "mock",
      ttsProvider: "mock",
      imageProvider: "placeholder",
      textProvider: "mock",
      visualRetention: smallVisualRetentionConfig({
        shotCount: 1,
        sourceImageCount: 1,
      }),
    });
    const manifest = await pipeline.createEpisode({
      filePath: sourcePath,
      transcriptPath,
      slug: "episode-fixture",
    });

    await expect(
      pipeline.runEpisode(manifest.episodeId, {
        untilStage: "validate-output",
        visualRetention: {
          enabled: true,
          profile: "balanced",
          strictValidation: true,
        },
      })
    ).rejects.toThrow(/Shot validation failed/u);
  }, 60000);
});
