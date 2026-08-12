import type {
  CreativeRecommendationRevision,
  LearningFindingRevision,
  PlanningSafeSurface,
} from "@mediaforge/domain";
import {
  planCreativeRecommendation,
  planLearningFindingFromExperimentResult,
} from "@mediaforge/domain";

import {
  evaluateExperimentFromObservations,
} from "./experiment-evaluation.js";
import {
  fakeExperimentAssignment,
  fakeExperimentRevision,
} from "./experiment-fixtures.js";
import { ingestPerformanceObservation } from "./performance-ingestion.js";
import {
  fakePerformanceObservationIdentity,
  fakeTikTokVideoCounters,
} from "./provider-fixtures.js";

export function projectLearningFindingFromControlledExperiment(input?: {
  readonly findingId?: string;
  readonly summary?: string;
}): LearningFindingRevision {
  const revision = fakeExperimentRevision();
  const assignment = fakeExperimentAssignment({ revision });
  const observation = ingestPerformanceObservation({
    identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
    providerVideoId: "tiktok.video.learning",
    counters: fakeTikTokVideoCounters({ view_count: 150, like_count: 12 }),
    observedAt: "2026-08-12T12:00:00.000Z",
    fetchedAt: "2026-08-12T12:00:00.000Z",
    idempotencyKey: "perf.learning.controlled",
  });
  const result = evaluateExperimentFromObservations({
    experimentRevision: revision,
    assignment,
    observations: [observation],
    idempotencyKey: "exp.result.learning",
  });

  return planLearningFindingFromExperimentResult({
    findingId: input?.findingId ?? "finding.hook.completion",
    revisionNumber: 1,
    seriesId: revision.seriesId,
    experimentResult: result,
    summary:
      input?.summary ??
      "Shorter cold-open hooks correlate with higher completion in the controlled assignment.",
  });
}

export function projectCreativeRecommendationFromFinding(input: {
  readonly finding: LearningFindingRevision;
  readonly recommendationId?: string;
  readonly guidance: string;
  readonly surfaces: readonly PlanningSafeSurface[];
  readonly targetEpisodeIds?: readonly string[];
}): CreativeRecommendationRevision {
  return planCreativeRecommendation({
    recommendationId: input.recommendationId ?? "recommendation.hook.presentation",
    revisionNumber: 1,
    seriesId: input.finding.seriesId,
    findingRevisionIds: [input.finding.findingRevisionId],
    targetEpisodeIds: [...(input.targetEpisodeIds ?? ["E011"])],
    targetPlanningHorizons: ["near_horizon", "current_episode"],
    canonImpact: {
      kind: "planning_only",
      surfaces: [...input.surfaces],
    },
    guidance: input.guidance,
    status: "VALIDATED",
    recordedAt: input.finding.recordedAt,
  });
}
