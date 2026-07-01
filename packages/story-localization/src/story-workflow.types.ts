export const workflowSchemaVersion = "story-workflow-manifest-v1" as const;
export const stageOutcomeSchemaVersion = "stage-outcome-v1" as const;
export const stageFailureSchemaVersion = "stage-failure-v1" as const;

export type WorkflowId = string & { readonly __brand: "WorkflowId" };
export type ExecutionId = string & { readonly __brand: "ExecutionId" };
export type StageId = string & { readonly __brand: "StageId" };
export type ArtifactId = string & { readonly __brand: "ArtifactId" };
export type ProviderBatchId = string & { readonly __brand: "ProviderBatchId" };

export const workflowLocales = ["en", "de", "es", "fr", "pt"] as const;
export type WorkflowLocale = (typeof workflowLocales)[number];

export const storyFormats = ["full", "short"] as const;
export type StoryFormat = (typeof storyFormats)[number];

export const stageTypes = [
  "ingest-source",
  "rewrite-full",
  "validate-full",
  "quality-full",
  "localize-full",
  "rewrite-short",
  "validate-short",
  "quality-short",
  "scene-extraction",
  "visual-model",
  "image-prompt",
  "image-generation",
  "thumbnail",
  "audio",
  "captions",
  "metadata",
  "render",
  "publish",
] as const;
export type StageType = (typeof stageTypes)[number];

export const artifactProvenances = [
  "source",
  "generated",
  "source-fallback",
  "localized-fallback",
  "cache",
  "manual",
  "imported",
  "legacy-compatibility",
] as const;
export type ArtifactProvenance = (typeof artifactProvenances)[number];

export const stageStatuses = [
  "planned",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "skipped",
  "cancelled",
  "cached",
] as const;
export type StageStatus = (typeof stageStatuses)[number];

export const terminalStageStatuses = [
  "succeeded",
  "failed",
  "blocked",
  "skipped",
  "cancelled",
  "cached",
] as const;
export type TerminalStageStatus = (typeof terminalStageStatuses)[number];

export const retryabilities = [
  "retryable",
  "not-retryable",
  "retry-after-change",
  "manual-review",
] as const;
export type Retryability = (typeof retryabilities)[number];

export const failureCategories = [
  "source-missing",
  "source-invalid",
  "rewrite-provider-failure",
  "rewrite-timeout",
  "rewrite-rate-limited",
  "rewrite-quota-failure",
  "rewrite-schema-invalid",
  "rewrite-local-validation-failed",
  "rewrite-quality-gate-failed",
  "source-fallback-accepted",
  "source-fallback-rejected",
  "localization-provider-failure",
  "localization-schema-invalid",
  "locale-validation-failed",
  "locale-quality-gate-failed",
  "locale-fallback-accepted",
  "locale-fallback-rejected",
  "short-generation-failed",
  "short-validation-failed",
  "short-quality-gate-failed",
  "audio-generation-failed",
  "metadata-generation-failed",
  "scene-extraction-failed",
  "visual-model-failed",
  "image-generation-failed",
  "thumbnail-generation-failed",
  "render-failed",
  "publish-failed",
  "persistence-failed",
  "cache-corrupt",
  "manifest-version-incompatible",
  "fingerprint-mismatch",
  "dependency-blocked",
  "budget-exceeded",
  "policy-blocked",
  "copyright-blocked",
  "provenance-blocked",
  "cancelled",
  "skipped",
  "resumed",
  "cache-reused",
] as const;
export type FailureCategory = (typeof failureCategories)[number];

export const qualityGateStatuses = [
  "READY",
  "READY_WITH_MINOR_EDITS",
  "REVISION_REQUIRED",
  "REWRITE_REQUIRED",
  "BLOCKED",
] as const;
export type QualityGateStatus = (typeof qualityGateStatuses)[number];

export const deterministicValidationStatuses = [
  "passed",
  "failed",
  "skipped",
] as const;
export type DeterministicValidationStatus =
  (typeof deterministicValidationStatuses)[number];

export const cacheStatuses = [
  "hit",
  "miss",
  "stale",
  "invalid",
  "forced",
  "bypassed",
] as const;
export type CacheStatus = (typeof cacheStatuses)[number];

export const artifactOwners = [
  "narration",
  "analysis",
  "metadata",
  "audio",
  "scene-plan",
  "image-plan",
  "render",
  "publication",
] as const;
export type ArtifactOwner = (typeof artifactOwners)[number];

export const batchSubmissionStatuses = [
  "planned",
  "submitted",
  "completed",
  "failed",
  "expired",
  "cancelled",
  "imported",
  "imported_with_failures",
] as const;
export type BatchSubmissionStatus = (typeof batchSubmissionStatuses)[number];

export const batchItemStatuses = [
  "planned",
  "submitted",
  "completed",
  "persisted",
  "failed",
  "expired",
  "cancelled",
  "schema-invalid",
  "skipped-cached",
] as const;
export type BatchItemStatus = (typeof batchItemStatuses)[number];

export interface StageWarning {
  readonly code: string;
  readonly message: string;
  readonly emittedAt: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface StageFailure {
  readonly schemaVersion: typeof stageFailureSchemaVersion;
  readonly category: FailureCategory;
  readonly retryability: Retryability;
  readonly message: string;
  readonly occurredAt: string;
  readonly providerStatusCode?: number;
  readonly providerErrorCode?: string;
  readonly causeStageId?: StageId;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface CostMetrics {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly estimatedCostMicros: number | null;
  readonly actualCostMicros: number | null;
  readonly pricingVersion?: string;
}

export interface CacheMetadata {
  readonly status: CacheStatus;
  readonly cacheKey?: string;
  readonly cacheSchemaVersion?: string;
  readonly reusedArtifactId?: ArtifactId;
  readonly invalidationReasons: readonly string[];
}

export interface FingerprintInputs {
  readonly sourceFingerprint?: string;
  readonly parentFingerprints: readonly string[];
  readonly promptFingerprint?: string;
  readonly schemaFingerprint?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly configFingerprint?: string;
  readonly workflowSchemaVersion: string;
}

export interface ArtifactLineage {
  readonly artifactId: ArtifactId;
  readonly artifactType: string;
  readonly owner: ArtifactOwner;
  readonly locale?: WorkflowLocale;
  readonly format?: StoryFormat;
  readonly provenance: ArtifactProvenance;
  readonly path: string;
  readonly fingerprint: string;
  readonly schemaVersion: string;
  readonly parents: readonly ArtifactId[];
  readonly sourceStageId: StageId;
}

export interface StageOutcomeObservability {
  readonly attemptNumber: number;
  readonly durationMs: number;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly providerRequestId?: string;
  readonly providerBatchId?: ProviderBatchId;
}

export type StageOutcome<TArtifactRef> =
  | {
      readonly schemaVersion: typeof stageOutcomeSchemaVersion;
      readonly status: "succeeded" | "cached";
      readonly stageId: StageId;
      readonly executionId: ExecutionId;
      readonly artifact: TArtifactRef;
      readonly provenance: ArtifactProvenance;
      readonly fingerprintInputs: FingerprintInputs;
      readonly cache: CacheMetadata;
      readonly warnings: readonly StageWarning[];
      readonly cost: CostMetrics;
      readonly startedAt: string;
      readonly completedAt: string;
      readonly observability: StageOutcomeObservability;
    }
  | {
      readonly schemaVersion: typeof stageOutcomeSchemaVersion;
      readonly status: "failed" | "blocked" | "skipped" | "cancelled";
      readonly stageId: StageId;
      readonly executionId: ExecutionId;
      readonly failure: StageFailure;
      readonly fingerprintInputs: FingerprintInputs;
      readonly cache: CacheMetadata;
      readonly warnings: readonly StageWarning[];
      readonly cost: CostMetrics;
      readonly startedAt: string;
      readonly completedAt: string;
      readonly observability: StageOutcomeObservability;
    };

export interface QualityGateDecision {
  readonly status: QualityGateStatus;
  readonly pass: boolean;
  readonly profile: string;
  readonly gateVersion: string;
  readonly deterministicValidationStatus: DeterministicValidationStatus;
  readonly analysisArtifactId?: ArtifactId;
  readonly failedChecks: readonly string[];
  readonly warnings: readonly StageWarning[];
}

export interface BatchItemState {
  readonly customId: string;
  readonly stageId: StageId;
  readonly locale?: WorkflowLocale;
  readonly format?: StoryFormat;
  readonly artifactId?: ArtifactId;
  readonly retryParentCustomId?: string;
  readonly providerRequestId?: string;
  readonly status: BatchItemStatus;
  readonly updatedAt: string;
  readonly failure?: StageFailure;
  readonly fingerprintInputs: FingerprintInputs;
}

export interface BatchSubmission {
  readonly id: string;
  readonly status: BatchSubmissionStatus;
  readonly category: string;
  readonly operation: string;
  readonly endpoint?: string;
  readonly providerBatchId?: ProviderBatchId;
  readonly localManifestPath?: string;
  readonly inputFilePath?: string;
  readonly outputFilePath?: string;
  readonly errorFilePath?: string;
  readonly stageIds: readonly StageId[];
  readonly items: readonly BatchItemState[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface WorkflowStageState<TArtifactRef> {
  readonly stageId: StageId;
  readonly stageType: StageType;
  readonly locale?: WorkflowLocale;
  readonly format?: StoryFormat;
  readonly dependsOn: readonly StageId[];
  readonly status: StageStatus;
  readonly fingerprintInputs: FingerprintInputs;
  readonly cache: CacheMetadata;
  readonly latestExecutionId?: ExecutionId;
  readonly latestCompletedAt?: string;
  readonly qualityDecision?: QualityGateDecision;
  readonly latestOutcome?: StageOutcome<TArtifactRef>;
}

export interface WorkflowManifest<TArtifactRef> {
  readonly schemaVersion: typeof workflowSchemaVersion;
  readonly workflowId: WorkflowId;
  readonly executionId: ExecutionId;
  readonly episodeId: string;
  readonly locales: readonly WorkflowLocale[];
  readonly formats: readonly StoryFormat[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly plannedStageCount: number;
  readonly stages: readonly WorkflowStageState<TArtifactRef>[];
  readonly attemptHistory: readonly StageOutcome<TArtifactRef>[];
  readonly artifacts: readonly ArtifactLineage[];
  readonly batches: readonly BatchSubmission[];
  readonly warnings: readonly StageWarning[];
}
