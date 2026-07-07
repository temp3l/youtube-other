import {
  stageOutcomeSchemaVersion,
  stageFailureSchemaVersion,
  type ArtifactLineage,
  type CacheMetadata,
  type CostMetrics,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type WorkflowManifest,
  type WorkflowLocale,
} from "./story-workflow.types.js";
import {
  appendStageOutcome,
  type StoryWorkflowManifestStore,
} from "./story-workflow-store.js";

export interface VisualBranchInput {
  readonly englishFullAccepted: boolean;
  readonly englishQualityPassed: boolean;
  readonly visualPrepSucceeded?: boolean;
  readonly localeFailures?: readonly WorkflowLocale[];
}

export interface VisualBranchResult {
  readonly sharedImagesStatus: "planned" | "ready" | "blocked";
  readonly blockedBy: readonly string[];
  readonly failure?: StageFailure;
}

export function resolveVisualBranch(input: VisualBranchInput): VisualBranchResult {
  const blockedBy = [
    ...(input.englishFullAccepted ? [] : ["english-full"]),
    ...(input.englishQualityPassed ? [] : ["english-quality"]),
    ...(input.visualPrepSucceeded === false ? ["visual-prep"] : []),
  ];
  if (blockedBy.length > 0) {
    return {
      sharedImagesStatus: "blocked",
      blockedBy,
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "dependency-blocked",
        retryability: "retry-after-change",
        message: `Shared image branch blocked by ${blockedBy.join(", ")}.`,
        occurredAt: new Date().toISOString(),
      },
    };
  }
  return {
    sharedImagesStatus: input.visualPrepSucceeded ? "ready" : "planned",
    blockedBy: [],
  };
}

export interface VisualBranchStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface VisualBranchStageResult {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly outcome: StageOutcome<ArtifactLineage>;
}

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

function resolveStage(
  manifest: WorkflowManifest<ArtifactLineage>,
  stageId: StageId
) {
  const stage = manifest.stages.find((entry) => entry.stageId === stageId);
  if (!stage) {
    throw new Error(`Workflow stage not found: ${stageId}`);
  }
  return stage;
}

export async function executeVisualBranchStage(args: {
  readonly context: VisualBranchStageContext;
  readonly result: VisualBranchResult;
  readonly artifact?: ArtifactLineage;
}): Promise<VisualBranchStageResult> {
  const stageId =
    args.context.stageId ?? ("stage:visual-model:en:full" as StageId);
  const stage = resolveStage(args.context.manifest, stageId);
  if (
    (stage.status === "succeeded" || stage.status === "blocked") &&
    stage.latestOutcome
  ) {
    return {
      manifest: args.context.manifest,
      outcome: stage.latestOutcome,
    };
  }

  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const baseOutcome = {
    schemaVersion: stageOutcomeSchemaVersion,
    stageId: stage.stageId,
    executionId: args.context.manifest.executionId,
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
  } as const;
  const missingArtifactFailure: StageFailure = {
    schemaVersion: stageFailureSchemaVersion,
    category: "visual-model-failed",
    retryability: "manual-review",
    message: "Visual branch boundary requires an artifact reference when ready.",
    occurredAt: completedAt,
  };
  const outcome: StageOutcome<ArtifactLineage> =
    args.result.sharedImagesStatus !== "blocked" && args.artifact
      ? {
          ...baseOutcome,
          status: "succeeded",
          artifact: args.artifact,
          provenance: args.artifact.provenance,
        }
      : {
          ...baseOutcome,
          status: "blocked",
          failure:
            args.result.failure ??
            (args.result.sharedImagesStatus === "blocked"
              ? {
                  schemaVersion: stageFailureSchemaVersion,
                  category: "dependency-blocked",
                  retryability: "retry-after-change",
                  message: `Shared image branch blocked by ${args.result.blockedBy.join(", ")}.`,
                  occurredAt: completedAt,
                }
              : missingArtifactFailure),
        };
  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}
