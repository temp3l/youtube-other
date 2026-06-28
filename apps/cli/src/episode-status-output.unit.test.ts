import { describe, expect, it } from "vitest";
import { buildEpisodeStatusOutput } from "./episode-status-output.js";

describe("episode status output", () => {
  it("includes image generation readiness alongside episode metadata", () => {
    expect(
      buildEpisodeStatusOutput({
        episodeId: "001-demo",
        slug: "demo-episode",
        pipelineRuns: 2,
        imageGeneration: {
          totalBatches: 3,
          pendingBatches: 1,
          requiresImportBatches: 1,
          importedBatches: 1,
          failedBatches: 0,
          mergedWithPreviousScenes: 2,
          mergedWithNextScenes: 1,
          reusedScenes: 3,
          readyForRender: false,
          episodeNumbers: ["001"],
          sceneCount: 12,
        },
      })
    ).toEqual({
      episodeId: "001-demo",
      slug: "demo-episode",
      pipelineRuns: 2,
      imageGeneration: {
        readyForRender: false,
        episodeNumbers: ["001"],
        batchCounts: {
          totalBatches: 3,
          pendingBatches: 1,
          requiresImportBatches: 1,
          importedBatches: 1,
          failedBatches: 0,
        },
        sceneCount: 12,
        mergeCounts: {
          mergedWithPreviousScenes: 2,
          mergedWithNextScenes: 1,
          reusedScenes: 3,
        },
      },
    });
  });
});
