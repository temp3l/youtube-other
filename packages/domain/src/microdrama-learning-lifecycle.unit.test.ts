import { describe, expect, it } from "vitest";

import { planCreativeRecommendation } from "./microdrama-learning-lifecycle.js";

describe("learning lifecycle", () => {
  it("accepts canonical E### target episode ids", () => {
    const recommendation = planCreativeRecommendation({
      recommendationId: "recommendation.hook.presentation",
      revisionNumber: 1,
      seriesId: "series.seven-minutes-ahead",
      findingRevisionIds: ["finding.hook.completion.v1"],
      targetEpisodeIds: ["E011"],
      targetPlanningHorizons: ["near_horizon"],
      canonImpact: {
        kind: "planning_only",
        surfaces: ["hook_presentation"],
      },
      guidance: "Tighten hook presentation.",
      recordedAt: "2026-08-12T12:00:00.000Z",
    });

    expect(recommendation.targetEpisodeIds).toEqual(["E011"]);
  });
});
