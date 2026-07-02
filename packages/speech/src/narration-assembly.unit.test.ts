import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashFile, hashText } from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  assembleNarration,
  buildNarrationAssemblyEntries,
  buildNarrationAssemblyFfmpegArgs,
  makeWavHeader,
  type NarrationChunkCacheRecord,
  type NarrationChunkManifest,
  type NarrationChunkValidationReport,
  type NarrationDirectionSet,
} from "./index.js";

const createdAt = "2026-01-02T03:04:05.000Z";

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "narration-assembly-"));
  const narrationRoot = path.join(root, "009-mary-gloria-the-christmas-doll", "locales", "en", "full", "audio", "narration");
  await fs.mkdir(path.join(narrationRoot, "chunks"), { recursive: true });
  return narrationRoot;
}

async function writeToneWav(filePath: string, durationSeconds: number): Promise<void> {
  const sampleRate = 24_000;
  const frames = Math.floor(durationSeconds * sampleRate);
  const pcm = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    pcm.writeInt16LE(Math.round(Math.sin(index * 0.05) * 6_000), index * 2);
  }
  await fs.writeFile(filePath, Buffer.concat([makeWavHeader(sampleRate, 1, 16, pcm.byteLength), pcm]));
}

function chunkManifest(): NarrationChunkManifest {
  const chunks = [1, 2].map((number, index) => {
    const text = `Chunk ${number} narration.`;
    return {
      chunkId: `narr-chunk-00${number}`,
      sequence: index,
      text,
      textHash: hashText(text),
      role: index === 0 ? "hook" as const : "closing" as const,
      estimatedWordCount: 3,
      estimatedDurationMs: 1_000,
      estimatedDurationSeconds: 1,
      previousContextExcerpt: "",
      nextContextExcerpt: "",
      flowIntent: index === 0 ? "leads_next" as const : "concludes" as const,
    };
  });
  const base = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "en" as const,
    variant: "full" as const,
    sourceSpokenTextHash: hashText("spoken"),
    segmentationConfig: { mode: "deterministic" as const, version: "test-v1" },
    chunks,
    manifestFingerprint: hashText("pending"),
    createdAt,
  };
  return { ...base, manifestFingerprint: hashText(JSON.stringify(base)) };
}

function directionSet(manifest: NarrationChunkManifest): NarrationDirectionSet {
  return {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    manifestFingerprint: manifest.manifestFingerprint,
    plannerMode: "deterministic",
    plannerVersion: "test-v1",
    fallbackUsage: { used: false },
    directions: manifest.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      role: chunk.role,
      mood: "intimate",
      pace: "measured",
      intensity: 0.4,
      restraint: 0.8,
      pauseBeforeMs: 0,
      pauseAfterMs: chunk.sequence === 0 ? 250 : 0,
      emphasisTargets: [],
      deliveryNote: "Quiet.",
      negativeConstraints: [],
      continuityGuidance: "Continue.",
      flowIntent: chunk.flowIntent,
    })),
    setFingerprint: hashText("directions"),
    createdAt,
  };
}

async function recordsAndReports(narrationRoot: string, manifest: NarrationChunkManifest): Promise<{
  readonly records: readonly NarrationChunkCacheRecord[];
  readonly reports: readonly NarrationChunkValidationReport[];
}> {
  const records: NarrationChunkCacheRecord[] = [];
  const reports: NarrationChunkValidationReport[] = [];
  for (const chunk of manifest.chunks) {
    const audioPath = path.join(narrationRoot, "chunks", `${chunk.chunkId}.wav`);
    await writeToneWav(audioPath, 1);
    const outputHash = await hashFile(audioPath);
    const generationFingerprint = hashText(chunk.chunkId);
    records.push({
      schemaVersion: "narration-chunk-cache-v1",
      artifactSchemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
      chunkId: chunk.chunkId,
      chunkFingerprint: generationFingerprint,
      requestFingerprint: hashText(`request-${chunk.chunkId}`),
      inputTextHash: chunk.textHash,
      instructionHash: hashText("instructions"),
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      speed: 1,
      outputFormat: "wav",
      language: "en",
      outputPath: `chunks/${chunk.chunkId}.wav`,
      outputHash,
      validationPath: `chunks/${chunk.chunkId}.validation.json`,
      validationHash: hashText(`validation-${chunk.chunkId}`),
      validationStatus: "passed",
      durationMs: 1_000,
      createdAt,
    });
    reports.push({
      schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
      chunkId: chunk.chunkId,
      requestFingerprint: hashText(`request-${chunk.chunkId}`),
      generationFingerprint,
      audioPath: `chunks/${chunk.chunkId}.wav`,
      audioHash: outputHash,
      validationStatus: "passed",
      metrics: {
        durationMs: 1_000,
        sampleRate: 24_000,
        channels: 1,
        leadingSilenceMs: 90,
        trailingSilenceMs: 110,
        decodable: true,
      },
      findings: [],
      createdAt,
    });
  }
  return { records, reports };
}

describe("narration assembly", () => {
  it("builds an explicit ordered manifest and never relies on filename sorting", async () => {
    const narrationRoot = await createRoot();
    const manifest = chunkManifest();
    const directions = directionSet(manifest);
    const { records, reports } = await recordsAndReports(narrationRoot, manifest);

    const built = buildNarrationAssemblyEntries({
      narrationRoot,
      chunkManifest: { ...manifest, chunks: [...manifest.chunks].reverse() },
      directionSet: directions,
      cacheRecords: [...records].reverse(),
      validationReports: [...reports].reverse(),
    });

    expect(built.errors).toContain("Chunk manifest entries are not stored in explicit sequence order.");
    const ordered = buildNarrationAssemblyEntries({
      narrationRoot,
      chunkManifest: manifest,
      directionSet: directions,
      cacheRecords: [...records].reverse(),
      validationReports: [...reports].reverse(),
    });
    expect(ordered.errors).toEqual([]);
    expect(ordered.entries.map((entry) => entry.chunkId)).toEqual(["narr-chunk-001", "narr-chunk-002"]);
  });

  it("uses ffmpeg argument arrays for trims and inserted silence", async () => {
    const narrationRoot = await createRoot();
    const manifest = chunkManifest();
    const directions = directionSet(manifest);
    const { records, reports } = await recordsAndReports(narrationRoot, manifest);
    const built = buildNarrationAssemblyEntries({
      narrationRoot,
      chunkManifest: manifest,
      directionSet: directions,
      cacheRecords: records,
      validationReports: reports,
    });
    const args = buildNarrationAssemblyFfmpegArgs({
      entries: built.entries,
      outputPath: path.join(narrationRoot, "clean-narration.wav"),
    });

    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("atrim=start=");
    expect(args.join(" ")).toContain("anullsrc");
    expect(args).not.toContain(";");
  });

  it("preserves the previous clean narration when assembly is blocked", async () => {
    const narrationRoot = await createRoot();
    const manifest = chunkManifest();
    const directions = directionSet(manifest);
    const { records, reports } = await recordsAndReports(narrationRoot, manifest);
    const outputPath = path.join(narrationRoot, "clean-narration.wav");
    await fs.writeFile(outputPath, "previous-valid");

    const result = await assembleNarration({
      narrationRoot,
      chunkManifest: manifest,
      directionSet: directions,
      cacheRecords: records.slice(0, 1),
      validationReports: reports,
      outputPath,
      manifestPath: path.join(narrationRoot, "assembly-manifest.json"),
      createdAt,
    });

    expect(result.status).toBe("blocked");
    expect(await fs.readFile(outputPath, "utf8")).toBe("previous-valid");
  });

  it("promotes temp output only after validation succeeds", async () => {
    const narrationRoot = await createRoot();
    const manifest = chunkManifest();
    const directions = directionSet(manifest);
    const { records, reports } = await recordsAndReports(narrationRoot, manifest);
    const outputPath = path.join(narrationRoot, "clean-narration.wav");

    const result = await assembleNarration({
      narrationRoot,
      chunkManifest: manifest,
      directionSet: directions,
      cacheRecords: records,
      validationReports: reports,
      outputPath,
      manifestPath: path.join(narrationRoot, "assembly-manifest.json"),
      createdAt,
      runFfmpeg: async (args) => {
        const candidate = args.at(-1);
        if (candidate === undefined) {
          throw new Error("missing output");
        }
        await writeToneWav(candidate, 2);
      },
      async probeAudio() {
        return { durationSeconds: 2, sampleRate: 48_000, channels: 1 };
      },
    });

    expect(result.status).toBe("completed");
    expect(await fs.access(outputPath).then(() => true)).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(narrationRoot, "assembly-manifest.json"), "utf8"))).toMatchObject({
      cleanOutputPath: "clean-narration.wav",
    });
  });
});
