import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashFile, hashText } from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  assessNarrationChunkCache,
  computeNarrationChunkFingerprint,
  generateNarrationChunkWithCache,
  narrationChunkCacheRecordPath,
  promoteNarrationChunk,
  reportStaleNarrationArtifacts,
  type NarrationChunkValidationReport,
} from "./index.js";

const createdAt = "2026-01-02T03:04:05.000Z";
const requestFingerprint = hashText("request");
const instructionHash = hashText("instructions");
const inputTextHash = hashText("input");

async function createNarrationRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "narration-cache-"));
  const narrationRoot = path.join(root, "009-mary-gloria-the-christmas-doll", "en", "full", "audio", "narration");
  await fs.mkdir(path.join(narrationRoot, "chunks"), { recursive: true });
  return narrationRoot;
}

function fingerprint(chunkId = "narr-chunk-001"): string {
  return computeNarrationChunkFingerprint({
    schemaVersion: "openai-tts-request-v1",
    promptVersion: "openai-tts-instructions-v1",
    chunkId,
    text: "Mary opened the radio.",
    textHash: hashText("Mary opened the radio."),
    previousContext: "previous context",
    nextContext: "next context",
    model: "gpt-4o-mini-tts",
    voice: "onyx",
    speed: 1,
    outputFormat: "wav",
    language: "en",
    locale: "en",
    instructions: "Speak calmly.",
    direction: {
      chunkId,
      role: "hook",
      mood: "intimate",
      pace: "measured",
      intensity: 0.4,
      restraint: 0.8,
      pauseBeforeMs: 0,
      pauseAfterMs: 200,
      emphasisTargets: ["Mary"],
      deliveryNote: "Quiet.",
      negativeConstraints: ["No trailer voice."],
      continuityGuidance: "Continue.",
      flowIntent: "leads_next",
    },
    pronunciationHints: ["Mary as MARE-ee"],
    requestFingerprint,
  });
}

function validationReport(input: {
  readonly chunkId: string;
  readonly outputHash: string;
  readonly chunkFingerprint: string;
  readonly status?: "passed" | "warning" | "failed";
}): NarrationChunkValidationReport {
  return {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    chunkId: input.chunkId,
    requestFingerprint,
    generationFingerprint: input.chunkFingerprint,
    audioPath: `chunks/${input.chunkId}.wav`,
    audioHash: input.outputHash,
    validationStatus: input.status ?? "passed",
    metrics: {
      durationMs: 1200,
      sampleRate: 24000,
      channels: 1,
      decodable: true,
    },
    findings: [],
    createdAt,
  };
}

async function promoteFixture(input: {
  readonly narrationRoot: string;
  readonly chunkId?: string;
  readonly chunkFingerprint?: string;
  readonly audioText?: string;
  readonly validationStatus?: "passed" | "warning" | "failed";
}) {
  const chunkId = input.chunkId ?? "narr-chunk-001";
  const chunkFingerprint = input.chunkFingerprint ?? fingerprint(chunkId);
  const audioText = input.audioText ?? `audio-${chunkId}`;
  const audioData = Buffer.from(audioText, "utf8");
  return promoteNarrationChunk({
    narrationRoot: input.narrationRoot,
    chunkId,
    chunkFingerprint,
    requestFingerprint,
    inputTextHash,
    instructionHash,
    model: "gpt-4o-mini-tts",
    voice: "onyx",
    speed: 1,
    outputFormat: "wav",
    language: "en",
    outputPath: path.join(input.narrationRoot, "chunks", `${chunkId}.wav`),
    audioData,
    validationReport: validationReport({
      chunkId,
      outputHash: hashText(audioText),
      chunkFingerprint,
      status: input.validationStatus,
    }),
    createdAt,
  });
}

describe("narration chunk cache", () => {
  it("reuses only when metadata, validation, output hash, and fingerprint agree", async () => {
    const narrationRoot = await createNarrationRoot();
    const chunkFingerprint = fingerprint();
    await promoteFixture({ narrationRoot, chunkFingerprint });

    const hit = await assessNarrationChunkCache({
      narrationRoot,
      chunkId: "narr-chunk-001",
      chunkFingerprint,
    });

    expect(hit.reason).toBe("hit");
    expect(hit.reusable).toBe(true);
    expect(hit.outputHash).toBe(await hashFile(path.join(narrationRoot, "chunks", "narr-chunk-001.wav")));
  });

  it("classifies miss, stale metadata, invalid output, and validation failure separately", async () => {
    const narrationRoot = await createNarrationRoot();
    const chunkFingerprint = fingerprint();
    const missing = await assessNarrationChunkCache({
      narrationRoot,
      chunkId: "narr-chunk-001",
      chunkFingerprint,
    });
    expect(missing.reason).toBe("miss");

    await promoteFixture({ narrationRoot, chunkFingerprint });
    const stale = await assessNarrationChunkCache({
      narrationRoot,
      chunkId: "narr-chunk-001",
      chunkFingerprint: fingerprint("narr-chunk-002"),
    });
    expect(stale.reason).toBe("stale_metadata");

    await fs.writeFile(path.join(narrationRoot, "chunks", "narr-chunk-001.wav"), "changed");
    const invalid = await assessNarrationChunkCache({
      narrationRoot,
      chunkId: "narr-chunk-001",
      chunkFingerprint,
    });
    expect(invalid.reason).toBe("invalid_output");

    await promoteFixture({ narrationRoot, chunkFingerprint, audioText: "restored" });
    await fs.writeFile(path.join(narrationRoot, "chunks", "narr-chunk-001.validation.json"), "{");
    const validation = await assessNarrationChunkCache({
      narrationRoot,
      chunkId: "narr-chunk-001",
      chunkFingerprint,
    });
    expect(validation.reason).toBe("validation_failure");
  });

  it("preserves valid chunks when another chunk fails provider generation", async () => {
    const narrationRoot = await createNarrationRoot();
    const firstFingerprint = fingerprint("narr-chunk-001");
    const secondFingerprint = fingerprint("narr-chunk-002");
    await promoteFixture({
      narrationRoot,
      chunkId: "narr-chunk-001",
      chunkFingerprint: firstFingerprint,
      audioText: "valid-first",
    });
    const firstPath = path.join(narrationRoot, "chunks", "narr-chunk-001.wav");
    const firstHash = await hashFile(firstPath);

    const failed = await generateNarrationChunkWithCache({
      narrationRoot,
      chunkId: "narr-chunk-002",
      chunkFingerprint: secondFingerprint,
      requestFingerprint,
      inputTextHash,
      instructionHash,
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      speed: 1,
      outputFormat: "wav",
      language: "en",
      outputPath: path.join(narrationRoot, "chunks", "narr-chunk-002.wav"),
      createdAt,
      synthesizeToTempFile: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(failed.reason).toBe("provider_failure");
    expect(await hashFile(firstPath)).toBe(firstHash);
    await expect(fs.access(path.join(narrationRoot, "chunks", "narr-chunk-002.wav"))).rejects.toThrow();
  });

  it("reports stale artifacts and does not clean up by default", async () => {
    const narrationRoot = await createNarrationRoot();
    const chunkFingerprint = fingerprint();
    await promoteFixture({ narrationRoot, chunkFingerprint });
    const recordPath = narrationChunkCacheRecordPath(narrationRoot, "narr-chunk-001");
    const report = await reportStaleNarrationArtifacts({
      narrationRoot,
      expectedFingerprints: new Map([["narr-chunk-001", fingerprint("narr-chunk-002")]]),
    });

    expect(report.staleArtifacts).toHaveLength(1);
    expect(report.staleArtifacts[0]?.reason).toBe("stale_metadata");
    expect(report.deletedPaths).toEqual([]);
    await expect(fs.access(recordPath)).resolves.toBeUndefined();
  });
});
