import { z } from "zod";

import {
  creativeRecommendationAdmissionSchema,
  planningSafeSurfaceSchema,
} from "@mediaforge/domain";

export const LEARNING_ADMISSION_SCHEMA_VERSION =
  "mediaforge.microdrama.learning-admission.v1" as const;

export const LEARNING_ADMISSION_ISSUE_CODES = [
  "canon_mutation_forbidden",
  "recommendation_not_validated",
  "snapshot_anchor_mismatch",
  "target_episode_out_of_range",
  "protected_surface_requested",
  "missing_acceptance",
] as const;

export const learningAdmissionIssueCodeSchema = z.enum(LEARNING_ADMISSION_ISSUE_CODES);
export type LearningAdmissionIssueCode = z.infer<typeof learningAdmissionIssueCodeSchema>;

export const learningAdmissionIssueSchema = z
  .object({
    code: learningAdmissionIssueCodeSchema,
    message: z.string().min(1),
    path: z.string().optional(),
  })
  .strict();
export type LearningAdmissionIssue = z.infer<typeof learningAdmissionIssueSchema>;

export const learningAdmissionValidationResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      issues: z.array(learningAdmissionIssueSchema).min(1),
    })
    .strict(),
]);
export type LearningAdmissionValidationResult = z.infer<
  typeof learningAdmissionValidationResultSchema
>;

export const acceptedPlanningLearningInputSchema = z
  .object({
    schemaVersion: z.literal(LEARNING_ADMISSION_SCHEMA_VERSION),
    admissionId: z.string().min(1),
    recommendationRevisionId: z.string().min(1),
    recommendationId: z.string().min(1),
    anchoredSnapshotRevisionId: z.string().min(1),
    targetEpisodeIds: z.array(z.string().min(1)).min(1),
    acceptedPlanningSurfaces: z.array(planningSafeSurfaceSchema).min(1),
    guidance: z.string().min(1),
    acceptedAt: z.string().min(1),
  })
  .strict();
export type AcceptedPlanningLearningInput = z.infer<
  typeof acceptedPlanningLearningInputSchema
>;

export const planningLearningInputsSchema = z
  .object({
    schemaVersion: z.literal(LEARNING_ADMISSION_SCHEMA_VERSION),
    anchoredSnapshotRevisionId: z.string().min(1),
    acceptedRecommendations: z.array(acceptedPlanningLearningInputSchema),
  })
  .strict();
export type PlanningLearningInputs = z.infer<typeof planningLearningInputsSchema>;

export {
  creativeRecommendationAdmissionSchema,
};
