import { z } from "zod";

export const NARRATION_ARTIFACT_SCHEMA_VERSION = "narration-artifact-v1" as const;

const sha256Pattern = /^[a-f0-9]{64}$/u;
const episodeIdPattern = /^[a-z0-9][a-z0-9-]{2,127}$/u;
const localePattern = /^(en|de|es|fr|pt)$/u;
const portablePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\/\/).+$/u;
const chunkIdPattern = /^narr-chunk-[0-9]{3,}$/u;
const codePattern = /^[A-Z][A-Z0-9_:-]{1,63}$/u;
const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const secretKeyPattern = /(?:api[_-]?key|authorization|bearer|token|secret|password|credential)/iu;

const boundedString = (max: number) => z.string().min(1).max(max);
const optionalNote = z.string().max(1000).optional();
const sha256Schema = z.string().regex(sha256Pattern);
const isoTimestampSchema = z.string().datetime({ offset: true });
const episodeIdSchema = z.string().regex(episodeIdPattern);
const localeSchema = z.string().regex(localePattern);
const pathSchema = z.string().regex(portablePathPattern).max(500);
const chunkIdSchema = z.string().regex(chunkIdPattern);
const sequenceSchema = z.number().int().nonnegative();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const nonNegativeNumberSchema = z.number().finite().nonnegative();
const positiveNumberSchema = z.number().finite().positive();
const unitIntervalSchema = z.number().finite().min(0).max(1);
const artifactStatusSchema = z.enum(["pending", "completed", "failed", "skipped"]);
const checkStatusSchema = z.enum(["passed", "warning", "failed", "skipped"]);

export const narrationRoleSchema = z.enum([
  "hook",
  "setup",
  "discovery",
  "escalation",
  "climax",
  "reveal",
  "aftermath",
  "closing",
]);
export type NarrationRole = z.infer<typeof narrationRoleSchema>;

export const narrationMoodSchema = z.enum([
  "neutral",
  "curious",
  "uneasy",
  "urgent",
  "intimate",
  "disturbed",
  "reflective",
]);
export type NarrationMood = z.infer<typeof narrationMoodSchema>;

export const narrationPaceSchema = z.enum(["slow", "measured", "normal", "fast"]);
export type NarrationPace = z.infer<typeof narrationPaceSchema>;

export const narrationFlowIntentSchema = z.enum([
  "concludes",
  "continues",
  "leads_next",
  "unresolved_reveal",
]);
export type NarrationFlowIntent = z.infer<typeof narrationFlowIntentSchema>;

export const validationSeveritySchema = z.enum(["error", "warning", "info"]);
export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;

export const narrationQualityOutcomeSchema = z.enum([
  "READY",
  "READY_WITH_WARNINGS",
  "REGENERATION_RECOMMENDED",
  "BLOCKED",
]);
export type NarrationQualityOutcome = z.infer<typeof narrationQualityOutcomeSchema>;

export const narrationVariantSchema = z.enum(["full", "short"]);
export type NarrationVariant = z.infer<typeof narrationVariantSchema>;

export const narrationGenerationStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "skipped",
]);
export type NarrationGenerationStatus = z.infer<typeof narrationGenerationStatusSchema>;

export const narrationCacheStatusSchema = z.enum(["hit", "miss", "bypass", "stale"]);
export type NarrationCacheStatus = z.infer<typeof narrationCacheStatusSchema>;

const artifactReferenceSchema = z
  .object({
    artifactType: boundedString(80),
    path: pathSchema.optional(),
    fingerprint: sha256Schema,
    schemaVersion: boundedString(80).optional(),
  })
  .strict();

const warningSchema = z
  .object({
    code: z.string().regex(codePattern),
    message: boundedString(1000),
    chunkId: chunkIdSchema.optional(),
  })
  .strict();

const provenanceSchema = z
  .object({
    generator: boundedString(120),
    generatorVersion: boundedString(80).optional(),
    host: boundedString(120).optional(),
    runId: boundedString(120).optional(),
    command: boundedString(500).optional(),
  })
  .strict();

const sourceRangeSchema = z
  .object({
    start: nonNegativeIntegerSchema,
    end: nonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.start > value.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start"],
        message: "Range start must not exceed range end.",
      });
    }
  });

const durationRangeMsSchema = z
  .object({
    minMs: nonNegativeNumberSchema,
    maxMs: nonNegativeNumberSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minMs > value.maxMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minMs"],
        message: "Minimum duration must not exceed maximum duration.",
      });
    }
  });

function uniqueStrings(values: ReadonlyArray<string>): boolean {
  return new Set(values).size === values.length;
}

function uniqueNumbers(values: ReadonlyArray<number>): boolean {
  return new Set(values).size === values.length;
}

function areContiguousZeroBased(values: ReadonlyArray<number>): boolean {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.every((value, index) => value === index);
}

function validateStartedCompletedOrder(
  startedAt: string | undefined,
  completedAt: string | undefined
): boolean {
  if (startedAt === undefined || completedAt === undefined) {
    return true;
  }
  return Date.parse(completedAt) >= Date.parse(startedAt);
}

const fallbackUsageSchema = z
  .object({
    used: z.boolean(),
    reason: z.string().max(500).optional(),
    from: z.string().max(120).optional(),
    to: z.string().max(120).optional(),
  })
  .strict();

/** Metadata for the separately persisted spoken narration Markdown artifact. */
export const spokenNarrationArtifactSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    status: z.enum(["completed", "failed"]).optional(),
    episodeId: episodeIdSchema,
    locale: localeSchema,
    variant: narrationVariantSchema,
    preparationMode: z.enum(["source", "adapted", "manual", "fallback"]),
    sourceStoryPath: pathSchema.optional(),
    sourceArtifact: artifactReferenceSchema.optional(),
    sourceHash: sha256Schema,
    spokenTextPath: pathSchema,
    spokenTextHash: sha256Schema,
    wordCount: nonNegativeIntegerSchema,
    warnings: z.array(warningSchema).max(100),
    createdAt: isoTimestampSchema,
    parentFingerprints: z.array(sha256Schema).max(50).optional(),
    dependencyFingerprints: z.array(sha256Schema).max(50).optional(),
    provenance: provenanceSchema,
    failureMessage: z.string().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status !== "failed" &&
      value.sourceStoryPath === undefined &&
      value.sourceArtifact === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceStoryPath"],
        message: "A source story path or source artifact reference is required.",
      });
    }
    if (value.status === "failed" && value.failureMessage === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureMessage"],
        message: "Failed spoken narration artifacts require a failure message.",
      });
    }
  });
export type SpokenNarrationArtifact = z.infer<typeof spokenNarrationArtifactSchema>;

const narrationChunkSchema = z
  .object({
    chunkId: chunkIdSchema,
    sequence: sequenceSchema,
    text: boundedString(8000),
    textHash: sha256Schema,
    role: narrationRoleSchema,
    estimatedWordCount: nonNegativeIntegerSchema,
    estimatedDurationMs: nonNegativeNumberSchema,
    estimatedDurationSeconds: nonNegativeNumberSchema.optional(),
    previousContextExcerpt: z.string().max(1000),
    nextContextExcerpt: z.string().max(1000),
    sourceParagraphRange: sourceRangeSchema.optional(),
    sourceSentenceRange: sourceRangeSchema.optional(),
    flowIntent: narrationFlowIntentSchema,
    warnings: z.array(warningSchema).max(50).optional(),
  })
  .strict();
export type NarrationChunk = z.infer<typeof narrationChunkSchema>;

/** Ordered manifest for deterministic narration segmentation output. */
export const narrationChunkManifestSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    locale: localeSchema,
    variant: narrationVariantSchema,
    sourceSpokenTextHash: sha256Schema,
    segmentationConfig: z
      .object({
        mode: z.enum(["deterministic", "manual", "fallback"]),
        version: boundedString(80),
        maxWordsPerChunk: nonNegativeIntegerSchema.optional(),
        targetDurationMs: nonNegativeNumberSchema.optional(),
        fingerprint: sha256Schema.optional(),
      })
      .strict(),
    chunks: z.array(narrationChunkSchema).min(1),
    manifestFingerprint: sha256Schema,
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const chunkIds = value.chunks.map((chunk) => chunk.chunkId);
    const sequences = value.chunks.map((chunk) => chunk.sequence);
    if (!uniqueStrings(chunkIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunks"],
        message: "Chunk IDs must be unique.",
      });
    }
    if (!uniqueNumbers(sequences)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunks"],
        message: "Chunk sequence indexes must be unique.",
      });
    }
    if (!areContiguousZeroBased(sequences)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunks"],
        message: "Chunk sequence indexes must be contiguous and zero-based.",
      });
    }
  });
export type NarrationChunkManifest = z.infer<typeof narrationChunkManifestSchema>;

const pronunciationGuidanceReferenceSchema = z
  .object({
    entryId: boundedString(128),
    dictionaryFingerprint: sha256Schema.optional(),
  })
  .strict();

const narrationDirectionSchema = z
  .object({
    chunkId: chunkIdSchema,
    role: narrationRoleSchema,
    mood: narrationMoodSchema,
    pace: narrationPaceSchema,
    intensity: unitIntervalSchema,
    restraint: unitIntervalSchema,
    pauseBeforeMs: nonNegativeNumberSchema,
    pauseAfterMs: nonNegativeNumberSchema,
    emphasisTargets: z.array(boundedString(120)).max(25),
    deliveryNote: z.string().max(1000),
    negativeConstraints: z.array(boundedString(250)).max(25),
    continuityGuidance: z.string().max(1000),
    flowIntent: narrationFlowIntentSchema,
    pronunciationGuidanceReferences: z
      .array(pronunciationGuidanceReferenceSchema)
      .max(50)
      .optional(),
  })
  .strict();
export type NarrationDirection = z.infer<typeof narrationDirectionSchema>;

/** Performance direction set keyed by chunk ID for a chunk manifest. */
export const narrationDirectionSetSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    manifestFingerprint: sha256Schema,
    plannerMode: z.enum(["deterministic", "openai", "manual", "fallback"]),
    plannerVersion: boundedString(80),
    fallbackUsage: fallbackUsageSchema,
    directions: z.array(narrationDirectionSchema).min(1),
    setFingerprint: sha256Schema,
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueStrings(value.directions.map((direction) => direction.chunkId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["directions"],
        message: "Direction chunk IDs must be unique.",
      });
    }
  });
export type NarrationDirectionSet = z.infer<typeof narrationDirectionSetSchema>;

const pronunciationTransformationSchema = z
  .object({
    chunkId: chunkIdSchema,
    entryId: boundedString(128),
    scope: z.enum(["token", "phrase", "chunk"]),
    original: boundedString(500),
    replacement: boundedString(500),
    occurrenceCount: nonNegativeIntegerSchema,
    mandatory: z.boolean(),
  })
  .strict();

const pronunciationCollisionSchema = z
  .object({
    entryIds: z.array(boundedString(128)).min(2).max(20),
    tokenOrPhrase: boundedString(500),
    resolution: z.enum(["skipped", "first-match", "manual-required"]),
  })
  .strict();

const pronunciationSkippedEntrySchema = z
  .object({
    entryId: boundedString(128),
    reason: boundedString(500),
    mandatory: z.boolean(),
  })
  .strict();

const pronunciationScopeSchema = z.enum(["global", "language", "profile", "episode"]);
const pronunciationLiteralSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => !/[\\^$.*+?()[\]{}|]/u.test(value), {
    message: "Pronunciation entries support literal text only.",
  });

export const pronunciationEntrySchema = z
  .object({
    entryId: boundedString(128),
    scope: pronunciationScopeSchema,
    language: z.union([localeSchema, z.literal("global")]),
    profileId: boundedString(128).optional(),
    episodeId: episodeIdSchema.optional(),
    phrase: pronunciationLiteralSchema,
    replacement: boundedString(500),
    mandatory: z.boolean().default(false),
    enabled: z.boolean().default(true),
    note: optionalNote,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "episode" && value.episodeId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["episodeId"],
        message: "Episode pronunciation entries require episodeId.",
      });
    }
    if (value.scope === "profile" && value.profileId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profileId"],
        message: "Profile pronunciation entries require profileId.",
      });
    }
  });
export type PronunciationEntry = z.infer<typeof pronunciationEntrySchema>;

export const pronunciationDictionarySchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION).optional(),
    language: z.union([localeSchema, z.literal("global")]),
    profileId: boundedString(128).optional(),
    episodeId: episodeIdSchema.optional(),
    entries: z.array(pronunciationEntrySchema).max(1000),
    dictionaryFingerprint: sha256Schema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueStrings(value.entries.map((entry) => entry.entryId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "Pronunciation entry IDs must be unique.",
      });
    }
  });
export type PronunciationDictionary = z.infer<typeof pronunciationDictionarySchema>;

/** Audit report for TTS-only pronunciation text transformations. */
export const pronunciationTransformationReportSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    sourceManifestFingerprint: sha256Schema,
    dictionaryFingerprint: sha256Schema,
    language: localeSchema,
    appliedTransformations: z.array(pronunciationTransformationSchema).max(5000),
    collisions: z.array(pronunciationCollisionSchema).max(500),
    skippedEntries: z.array(pronunciationSkippedEntrySchema).max(1000),
    warnings: z.array(warningSchema).max(100),
    reportFingerprint: sha256Schema,
    createdAt: isoTimestampSchema,
  })
  .strict();
export type PronunciationTransformationReport = z.infer<
  typeof pronunciationTransformationReportSchema
>;
export type PronunciationTransformReport = PronunciationTransformationReport;

const outputFormatSchema = z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]);
const providerErrorClassificationSchema = z.enum([
  "authentication",
  "rate_limit",
  "timeout",
  "network",
  "invalid_request",
  "provider_response",
  "unknown",
]);

/** Per-chunk OpenAI TTS generation/cache record. */
export const narrationChunkGenerationRecordSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    chunkId: chunkIdSchema,
    requestFingerprint: sha256Schema,
    generationFingerprint: sha256Schema.optional(),
    inputTextHash: sha256Schema,
    instructionHash: sha256Schema,
    model: boundedString(120),
    voice: boundedString(120),
    speed: positiveNumberSchema.min(0.25).max(4),
    language: localeSchema,
    outputFormat: outputFormatSchema,
    attemptCount: nonNegativeIntegerSchema,
    status: narrationGenerationStatusSchema,
    cacheStatus: narrationCacheStatusSchema,
    outputPath: pathSchema.optional(),
    outputHash: sha256Schema.optional(),
    durationMs: nonNegativeNumberSchema.optional(),
    providerErrorClassification: providerErrorClassificationSchema.optional(),
    errorMessage: z.string().max(1000).optional(),
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
    fallbackUsage: fallbackUsageSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "completed" && (value.outputPath === undefined || value.outputHash === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputHash"],
        message: "Completed generation records require output path and output hash.",
      });
    }
    if (!validateStartedCompletedOrder(value.startedAt, value.completedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedAt"],
        message: "Completion timestamp must not precede start timestamp.",
      });
    }
  });
export type NarrationChunkGenerationRecord = z.infer<
  typeof narrationChunkGenerationRecordSchema
>;

const measuredValueSchema = z.union([z.number().finite(), z.boolean(), boundedString(120)]);

const validationFindingSchema = z
  .object({
    code: z.string().regex(codePattern),
    severity: validationSeveritySchema,
    message: boundedString(1000),
    measuredValue: measuredValueSchema.optional(),
    expectedBound: measuredValueSchema.optional(),
  })
  .strict();

const audioValidationMetricsSchema = z
  .object({
    durationMs: nonNegativeNumberSchema.optional(),
    expectedDurationRangeMs: durationRangeMsSchema.optional(),
    sampleRate: nonNegativeIntegerSchema.optional(),
    channels: nonNegativeIntegerSchema.optional(),
    silencePercentage: unitIntervalSchema.optional(),
    leadingSilenceMs: nonNegativeNumberSchema.optional(),
    trailingSilenceMs: nonNegativeNumberSchema.optional(),
    peakDb: z.number().finite().optional(),
    truePeakDb: z.number().finite().optional(),
    rmsDb: z.number().finite().optional(),
    loudnessLufs: z.number().finite().optional(),
    decodable: z.boolean(),
  })
  .strict();

/** Technical validation report for one generated audio chunk. */
export const narrationChunkValidationReportSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    chunkId: chunkIdSchema,
    requestFingerprint: sha256Schema.optional(),
    generationFingerprint: sha256Schema.optional(),
    audioPath: pathSchema,
    audioHash: sha256Schema,
    validationStatus: z.enum(["passed", "warning", "failed"]),
    metrics: audioValidationMetricsSchema,
    findings: z.array(validationFindingSchema).max(200),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type NarrationChunkValidationReport = z.infer<
  typeof narrationChunkValidationReportSchema
>;
export type ChunkValidationReport = NarrationChunkValidationReport;

const crossfadeSettingsSchema = z
  .object({
    enabled: z.boolean(),
    durationMs: nonNegativeNumberSchema,
    curve: z.enum(["linear", "equal-power"]).optional(),
  })
  .strict();

const assemblyEntrySchema = z
  .object({
    chunkId: chunkIdSchema,
    sequence: sequenceSchema,
    validatedAudioPath: pathSchema,
    audioHash: sha256Schema,
    retainedLeadingSilenceMs: nonNegativeNumberSchema,
    retainedTrailingSilenceMs: nonNegativeNumberSchema,
    insertedPauseMs: nonNegativeNumberSchema,
    crossfade: crossfadeSettingsSchema.optional(),
    validationAcceptanceStatus: z.enum(["accepted", "accepted_with_warnings", "rejected"]),
  })
  .strict();

/** Ordered audio assembly manifest for clean narration output. */
export const narrationAssemblyManifestSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    locale: localeSchema,
    variant: narrationVariantSchema,
    chunkManifestFingerprint: sha256Schema,
    directionSetFingerprint: sha256Schema,
    entries: z.array(assemblyEntrySchema).min(1),
    cleanOutputPath: pathSchema,
    assemblyFingerprint: sha256Schema,
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueStrings(value.entries.map((entry) => entry.chunkId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "Assembly entries must not contain duplicate chunk IDs.",
      });
    }
    if (!uniqueNumbers(value.entries.map((entry) => entry.sequence))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "Assembly entry sequences must be unique.",
      });
    }
    if (!areContiguousZeroBased(value.entries.map((entry) => entry.sequence))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "Assembly entry sequences must be contiguous and zero-based.",
      });
    }
  });
export type NarrationAssemblyManifest = z.infer<typeof narrationAssemblyManifestSchema>;

/** Mastered narration audio metadata and reproducibility inputs. */
export const narrationMasteringMetadataSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    inputPath: pathSchema,
    inputHash: sha256Schema,
    masteringProfileName: boundedString(120),
    masteringProfileVersion: boundedString(80),
    masteringConfigurationFingerprint: sha256Schema,
    outputPath: pathSchema.optional(),
    outputHash: sha256Schema.optional(),
    inputDurationMs: nonNegativeNumberSchema,
    outputDurationMs: nonNegativeNumberSchema.optional(),
    targetLoudnessLufs: z.number().finite(),
    measuredLoudnessLufs: z.number().finite().optional(),
    truePeakTargetDb: z.number().finite(),
    measuredTruePeakDb: z.number().finite().optional(),
    sampleRate: nonNegativeIntegerSchema,
    codec: boundedString(40),
    bitrateKbps: positiveNumberSchema.optional(),
    status: artifactStatusSchema,
    warnings: z.array(warningSchema).max(100),
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "completed" && (value.outputPath === undefined || value.outputHash === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputHash"],
        message: "Completed mastering metadata requires output path and output hash.",
      });
    }
  });
export type NarrationMasteringMetadata = z.infer<typeof narrationMasteringMetadataSchema>;

const qualityGateCheckSchema = z
  .object({
    code: z.string().regex(codePattern),
    status: checkStatusSchema,
    severity: validationSeveritySchema,
    message: boundedString(1000),
    artifactReference: artifactReferenceSchema.optional(),
    chunkId: chunkIdSchema.optional(),
  })
  .strict();

const fallbackSummarySchema = z
  .object({
    used: z.boolean(),
    count: nonNegativeIntegerSchema,
    reasons: z.array(boundedString(300)).max(50),
  })
  .strict();

/** Final narration readiness report consumed by migration and inspection tasks. */
export const narrationQualityGateReportSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    locale: localeSchema,
    variant: narrationVariantSchema,
    outcome: narrationQualityOutcomeSchema,
    inputArtifactFingerprints: z.array(sha256Schema).min(1).max(100),
    checks: z.array(qualityGateCheckSchema).max(500),
    warningCount: nonNegativeIntegerSchema,
    errorCount: nonNegativeIntegerSchema,
    fallbackSummary: fallbackSummarySchema,
    compatibilityOutputStatus: z.enum(["not_written", "written", "failed", "skipped"]),
    cleanNarrationPath: pathSchema,
    masteredNarrationPath: pathSchema.optional(),
    reportFingerprint: sha256Schema,
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const warningCount = value.checks.filter((check) => check.severity === "warning").length;
    const errorCount = value.checks.filter((check) => check.severity === "error").length;
    if (value.warningCount !== warningCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["warningCount"],
        message: "Warning count must match warning-severity checks.",
      });
    }
    if (value.errorCount !== errorCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errorCount"],
        message: "Error count must match error-severity checks.",
      });
    }
    if (value.outcome === "READY" && errorCount > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outcome"],
        message: "READY quality reports must not contain error-severity checks.",
      });
    }
  });
export type NarrationQualityGateReport = z.infer<typeof narrationQualityGateReportSchema>;

const languageOverrideSchema = z
  .object({
    locale: localeSchema,
    voice: boundedString(120).optional(),
    speed: positiveNumberSchema.min(0.25).max(4).optional(),
    instructionsProfileId: boundedString(120).optional(),
  })
  .strict();

const variantOverrideSchema = z
  .object({
    variant: narrationVariantSchema,
    maxWordsPerChunk: nonNegativeIntegerSchema.optional(),
    masteringProfileId: boundedString(120).optional(),
  })
  .strict();

const chunkingConfigurationSchema = z
  .object({
    mode: z.enum(["deterministic", "manual"]),
    targetWordsPerChunk: nonNegativeIntegerSchema,
    maxWordsPerChunk: nonNegativeIntegerSchema,
    targetDurationMs: nonNegativeNumberSchema,
    maxDurationMs: nonNegativeNumberSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.targetWordsPerChunk > value.maxWordsPerChunk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetWordsPerChunk"],
        message: "Target words must not exceed maximum words.",
      });
    }
    if (value.targetDurationMs > value.maxDurationMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDurationMs"],
        message: "Target duration must not exceed maximum duration.",
      });
    }
  });

const safeIdentifierArraySchema = z.array(z.string().regex(identifierPattern)).max(100);

/** Whitelisted non-secret configuration snapshot for reproducible narration runs. */
export const narrationConfigurationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    model: boundedString(120),
    voice: boundedString(120),
    fallbackVoice: boundedString(120).optional(),
    outputFormat: outputFormatSchema,
    speed: positiveNumberSchema.min(0.25).max(4),
    timeoutMs: positiveNumberSchema,
    retries: nonNegativeIntegerSchema,
    concurrency: positiveNumberSchema,
    languageOverrides: z.array(languageOverrideSchema).max(25),
    variantOverrides: z.array(variantOverrideSchema).max(10),
    chunking: chunkingConfigurationSchema,
    instructionProfileIds: safeIdentifierArraySchema,
    masteringProfileId: z.string().regex(identifierPattern),
    schemaVersions: z.record(z.string().regex(identifierPattern), boundedString(80)),
    promptVersions: z.record(z.string().regex(identifierPattern), boundedString(80)),
    snapshotFingerprint: sha256Schema,
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const json = JSON.stringify(value);
    if (secretKeyPattern.test(json)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuration snapshots must not contain secret-bearing keys or values.",
      });
    }
  });
export type NarrationConfigurationSnapshot = z.infer<
  typeof narrationConfigurationSnapshotSchema
>;

const stageStatusSchema = z
  .object({
    stage: z.enum([
      "spoken_narration",
      "segmentation",
      "directions",
      "pronunciation",
      "generation",
      "validation",
      "assembly",
      "mastering",
      "quality_gate",
    ]),
    status: artifactStatusSchema,
    startedAt: isoTimestampSchema.optional(),
    completedAt: isoTimestampSchema.optional(),
    fingerprint: sha256Schema.optional(),
    errorCode: z.string().regex(codePattern).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!validateStartedCompletedOrder(value.startedAt, value.completedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedAt"],
        message: "Completion timestamp must not precede start timestamp.",
      });
    }
  });

const usageCountersSchema = z
  .object({
    chunksRequested: nonNegativeIntegerSchema,
    chunksGenerated: nonNegativeIntegerSchema,
    chunksFailed: nonNegativeIntegerSchema,
    retries: nonNegativeIntegerSchema,
    cacheHits: nonNegativeIntegerSchema,
    cacheMisses: nonNegativeIntegerSchema,
  })
  .strict();

/** Top-level provenance/orchestration metadata for a narration pipeline run. */
export const narrationGenerationMetadataSchema = z
  .object({
    schemaVersion: z.literal(NARRATION_ARTIFACT_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    locale: localeSchema,
    variant: narrationVariantSchema,
    pipelineMode: z.enum(["legacy", "shadow", "new"]),
    sourceHashes: z
      .object({
        storyHash: sha256Schema,
        spokenTextHash: sha256Schema.optional(),
      })
      .strict(),
    artifactFingerprints: z.array(artifactReferenceSchema).max(100),
    stageStatuses: z.array(stageStatusSchema).max(20),
    openAi: z
      .object({
        model: boundedString(120),
        voice: boundedString(120),
      })
      .strict(),
    usageCounters: usageCountersSchema,
    fallbackUsage: fallbackSummarySchema,
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
    finalOutputs: z
      .object({
        cleanNarrationPath: pathSchema.optional(),
        masteredNarrationPath: pathSchema.optional(),
        compatibilityNarrationPath: pathSchema.optional(),
        rootCompatibilityNarrationPath: pathSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!validateStartedCompletedOrder(value.startedAt, value.completedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedAt"],
        message: "Completion timestamp must not precede start timestamp.",
      });
    }
  });
export type NarrationGenerationMetadata = z.infer<typeof narrationGenerationMetadataSchema>;

export type NarrationWarning = z.infer<typeof warningSchema>;
