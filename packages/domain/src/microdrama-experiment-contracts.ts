import { z } from "zod";

import {
  microdramaPerformanceMetricKindSchema,
  microdramaPerformanceObservationWindowSchema,
} from "./microdrama-performance-contracts.js";
import { microdramaPublicationProviderSchema } from "./microdrama-publication-contracts.js";

export const MICRODRAMA_EXPERIMENT_SCHEMA_VERSION =
  "mediaforge.microdrama-experiment.v1" as const;

export const MICRODRAMA_EXPERIMENT_OBSERVATIONAL_LIMITATIONS = [
  "cross_locale_comparison",
  "missing_assignment",
  "uncontrolled_variables",
  "cross_provider_comparison",
] as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const microdramaExperimentObservationalLimitationSchema = z.enum(
  MICRODRAMA_EXPERIMENT_OBSERVATIONAL_LIMITATIONS
);
export type MicrodramaExperimentObservationalLimitation = z.infer<
  typeof microdramaExperimentObservationalLimitationSchema
>;

export const microdramaExperimentCandidateSchema = z
  .object({
    candidateId: identifierSchema,
    label: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
  })
  .strict();
export type MicrodramaExperimentCandidate = z.infer<
  typeof microdramaExperimentCandidateSchema
>;

export const microdramaExperimentEligibilitySchema = z
  .object({
    locales: z.array(nonEmptyStringSchema).min(1),
    providers: z.array(microdramaPublicationProviderSchema).min(1),
    minimumObservationWindowHours: z.number().int().positive(),
  })
  .strict();
export type MicrodramaExperimentEligibility = z.infer<
  typeof microdramaExperimentEligibilitySchema
>;

export const microdramaExperimentRevisionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_EXPERIMENT_SCHEMA_VERSION),
    experimentId: identifierSchema,
    experimentRevisionId: identifierSchema,
    revisionNumber: z.number().int().positive(),
    seriesId: identifierSchema,
    hypothesis: nonEmptyStringSchema,
    controlledVariable: nonEmptyStringSchema,
    control: microdramaExperimentCandidateSchema,
    candidates: z.array(microdramaExperimentCandidateSchema).min(1),
    eligibility: microdramaExperimentEligibilitySchema,
    observationWindow: microdramaPerformanceObservationWindowSchema,
    stoppingRule: nonEmptyStringSchema,
    recordedAt: isoDateTimeSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type MicrodramaExperimentRevision = z.infer<
  typeof microdramaExperimentRevisionSchema
>;

export const microdramaExperimentAssignmentBindingSchema = z
  .object({
    seriesId: identifierSchema,
    episodeId: identifierSchema,
    episodeRevisionId: identifierSchema,
    locale: nonEmptyStringSchema,
    provider: microdramaPublicationProviderSchema,
    providerAccountId: identifierSchema,
    publicationId: identifierSchema,
    publicationRevision: z.number().int().nonnegative(),
    renderHash: sha256Schema,
    metadataRevisionId: identifierSchema,
  })
  .strict();
export type MicrodramaExperimentAssignmentBinding = z.infer<
  typeof microdramaExperimentAssignmentBindingSchema
>;

export const microdramaExperimentAssignmentSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_EXPERIMENT_SCHEMA_VERSION),
    assignmentId: identifierSchema,
    experimentId: identifierSchema,
    experimentRevisionId: identifierSchema,
    candidateId: identifierSchema,
    binding: microdramaExperimentAssignmentBindingSchema,
    assignedAt: isoDateTimeSchema,
    idempotencyKey: identifierSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type MicrodramaExperimentAssignment = z.infer<
  typeof microdramaExperimentAssignmentSchema
>;

export const microdramaExperimentResultMetricDefinitionSchema = z
  .object({
    metricKind: microdramaPerformanceMetricKindSchema,
    label: nonEmptyStringSchema,
    source: z.enum(["normalized_observation", "derived_comparison"]),
  })
  .strict();
export type MicrodramaExperimentResultMetricDefinition = z.infer<
  typeof microdramaExperimentResultMetricDefinitionSchema
>;

export const microdramaExperimentCausalConfidenceSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("controlled"),
        rationale: nonEmptyStringSchema,
        assignmentId: identifierSchema,
        experimentRevisionId: identifierSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("observational"),
        rationale: nonEmptyStringSchema,
        limitationCodes: z
          .array(microdramaExperimentObservationalLimitationSchema)
          .min(1),
      })
      .strict(),
  ]
);
export type MicrodramaExperimentCausalConfidence = z.infer<
  typeof microdramaExperimentCausalConfidenceSchema
>;

export const microdramaExperimentResultProvenanceSchema = z
  .object({
    experimentRevisionId: identifierSchema,
    assignmentId: identifierSchema.optional(),
    observationIds: z.array(identifierSchema).min(1),
    eligibility: microdramaExperimentEligibilitySchema,
    observationWindow: microdramaPerformanceObservationWindowSchema,
  })
  .strict();
export type MicrodramaExperimentResultProvenance = z.infer<
  typeof microdramaExperimentResultProvenanceSchema
>;

export const microdramaExperimentResultSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_EXPERIMENT_SCHEMA_VERSION),
    resultId: identifierSchema,
    experimentId: identifierSchema,
    provenance: microdramaExperimentResultProvenanceSchema,
    metricDefinitions: z
      .array(microdramaExperimentResultMetricDefinitionSchema)
      .min(1),
    limitations: z.array(nonEmptyStringSchema),
    causalConfidence: microdramaExperimentCausalConfidenceSchema,
    comparisonSummary: nonEmptyStringSchema.optional(),
    recordedAt: isoDateTimeSchema,
    idempotencyKey: identifierSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type MicrodramaExperimentResult = z.infer<
  typeof microdramaExperimentResultSchema
>;

export function validateMicrodramaExperimentRevision(
  input: unknown
): MicrodramaExperimentRevision {
  return microdramaExperimentRevisionSchema.parse(input);
}

export function validateMicrodramaExperimentAssignment(
  input: unknown
): MicrodramaExperimentAssignment {
  return microdramaExperimentAssignmentSchema.parse(input);
}

export function validateMicrodramaExperimentResult(
  input: unknown
): MicrodramaExperimentResult {
  return microdramaExperimentResultSchema.parse(input);
}
