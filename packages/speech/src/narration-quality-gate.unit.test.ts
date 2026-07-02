import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText } from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  runNarrationQualityGate,
  type NarrationAssemblyManifest,
  type NarrationChunkManifest,
  type NarrationChunkValidationReport,
  type NarrationMasteringMetadata,
} from "./index.js";

const createdAt = "2026-01-02T03:04:05.000Z";

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "narration-quality-gate-"));
  const narrationRoot = path.join(root, "009-mary-gloria-the-christmas-doll", "locales", "en", "full", "audio", "narration");
  await fs.mkdir(narrationRoot, { recursive: true });
  return narrationRoot;
}

function manifest(): NarrationChunkManifest {
  const text = "Mary heard the radio whisper.";
  const base = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "en" as const,
    variant: "full" as const,
    sourceSpokenTextHash: hashText("spoken"),
    segmentationConfig: { mode: "deterministic" as const, version: "test-v1" },
    chunks: [
      {
        chunkId: "narr-chunk-001",
        sequence: 0,
        text,
        textHash: hashText(text),
        role: "hook" as const,
        estimatedWordCount: 5,
        estimatedDurationMs: 1_000,
        estimatedDurationSeconds: 1,
        previousContextExcerpt: "",
        nextContextExcerpt: "",
        flowIntent: "concludes" as const,
      },
    ],
    manifestFingerprint: hashText("pending"),
    createdAt,
  };
  return { ...base, manifestFingerprint: hashText(JSON.stringify(base)) };
}

function validation(status: "passed" | "warning" | "failed" = "passed"): NarrationChunkValidationReport {
  return {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    chunkId: "narr-chunk-001",
    requestFingerprint: hashText("request"),
    generationFingerprint: hashText("generation"),
    audioPath: "chunks/narr-chunk-001.wav",
    audioHash: hashText("audio"),
    validationStatus: status,
    metrics: {
      durationMs: 1_000,
      sampleRate: 24_000,
      channels: 1,
      decodable: true,
    },
    findings: status === "warning" ? [{ code: "AUDIO_DURATION_DRIFT", severity: "warning", message: "duration drift" }] : [],
    createdAt,
  };
}

function assembly(source: NarrationChunkManifest): NarrationAssemblyManifest {
  return {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: source.episodeId,
    locale: source.locale,
    variant: source.variant,
    chunkManifestFingerprint: source.manifestFingerprint,
    directionSetFingerprint: hashText("directions"),
    entries: [
      {
        chunkId: "narr-chunk-001",
        sequence: 0,
        validatedAudioPath: "chunks/narr-chunk-001.wav",
        audioHash: hashText("audio"),
        retainedLeadingSilenceMs: 80,
        retainedTrailingSilenceMs: 80,
        insertedPauseMs: 0,
        validationAcceptanceStatus: "accepted",
      },
    ],
    cleanOutputPath: "clean-narration.wav",
    assemblyFingerprint: hashText("assembly"),
    createdAt,
  };
}

function mastering(status: "completed" | "failed" = "completed"): NarrationMasteringMetadata {
  return {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    inputPath: "clean-narration.wav",
    inputHash: hashText("clean"),
    masteringProfileName: "render-ready",
    masteringProfileVersion: "mastering-render-ready-v1",
    masteringConfigurationFingerprint: hashText("mastering-config"),
    ...(status === "completed" ? { outputPath: "mastered-narration.wav", outputHash: hashText("mastered") } : {}),
    inputDurationMs: 1_000,
    ...(status === "completed" ? { outputDurationMs: 1_000 } : {}),
    targetLoudnessLufs: -16,
    truePeakTargetDb: -1.5,
    sampleRate: 48_000,
    codec: "pcm_s16le",
    status,
    warnings: [],
    createdAt,
  };
}

async function gate(input: {
  readonly validationStatus?: "passed" | "warning" | "failed";
  readonly includeAssembly?: boolean;
  readonly masteringStatus?: "completed" | "failed";
  readonly fallbackUsed?: boolean;
}) {
  const narrationRoot = await createRoot();
  const chunkManifest = manifest();
  return runNarrationQualityGate({
    chunkManifest,
    validationReports: [validation(input.validationStatus)],
    assemblyManifest: input.includeAssembly === false ? undefined : assembly(chunkManifest),
    masteringMetadata: mastering(input.masteringStatus),
    cleanNarrationPath: path.join(narrationRoot, "clean-narration.wav"),
    masteredNarrationPath: path.join(narrationRoot, "mastered-narration.wav"),
    reportJsonPath: path.join(narrationRoot, "quality-gate.json"),
    reportMarkdownPath: path.join(narrationRoot, "quality-gate.md"),
    narrationRoot,
    compatibilityOutputStatus: "written",
    fallbackUsed: input.fallbackUsed,
    fallbackReasons: input.fallbackUsed ? ["provider retry"] : [],
    createdAt,
  });
}

describe("narration quality gate", () => {
  it("returns READY for clean completed state and writes reports", async () => {
    const report = await gate({});

    expect(report.outcome).toBe("READY");
    expect(report.warningCount).toBe(0);
  });

  it("returns READY_WITH_WARNINGS for fallback or warning-only state", async () => {
    await expect(gate({ validationStatus: "warning" })).resolves.toMatchObject({
      outcome: "READY_WITH_WARNINGS",
    });
    await expect(gate({ fallbackUsed: true })).resolves.toMatchObject({
      outcome: "READY_WITH_WARNINGS",
    });
  });

  it("returns REGENERATION_RECOMMENDED for failed chunk validation", async () => {
    const report = await gate({ validationStatus: "failed" });

    expect(report.outcome).toBe("REGENERATION_RECOMMENDED");
    expect(report.checks.map((item) => item.code)).toContain("VALIDATION_FAILED");
  });

  it("returns BLOCKED for missing assembly and persists JSON plus Markdown", async () => {
    const narrationRoot = await createRoot();
    const chunkManifest = manifest();
    const jsonPath = path.join(narrationRoot, "quality-gate.json");
    const markdownPath = path.join(narrationRoot, "quality-gate.md");
    const report = await runNarrationQualityGate({
      chunkManifest,
      validationReports: [validation()],
      cleanNarrationPath: path.join(narrationRoot, "clean-narration.wav"),
      reportJsonPath: jsonPath,
      reportMarkdownPath: markdownPath,
      narrationRoot,
      compatibilityOutputStatus: "written",
      createdAt,
    });

    expect(report.outcome).toBe("BLOCKED");
    expect(JSON.parse(await fs.readFile(jsonPath, "utf8"))).toMatchObject({ outcome: "BLOCKED" });
    expect(await fs.readFile(markdownPath, "utf8")).toContain("Outcome: BLOCKED");
  });
});
