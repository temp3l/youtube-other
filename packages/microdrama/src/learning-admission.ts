import type { NarrativeSnapshotPayload } from "@mediaforge/narrative-core";
import { isCanonProtectedSurface } from "@mediaforge/narrative-core";
import type {
  CreativeRecommendationAdmission,
  CreativeRecommendationRevision,
} from "@mediaforge/domain";
import { planCreativeRecommendationAdmission } from "@mediaforge/domain";

import {
  LEARNING_ADMISSION_SCHEMA_VERSION,
  type AcceptedPlanningLearningInput,
  type LearningAdmissionIssue,
  type LearningAdmissionValidationResult,
  type PlanningLearningInputs,
} from "./learning-admission-contracts.js";
import { parseCanonicalEpisodeNumber } from "./rolling-plan-contracts.js";

export type LearningAdmissionContext = {
  readonly anchoredSnapshot: NarrativeSnapshotPayload;
  readonly anchoredSnapshotRevisionId: string;
  readonly lastAcceptedEpisodeNumber: number;
};

function issue(
  code: LearningAdmissionIssue["code"],
  message: string,
  path?: string
): LearningAdmissionIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function fail(issues: LearningAdmissionIssue[]): LearningAdmissionValidationResult {
  return { ok: false, issues };
}

export function validateCreativeRecommendationCanonSafety(input: {
  readonly recommendation: CreativeRecommendationRevision;
  readonly context: LearningAdmissionContext;
}): LearningAdmissionValidationResult {
  const issues: LearningAdmissionIssue[] = [];
  const { recommendation, context } = input;

  if (recommendation.status !== "VALIDATED" && recommendation.status !== "ACCEPTED") {
    issues.push(
      issue(
        "recommendation_not_validated",
        `Recommendation ${recommendation.recommendationRevisionId} must be VALIDATED before admission.`,
        "status"
      )
    );
  }

  if (recommendation.canonImpact.kind === "canon_mutation") {
    for (const surface of recommendation.canonImpact.surfaces) {
      issues.push(
        issue(
          "canon_mutation_forbidden",
          `Recommendation cannot mutate canon surface ${surface}.`,
          `canonImpact.surfaces.${surface}`
        )
      );
    }
  }

  for (const surface of recommendation.canonImpact.kind === "planning_only"
    ? recommendation.canonImpact.surfaces
    : []) {
    if (isCanonProtectedSurface(surface)) {
      issues.push(
        issue(
          "protected_surface_requested",
          `Surface ${surface} is canon-protected and cannot enter planning.`,
          `canonImpact.surfaces.${surface}`
        )
      );
    }
  }

  for (const episodeId of recommendation.targetEpisodeIds) {
    const episodeNumber = parseCanonicalEpisodeNumber(episodeId);
    if (episodeNumber === null) {
      issues.push(
        issue(
          "target_episode_out_of_range",
          `Target episode ${episodeId} is not canonical.`,
          episodeId
        )
      );
      continue;
    }
    if (episodeNumber <= context.lastAcceptedEpisodeNumber) {
      issues.push(
        issue(
          "canon_mutation_forbidden",
          `Recommendation cannot target already-accepted episode ${episodeId}.`,
          episodeId
        )
      );
    }
  }

  return issues.length === 0 ? { ok: true } : fail(issues);
}

export function acceptCreativeRecommendationForPlanning(input: {
  readonly recommendation: CreativeRecommendationRevision;
  readonly context: LearningAdmissionContext;
  readonly admissionId: string;
  readonly acceptedBy: string;
  readonly acceptedAt: string;
}): LearningAdmissionValidationResult & {
  readonly admission?: CreativeRecommendationAdmission;
} {
  const validation = validateCreativeRecommendationCanonSafety({
    recommendation: input.recommendation,
    context: input.context,
  });
  if (!validation.ok) {
    return validation;
  }

  if (input.recommendation.canonImpact.kind !== "planning_only") {
    return fail([
      issue(
        "canon_mutation_forbidden",
        "Only planning-only recommendations can be accepted into future planning."
      ),
    ]);
  }

  const admission = planCreativeRecommendationAdmission({
    admissionId: input.admissionId,
    recommendation: input.recommendation,
    anchoredSnapshotRevisionId: input.context.anchoredSnapshotRevisionId,
    acceptedPlanningSurfaces: input.recommendation.canonImpact.surfaces,
    acceptedAt: input.acceptedAt,
    acceptedBy: input.acceptedBy,
  });

  return { ok: true, admission };
}

export function buildAcceptedPlanningLearningInput(input: {
  readonly recommendation: CreativeRecommendationRevision;
  readonly admission: CreativeRecommendationAdmission;
}): AcceptedPlanningLearningInput {
  return {
    schemaVersion: LEARNING_ADMISSION_SCHEMA_VERSION,
    admissionId: input.admission.admissionId,
    recommendationRevisionId: input.admission.recommendationRevisionId,
    recommendationId: input.admission.recommendationId,
    anchoredSnapshotRevisionId: input.admission.anchoredSnapshotRevisionId,
    targetEpisodeIds: [...input.recommendation.targetEpisodeIds],
    acceptedPlanningSurfaces: [...input.admission.acceptedPlanningSurfaces],
    guidance: input.recommendation.guidance,
    acceptedAt: input.admission.acceptedAt,
  };
}

export function selectAcceptedRecommendationsForPlanning(input: {
  readonly recommendations: readonly CreativeRecommendationRevision[];
  readonly admissions: readonly CreativeRecommendationAdmission[];
  readonly anchoredSnapshotRevisionId: string;
}): PlanningLearningInputs {
  const admittedRevisionIds = new Set(
    input.admissions
      .filter(
        (admission) =>
          admission.anchoredSnapshotRevisionId === input.anchoredSnapshotRevisionId
      )
      .map((admission) => admission.recommendationRevisionId)
  );

  const acceptedRecommendations = input.recommendations
    .filter(
      (recommendation) =>
        recommendation.status === "ACCEPTED" &&
        admittedRevisionIds.has(recommendation.recommendationRevisionId)
    )
    .map((recommendation) => {
      const admission = input.admissions.find(
        (entry) =>
          entry.recommendationRevisionId === recommendation.recommendationRevisionId
      );
      if (!admission) {
        return null;
      }
      return buildAcceptedPlanningLearningInput({ recommendation, admission });
    })
    .filter((entry): entry is AcceptedPlanningLearningInput => entry !== null);

  return {
    schemaVersion: LEARNING_ADMISSION_SCHEMA_VERSION,
    anchoredSnapshotRevisionId: input.anchoredSnapshotRevisionId,
    acceptedRecommendations,
  };
}

export function rejectUnadmittedRecommendationsForPlanning(input: {
  readonly recommendations: readonly CreativeRecommendationRevision[];
  readonly admissions: readonly CreativeRecommendationAdmission[];
  readonly anchoredSnapshotRevisionId: string;
}): readonly CreativeRecommendationRevision[] {
  const planningInputs = selectAcceptedRecommendationsForPlanning(input);
  const admittedIds = new Set(
    planningInputs.acceptedRecommendations.map(
      (entry) => entry.recommendationRevisionId
    )
  );
  return input.recommendations.filter(
    (recommendation) => !admittedIds.has(recommendation.recommendationRevisionId)
  );
}
