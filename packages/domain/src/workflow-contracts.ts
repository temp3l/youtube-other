import { z } from "zod";

export const DOMAIN_CONTRACT_VERSION = "1.0.0" as const;
export const PROFILE_SCHEMA_VERSION = "mediaforge.profile.v1" as const;
export const TASK_SCHEMA_VERSION = "mediaforge.task.v1" as const;
export const ARTIFACT_SCHEMA_VERSION = "mediaforge.artifact.v1" as const;
export const WORKFLOW_SCHEMA_VERSION = "mediaforge.workflow.v1" as const;
export const QUALITY_SCHEMA_VERSION = "mediaforge.quality.v1" as const;
export const APPROVAL_SCHEMA_VERSION = "mediaforge.approval.v1" as const;
export const BATCH_SCHEMA_VERSION = "mediaforge.batch.v1" as const;
export const ERROR_SCHEMA_VERSION = "mediaforge.error.v1" as const;
export const OVERRIDE_SCHEMA_VERSION = "mediaforge.override.v1" as const;

export const DOMAIN_SCHEMA_VERSIONS = {
  profile: PROFILE_SCHEMA_VERSION,
  task: TASK_SCHEMA_VERSION,
  artifact: ARTIFACT_SCHEMA_VERSION,
  workflow: WORKFLOW_SCHEMA_VERSION,
  quality: QUALITY_SCHEMA_VERSION,
  approval: APPROVAL_SCHEMA_VERSION,
  batch: BATCH_SCHEMA_VERSION,
  error: ERROR_SCHEMA_VERSION,
  override: OVERRIDE_SCHEMA_VERSION,
} as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const namespacedIdentifierPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u;
const revisionPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const revisionSchema = z.string().min(1).max(160).regex(revisionPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

function brandedIdentifier<TBrand extends string>(brand: TBrand) {
  return identifierSchema.brand<TBrand>();
}

function namespacedBrandedIdentifier<TBrand extends string>(brand: TBrand) {
  return z
    .string()
    .min(3)
    .max(160)
    .regex(namespacedIdentifierPattern)
    .brand<TBrand>();
}

export const productionUnitIdSchema = brandedIdentifier("ProductionUnitId");
export type ProductionUnitId = z.infer<typeof productionUnitIdSchema>;
export const taskIdSchema = namespacedBrandedIdentifier("TaskId");
export type TaskId = z.infer<typeof taskIdSchema>;
export const workflowIdSchema = namespacedBrandedIdentifier("WorkflowId");
export type WorkflowId = z.infer<typeof workflowIdSchema>;
export const workflowInstanceIdSchema = brandedIdentifier("WorkflowInstanceId");
export type WorkflowInstanceId = z.infer<typeof workflowInstanceIdSchema>;
export const workflowRunIdSchema = brandedIdentifier("WorkflowRunId");
export type WorkflowRunId = z.infer<typeof workflowRunIdSchema>;
export const attemptIdSchema = brandedIdentifier("AttemptId");
export type AttemptId = z.infer<typeof attemptIdSchema>;
export const approvalIdSchema = brandedIdentifier("ApprovalId");
export type ApprovalId = z.infer<typeof approvalIdSchema>;
export const batchIdSchema = brandedIdentifier("BatchId");
export type BatchId = z.infer<typeof batchIdSchema>;
export const batchItemIdSchema = brandedIdentifier("BatchItemId");
export type BatchItemId = z.infer<typeof batchItemIdSchema>;
export const artifactManifestIdSchema = brandedIdentifier("ArtifactManifestId");
export type ArtifactManifestId = z.infer<typeof artifactManifestIdSchema>;

export const CONTENT_PROFILE_IDS = [
  "dark-truth",
  "mathematics-education",
] as const;
export const contentProfileIdSchema = z.enum(CONTENT_PROFILE_IDS);
export type ContentProfileId = z.infer<typeof contentProfileIdSchema>;

export const CONTENT_VARIANTS = ["full", "short"] as const;
export const contentVariantSchema = z.enum(CONTENT_VARIANTS);
export type ContentVariant = z.infer<typeof contentVariantSchema>;

export const SUPPORTED_CONTENT_LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "pt",
] as const;
export const contentLocaleSchema = z.enum(SUPPORTED_CONTENT_LOCALES);
export type ContentLocale = z.infer<typeof contentLocaleSchema>;

const audienceDefinitionSchema = z
  .object({
    ageMinimum: z.number().int().min(0).max(120),
    ageMaximum: z.number().int().min(0).max(120),
    description: nonEmptyStringSchema,
    priorKnowledge: z.array(nonEmptyStringSchema),
    accessibilityNeeds: z.array(nonEmptyStringSchema),
  })
  .strict()
  .refine((value) => value.ageMinimum <= value.ageMaximum, {
    message: "Audience minimum age must not exceed maximum age.",
    path: ["ageMinimum"],
  });

const policyReferenceSchema = z
  .object({
    id: namespacedBrandedIdentifier("PolicyId"),
    version: revisionSchema,
  })
  .strict();

const profileBaseShape = {
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  contractVersion: z.literal(DOMAIN_CONTRACT_VERSION),
  audience: audienceDefinitionSchema,
  objective: nonEmptyStringSchema,
  engagementStrategies: z.array(nonEmptyStringSchema).min(1),
  qualityPolicies: z.array(policyReferenceSchema).min(1),
  visualPolicy: policyReferenceSchema,
  narrationPolicy: policyReferenceSchema,
  localizationPolicy: policyReferenceSchema,
  approvalPolicy: policyReferenceSchema,
  artifactRequirements: z.array(policyReferenceSchema),
  referencePolicy: policyReferenceSchema,
};

export const darkTruthContentProfileSchema = z
  .object({
    ...profileBaseShape,
    id: z.literal("dark-truth"),
    narrativeMode: z.literal("dark-documentary"),
    supernaturalRuleRequired: z.boolean(),
    referenceImagesRequired: z.boolean(),
  })
  .strict();
export type DarkTruthContentProfile = z.infer<
  typeof darkTruthContentProfileSchema
>;

export const mathematicsEducationContentProfileSchema = z
  .object({
    ...profileBaseShape,
    id: z.literal("mathematics-education"),
    curriculumJurisdiction: nonEmptyStringSchema,
    curriculumRevision: revisionSchema,
    grade: z.number().int().min(1).max(13),
    deterministicVerificationRequired: z.literal(true),
  })
  .strict();
export type MathematicsEducationContentProfile = z.infer<
  typeof mathematicsEducationContentProfileSchema
>;

export const contentProfileSchema = z.discriminatedUnion("id", [
  darkTruthContentProfileSchema,
  mathematicsEducationContentProfileSchema,
]);
export type ContentProfile = z.infer<typeof contentProfileSchema>;

export const ARTIFACT_KINDS = [
  "source",
  "transcript",
  "story-bible",
  "reference-manifest",
  "full-script",
  "short-script",
  "scene-plan",
  "shot-plan",
  "image",
  "thumbnail",
  "narration",
  "captions",
  "render",
  "metadata",
  "publish-report",
  "curriculum",
  "lesson-specification",
  "math-verification",
  "educational-visual-style",
  "quality-assessment",
] as const;
export const artifactKindSchema = z.enum(ARTIFACT_KINDS);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const ARTIFACT_FORMATS = [
  "json",
  "md",
  "txt",
  "wav",
  "mp3",
  "srt",
  "vtt",
  "ass",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "mp4",
] as const;
export const artifactFormatSchema = z.enum(ARTIFACT_FORMATS);
export type ArtifactFormat = z.infer<typeof artifactFormatSchema>;

export const ARTIFACT_RENDER_PROFILES = [
  "youtube",
  "vertical",
  "educational",
] as const;
export const artifactRenderProfileSchema = z.enum(ARTIFACT_RENDER_PROFILES);
export type ArtifactRenderProfile = z.infer<typeof artifactRenderProfileSchema>;

export const artifactRefSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
    unitId: productionUnitIdSchema,
    profileId: contentProfileIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    kind: artifactKindSchema,
    artifactKey: identifierSchema.optional(),
    format: artifactFormatSchema.optional(),
    renderProfile: artifactRenderProfileSchema.optional(),
    artifactRevision: revisionSchema,
    workflowRevision: revisionSchema,
    policyRevision: revisionSchema,
    referenceSetRevision: revisionSchema.optional(),
  })
  .strict();
export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export const artifactContractSchema = z
  .object({
    kind: artifactKindSchema,
    required: z.boolean(),
    schemaId: namespacedBrandedIdentifier("ArtifactSchemaId"),
    schemaVersion: revisionSchema,
  })
  .strict();
export type ArtifactContract = z.infer<typeof artifactContractSchema>;

export const artifactManifestSchema = z
  .object({
    schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
    id: artifactManifestIdSchema,
    ref: artifactRefSchema,
    relativePath: z.string().min(1),
    checksumSha256: sha256Schema,
    sizeBytes: z.number().int().nonnegative(),
    mediaType: nonEmptyStringSchema,
    producerTaskId: taskIdSchema,
    producerTaskVersion: revisionSchema,
    producerAttemptId: attemptIdSchema,
    producerSucceeded: z.literal(true),
    validation: z
      .object({
        status: z.literal("passed"),
        validatorId: namespacedBrandedIdentifier("ValidatorId"),
        validatorVersion: revisionSchema,
        validatedAt: isoDateTimeSchema,
      })
      .strict(),
    dependencyFingerprints: z.array(sha256Schema),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export const TASK_EXECUTION_KINDS = [
  "deterministic",
  "model-assisted",
  "provider-dependent",
  "manual-approval",
  "irreversible",
] as const;
export const taskExecutionKindSchema = z.enum(TASK_EXECUTION_KINDS);
export type TaskExecutionKind = z.infer<typeof taskExecutionKindSchema>;

const taskDependencySchema = z
  .object({
    taskId: taskIdSchema,
    optional: z.boolean(),
  })
  .strict();

const taskPolicySchema = z
  .object({
    cache: z.enum(["disabled", "fingerprint"]),
    retryLimit: z.number().int().min(0).max(20),
    timeoutMs: z.number().int().positive(),
    lockScope: z.enum(["none", "unit", "task", "artifact"]),
    approvalRequired: z.boolean(),
    batchable: z.boolean(),
    provider: z.enum(["none", "optional", "required"]),
    estimatedCostClass: z.enum(["none", "low", "medium", "high"]),
  })
  .strict();

export { taskDependencySchema, taskPolicySchema };
export type TaskDependency = z.infer<typeof taskDependencySchema>;
export type TaskPolicy = z.infer<typeof taskPolicySchema>;

export const taskDefinitionSchema = z
  .object({
    schemaVersion: z.literal(TASK_SCHEMA_VERSION),
    id: taskIdSchema,
    implementationVersion: revisionSchema,
    displayName: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    applicableProfiles: z.array(contentProfileIdSchema).min(1),
    dependencies: z.array(taskDependencySchema),
    inputs: z.array(artifactContractSchema),
    outputs: z.array(artifactContractSchema),
    executionKind: taskExecutionKindSchema,
    policies: taskPolicySchema,
    cli: z
      .object({
        resource: z.enum(["episode", "lesson", "task"]),
        command: nonEmptyStringSchema,
        examples: z.array(nonEmptyStringSchema),
      })
      .strict(),
    observability: z
      .object({
        operationName: namespacedBrandedIdentifier("OperationName"),
        redactedFields: z.array(nonEmptyStringSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const dependencyIds = value.dependencies.map(
      (dependency) => dependency.taskId
    );
    if (new Set(dependencyIds).size !== dependencyIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["dependencies"],
        message: "Task dependencies must be unique.",
      });
    }
    if (
      value.executionKind === "irreversible" &&
      !value.policies.approvalRequired
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["policies", "approvalRequired"],
        message: "Irreversible tasks require approval.",
      });
    }
  });
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;

export const taskFingerprintSchema = sha256Schema.brand<"TaskFingerprint">();
export type TaskFingerprint = z.infer<typeof taskFingerprintSchema>;

export const taskInputSchema = z
  .object({
    schemaVersion: z.literal(TASK_SCHEMA_VERSION),
    taskId: taskIdSchema,
    taskVersion: revisionSchema,
    workflowInstanceId: workflowInstanceIdSchema,
    runId: workflowRunIdSchema,
    unitId: productionUnitIdSchema,
    profileId: contentProfileIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    inputArtifacts: z.array(artifactRefSchema),
    fingerprint: taskFingerprintSchema,
  })
  .strict();
export type TaskInput = z.infer<typeof taskInputSchema>;

export const WORKFLOW_TASK_STATUSES = [
  "pending",
  "ready",
  "blocked",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "skipped",
  "invalidated",
  "awaiting-approval",
] as const;
export const workflowTaskStatusSchema = z.enum(WORKFLOW_TASK_STATUSES);
export type WorkflowTaskStatus = z.infer<typeof workflowTaskStatusSchema>;

export const workflowDefinitionSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
    id: workflowIdSchema,
    revision: revisionSchema,
    profileId: contentProfileIdSchema,
    taskIds: z.array(taskIdSchema).min(1),
  })
  .strict()
  .refine((value) => new Set(value.taskIds).size === value.taskIds.length, {
    message: "Workflow task IDs must be unique.",
    path: ["taskIds"],
  });
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

const workflowTaskStateBase = {
  taskId: taskIdSchema,
  updatedAt: isoDateTimeSchema,
};
export const workflowTaskStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...workflowTaskStateBase,
      status: z.enum(["pending", "ready"]),
      reasons: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      ...workflowTaskStateBase,
      status: z.enum(["blocked", "awaiting-approval"]),
      reasons: z.array(nonEmptyStringSchema).min(1),
    })
    .strict(),
  z
    .object({
      ...workflowTaskStateBase,
      status: z.literal("running"),
      attemptId: attemptIdSchema,
      startedAt: isoDateTimeSchema,
    })
    .strict(),
  z
    .object({
      ...workflowTaskStateBase,
      status: z.literal("succeeded"),
      attemptId: attemptIdSchema.optional(),
      overrideId: brandedIdentifier("OperatorOverrideId").optional(),
      outputManifestIds: z.array(artifactManifestIdSchema),
      completedAt: isoDateTimeSchema,
    })
    .strict()
    .refine(
      (value) =>
        (value.attemptId === undefined) !== (value.overrideId === undefined),
      {
        message: "Succeeded state requires exactly one attempt or override ID.",
      }
    ),
  z
    .object({
      ...workflowTaskStateBase,
      status: z.enum(["failed", "interrupted"]),
      attemptId: attemptIdSchema,
      errorCode: nonEmptyStringSchema,
      completedAt: isoDateTimeSchema,
    })
    .strict(),
  z
    .object({
      ...workflowTaskStateBase,
      status: z.enum(["skipped", "invalidated"]),
      reason: nonEmptyStringSchema,
    })
    .strict(),
]);
export type WorkflowTaskState = z.infer<typeof workflowTaskStateSchema>;

export const workflowInstanceSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
    id: workflowInstanceIdSchema,
    workflowId: workflowIdSchema,
    workflowRevision: revisionSchema,
    unitId: productionUnitIdSchema,
    profileId: contentProfileIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    tasks: z.array(workflowTaskStateSchema),
    materializedFromEventId: brandedIdentifier("WorkflowEventId").optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type WorkflowInstance = z.infer<typeof workflowInstanceSchema>;

export const SHARED_HARD_FAILURE_REASON_CODES = [
  "ARTIFACT_INVALID",
  "LOCALIZATION_BROKEN",
  "POLICY_VIOLATION",
  "PUBLISH_APPROVAL_MISSING",
] as const;
export const DARK_TRUTH_HARD_FAILURE_REASON_CODES = [
  "DARKTRUTH_SUPERNATURAL_RULE_UNCLEAR",
  "DARKTRUTH_BIBLE_CONTRADICTION",
  "DARKTRUTH_TEMPLATE_REPETITION",
  "DARKTRUTH_CHARACTER_IDENTITY_INCONSISTENT",
  "DARKTRUTH_EMOTIONAL_COST_MISSING",
  "DARKTRUTH_ARBITRARY_ENDING_BEHAVIOR",
  "DARKTRUTH_REFERENCE_SET_MISSING",
  "DARKTRUTH_REFERENCE_SET_UNAPPROVED",
  "DARKTRUTH_VISUAL_CONTINUITY_FAILED",
] as const;
export const MATH_HARD_FAILURE_REASON_CODES = [
  "MATH_STATEMENT_INCORRECT",
  "MATH_WORKED_SOLUTION_INVALID",
  "MATH_SYMBOLIC_RESULT_UNVERIFIED",
  "MATH_CURRICULUM_MISMATCH",
  "MATH_PREREQUISITE_MISSING",
  "MATH_VISUAL_SEMANTICS_MISLEADING",
  "MATH_ESSENTIAL_INFORMATION_INACCESSIBLE",
  "MATH_EXERCISE_UNTEACHABLE_FROM_LESSON",
  "MATH_ANSWER_KEY_MISMATCH",
  "MATH_LEARNING_CLAIM_UNSUPPORTED",
] as const;
export const HARD_FAILURE_REASON_CODES = [
  ...SHARED_HARD_FAILURE_REASON_CODES,
  ...DARK_TRUTH_HARD_FAILURE_REASON_CODES,
  ...MATH_HARD_FAILURE_REASON_CODES,
] as const;
export const hardFailureReasonCodeSchema = z.enum(HARD_FAILURE_REASON_CODES);
export type HardFailureReasonCode = z.infer<typeof hardFailureReasonCodeSchema>;

export const QUALITY_STATUSES = [
  "READY",
  "READY_WITH_MINOR_EDITS",
  "REVISION_REQUIRED",
  "REWRITE_REQUIRED",
  "BLOCKED",
] as const;
export const qualityStatusSchema = z.enum(QUALITY_STATUSES);
export type QualityStatus = z.infer<typeof qualityStatusSchema>;

const hardFailureSchema = z
  .object({
    code: hardFailureReasonCodeSchema,
    message: nonEmptyStringSchema,
    action: z.enum(["revision", "rewrite", "blocked"]),
    overridable: z.boolean(),
    evidence: z.array(nonEmptyStringSchema).min(1),
  })
  .strict();
export type HardFailure = z.infer<typeof hardFailureSchema>;

const scoringResultSchema = z
  .object({
    dimension: namespacedBrandedIdentifier("ScoringDimensionId"),
    score: z.number().int().min(0).max(100),
    weight: z.number().int().min(1).max(100),
    required: z.boolean(),
    evidence: z.array(nonEmptyStringSchema).min(1),
  })
  .strict();
export type ScoringResult = z.infer<typeof scoringResultSchema>;

export const qualityAssessmentSchema = z
  .object({
    schemaVersion: z.literal(QUALITY_SCHEMA_VERSION),
    profileId: contentProfileIdSchema,
    artifact: artifactRefSchema,
    status: qualityStatusSchema,
    dimensions: z.array(scoringResultSchema).min(1),
    weightedScore: z.number().min(0).max(100),
    hardFailures: z.array(hardFailureSchema),
    boundedEdits: z.array(nonEmptyStringSchema),
    warnings: z.array(nonEmptyStringSchema),
    assessedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const totalWeight = value.dimensions.reduce(
      (sum, item) => sum + item.weight,
      0
    );
    if (totalWeight !== 100) {
      ctx.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "Quality dimension weights must sum to 100.",
      });
    }
    const calculatedScore = value.dimensions.reduce(
      (sum, item) => sum + (item.score * item.weight) / 100,
      0
    );
    if (Math.abs(calculatedScore - value.weightedScore) > 0.001) {
      ctx.addIssue({
        code: "custom",
        path: ["weightedScore"],
        message: "Weighted score does not match dimensions.",
      });
    }
    const readyStatus =
      value.status === "READY" || value.status === "READY_WITH_MINOR_EDITS";
    if (readyStatus && value.hardFailures.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["hardFailures"],
        message: "Hard failures cannot produce a ready status.",
      });
    }
    if (
      value.status === "READY" &&
      (value.weightedScore < 85 ||
        value.dimensions.some((item) => item.required && item.score < 70) ||
        value.boundedEdits.length > 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "READY thresholds are not satisfied.",
      });
    }
    if (
      value.status === "READY_WITH_MINOR_EDITS" &&
      (value.weightedScore < 75 || value.boundedEdits.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message:
          "READY_WITH_MINOR_EDITS requires a score of at least 75 and bounded edits.",
      });
    }
  });
export type QualityAssessment = z.infer<typeof qualityAssessmentSchema>;

export const approvalRecordSchema = z
  .object({
    schemaVersion: z.literal(APPROVAL_SCHEMA_VERSION),
    id: approvalIdSchema,
    workflowInstanceId: workflowInstanceIdSchema,
    taskId: taskIdSchema,
    profileId: contentProfileIdSchema,
    unitId: productionUnitIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    decision: z.enum(["approved", "rejected", "revoked"]),
    actor: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    boundRevision: revisionSchema,
    artifactHashes: z.array(sha256Schema).min(1),
    qualityAssessmentHash: sha256Schema.optional(),
    channel: nonEmptyStringSchema.optional(),
    createdAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
  })
  .strict();
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;

export const BATCH_ITEM_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed-retryable",
  "failed-permanent",
  "cancelled",
] as const;
export const batchItemStatusSchema = z.enum(BATCH_ITEM_STATUSES);
export type BatchItemStatus = z.infer<typeof batchItemStatusSchema>;

export const BATCH_STATUSES = [
  "planned",
  "running",
  "partial",
  "succeeded",
  "failed",
  "cancelling",
  "cancelled",
] as const;
export const batchStatusSchema = z.enum(BATCH_STATUSES);

const tokenUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
  })
  .strict();

const costUsageSchema = z
  .object({
    estimatedMicros: z.number().int().nonnegative().optional(),
    actualMicros: z.number().int().nonnegative().optional(),
    currency: z.literal("USD"),
  })
  .strict();

export const batchItemSchema = z
  .object({
    id: batchItemIdSchema,
    legacyItemId: nonEmptyStringSchema.optional(),
    taskId: taskIdSchema,
    unitId: productionUnitIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    fingerprint: sha256Schema,
    groupKey: nonEmptyStringSchema,
    status: batchItemStatusSchema,
    attemptIds: z.array(attemptIdSchema),
    providerRequestId: nonEmptyStringSchema.optional(),
    errorCode: nonEmptyStringSchema.optional(),
    errorMessage: nonEmptyStringSchema.optional(),
    retryable: z.boolean().optional(),
    cacheStatus: z.enum(["hit", "miss", "disabled"]).optional(),
    outputManifestIds: z.array(artifactManifestIdSchema),
    warnings: z.array(nonEmptyStringSchema),
    usage: tokenUsageSchema.optional(),
    cost: costUsageSchema.optional(),
  })
  .strict();

export const batchManifestSchema = z
  .object({
    schemaVersion: z.literal(BATCH_SCHEMA_VERSION),
    id: batchIdSchema,
    legacyBatchId: nonEmptyStringSchema.optional(),
    providerBatchId: nonEmptyStringSchema.optional(),
    profileId: contentProfileIdSchema,
    provider: nonEmptyStringSchema,
    model: nonEmptyStringSchema.optional(),
    operation: namespacedBrandedIdentifier("BatchOperationId"),
    executionMode: z.enum(["sync", "provider-batch"]),
    status: batchStatusSchema,
    configuration: z
      .object({
        concurrency: z.number().int().positive().max(100),
        retryLimit: z.number().int().nonnegative().max(20),
        rateLimitPerSecond: z.number().positive().optional(),
      })
      .strict(),
    items: z.array(batchItemSchema).min(1),
    totals: z
      .object({
        succeeded: z.number().int().nonnegative(),
        failedRetryable: z.number().int().nonnegative(),
        failedPermanent: z.number().int().nonnegative(),
        cancelled: z.number().int().nonnegative(),
        estimatedCostMicros: z.number().int().nonnegative(),
        actualCostMicros: z.number().int().nonnegative(),
      })
      .strict(),
    cancellationReason: nonEmptyStringSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.id)).size === value.items.length,
    {
      message: "Batch item IDs must be unique.",
      path: ["items"],
    }
  );
export type BatchManifest = z.infer<typeof batchManifestSchema>;

export const WORKFLOW_ERROR_CODES = [
  "INPUT_INVALID",
  "CONFIGURATION_INVALID",
  "APPROVAL_REQUIRED",
  "QUALITY_MINOR_EDITS_REQUIRED",
  "WORKFLOW_BLOCKED",
  "BATCH_PARTIAL_FAILURE",
  "PROVIDER_RETRIES_EXHAUSTED",
  "WORKFLOW_CONFLICT",
  "LOCK_CONFLICT",
  "PERSISTENCE_CONFLICT",
  "CACHE_CONFLICT",
  "PROVIDER_PERMANENT_FAILURE",
  "ARTIFACT_VALIDATION_FAILED",
  "INTERRUPTED",
  "UNEXPECTED_FAILURE",
] as const;
export const workflowErrorCodeSchema = z.enum(WORKFLOW_ERROR_CODES);
export type WorkflowErrorCode = z.infer<typeof workflowErrorCodeSchema>;

export const normalizedWorkflowErrorSchema = z
  .object({
    schemaVersion: z.literal(ERROR_SCHEMA_VERSION),
    code: workflowErrorCodeSchema,
    message: nonEmptyStringSchema,
    retryable: z.boolean(),
    remediation: nonEmptyStringSchema,
    taskId: taskIdSchema.optional(),
    attemptId: attemptIdSchema.optional(),
    causeName: nonEmptyStringSchema.optional(),
  })
  .strict();
export type NormalizedWorkflowError = z.infer<
  typeof normalizedWorkflowErrorSchema
>;

export const taskResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      schemaVersion: z.literal(TASK_SCHEMA_VERSION),
      status: z.literal("succeeded"),
      outputs: z.array(artifactManifestSchema),
      warnings: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(TASK_SCHEMA_VERSION),
      status: z.literal("failed"),
      error: normalizedWorkflowErrorSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(TASK_SCHEMA_VERSION),
      status: z.literal("skipped"),
      reason: nonEmptyStringSchema,
    })
    .strict(),
]);
export type TaskResult = z.infer<typeof taskResultSchema>;

export const taskAttemptSchema = z
  .object({
    schemaVersion: z.literal(TASK_SCHEMA_VERSION),
    id: attemptIdSchema,
    runId: workflowRunIdSchema,
    workflowInstanceId: workflowInstanceIdSchema,
    taskId: taskIdSchema,
    fingerprint: taskFingerprintSchema,
    attemptNumber: z.number().int().positive(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    result: taskResultSchema,
  })
  .strict();
export type TaskAttempt = z.infer<typeof taskAttemptSchema>;

export const attemptTelemetrySchema = z
  .object({
    schemaVersion: z.literal(TASK_SCHEMA_VERSION),
    id: attemptIdSchema,
    runId: workflowRunIdSchema,
    batchId: batchIdSchema.optional(),
    batchItemId: batchItemIdSchema.optional(),
    unitId: productionUnitIdSchema,
    profileId: contentProfileIdSchema,
    taskId: taskIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    operation: namespacedBrandedIdentifier("OperationName"),
    attemptNumber: z.number().int().positive(),
    provider: nonEmptyStringSchema.optional(),
    model: nonEmptyStringSchema.optional(),
    providerRequestId: nonEmptyStringSchema.optional(),
    cacheStatus: z.enum(["hit", "miss", "disabled"]),
    durationMs: z.number().int().nonnegative(),
    fingerprint: taskFingerprintSchema,
    revisions: z.record(nonEmptyStringSchema, revisionSchema),
    outputManifestIds: z.array(artifactManifestIdSchema),
    warnings: z.array(nonEmptyStringSchema),
    error: normalizedWorkflowErrorSchema.optional(),
    exitCode: z.number().int().min(0).max(255),
    usage: tokenUsageSchema.optional(),
    cost: costUsageSchema.optional(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.batchId === undefined) !== (value.batchItemId === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["batchItemId"],
        message: "Batch and batch item IDs must be recorded together.",
      });
    }
  });
export type AttemptTelemetry = z.infer<typeof attemptTelemetrySchema>;

const workflowEventBase = {
  schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
  eventId: brandedIdentifier("WorkflowEventId"),
  workflowInstanceId: workflowInstanceIdSchema,
  occurredAt: isoDateTimeSchema,
};

export const workflowEventSchema = z.discriminatedUnion("eventType", [
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("workflow-created"),
      workflow: workflowDefinitionSchema,
      unitId: productionUnitIdSchema,
      profileId: contentProfileIdSchema,
      locale: contentLocaleSchema,
      variant: contentVariantSchema,
    })
    .strict(),
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("task-state-changed"),
      taskId: taskIdSchema,
      from: workflowTaskStatusSchema,
      to: workflowTaskStatusSchema,
      attemptId: attemptIdSchema.optional(),
      reason: nonEmptyStringSchema.optional(),
      taskState: workflowTaskStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("approval-recorded"),
      approvalId: approvalIdSchema,
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("artifact-invalidated"),
      artifact: artifactRefSchema,
      reason: nonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("override-recorded"),
      overrideId: brandedIdentifier("OperatorOverrideId"),
      taskId: taskIdSchema,
    })
    .strict(),
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("reconciliation-recorded"),
      taskId: taskIdSchema,
      evidenceKind: z.enum(["artifact-manifest", "subsystem-manifest"]),
      evidencePaths: z.array(nonEmptyStringSchema).min(1),
      disposition: z.enum([
        "evidence-only",
        "task-succeeded",
        "task-invalidated",
      ]),
      reason: nonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      ...workflowEventBase,
      eventType: z.literal("lock-recovered"),
      lockKey: nonEmptyStringSchema,
      previousOwner: nonEmptyStringSchema,
      reason: nonEmptyStringSchema,
    })
    .strict(),
]);
export type WorkflowEvent = z.infer<typeof workflowEventSchema>;

export const operatorOverrideSchema = z
  .object({
    schemaVersion: z.literal(OVERRIDE_SCHEMA_VERSION),
    id: brandedIdentifier("OperatorOverrideId"),
    workflowInstanceId: workflowInstanceIdSchema,
    taskId: taskIdSchema,
    actor: nonEmptyStringSchema,
    reason: nonEmptyStringSchema,
    scope: z.enum([
      "readiness",
      "quality",
      "artifact-compatibility",
      "task-success",
    ]),
    outputManifestIds: z.array(artifactManifestIdSchema).optional(),
    createdAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    boundRevision: revisionSchema,
  })
  .strict();
export type OperatorOverride = z.infer<typeof operatorOverrideSchema>;

export const LEGACY_QUALITY_STATUS_MAP = {
  PASS: "READY",
  REPAIRABLE: "REVISION_REQUIRED",
  FAIL: "REWRITE_REQUIRED",
} as const satisfies Record<string, QualityStatus>;

export function convertLegacyQualityStatus(
  status: keyof typeof LEGACY_QUALITY_STATUS_MAP
): QualityStatus {
  return LEGACY_QUALITY_STATUS_MAP[status];
}

export function convertLegacyArtifactReference(input: {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly unitId: string;
  readonly profileId: ContentProfileId;
  readonly locale: ContentLocale;
  readonly variant: ContentVariant;
  readonly artifactRevision: string;
  readonly workflowRevision: string;
  readonly policyRevision: string;
}): ArtifactRef {
  return artifactRefSchema.parse({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    unitId: input.unitId,
    profileId: input.profileId,
    locale: input.locale,
    variant: input.variant,
    kind: input.kind,
    artifactRevision: input.artifactRevision,
    workflowRevision: input.workflowRevision,
    policyRevision: input.policyRevision,
  });
}
