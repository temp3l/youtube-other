import { normalizeLocaleCode } from "@mediaforge/shared";
import { z } from "zod";
import {
  artifactOwners,
  artifactProvenances,
  batchItemStatuses,
  batchSubmissionStatuses,
  cacheStatuses,
  deterministicValidationStatuses,
  failureCategories,
  qualityGateStatuses,
  retryabilities,
  stageFailureSchemaVersion,
  stageOutcomeSchemaVersion,
  stageStatuses,
  stageTypes,
  storyFormats,
  terminalStageStatuses,
  workflowLocales,
  workflowSchemaVersion,
} from "./story-workflow.types.js";

const workflowSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const compactTimestampPattern = /^\d{8}T\d{6}Z$/u;
const isoUtcDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const episodeIdPattern = /^[a-z0-9][a-z0-9-]*$/u;
const shortHashPattern = /^[a-f0-9]{8}$/u;
const hexFingerprintPattern = /^[a-f0-9]{8,128}$/u;

function normalizeLocaleInput(
  value: string,
  context: z.RefinementCtx
): (typeof workflowLocales)[number] | typeof z.NEVER {
  try {
    const normalized = normalizeLocaleCode(value);
    if (!workflowLocales.includes(normalized)) {
      context.addIssue({
        code: "custom",
        message: `Unsupported locale code: ${value}`,
      });
      return z.NEVER;
    }
    return normalized;
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : `Invalid locale code: ${value}`,
    });
    return z.NEVER;
  }
}

function parseStageId(value: string): boolean {
  const parts = value.split(":");
  if (parts[0] !== "stage" || parts.length < 2 || parts.length > 4) {
    return false;
  }
  if (!stageTypes.includes(parts[1] as (typeof stageTypes)[number])) {
    return false;
  }
  if (parts.length >= 3) {
    try {
      normalizeLocaleCode(parts[2]!);
    } catch {
      return false;
    }
  }
  if (parts.length === 4) {
    if (!storyFormats.includes(parts[3] as (typeof storyFormats)[number])) {
      return false;
    }
  }
  return true;
}

function parseArtifactId(value: string): boolean {
  const parts = value.split(":");
  if (parts[0] !== "artifact" || parts.length < 5 || parts.length > 7) {
    return false;
  }
  const hash = parts.at(-1);
  const owner = parts.at(-2);
  if (!hash || !shortHashPattern.test(hash)) {
    return false;
  }
  if (!owner || !artifactOwners.includes(owner as (typeof artifactOwners)[number])) {
    return false;
  }
  const middle = parts.slice(1, -2);
  if (middle.length < 1 || middle.length > 3) {
    return false;
  }
  const [episodeId, locale, format] = middle;
  if (!episodeId || !episodeIdPattern.test(episodeId)) {
    return false;
  }
  if (locale) {
    try {
      normalizeLocaleCode(locale);
    } catch {
      return false;
    }
  }
  if (format && !storyFormats.includes(format as (typeof storyFormats)[number])) {
    return false;
  }
  return true;
}

function parseWorkflowId(value: string): boolean {
  const parts = value.split("_");
  return (
    parts.length === 4 &&
    parts[0] === "wf" &&
    workflowSlugPattern.test(parts[1] ?? "") &&
    compactTimestampPattern.test(parts[2] ?? "") &&
    shortHashPattern.test(parts[3] ?? "")
  );
}

function parseExecutionId(value: string): boolean {
  const parts = value.split("_");
  return (
    parts.length === 3 &&
    parts[0] === "exec" &&
    compactTimestampPattern.test(parts[1] ?? "") &&
    shortHashPattern.test(parts[2] ?? "")
  );
}

const detailsValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
const detailsSchema = z.record(z.string().min(1), detailsValueSchema);

export const workflowLocaleSchema = z
  .string()
  .trim()
  .min(1)
  .transform(normalizeLocaleInput);

export const storyFormatSchema = z.enum(storyFormats);
export const stageTypeSchema = z.enum(stageTypes);
export const artifactOwnerSchema = z.enum(artifactOwners);
export const artifactProvenanceSchema = z.enum(artifactProvenances);
export const stageStatusSchema = z.enum(stageStatuses);
export const terminalStageStatusSchema = z.enum(terminalStageStatuses);
export const retryabilitySchema = z.enum(retryabilities);
export const failureCategorySchema = z.enum(failureCategories);
export const qualityGateStatusSchema = z.enum(qualityGateStatuses);
export const deterministicValidationStatusSchema = z.enum(
  deterministicValidationStatuses
);
export const cacheStatusSchema = z.enum(cacheStatuses);
export const batchSubmissionStatusSchema = z.enum(batchSubmissionStatuses);
export const batchItemStatusSchema = z.enum(batchItemStatuses);

export const workflowIdSchema = z
  .string()
  .trim()
  .refine(parseWorkflowId, {
    message: "Invalid workflow id. Expected wf_<slug>_<timestamp>_<hash8>.",
  })
  .transform((value) => value as import("./story-workflow.types.js").WorkflowId);

export const executionIdSchema = z
  .string()
  .trim()
  .refine(parseExecutionId, {
    message: "Invalid execution id. Expected exec_<timestamp>_<hash8>.",
  })
  .transform((value) => value as import("./story-workflow.types.js").ExecutionId);

export const stageIdSchema = z
  .string()
  .trim()
  .refine(parseStageId, {
    message: "Invalid stage id.",
  })
  .transform((value) => value as import("./story-workflow.types.js").StageId);

export const artifactIdSchema = z
  .string()
  .trim()
  .refine(parseArtifactId, {
    message: "Invalid artifact id.",
  })
  .transform((value) => value as import("./story-workflow.types.js").ArtifactId);

export const providerBatchIdSchema = z
  .string()
  .trim()
  .min(1)
  .transform(
    (value) => value as import("./story-workflow.types.js").ProviderBatchId
  );

export const episodeIdSchema = z.string().trim().regex(episodeIdPattern);
export const fingerprintSchema = z.string().trim().regex(hexFingerprintPattern);
export const isoUtcDateTimeSchema = z
  .string()
  .trim()
  .regex(isoUtcDateTimePattern, "Expected UTC ISO-8601 timestamp.")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid timestamp value.",
  });

export const stageWarningSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    emittedAt: isoUtcDateTimeSchema,
    details: detailsSchema.optional(),
  })
  .strict();

export const stageFailureSchema = z
  .object({
    schemaVersion: z.literal(stageFailureSchemaVersion),
    category: failureCategorySchema,
    retryability: retryabilitySchema,
    message: z.string().trim().min(1),
    occurredAt: isoUtcDateTimeSchema,
    providerStatusCode: z.number().int().nonnegative().optional(),
    providerErrorCode: z.string().trim().min(1).optional(),
    causeStageId: stageIdSchema.optional(),
    details: detailsSchema.optional(),
  })
  .strict();

export const costMetricsSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
    estimatedCostMicros: z.number().int().nonnegative().nullable(),
    actualCostMicros: z.number().int().nonnegative().nullable(),
    pricingVersion: z.string().trim().min(1).optional(),
  })
  .strict();

export const cacheMetadataSchema = z
  .object({
    status: cacheStatusSchema,
    cacheKey: z.string().trim().min(1).optional(),
    cacheSchemaVersion: z.string().trim().min(1).optional(),
    reusedArtifactId: artifactIdSchema.optional(),
    invalidationReasons: z.array(z.string().trim().min(1)),
  })
  .strict();

export const fingerprintInputsSchema = z
  .object({
    sourceFingerprint: fingerprintSchema.optional(),
    parentFingerprints: z.array(fingerprintSchema),
    promptFingerprint: fingerprintSchema.optional(),
    schemaFingerprint: fingerprintSchema.optional(),
    model: z.string().trim().min(1).optional(),
    reasoningEffort: z.string().trim().min(1).optional(),
    configFingerprint: fingerprintSchema.optional(),
    workflowSchemaVersion: z.string().trim().min(1),
  })
  .strict();

export const artifactLineageSchema = z
  .object({
    artifactId: artifactIdSchema,
    artifactType: z.string().trim().min(1),
    owner: artifactOwnerSchema,
    locale: workflowLocaleSchema.optional(),
    format: storyFormatSchema.optional(),
    provenance: artifactProvenanceSchema,
    path: z.string().trim().min(1),
    fingerprint: fingerprintSchema,
    schemaVersion: z.string().trim().min(1),
    parents: z.array(artifactIdSchema),
    sourceStageId: stageIdSchema,
  })
  .strict();

export const stageOutcomeObservabilitySchema = z
  .object({
    attemptNumber: z.number().int().positive(),
    durationMs: z.number().int().nonnegative(),
    model: z.string().trim().min(1).optional(),
    reasoningEffort: z.string().trim().min(1).optional(),
    providerRequestId: z.string().trim().min(1).optional(),
    providerBatchId: providerBatchIdSchema.optional(),
  })
  .strict();

export function createStageOutcomeSchema<TArtifact extends z.ZodTypeAny>(
  artifactSchema: TArtifact
) {
  const baseSchema = z
    .object({
      schemaVersion: z.literal(stageOutcomeSchemaVersion),
      stageId: stageIdSchema,
      executionId: executionIdSchema,
      fingerprintInputs: fingerprintInputsSchema,
      cache: cacheMetadataSchema,
      warnings: z.array(stageWarningSchema),
      cost: costMetricsSchema,
      startedAt: isoUtcDateTimeSchema,
      completedAt: isoUtcDateTimeSchema,
      observability: stageOutcomeObservabilitySchema,
    })
    .strict()
    .refine(
      (value) => Date.parse(value.startedAt) <= Date.parse(value.completedAt),
      {
        message: "startedAt must be before or equal to completedAt.",
        path: ["startedAt"],
      }
    );

  const successSchema = baseSchema
    .extend({
      status: z.enum(["succeeded", "cached"]),
      artifact: artifactSchema,
      provenance: artifactProvenanceSchema,
    })
    .strict();

  const failureSchema = baseSchema
    .extend({
      status: z.enum(["failed", "blocked", "skipped", "cancelled"]),
      failure: stageFailureSchema,
    })
    .strict();

  return z.discriminatedUnion("status", [successSchema, failureSchema]);
}

export const stageOutcomeSchema = createStageOutcomeSchema(artifactLineageSchema);

export const qualityGateDecisionSchema = z
  .object({
    status: qualityGateStatusSchema,
    pass: z.boolean(),
    profile: z.string().trim().min(1),
    gateVersion: z.string().trim().min(1),
    deterministicValidationStatus: deterministicValidationStatusSchema,
    analysisArtifactId: artifactIdSchema.optional(),
    failedChecks: z.array(z.string().trim().min(1)),
    warnings: z.array(stageWarningSchema),
  })
  .strict()
  .refine(
    (value) =>
      (value.status === "READY" || value.status === "READY_WITH_MINOR_EDITS") ===
      value.pass,
    {
      message: "pass must match the quality status semantics.",
      path: ["pass"],
    }
  );

export const batchItemStateSchema = z
  .object({
    customId: z.string().trim().min(1),
    stageId: stageIdSchema,
    locale: workflowLocaleSchema.optional(),
    format: storyFormatSchema.optional(),
    artifactId: artifactIdSchema.optional(),
    retryParentCustomId: z.string().trim().min(1).optional(),
    providerRequestId: z.string().trim().min(1).optional(),
    status: batchItemStatusSchema,
    updatedAt: isoUtcDateTimeSchema,
    failure: stageFailureSchema.optional(),
    fingerprintInputs: fingerprintInputsSchema,
  })
  .strict();

export const batchSubmissionSchema = z
  .object({
    id: z.string().trim().min(1),
    status: batchSubmissionStatusSchema,
    category: z.string().trim().min(1),
    operation: z.string().trim().min(1),
    endpoint: z.string().trim().min(1).optional(),
    providerBatchId: providerBatchIdSchema.optional(),
    localManifestPath: z.string().trim().min(1).optional(),
    inputFilePath: z.string().trim().min(1).optional(),
    outputFilePath: z.string().trim().min(1).optional(),
    errorFilePath: z.string().trim().min(1).optional(),
    stageIds: z.array(stageIdSchema),
    items: z.array(batchItemStateSchema),
    createdAt: isoUtcDateTimeSchema,
    updatedAt: isoUtcDateTimeSchema,
    completedAt: isoUtcDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.createdAt) <= Date.parse(value.updatedAt),
    {
      message: "updatedAt must be after or equal to createdAt.",
      path: ["updatedAt"],
    }
  );

export const workflowStageStateSchema = z
  .object({
    stageId: stageIdSchema,
    stageType: stageTypeSchema,
    locale: workflowLocaleSchema.optional(),
    format: storyFormatSchema.optional(),
    dependsOn: z.array(stageIdSchema),
    status: stageStatusSchema,
    fingerprintInputs: fingerprintInputsSchema,
    cache: cacheMetadataSchema,
    latestExecutionId: executionIdSchema.optional(),
    latestCompletedAt: isoUtcDateTimeSchema.optional(),
    qualityDecision: qualityGateDecisionSchema.optional(),
    latestOutcome: stageOutcomeSchema.optional(),
  })
  .strict();

export const workflowManifestSchema = z
  .object({
    schemaVersion: z.literal(workflowSchemaVersion),
    workflowId: workflowIdSchema,
    executionId: executionIdSchema,
    episodeId: episodeIdSchema,
    locales: z.array(workflowLocaleSchema),
    formats: z.array(storyFormatSchema),
    createdAt: isoUtcDateTimeSchema,
    updatedAt: isoUtcDateTimeSchema,
    plannedStageCount: z.number().int().nonnegative(),
    stages: z.array(workflowStageStateSchema),
    attemptHistory: z.array(stageOutcomeSchema),
    artifacts: z.array(artifactLineageSchema),
    batches: z.array(batchSubmissionSchema),
    warnings: z.array(stageWarningSchema),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.createdAt) <= Date.parse(value.updatedAt),
    {
      message: "updatedAt must be after or equal to createdAt.",
      path: ["updatedAt"],
    }
  )
  .refine((value) => value.plannedStageCount === value.stages.length, {
    message: "plannedStageCount must match stages length.",
    path: ["plannedStageCount"],
  });
