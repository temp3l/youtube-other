import { describe, expect, it } from "vitest";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type NarrationAssemblyManifest,
  type NarrationChunkGenerationRecord,
  type NarrationChunkManifest,
  type NarrationConfigurationSnapshot,
  type NarrationDirectionSet,
  type NarrationGenerationMetadata,
  type NarrationMasteringMetadata,
  type NarrationQualityGateReport,
  type PronunciationTransformationReport,
  type SpokenNarrationArtifact,
  narrationAssemblyManifestSchema,
  narrationChunkGenerationRecordSchema,
  narrationChunkManifestSchema,
  narrationChunkValidationReportSchema,
  narrationConfigurationSnapshotSchema,
  narrationDirectionSetSchema,
  narrationGenerationMetadataSchema,
  narrationMasteringMetadataSchema,
  narrationQualityGateReportSchema,
  narrationRoleSchema,
  pronunciationTransformationReportSchema,
  spokenNarrationArtifactSchema,
} from "./narration-schemas.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);
const createdAt = "2026-01-02T03:04:05.000Z";

function warning(code = "WARN_TEST") {
  return {
    code,
    message: "Review this artifact before publishing.",
  };
}

function fallbackUsage(used = false) {
  return {
    used,
    reason: used ? "Primary voice unavailable." : undefined,
    from: used ? "alloy" : undefined,
    to: used ? "verse" : undefined,
  };
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function spokenArtifact(overrides: Partial<SpokenNarrationArtifact> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "es",
    variant: "full",
    preparationMode: "adapted",
    sourceStoryPath: "locales/es/full/script.md",
    sourceHash: hashA,
    spokenTextPath: "locales/es/full/audio/narration/spoken-text.md",
    spokenTextHash: hashB,
    wordCount: 1200,
    warnings: [warning()],
    createdAt,
    parentFingerprints: [hashA],
    dependencyFingerprints: [hashC],
    provenance: {
      generator: "@mediaforge/speech",
      generatorVersion: "1.0.0",
      runId: "run-001",
    },
    ...overrides,
  });
}

function chunk(sequence: number, chunkId = `narr-chunk-${String(sequence + 1).padStart(3, "0")}`) {
  return {
    chunkId,
    sequence,
    text: `Spoken chunk ${sequence + 1}.`,
    textHash: sequence === 0 ? hashA : hashB,
    role: sequence === 0 ? "hook" : "setup",
    estimatedWordCount: 4,
    estimatedDurationMs: 2400,
    estimatedDurationSeconds: 2.4,
    previousContextExcerpt: sequence === 0 ? "" : "Earlier context only.",
    nextContextExcerpt: "Next context only.",
    sourceParagraphRange: { start: sequence, end: sequence },
    sourceSentenceRange: { start: sequence, end: sequence },
    flowIntent: sequence === 0 ? "leads_next" : "concludes",
    warnings: [],
  };
}

function chunkManifest(overrides: Partial<NarrationChunkManifest> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "es",
    variant: "full",
    sourceSpokenTextHash: hashB,
    segmentationConfig: {
      mode: "deterministic",
      version: "segmentation-v1",
      maxWordsPerChunk: 120,
      targetDurationMs: 12000,
      fingerprint: hashC,
    },
    chunks: [chunk(0), chunk(1)],
    manifestFingerprint: hashD,
    createdAt,
    ...overrides,
  });
}

function directionSet(overrides: Partial<NarrationDirectionSet> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    manifestFingerprint: hashD,
    plannerMode: "deterministic",
    plannerVersion: "directions-v1",
    fallbackUsage: fallbackUsage(),
    directions: [
      {
        chunkId: "narr-chunk-001",
        role: "hook",
        mood: "curious",
        pace: "measured",
        intensity: 0.45,
        restraint: 0.8,
        pauseBeforeMs: 0,
        pauseAfterMs: 350,
        emphasisTargets: ["Mary"],
        deliveryNote: "Begin quietly.",
        negativeConstraints: ["Do not overdramatize."],
        continuityGuidance: "Lead into the next discovery.",
        flowIntent: "leads_next",
        pronunciationGuidanceReferences: [{ entryId: "mary-gloria", dictionaryFingerprint: hashA }],
      },
      {
        chunkId: "narr-chunk-002",
        role: "setup",
        mood: "uneasy",
        pace: "normal",
        intensity: 0.6,
        restraint: 0.7,
        pauseBeforeMs: 100,
        pauseAfterMs: 500,
        emphasisTargets: [],
        deliveryNote: "Keep it grounded.",
        negativeConstraints: [],
        continuityGuidance: "Resolve the thought.",
        flowIntent: "concludes",
      },
    ],
    setFingerprint: hashA,
    createdAt,
    ...overrides,
  });
}

function pronunciationReport(overrides: Partial<PronunciationTransformationReport> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    sourceManifestFingerprint: hashD,
    dictionaryFingerprint: hashA,
    language: "es",
    appliedTransformations: [
      {
        chunkId: "narr-chunk-001",
        entryId: "mary-gloria",
        scope: "phrase",
        original: "Mary Gloria",
        replacement: "Meri Gloria",
        occurrenceCount: 1,
        mandatory: true,
      },
    ],
    collisions: [
      {
        entryIds: ["entry-a", "entry-b"],
        tokenOrPhrase: "Gloria",
        resolution: "manual-required",
      },
    ],
    skippedEntries: [
      {
        entryId: "unused",
        reason: "No match in TTS text.",
        mandatory: false,
      },
    ],
    warnings: [warning()],
    reportFingerprint: hashB,
    createdAt,
    ...overrides,
  });
}

function generationRecord(
  overrides: Partial<NarrationChunkGenerationRecord> = {}
) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    chunkId: "narr-chunk-001",
    requestFingerprint: hashA,
    generationFingerprint: hashB,
    inputTextHash: hashC,
    instructionHash: hashD,
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    speed: 1,
    language: "es",
    outputFormat: "wav",
    attemptCount: 1,
    status: "completed",
    cacheStatus: "miss",
    outputPath: "locales/es/full/audio/narration/chunks/narr-chunk-001.wav",
    outputHash: hashA,
    durationMs: 2300,
    startedAt: createdAt,
    completedAt: "2026-01-02T03:04:06.000Z",
    fallbackUsage: fallbackUsage(),
    ...overrides,
  });
}

function validationReport(overrides = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    chunkId: "narr-chunk-001",
    requestFingerprint: hashA,
    generationFingerprint: hashB,
    audioPath: "locales/es/full/audio/narration/chunks/narr-chunk-001.wav",
    audioHash: hashC,
    validationStatus: "warning",
    metrics: {
      durationMs: 2300,
      expectedDurationRangeMs: { minMs: 2000, maxMs: 3000 },
      sampleRate: 24000,
      channels: 1,
      silencePercentage: 0.05,
      leadingSilenceMs: 80,
      trailingSilenceMs: 120,
      peakDb: -1.5,
      rmsDb: -18,
      loudnessLufs: -16,
      decodable: true,
    },
    findings: [
      {
        code: "LEADING_SILENCE_HIGH",
        severity: "warning",
        message: "Leading silence is above the target.",
        measuredValue: 80,
        expectedBound: 60,
      },
    ],
    createdAt,
    ...overrides,
  });
}

function assemblyManifest(overrides: Partial<NarrationAssemblyManifest> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "es",
    variant: "full",
    chunkManifestFingerprint: hashD,
    directionSetFingerprint: hashA,
    entries: [
      {
        chunkId: "narr-chunk-001",
        sequence: 0,
        validatedAudioPath: "locales/es/full/audio/narration/chunks/narr-chunk-001.wav",
        audioHash: hashA,
        retainedLeadingSilenceMs: 40,
        retainedTrailingSilenceMs: 80,
        insertedPauseMs: 350,
        crossfade: { enabled: false, durationMs: 0 },
        validationAcceptanceStatus: "accepted_with_warnings",
      },
      {
        chunkId: "narr-chunk-002",
        sequence: 1,
        validatedAudioPath: "locales/es/full/audio/narration/chunks/narr-chunk-002.wav",
        audioHash: hashB,
        retainedLeadingSilenceMs: 30,
        retainedTrailingSilenceMs: 90,
        insertedPauseMs: 0,
        validationAcceptanceStatus: "accepted",
      },
    ],
    cleanOutputPath: "locales/es/full/audio/narration/clean-narration.wav",
    assemblyFingerprint: hashC,
    createdAt,
    ...overrides,
  });
}

function masteringMetadata(overrides: Partial<NarrationMasteringMetadata> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    inputPath: "locales/es/full/audio/narration/clean-narration.wav",
    inputHash: hashC,
    masteringProfileName: "youtube-narration",
    masteringProfileVersion: "1.0.0",
    masteringConfigurationFingerprint: hashA,
    outputPath: "locales/es/full/audio/narration/mastered-narration.wav",
    outputHash: hashB,
    inputDurationMs: 5200,
    outputDurationMs: 5200,
    targetLoudnessLufs: -16,
    measuredLoudnessLufs: -16.1,
    truePeakTargetDb: -1,
    measuredTruePeakDb: -1.2,
    sampleRate: 48000,
    codec: "pcm_s16le",
    bitrateKbps: 1536,
    status: "completed",
    warnings: [],
    createdAt,
    ...overrides,
  });
}

function qualityGateReport(overrides: Partial<NarrationQualityGateReport> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "es",
    variant: "full",
    outcome: "READY_WITH_WARNINGS",
    inputArtifactFingerprints: [hashA, hashB, hashC],
    checks: [
      {
        code: "LOUDNESS_OK",
        status: "passed",
        severity: "info",
        message: "Loudness is within tolerance.",
      },
      {
        code: "SILENCE_WARN",
        status: "warning",
        severity: "warning",
        message: "One chunk retained extra trailing silence.",
        chunkId: "narr-chunk-001",
      },
    ],
    warningCount: 1,
    errorCount: 0,
    fallbackSummary: {
      used: false,
      count: 0,
      reasons: [],
    },
    compatibilityOutputStatus: "written",
    cleanNarrationPath: "locales/es/full/audio/narration/clean-narration.wav",
    masteredNarrationPath: "locales/es/full/audio/narration/mastered-narration.wav",
    reportFingerprint: hashD,
    createdAt,
    ...overrides,
  });
}

function configSnapshot(overrides: Partial<NarrationConfigurationSnapshot> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    fallbackVoice: "verse",
    outputFormat: "wav",
    speed: 1,
    timeoutMs: 30000,
    retries: 2,
    concurrency: 3,
    languageOverrides: [{ locale: "es", voice: "nova", speed: 0.95 }],
    variantOverrides: [{ variant: "short", maxWordsPerChunk: 80 }],
    chunking: {
      mode: "deterministic",
      targetWordsPerChunk: 80,
      maxWordsPerChunk: 120,
      targetDurationMs: 10000,
      maxDurationMs: 18000,
    },
    instructionProfileIds: ["natural-narration-v1"],
    masteringProfileId: "youtube-narration-v1",
    schemaVersions: { narration: NARRATION_ARTIFACT_SCHEMA_VERSION },
    promptVersions: { directions: "directions-prompt-v1" },
    snapshotFingerprint: hashA,
    createdAt,
    ...overrides,
  });
}

function generationMetadata(overrides: Partial<NarrationGenerationMetadata> = {}) {
  return stripUndefined({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: "009-mary-gloria-the-christmas-doll",
    locale: "es",
    variant: "full",
    pipelineMode: "shadow",
    sourceHashes: {
      storyHash: hashA,
      spokenTextHash: hashB,
    },
    artifactFingerprints: [
      {
        artifactType: "chunk-manifest",
        path: "locales/es/full/audio/narration/chunk-manifest.json",
        fingerprint: hashD,
        schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
      },
    ],
    stageStatuses: [
      {
        stage: "segmentation",
        status: "completed",
        startedAt: createdAt,
        completedAt: "2026-01-02T03:04:06.000Z",
        fingerprint: hashD,
      },
    ],
    openAi: {
      model: "gpt-4o-mini-tts",
      voice: "alloy",
    },
    usageCounters: {
      chunksRequested: 2,
      chunksGenerated: 2,
      chunksFailed: 0,
      retries: 0,
      cacheHits: 1,
      cacheMisses: 1,
    },
    fallbackUsage: {
      used: false,
      count: 0,
      reasons: [],
    },
    startedAt: createdAt,
    completedAt: "2026-01-02T03:04:08.000Z",
    finalOutputs: {
      cleanNarrationPath: "locales/es/full/audio/narration/clean-narration.wav",
      masteredNarrationPath: "locales/es/full/audio/narration/mastered-narration.wav",
      compatibilityNarrationPath: "locales/es/full/audio/narration.wav",
      rootCompatibilityNarrationPath: "audio/narration.wav",
    },
    ...overrides,
  });
}

describe("narration schemas", () => {
  it("accepts representative valid fixtures for every required artifact", () => {
    expect(spokenNarrationArtifactSchema.parse(spokenArtifact())).toBeDefined();
    expect(narrationChunkManifestSchema.parse(chunkManifest())).toBeDefined();
    expect(narrationDirectionSetSchema.parse(directionSet())).toBeDefined();
    expect(pronunciationTransformationReportSchema.parse(pronunciationReport())).toBeDefined();
    expect(narrationChunkGenerationRecordSchema.parse(generationRecord())).toBeDefined();
    expect(narrationChunkValidationReportSchema.parse(validationReport())).toBeDefined();
    expect(narrationAssemblyManifestSchema.parse(assemblyManifest())).toBeDefined();
    expect(narrationMasteringMetadataSchema.parse(masteringMetadata())).toBeDefined();
    expect(narrationQualityGateReportSchema.parse(qualityGateReport())).toBeDefined();
    expect(narrationConfigurationSnapshotSchema.parse(configSnapshot())).toBeDefined();
    expect(narrationGenerationMetadataSchema.parse(generationMetadata())).toBeDefined();
  });

  it("rejects unknown fields on strict schemas", () => {
    expect(spokenNarrationArtifactSchema.safeParse({ ...spokenArtifact(), extra: true }).success).toBe(false);
  });

  it("rejects malformed SHA-256 hashes", () => {
    expect(spokenNarrationArtifactSchema.safeParse(spokenArtifact({ sourceHash: "not-a-hash" })).success).toBe(false);
  });

  it("rejects invalid timestamps", () => {
    expect(spokenNarrationArtifactSchema.safeParse(spokenArtifact({ createdAt: "yesterday" })).success).toBe(false);
  });

  it("rejects negative durations and pause values", () => {
    expect(
      narrationChunkManifestSchema.safeParse(
        chunkManifest({ chunks: [{ ...chunk(0), estimatedDurationMs: -1 }] })
      ).success
    ).toBe(false);
    expect(
      narrationDirectionSetSchema.safeParse(
        directionSet({
          directions: [{ ...directionSet().directions[0], pauseAfterMs: -1 }],
        })
      ).success
    ).toBe(false);
  });

  it("rejects invalid enum values", () => {
    expect(narrationRoleSchema.safeParse("transition").success).toBe(false);
  });

  it("rejects duplicate chunk IDs", () => {
    const duplicate = chunkManifest({
      chunks: [chunk(0, "narr-chunk-001"), chunk(1, "narr-chunk-001")],
    });
    expect(narrationChunkManifestSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects duplicate sequence indexes", () => {
    const duplicate = chunkManifest({
      chunks: [chunk(0, "narr-chunk-001"), { ...chunk(1, "narr-chunk-002"), sequence: 0 }],
    });
    expect(narrationChunkManifestSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects non-contiguous zero-based sequences", () => {
    const gap = chunkManifest({
      chunks: [chunk(0, "narr-chunk-001"), { ...chunk(1, "narr-chunk-002"), sequence: 2 }],
    });
    expect(narrationChunkManifestSchema.safeParse(gap).success).toBe(false);
  });

  it("rejects invalid expected-duration ranges", () => {
    expect(
      narrationChunkValidationReportSchema.safeParse(
        validationReport({
          metrics: {
            ...validationReport().metrics,
            expectedDurationRangeMs: { minMs: 3000, maxMs: 1000 },
          },
        })
      ).success
    ).toBe(false);
  });

  it("rejects invalid intensity and restraint values", () => {
    expect(
      narrationDirectionSetSchema.safeParse(
        directionSet({
          directions: [{ ...directionSet().directions[0], intensity: 1.1 }],
        })
      ).success
    ).toBe(false);
    expect(
      narrationDirectionSetSchema.safeParse(
        directionSet({
          directions: [{ ...directionSet().directions[0], restraint: -0.1 }],
        })
      ).success
    ).toBe(false);
  });

  it("rejects a completed generation record without output metadata", () => {
    const record = generationRecord({
      outputPath: undefined,
      outputHash: undefined,
    });
    expect(narrationChunkGenerationRecordSchema.safeParse(record).success).toBe(false);
  });

  it("accepts a failed generation record without output metadata", () => {
    const record = generationRecord({
      status: "failed",
      outputPath: undefined,
      outputHash: undefined,
      durationMs: undefined,
      providerErrorClassification: "timeout",
      errorMessage: "Provider timed out.",
    });
    expect(narrationChunkGenerationRecordSchema.safeParse(record).success).toBe(true);
  });

  it("rejects a READY quality report with blocking errors", () => {
    const report = qualityGateReport({
      outcome: "READY",
      checks: [
        {
          code: "AUDIO_MISSING",
          status: "failed",
          severity: "error",
          message: "A required chunk is missing.",
        },
      ],
      warningCount: 0,
      errorCount: 1,
    });
    expect(narrationQualityGateReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects duplicate assembly entries", () => {
    const manifest = assemblyManifest({
      entries: [
        assemblyManifest().entries[0],
        { ...assemblyManifest().entries[1], chunkId: "narr-chunk-001" },
      ],
    });
    expect(narrationAssemblyManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects secret-bearing config snapshot fields or values", () => {
    expect(
      narrationConfigurationSnapshotSchema.safeParse({
        ...configSnapshot(),
        apiKey: "sk-test",
      }).success
    ).toBe(false);
    expect(
      narrationConfigurationSnapshotSchema.safeParse({
        ...configSnapshot(),
        model: "contains-secret-token",
      }).success
    ).toBe(false);
  });

  it("keeps inferred types usable under strict TypeScript settings", () => {
    const artifact: SpokenNarrationArtifact = spokenNarrationArtifactSchema.parse(spokenArtifact());
    const manifest: NarrationChunkManifest = narrationChunkManifestSchema.parse(chunkManifest());
    const config: NarrationConfigurationSnapshot = narrationConfigurationSnapshotSchema.parse(configSnapshot());

    expect(artifact.schemaVersion).toBe(NARRATION_ARTIFACT_SCHEMA_VERSION);
    expect(manifest.chunks[0]?.chunkId).toBe("narr-chunk-001");
    expect(config.schemaVersions.narration).toBe(NARRATION_ARTIFACT_SCHEMA_VERSION);
  });

  it("rejects unsupported schema versions", () => {
    expect(
      spokenNarrationArtifactSchema.safeParse({
        ...spokenArtifact(),
        schemaVersion: "narration-artifact-v2",
      }).success
    ).toBe(false);
  });

  it("accepts warning-only and partial-failure fixtures", () => {
    expect(narrationQualityGateReportSchema.safeParse(qualityGateReport()).success).toBe(true);
    expect(
      narrationGenerationMetadataSchema.safeParse(
        generationMetadata({
          stageStatuses: [
            {
              stage: "generation",
              status: "failed",
              startedAt: createdAt,
              completedAt: "2026-01-02T03:04:09.000Z",
              errorCode: "CHUNK_GENERATION_FAILED",
            },
          ],
          usageCounters: {
            chunksRequested: 2,
            chunksGenerated: 1,
            chunksFailed: 1,
            retries: 1,
            cacheHits: 0,
            cacheMisses: 2,
          },
        })
      ).success
    ).toBe(true);
  });

  it("does not mutate input fixtures during parsing", () => {
    const fixture = chunkManifest();
    const before = JSON.stringify(fixture);
    narrationChunkManifestSchema.parse(fixture);
    expect(JSON.stringify(fixture)).toBe(before);
  });
});
