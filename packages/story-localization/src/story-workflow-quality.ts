import {
  STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
  SCRIPT_PRODUCTION_MIN_SCORE,
  type StoryProductionAnalysisArtifact,
  type StoryProductionAnalysisVerdict,
} from "./story-production-analysis.js";
import {
  stageFailureSchemaVersion,
  stageOutcomeSchemaVersion,
  type ArtifactLineage,
  type CacheMetadata,
  type CostMetrics,
  type FailureCategory,
  type QualityGateDecision,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type StageWarning,
  type WorkflowManifest,
} from "./story-workflow.types.js";
import {
  appendQualityGateOutcome,
  type StoryWorkflowManifestStore,
} from "./story-workflow-store.js";

export interface WorkflowQualityGateInput {
  readonly verdict?: StoryProductionAnalysisVerdict;
  readonly pass?: boolean;
  readonly deterministicValidationStatus: QualityGateDecision["deterministicValidationStatus"];
  readonly failedChecks?: readonly string[];
  readonly warnings?: readonly StageWarning[];
  readonly profile?: string;
  readonly gateVersion?: string;
  readonly analysisArtifactId?: QualityGateDecision["analysisArtifactId"];
  /** READY_WITH_MINOR_EDITS is advisory by default and may proceed only when a content profile opts in. */
  readonly allowMinorEditsToProceed?: boolean;
  readonly overallScore?: number;
  readonly analysisState?: string;
}

export function adaptStoryProductionQualityGate(
  input: WorkflowQualityGateInput | StoryProductionAnalysisArtifact
): QualityGateDecision {
  const verdict =
    "verdict" in input && input.verdict ? input.verdict : "REVISION_REQUIRED";
  const deterministicValidationStatus =
    "deterministicValidationStatus" in input
      ? input.deterministicValidationStatus
      : "passed";
  const failedChecks =
    "failedChecks" in input && input.failedChecks
      ? [...input.failedChecks]
      : "gateResults" in input
        ? input.gateResults.failedChecks.map((check) => check.id)
        : [];
  const warnings =
    "warnings" in input && input.warnings ? [...input.warnings] : [];
  const pass =
    deterministicValidationStatus === "passed" &&
    (verdict === "READY" ||
      (verdict === "READY_WITH_MINOR_EDITS" &&
        "allowMinorEditsToProceed" in input &&
        input.allowMinorEditsToProceed === true));
  return {
    status: verdict,
    pass,
    profile: "profile" in input && input.profile ? input.profile : "production",
    gateVersion:
      "gateVersion" in input && input.gateVersion
        ? input.gateVersion
        : STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
    deterministicValidationStatus,
    ...("analysisArtifactId" in input && input.analysisArtifactId
      ? { analysisArtifactId: input.analysisArtifactId }
      : {}),
    failedChecks:
      deterministicValidationStatus === "passed"
        ? failedChecks
        : ["deterministic-validation", ...failedChecks],
    warnings:
      verdict === "READY_WITH_MINOR_EDITS"
        ? [
            ...warnings,
            {
              code: "ready-with-minor-edits",
              message: "Quality gate passed with minor edits recommended.",
              emittedAt: new Date().toISOString(),
            },
          ]
        : warnings,
    ...("overallScore" in input && input.overallScore !== undefined
      ? { overallScore: input.overallScore, minimumScore: SCRIPT_PRODUCTION_MIN_SCORE }
      : {}),
    ...("analysisState" in input && input.analysisState
      ? { analysisState: input.analysisState }
      : {}),
  };
}

export function qualityDecisionToFailure(args: {
  readonly decision: QualityGateDecision;
  readonly category: FailureCategory;
  readonly message?: string;
}): StageFailure | null {
  if (args.decision.pass) {
    return null;
  }
  return {
    schemaVersion: stageFailureSchemaVersion,
    category: args.category,
    retryability: "retry-after-change",
    message:
      args.message ??
      `Quality gate blocked with status ${args.decision.status}.`,
    occurredAt: new Date().toISOString(),
    details: {
      qualityStatus: args.decision.status,
      failedCheckCount: args.decision.failedChecks.length,
    },
  };
}

export interface QualityGateStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface QualityGateStageResult {
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

function defaultQualityFailureCategory(
  stageType: string,
  locale: string | undefined
): FailureCategory {
  if (stageType === "quality-short") {
    return "short-quality-gate-failed";
  }
  return locale === "en"
    ? "rewrite-quality-gate-failed"
    : "locale-quality-gate-failed";
}

export async function executeQualityGateStage(args: {
  readonly context: QualityGateStageContext;
  readonly decision: QualityGateDecision;
  readonly artifact?: ArtifactLineage;
  readonly failureCategory?: FailureCategory;
}): Promise<QualityGateStageResult> {
  const stage = resolveStage(args.context.manifest, args.context.stageId);
  if (
    (stage.status === "succeeded" ||
      stage.status === "blocked" ||
      stage.status === "failed") &&
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
    warnings: args.decision.warnings,
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
    category: "persistence-failed",
    retryability: "manual-review",
    message:
      "Quality gate passed but no analysis artifact lineage was provided.",
    occurredAt: completedAt,
  };
  const outcome: StageOutcome<ArtifactLineage> =
    args.decision.pass && args.artifact
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
            args.decision.pass && !args.artifact
              ? missingArtifactFailure
              : (qualityDecisionToFailure({
                  decision: args.decision,
                  category:
                    args.failureCategory ??
                    defaultQualityFailureCategory(
                      stage.stageType,
                      stage.locale
                    ),
                }) ?? missingArtifactFailure),
        };
  const manifest = args.context.store
    ? await args.context.store.mutate(
        args.context.manifest.workflowId,
        (manifest) => appendQualityGateOutcome(manifest, outcome, args.decision)
      )
    : appendQualityGateOutcome(args.context.manifest, outcome, args.decision);
  return { manifest, outcome };
}
