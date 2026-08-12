import { z } from "zod";

import { microdramaExperimentCausalConfidenceSchema } from "./microdrama-experiment-contracts.js";

export const MICRODRAMA_LEARNING_SCHEMA_VERSION =
  "mediaforge.microdrama-learning.v1" as const;

export const CANON_PROTECTED_SURFACES = [
  "prior_truth",
  "canonical_events",
  "knowledge_state",
  "reveal_order",
  "promise_resolution",
] as const;

export const PLANNING_SAFE_SURFACES = [
  "hook_presentation",
  "pacing_ratio",
  "visual_emphasis",
  "metadata_variant",
  "cliffhanger_presentation",
] as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

const microdramaTargetEpisodeIdSchema = z
  .string()
  .regex(/^E\d{3}$/u, "Target episode ids use E### format.");

export const canonProtectedSurfaceSchema = z.enum(CANON_PROTECTED_SURFACES);
export type CanonProtectedSurface = z.infer<typeof canonProtectedSurfaceSchema>;

export const planningSafeSurfaceSchema = z.enum(PLANNING_SAFE_SURFACES);
export type PlanningSafeSurface = z.infer<typeof planningSafeSurfaceSchema>;

export const LEARNING_FINDING_SOURCE_KINDS = [
  "experiment_result",
  "observation_aggregate",
] as const;
export const learningFindingSourceKindSchema = z.enum(LEARNING_FINDING_SOURCE_KINDS);
export type LearningFindingSourceKind = z.infer<typeof learningFindingSourceKindSchema>;

export const learningFindingProvenanceSchema = z
  .object({
    sourceKind: learningFindingSourceKindSchema,
    experimentResultIds: z.array(identifierSchema).optional(),
    observationIds: z.array(identifierSchema).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.experimentResultIds?.length ?? 0) > 0 ||
      (value.observationIds?.length ?? 0) > 0,
    "Learning findings must reference at least one experiment result or observation."
  );
export type LearningFindingProvenance = z.infer<typeof learningFindingProvenanceSchema>;

export const learningFindingRevisionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_LEARNING_SCHEMA_VERSION),
    findingId: identifierSchema,
    findingRevisionId: identifierSchema,
    revisionNumber: z.number().int().positive(),
    seriesId: identifierSchema,
    provenance: learningFindingProvenanceSchema,
    summary: nonEmptyStringSchema,
    insightKind: z.enum(["performance_pattern", "retention_signal", "engagement_signal"]),
    metricKinds: z.array(nonEmptyStringSchema).min(1),
    causalConfidence: microdramaExperimentCausalConfidenceSchema,
    recordedAt: isoDateTimeSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type LearningFindingRevision = z.infer<typeof learningFindingRevisionSchema>;

export const CREATIVE_RECOMMENDATION_REVISION_STATUSES = [
  "DRAFT",
  "VALIDATED",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export const creativeRecommendationRevisionStatusSchema = z.enum(
  CREATIVE_RECOMMENDATION_REVISION_STATUSES
);
export type CreativeRecommendationRevisionStatus = z.infer<
  typeof creativeRecommendationRevisionStatusSchema
>;

export const creativeRecommendationCanonImpactSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("planning_only"),
      surfaces: z.array(planningSafeSurfaceSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("canon_mutation"),
      surfaces: z.array(canonProtectedSurfaceSchema).min(1),
      rationale: nonEmptyStringSchema,
    })
    .strict(),
]);
export type CreativeRecommendationCanonImpact = z.infer<
  typeof creativeRecommendationCanonImpactSchema
>;

export const creativeRecommendationRevisionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_LEARNING_SCHEMA_VERSION),
    recommendationId: identifierSchema,
    recommendationRevisionId: identifierSchema,
    revisionNumber: z.number().int().positive(),
    seriesId: identifierSchema,
    findingRevisionIds: z.array(identifierSchema).min(1),
    targetEpisodeIds: z.array(microdramaTargetEpisodeIdSchema).min(1),
    targetPlanningHorizons: z.array(nonEmptyStringSchema).min(1),
    canonImpact: creativeRecommendationCanonImpactSchema,
    guidance: nonEmptyStringSchema,
    status: creativeRecommendationRevisionStatusSchema,
    recordedAt: isoDateTimeSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type CreativeRecommendationRevision = z.infer<
  typeof creativeRecommendationRevisionSchema
>;

export const creativeRecommendationAdmissionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_LEARNING_SCHEMA_VERSION),
    admissionId: identifierSchema,
    recommendationRevisionId: identifierSchema,
    recommendationId: identifierSchema,
    anchoredSnapshotRevisionId: identifierSchema,
    acceptedPlanningSurfaces: z.array(planningSafeSurfaceSchema).min(1),
    acceptedAt: isoDateTimeSchema,
    acceptedBy: nonEmptyStringSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type CreativeRecommendationAdmission = z.infer<
  typeof creativeRecommendationAdmissionSchema
>;

export function validateLearningFindingRevision(
  input: unknown
): LearningFindingRevision {
  return learningFindingRevisionSchema.parse(input);
}

export function validateCreativeRecommendationRevision(
  input: unknown
): CreativeRecommendationRevision {
  return creativeRecommendationRevisionSchema.parse(input);
}

export function validateCreativeRecommendationAdmission(
  input: unknown
): CreativeRecommendationAdmission {
  return creativeRecommendationAdmissionSchema.parse(input);
}
