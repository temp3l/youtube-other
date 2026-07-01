import {
  type CacheMetadata,
  type FingerprintInputs,
  type WorkflowStageState,
} from "./story-workflow.types.js";

export interface WorkflowInvalidationDecision {
  readonly stageId: WorkflowStageState<unknown>["stageId"];
  readonly status: "fresh" | "stale" | "cache-reused";
  readonly cache: CacheMetadata;
}

export function compareFingerprintInputs(
  previous: FingerprintInputs,
  next: FingerprintInputs
): readonly string[] {
  const reasons: string[] = [];
  for (const key of [
    "sourceFingerprint",
    "promptFingerprint",
    "schemaFingerprint",
    "model",
    "reasoningEffort",
    "configFingerprint",
    "workflowSchemaVersion",
  ] as const) {
    if (previous[key] !== next[key]) {
      reasons.push(key);
    }
  }
  if (previous.parentFingerprints.join(",") !== next.parentFingerprints.join(",")) {
    reasons.push("parentFingerprints");
  }
  return reasons;
}

export function decideStageInvalidation<TArtifact>(
  stage: WorkflowStageState<TArtifact>,
  nextFingerprints: FingerprintInputs
): WorkflowInvalidationDecision {
  const invalidationReasons = compareFingerprintInputs(
    stage.fingerprintInputs,
    nextFingerprints
  );
  if (invalidationReasons.length === 0 && stage.latestOutcome) {
    return {
      stageId: stage.stageId,
      status: "cache-reused",
      cache: {
        ...stage.cache,
        status: "hit",
        invalidationReasons: [],
      },
    };
  }
  return {
    stageId: stage.stageId,
    status: invalidationReasons.length === 0 ? "fresh" : "stale",
    cache: {
      ...stage.cache,
      status: invalidationReasons.length === 0 ? stage.cache.status : "stale",
      invalidationReasons,
    },
  };
}
