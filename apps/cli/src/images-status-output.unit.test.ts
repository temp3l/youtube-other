import { describe, expect, it } from "vitest";
import { buildImageStatusOutput } from "./images-status-output.js";

describe("image status output", () => {
  it("groups merge and reuse counters with the readiness summary", () => {
    expect(
      buildImageStatusOutput({
        totalBatches: 3,
        pendingBatches: 1,
        requiresImportBatches: 1,
        importedBatches: 1,
        failedBatches: 0,
        mergedWithPreviousScenes: 2,
        mergedWithNextScenes: 1,
        reusedScenes: 3,
        readyForRender: false,
        retryableFailedScenes: 2,
        failureCategories: {
          "provider-transient-error": 2,
          "prompt-validation-error": 1,
        },
        episodeNumbers: ["001", "002"],
        sceneCount: 12,
      })
    ).toEqual({
      readyForRender: false,
      episodeNumbers: ["001", "002"],
      batchCounts: {
        totalBatches: 3,
        pendingBatches: 1,
        requiresImportBatches: 1,
        importedBatches: 1,
        failedBatches: 0,
      },
      sceneCount: 12,
      retryableFailedScenes: 2,
      failureCategories: {
        "provider-transient-error": 2,
        "prompt-validation-error": 1,
      },
      mergeCounts: {
        mergedWithPreviousScenes: 2,
        mergedWithNextScenes: 1,
        reusedScenes: 3,
      },
    });
  });
});
