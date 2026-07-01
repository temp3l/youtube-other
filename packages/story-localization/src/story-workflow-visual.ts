import {
  stageFailureSchemaVersion,
  type StageFailure,
  type WorkflowLocale,
} from "./story-workflow.types.js";

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
