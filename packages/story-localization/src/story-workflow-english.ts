import {
  stageFailureSchemaVersion,
  stageOutcomeSchemaVersion,
  type ArtifactLineage,
  type CacheMetadata,
  type CostMetrics,
  type FailureCategory,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type StageWarning,
  type WorkflowManifest,
} from "./story-workflow.types.js";
import {
  appendStageOutcome,
  type StoryWorkflowManifestStore,
} from "./story-workflow-store.js";
import { qualityDecisionToFailure } from "./story-workflow-quality.js";
import type { QualityGateDecision } from "./story-workflow.types.js";

export interface EnglishRewriteStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface EnglishRewriteStageSuccess {
  readonly artifact: ArtifactLineage;
  readonly cost?: CostMetrics;
  readonly warnings?: readonly StageWarning[];
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly providerRequestId?: string;
}

export type EnglishRewriteStageRunner = () => Promise<EnglishRewriteStageSuccess>;

export interface EnglishRewriteStageResult {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly outcome: StageOutcome<ArtifactLineage>;
}

const generationFailureCategories = new Set<FailureCategory>([
  "rewrite-provider-failure",
  "rewrite-timeout",
  "rewrite-rate-limited",
  "rewrite-quota-failure",
  "rewrite-schema-invalid",
  "persistence-failed",
]);

function emptyCost(): CostMetrics {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicros: null,
    actualCostMicros: null,
  };
}

function defaultCache(): CacheMetadata {
  return {
    status: "miss",
    invalidationReasons: [],
  };
}

export function classifyEnglishRewriteFailure(error: unknown): StageFailure {
  if (
    typeof error === "object" &&
    error !== null &&
    "category" in error &&
    typeof (error as { readonly category?: unknown }).category === "string"
  ) {
    return {
      schemaVersion: stageFailureSchemaVersion,
      category: (error as { readonly category: FailureCategory }).category,
      retryability:
        (error as { readonly retryability?: StageFailure["retryability"] })
          .retryability ?? "retryable",
      message:
        error instanceof Error
          ? error.message
          : (error as { readonly message?: string }).message ??
            "English rewrite failed.",
      occurredAt: new Date().toISOString(),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const category: FailureCategory =
    lower.includes("schema")
      ? "rewrite-schema-invalid"
      : lower.includes("validation")
        ? "rewrite-local-validation-failed"
        : lower.includes("quality")
          ? "rewrite-quality-gate-failed"
          : lower.includes("timeout")
            ? "rewrite-timeout"
            : "rewrite-provider-failure";
  return {
    schemaVersion: stageFailureSchemaVersion,
    category,
    retryability:
      category === "rewrite-quality-gate-failed" ||
      category === "rewrite-local-validation-failed"
        ? "retry-after-change"
        : "retryable",
    message,
    occurredAt: new Date().toISOString(),
  };
}

function resolveStage(
  manifest: WorkflowManifest<ArtifactLineage>,
  stageId?: StageId
) {
  const id = stageId ?? ("stage:rewrite-full:en:full" as StageId);
  const stage = manifest.stages.find((entry) => entry.stageId === id);
  if (!stage) {
    throw new Error(`Workflow stage not found: ${id}`);
  }
  return stage;
}

export async function executeEnglishRewriteStage(args: {
  readonly context: EnglishRewriteStageContext;
  readonly run: EnglishRewriteStageRunner;
}): Promise<EnglishRewriteStageResult> {
  const stage = resolveStage(args.context.manifest, args.context.stageId);
  const startedAt = new Date().toISOString();
  let outcome: StageOutcome<ArtifactLineage>;
  try {
    const result = await args.run();
    const completedAt = new Date().toISOString();
    outcome = {
      schemaVersion: stageOutcomeSchemaVersion,
      status: "succeeded",
      stageId: stage.stageId,
      executionId: args.context.manifest.executionId,
      artifact: result.artifact,
      provenance: result.artifact.provenance,
      fingerprintInputs: stage.fingerprintInputs,
      cache: stage.cache ?? defaultCache(),
      warnings: [...(result.warnings ?? [])],
      cost: result.cost ?? emptyCost(),
      startedAt,
      completedAt,
      observability: {
        attemptNumber: args.context.manifest.attemptHistory.length + 1,
        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
        ...(result.model ? { model: result.model } : {}),
        ...(result.reasoningEffort
          ? { reasoningEffort: result.reasoningEffort }
          : {}),
        ...(result.providerRequestId
          ? { providerRequestId: result.providerRequestId }
          : {}),
      },
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    outcome = {
      schemaVersion: stageOutcomeSchemaVersion,
      status: "failed",
      stageId: stage.stageId,
      executionId: args.context.manifest.executionId,
      failure: classifyEnglishRewriteFailure(error),
      fingerprintInputs: stage.fingerprintInputs,
      cache: stage.cache ?? defaultCache(),
      warnings: [],
      cost: emptyCost(),
      startedAt,
      completedAt,
      observability: {
        attemptNumber: args.context.manifest.attemptHistory.length + 1,
        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      },
    };
  }

  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}

export function canUseEnglishSourceFallback(failure: StageFailure): boolean {
  return generationFailureCategories.has(failure.category);
}

export interface EnglishSourceFallbackInput {
  readonly rewriteFailure: StageFailure;
  readonly sourceArtifact: ArtifactLineage;
  readonly validationPassed: boolean;
  readonly qualityDecision: QualityGateDecision;
}

export interface EnglishSourceFallbackResult {
  readonly accepted: boolean;
  readonly artifact?: ArtifactLineage;
  readonly failure?: StageFailure;
  readonly warning?: StageWarning;
}

export function evaluateEnglishSourceFallback(
  input: EnglishSourceFallbackInput
): EnglishSourceFallbackResult {
  if (!canUseEnglishSourceFallback(input.rewriteFailure)) {
    return {
      accepted: false,
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "source-fallback-rejected",
        retryability: "retry-after-change",
        message:
          "Source fallback is not allowed for local validation or quality failures.",
        occurredAt: new Date().toISOString(),
      },
    };
  }
  if (!input.validationPassed) {
    return {
      accepted: false,
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "source-fallback-rejected",
        retryability: "retry-after-change",
        message: "Source fallback failed deterministic validation.",
        occurredAt: new Date().toISOString(),
      },
    };
  }
  const qualityFailure = qualityDecisionToFailure({
    decision: input.qualityDecision,
    category: "source-fallback-rejected",
  });
  if (qualityFailure) {
    return {
      accepted: false,
      failure: qualityFailure,
    };
  }
  return {
    accepted: true,
    artifact: {
      ...input.sourceArtifact,
      provenance: "source-fallback",
    },
    warning: {
      code: "source-fallback-accepted",
      message:
        "English rewrite failed due to generation or infrastructure failure; original source accepted as canonical fallback.",
      emittedAt: new Date().toISOString(),
      details: {
        originalFailureCategory: input.rewriteFailure.category,
      },
    },
  };
}
