import {
  STORY_PRODUCTION_ANALYSIS_GATE_VERSION,
  type StoryProductionAnalysisArtifact,
  type StoryProductionAnalysisVerdict,
} from "./story-production-analysis.js";
import {
  stageFailureSchemaVersion,
  type FailureCategory,
  type QualityGateDecision,
  type StageFailure,
  type StageWarning,
} from "./story-workflow.types.js";

export interface WorkflowQualityGateInput {
  readonly verdict?: StoryProductionAnalysisVerdict;
  readonly pass?: boolean;
  readonly deterministicValidationStatus: QualityGateDecision["deterministicValidationStatus"];
  readonly failedChecks?: readonly string[];
  readonly warnings?: readonly StageWarning[];
  readonly profile?: string;
  readonly gateVersion?: string;
  readonly analysisArtifactId?: QualityGateDecision["analysisArtifactId"];
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
    (verdict === "READY" || verdict === "READY_WITH_MINOR_EDITS");
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
