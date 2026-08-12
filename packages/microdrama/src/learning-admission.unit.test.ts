import { describe, expect, it } from "vitest";

import {
  planCreativeRecommendation,
  planLearningFindingFromExperimentResult,
} from "@mediaforge/domain";
import {
  evaluateExperimentFromObservations,
  fakeExperimentAssignment,
  fakeExperimentRevision,
  fakePerformanceObservationIdentity,
  fakeTikTokVideoCounters,
  ingestPerformanceObservation,
} from "@mediaforge/performance";
import {
  NARRATIVE_SCHEMA_VERSION,
  narrativePromiseIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativeSnapshotIdSchema,
  seriesIdSchema,
  type NarrativeSnapshotPayload,
} from "@mediaforge/narrative-core";

import {
  acceptCreativeRecommendationForPlanning,
  selectAcceptedRecommendationsForPlanning,
  validateCreativeRecommendationCanonSafety,
} from "./learning-admission.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

const SNAPSHOT_REVISION_ID = narrativeRevisionIdSchema.parse(
  "rev.snapshot.season-1.e010"
);
const SNAPSHOT_ID = narrativeSnapshotIdSchema.parse("snapshot.season-1.e010");

function acceptedSnapshot(): NarrativeSnapshotPayload {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    seriesId: seriesIdSchema.parse(SEVEN_MINUTES_AHEAD_SERIES_ID),
    episodeId: "episode.e010",
    acceptedSeriesBibleRevisionId: narrativeRevisionIdSchema.parse(
      "rev.series-bible.v5-remediated"
    ),
    characterStates: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        characterId: "mara",
        goal: "Decode the signal",
        belief: "The loop is real",
        emotionalState: "anxious",
        injuriesAndStatus: [],
        provenanceRevisionIds: [],
      },
    ],
    relationshipStates: [],
    secrets: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        secretId: narrativeSecretIdSchema.parse("secret.signal-origin"),
        objectiveFact: "The signal originates outside the loop",
        holderCharacterIds: ["mara"],
        affectedCharacterIds: ["mara"],
        audienceKnowledge: "unknown",
        revealConstraints: ["forbidden before E050"],
        revealStatus: "hidden",
        revealProvenanceRevisionIds: [],
      },
    ],
    knowledgeClaims: [],
    promises: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        promiseId: narrativePromiseIdSchema.parse("promise.packet-truth"),
        description: "Reveal who sent the packet",
        plantedEpisodeId: "episode.e001",
        payoffWindowStartEpisodeId: "episode.e020",
        payoffWindowEndEpisodeId: "episode.e030",
        progression: "Escalate suspicion",
        status: "open",
      },
    ],
    provenance: {
      sourceKind: "acceptance",
      sourceRevisionIds: [SNAPSHOT_REVISION_ID],
    },
  };
}

const admissionContext = {
  anchoredSnapshot: acceptedSnapshot(),
  anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
  lastAcceptedEpisodeNumber: 10,
};

function fixtureFinding() {
  const revision = fakeExperimentRevision();
  const assignment = fakeExperimentAssignment({ revision });
  const observation = ingestPerformanceObservation({
    identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
    providerVideoId: "tiktok.video.learning",
    counters: fakeTikTokVideoCounters({ view_count: 150 }),
    observedAt: "2026-08-12T12:00:00.000Z",
    fetchedAt: "2026-08-12T12:00:00.000Z",
    idempotencyKey: "perf.learning.admission",
  });
  const result = evaluateExperimentFromObservations({
    experimentRevision: revision,
    assignment,
    observations: [observation],
    idempotencyKey: "exp.result.admission",
  });
  return planLearningFindingFromExperimentResult({
    findingId: "finding.hook.completion",
    revisionNumber: 1,
    seriesId: revision.seriesId,
    experimentResult: result,
    summary: "Shorter cold-open hooks correlate with higher completion.",
  });
}

function fixturePlanningRecommendation(input: {
  readonly finding: ReturnType<typeof fixtureFinding>;
  readonly guidance: string;
  readonly targetEpisodeIds: readonly string[];
}) {
  return planCreativeRecommendation({
    recommendationId: "recommendation.hook.presentation",
    revisionNumber: 1,
    seriesId: input.finding.seriesId,
    findingRevisionIds: [input.finding.findingRevisionId],
    targetEpisodeIds: [...input.targetEpisodeIds],
    targetPlanningHorizons: ["near_horizon", "current_episode"],
    canonImpact: {
      kind: "planning_only",
      surfaces: ["hook_presentation", "pacing_ratio"],
    },
    guidance: input.guidance,
    status: "VALIDATED",
    recordedAt: input.finding.recordedAt,
  });
}

describe("learning admission", () => {
  it("rejects recommendations that mutate prior canon surfaces", () => {
    const finding = fixtureFinding();
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
      status: "VALIDATED",
      recordedAt: finding.recordedAt,
    });

    const validation = validateCreativeRecommendationCanonSafety({
      recommendation,
      context: admissionContext,
    });

    expect(validation.ok).toBe(false);
    if (validation.ok) {
      throw new Error("Expected canon mutation rejection.");
    }
    expect(validation.issues.map((entry) => entry.code)).toEqual([
      "canon_mutation_forbidden",
      "canon_mutation_forbidden",
    ]);
  });

  it("rejects recommendations targeting already-accepted episodes", () => {
    const finding = fixtureFinding();
    const recommendation = fixturePlanningRecommendation({
      finding,
      guidance: "Tighten hook presentation for E010.",
      targetEpisodeIds: ["E010"],
    });

    const validation = validateCreativeRecommendationCanonSafety({
      recommendation,
      context: admissionContext,
    });

    expect(validation.ok).toBe(false);
    if (validation.ok) {
      throw new Error("Expected prior-episode rejection.");
    }
    expect(validation.issues[0]?.code).toBe("canon_mutation_forbidden");
  });

  it("accepts planning-only recommendations and admits only explicitly accepted ones", () => {
    const finding = fixtureFinding();
    const recommendation = fixturePlanningRecommendation({
      finding,
      guidance: "Tighten the cold-open hook presentation for E011.",
      targetEpisodeIds: ["E011"],
    });

    const acceptance = acceptCreativeRecommendationForPlanning({
      recommendation,
      context: admissionContext,
      admissionId: "admission.hook.presentation.001",
      acceptedBy: "operator.planning",
      acceptedAt: "2026-08-12T14:00:00.000Z",
    });

    expect(acceptance.ok).toBe(true);
    if (!acceptance.ok || !acceptance.admission) {
      throw new Error("Expected successful admission.");
    }

    const withoutAdmission = selectAcceptedRecommendationsForPlanning({
      recommendations: [{ ...recommendation, status: "VALIDATED" }],
      admissions: [],
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
    });
    expect(withoutAdmission.acceptedRecommendations).toHaveLength(0);

    const withAdmission = selectAcceptedRecommendationsForPlanning({
      recommendations: [{ ...recommendation, status: "ACCEPTED" }],
      admissions: [acceptance.admission],
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
    });
    expect(withAdmission.acceptedRecommendations).toHaveLength(1);
    expect(withAdmission.acceptedRecommendations[0]).toMatchObject({
      recommendationRevisionId: recommendation.recommendationRevisionId,
      acceptedPlanningSurfaces: ["hook_presentation", "pacing_ratio"],
      guidance: "Tighten the cold-open hook presentation for E011.",
    });
  });
});
