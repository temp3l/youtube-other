import { describe, expect, it } from "vitest";

import { planCreativeRecommendation } from "@mediaforge/domain";

import {
  projectCreativeRecommendationFromFinding,
  projectLearningFindingFromControlledExperiment,
} from "./learning-projection.js";

describe("learning projection", () => {
  it("creates revision-linked findings from experiment results", () => {
    const finding = projectLearningFindingFromControlledExperiment();

    expect(finding.provenance.sourceKind).toBe("experiment_result");
    expect(finding.provenance.experimentResultIds).toHaveLength(1);
    expect(finding.provenance.observationIds).toHaveLength(1);
    expect(finding.causalConfidence.kind).toBe("controlled");
    expect(finding.metricKinds).toEqual(["views", "completion_rate"]);
  });

  it("creates planning-only recommendations from findings", () => {
    const finding = projectLearningFindingFromControlledExperiment();
    const recommendation = projectCreativeRecommendationFromFinding({
      finding,
      guidance: "Tighten the cold-open hook presentation for the next near-horizon episodes.",
      surfaces: ["hook_presentation", "pacing_ratio"],
    });

    expect(recommendation.findingRevisionIds).toEqual([finding.findingRevisionId]);
    expect(recommendation.canonImpact).toEqual({
      kind: "planning_only",
      surfaces: ["hook_presentation", "pacing_ratio"],
    });
    expect(recommendation.status).toBe("VALIDATED");
  });

  it("preserves canon-mutation intent on recommendation revisions without auto-accepting", () => {
    const finding = projectLearningFindingFromControlledExperiment();
    const recommendation = planCreativeRecommendation({
      recommendationId: "recommendation.reveal.rewrite",
      revisionNumber: 1,
      seriesId: finding.seriesId,
      findingRevisionIds: [finding.findingRevisionId],
      targetEpisodeIds: ["E011"],
      targetPlanningHorizons: ["current_episode"],
      canonImpact: {
        kind: "canon_mutation",
        surfaces: ["reveal_order", "promise_resolution"],
        rationale: "Analytics suggests resolving the packet promise early.",
      },
      guidance: "Reveal the packet sender in E011.",
      status: "DRAFT",
      recordedAt: finding.recordedAt,
    });

    expect(recommendation.canonImpact.kind).toBe("canon_mutation");
    expect(recommendation.status).toBe("DRAFT");
  });
});
