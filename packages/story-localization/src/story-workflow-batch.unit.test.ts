import { describe, expect, it } from "vitest";
import { reconcileWorkflowBatch } from "./story-workflow-batch.js";
import { workflowSchemaVersion } from "./story-workflow.types.js";

function fingerprintInputs() {
  return {
    parentFingerprints: [],
    workflowSchemaVersion,
  };
}

describe("story workflow batch reconciliation", () => {
  it("keeps item success and exposes retryable failed items", () => {
    const result = reconcileWorkflowBatch({
      id: "batch-localize",
      status: "imported_with_failures",
      category: "text-localization",
      operation: "localization",
      stageIds: ["stage:localize-full:es:full" as never],
      items: [
        {
          customId: "ok",
          stageId: "stage:localize-full:es:full" as never,
          locale: "es",
          format: "full",
          status: "persisted",
          updatedAt: "2026-07-01T00:00:00.000Z",
          fingerprintInputs: fingerprintInputs(),
        },
        {
          customId: "bad",
          stageId: "stage:localize-full:fr:full" as never,
          locale: "fr",
          format: "full",
          status: "failed",
          updatedAt: "2026-07-01T00:00:00.000Z",
          fingerprintInputs: fingerprintInputs(),
          failure: {
            schemaVersion: "stage-failure-v1",
            category: "localization-provider-failure",
            retryability: "retryable",
            message: "Provider failed.",
            occurredAt: "2026-07-01T00:00:00.000Z",
          },
        },
      ],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(result.completedItemCount).toBe(1);
    expect(result.failedItemCount).toBe(1);
    expect(result.retryableItems.map((item) => item.customId)).toEqual(["bad"]);
  });

  it("marks expired batch items retryable", () => {
    const result = reconcileWorkflowBatch({
      id: "batch-expired",
      status: "expired",
      category: "text-localization",
      operation: "localization",
      stageIds: ["stage:localize-full:es:full" as never],
      items: [
        {
          customId: "pending",
          stageId: "stage:localize-full:es:full" as never,
          locale: "es",
          format: "full",
          status: "submitted",
          updatedAt: "2026-07-01T00:00:00.000Z",
          fingerprintInputs: fingerprintInputs(),
        },
      ],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(result.submission.items[0]?.status).toBe("failed");
    expect(result.retryableItems).toHaveLength(1);
  });
});
