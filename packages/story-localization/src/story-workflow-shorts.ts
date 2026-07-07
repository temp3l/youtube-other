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

export type ShortWorkflowStatus = "accepted" | "blocked" | "failed" | "skipped";

export interface ShortWorkflowInput {
  readonly locale: WorkflowLocale;
  readonly parentFull?: ArtifactLineage;
  readonly shortArtifact?: ArtifactLineage;
  readonly generationFailure?: StageFailure;
  readonly qualityPassed?: boolean;
  readonly qualityFailure?: StageFailure;
}

export interface ShortWorkflowResult {
  readonly locale: WorkflowLocale;
  readonly status: ShortWorkflowStatus;
  readonly parentArtifactId?: ArtifactLineage["artifactId"];
  readonly artifact?: ArtifactLineage;
  readonly failure?: StageFailure;
}

export function resolveShortWorkflow(
  input: ShortWorkflowInput
): ShortWorkflowResult {
  if (!input.parentFull) {
    return {
      locale: input.locale,
      status: "skipped",
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "dependency-blocked",
        retryability: "retry-after-change",
        message: "Short generation skipped because the parent full story is not accepted.",
        occurredAt: new Date().toISOString(),
      },
    };
  }
  if (input.generationFailure) {
    return {
      locale: input.locale,
      status: "failed",
      parentArtifactId: input.parentFull.artifactId,
      failure: input.generationFailure,
    };
  }
  if (input.qualityPassed === false || input.qualityFailure) {
    return {
      locale: input.locale,
      status: "blocked",
      parentArtifactId: input.parentFull.artifactId,
      failure:
        input.qualityFailure ??
        {
          schemaVersion: stageFailureSchemaVersion,
          category: "short-quality-gate-failed",
          retryability: "retry-after-change",
          message: "Short story quality gate blocked downstream media.",
          occurredAt: new Date().toISOString(),
        },
    };
  }
  if (!input.shortArtifact) {
    return {
      locale: input.locale,
      status: "failed",
      parentArtifactId: input.parentFull.artifactId,
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "short-generation-failed",
        retryability: "retryable",
        message: "Short generation did not produce an artifact.",
        occurredAt: new Date().toISOString(),
      },
    };
  }
  return {
    locale: input.locale,
    status: "accepted",
    parentArtifactId: input.parentFull.artifactId,
    artifact: input.shortArtifact,
  };
}

export interface ShortWorkflowStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface ShortWorkflowStageResult {
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

export async function executeShortWorkflowStage(args: {
  readonly context: ShortWorkflowStageContext;
  readonly result: ShortWorkflowResult;
}): Promise<ShortWorkflowStageResult> {
  const stageId =
    args.context.stageId ??
    (`stage:rewrite-short:${args.result.locale}:short` as StageId);
  const stage = resolveStage(args.context.manifest, stageId);
  if (
    (stage.status === "succeeded" ||
      stage.status === "blocked" ||
      stage.status === "failed" ||
      stage.status === "skipped") &&
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
  const nonAcceptedStatus =
    args.result.status === "skipped"
      ? "skipped"
      : args.result.status === "blocked"
        ? "blocked"
        : "failed";
  const outcome: StageOutcome<ArtifactLineage> =
    args.result.status === "accepted" && args.result.artifact
      ? {
          ...baseOutcome,
          status: "succeeded",
          artifact: args.result.artifact,
          provenance: args.result.artifact.provenance,
        }
      : {
          ...baseOutcome,
          status: nonAcceptedStatus,
          failure:
            args.result.failure ??
            ({
              schemaVersion: stageFailureSchemaVersion,
              category: "short-generation-failed",
              retryability: "retryable",
              message: `Short branch did not produce an accepted artifact for ${args.result.locale}.`,
              occurredAt: completedAt,
            } satisfies StageFailure),
        };
  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}
