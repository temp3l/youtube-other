import {
  stageFailureSchemaVersion,
  type BatchItemState,
  type BatchSubmission,
  type StageFailure,
} from "./story-workflow.types.js";

export interface BatchReconciliationResult {
  readonly submission: BatchSubmission;
  readonly completedItemCount: number;
  readonly failedItemCount: number;
  readonly retryableItems: readonly BatchItemState[];
}

function itemFailure(message: string): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category: "rewrite-provider-failure",
    retryability: "retryable",
    message,
    occurredAt: new Date().toISOString(),
  };
}

export function reconcileWorkflowBatch(
  submission: BatchSubmission
): BatchReconciliationResult {
  const items = submission.items.map((item) =>
    submission.status === "expired" ||
    submission.status === "cancelled" ||
    submission.status === "failed"
      ? {
          ...item,
          status: "failed" as const,
          failure: item.failure ?? itemFailure(`Batch ${submission.status}.`),
        }
      : item
  );
  const nextSubmission: BatchSubmission = {
    ...submission,
    items,
  };
  return {
    submission: nextSubmission,
    completedItemCount: items.filter((item) =>
      item.status === "completed" || item.status === "persisted"
    ).length,
    failedItemCount: items.filter((item) =>
      item.status === "failed" || item.status === "schema-invalid"
    ).length,
    retryableItems: items.filter(
      (item) => item.failure?.retryability === "retryable"
    ),
  };
}
