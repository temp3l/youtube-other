import { createHash } from "node:crypto";

import {
  type CreativeRecommendationAdmission,
  type CreativeRecommendationRevision,
  type CreativeRecommendationRevisionStatus,
  type LearningFindingRevision,
  creativeRecommendationAdmissionSchema,
  creativeRecommendationRevisionSchema,
  learningFindingRevisionSchema,
  type LearningFindingProvenance,
} from "./microdrama-learning-contracts.js";
import type {
  MicrodramaExperimentCausalConfidence,
  MicrodramaExperimentResult,
} from "./microdrama-experiment-contracts.js";
import type { PlanningSafeSurface } from "./microdrama-learning-contracts.js";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Learning record cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Learning record contains an unsupported value.");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function planLearningFinding(input: {
  readonly findingId: string;
  readonly revisionNumber: number;
  readonly seriesId: string;
  readonly provenance: LearningFindingProvenance;
  readonly summary: string;
  readonly insightKind: LearningFindingRevision["insightKind"];
  readonly metricKinds: readonly string[];
  readonly causalConfidence: MicrodramaExperimentCausalConfidence;
  readonly recordedAt: string;
}): LearningFindingRevision {
  const findingRevisionId = `${input.findingId}.v${input.revisionNumber}`;
  const body = {
    findingId: input.findingId,
    revisionNumber: input.revisionNumber,
    seriesId: input.seriesId,
    provenance: input.provenance,
    summary: input.summary,
    insightKind: input.insightKind,
    metricKinds: [...input.metricKinds],
    causalConfidence: input.causalConfidence,
    recordedAt: input.recordedAt,
  };
  return learningFindingRevisionSchema.parse({
    schemaVersion: "mediaforge.microdrama-learning.v1",
    findingRevisionId,
    ...body,
    fingerprint: fingerprint(body),
  });
}

export function planLearningFindingFromExperimentResult(input: {
  readonly findingId: string;
  readonly revisionNumber: number;
  readonly seriesId: string;
  readonly experimentResult: MicrodramaExperimentResult;
  readonly summary: string;
  readonly insightKind?: LearningFindingRevision["insightKind"];
  readonly recordedAt?: string;
}): LearningFindingRevision {
  return planLearningFinding({
    findingId: input.findingId,
    revisionNumber: input.revisionNumber,
    seriesId: input.seriesId,
    provenance: {
      sourceKind: "experiment_result",
      experimentResultIds: [input.experimentResult.resultId],
      observationIds: [...input.experimentResult.provenance.observationIds],
    },
    summary: input.summary,
    insightKind: input.insightKind ?? "performance_pattern",
    metricKinds: input.experimentResult.metricDefinitions.map(
      (definition) => definition.metricKind
    ),
    causalConfidence: input.experimentResult.causalConfidence,
    recordedAt: input.recordedAt ?? input.experimentResult.recordedAt,
  });
}

export function planCreativeRecommendation(input: {
  readonly recommendationId: string;
  readonly revisionNumber: number;
  readonly seriesId: string;
  readonly findingRevisionIds: readonly string[];
  readonly targetEpisodeIds: readonly string[];
  readonly targetPlanningHorizons: readonly string[];
  readonly canonImpact: CreativeRecommendationRevision["canonImpact"];
  readonly guidance: string;
  readonly status?: CreativeRecommendationRevisionStatus;
  readonly recordedAt: string;
}): CreativeRecommendationRevision {
  const recommendationRevisionId = `${input.recommendationId}.v${input.revisionNumber}`;
  const body = {
    recommendationId: input.recommendationId,
    revisionNumber: input.revisionNumber,
    seriesId: input.seriesId,
    findingRevisionIds: [...input.findingRevisionIds],
    targetEpisodeIds: [...input.targetEpisodeIds],
    targetPlanningHorizons: [...input.targetPlanningHorizons],
    canonImpact: input.canonImpact,
    guidance: input.guidance,
    status: input.status ?? "DRAFT",
    recordedAt: input.recordedAt,
  };
  return creativeRecommendationRevisionSchema.parse({
    schemaVersion: "mediaforge.microdrama-learning.v1",
    recommendationRevisionId,
    ...body,
    fingerprint: fingerprint(body),
  });
}

export function planCreativeRecommendationAdmission(input: {
  readonly admissionId: string;
  readonly recommendation: CreativeRecommendationRevision;
  readonly anchoredSnapshotRevisionId: string;
  readonly acceptedPlanningSurfaces: readonly PlanningSafeSurface[];
  readonly acceptedAt: string;
  readonly acceptedBy: string;
}): CreativeRecommendationAdmission {
  const body = {
    admissionId: input.admissionId,
    recommendationRevisionId: input.recommendation.recommendationRevisionId,
    recommendationId: input.recommendation.recommendationId,
    anchoredSnapshotRevisionId: input.anchoredSnapshotRevisionId,
    acceptedPlanningSurfaces: [...input.acceptedPlanningSurfaces],
    acceptedAt: input.acceptedAt,
    acceptedBy: input.acceptedBy,
  };
  return creativeRecommendationAdmissionSchema.parse({
    schemaVersion: "mediaforge.microdrama-learning.v1",
    ...body,
    fingerprint: fingerprint(body),
  });
}
