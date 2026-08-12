import { z } from "zod";

import {
  narrativePromiseIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativeSnapshotIdSchema,
  seasonIdSchema,
  seriesIdSchema,
  storyArcIdSchema,
} from "@mediaforge/narrative-core";

import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";

export const ROLLING_PLAN_SCHEMA_VERSION =
  "mediaforge.microdrama.rolling-plan.v1" as const;

export const PLANNING_HORIZONS = [
  "season_macro",
  "story_arc",
  "near_horizon",
  "current_episode",
] as const;
export const planningHorizonSchema = z.enum(PLANNING_HORIZONS);
export type PlanningHorizon = z.infer<typeof planningHorizonSchema>;

export const ROLLING_PLAN_REVISION_STATUSES = [
  "DRAFT",
  "VALIDATED",
  "ACCEPTED",
  "SUPERSEDED",
  "REJECTED",
] as const;
export const rollingPlanRevisionStatusSchema = z.enum(ROLLING_PLAN_REVISION_STATUSES);
export type RollingPlanRevisionStatus = z.infer<typeof rollingPlanRevisionStatusSchema>;

export const SEASON_1_EPISODE_COUNT = 100 as const;
export const NEAR_HORIZON_DEFAULT_SIZE = 5 as const;
export const NEAR_HORIZON_MAX_SIZE = 10 as const;

const episodeIdPattern = /^E(\d{3})$/u;
const narrativeEpisodeIdPattern = /^episode\.e(\d{3})$/u;

export const microdramaCanonicalEpisodeIdSchema = z
  .string()
  .regex(episodeIdPattern, "Canonical microdrama episode ids use E### format.");
export type MicrodramaCanonicalEpisodeId = z.infer<
  typeof microdramaCanonicalEpisodeIdSchema
>;

export function parseCanonicalEpisodeNumber(episodeId: string): number | null {
  const canonicalMatch = episodeIdPattern.exec(episodeId);
  if (canonicalMatch) {
    return Number.parseInt(canonicalMatch[1] ?? "", 10);
  }
  const narrativeMatch = narrativeEpisodeIdPattern.exec(episodeId);
  if (narrativeMatch) {
    return Number.parseInt(narrativeMatch[1] ?? "", 10);
  }
  return null;
}

export const promiseMovementSchema = z
  .object({
    promiseId: narrativePromiseIdSchema,
    progression: z.string().min(1).max(500),
  })
  .strict();
export type PromiseMovement = z.infer<typeof promiseMovementSchema>;

export const revealPermissionSchema = z
  .object({
    secretId: narrativeSecretIdSchema,
    allowed: z.boolean(),
    rationale: z.string().min(1).max(500),
  })
  .strict();
export type RevealPermission = z.infer<typeof revealPermissionSchema>;

export const planningIntentionSchema = z
  .object({
    episodeId: microdramaCanonicalEpisodeIdSchema,
    objective: z.string().min(1).max(1_000),
    audienceQuestion: z.string().min(1).max(500).optional(),
    promiseMovements: z.array(promiseMovementSchema),
    revealPermissions: z.array(revealPermissionSchema),
    requiredEvents: z.array(z.string().min(1).max(300)),
    forbiddenEvents: z.array(z.string().min(1).max(300)),
  })
  .strict();
export type PlanningIntention = z.infer<typeof planningIntentionSchema>;

export const planningEpisodeRangeSchema = z
  .object({
    startEpisodeId: microdramaCanonicalEpisodeIdSchema,
    endEpisodeId: microdramaCanonicalEpisodeIdSchema,
  })
  .strict()
  .refine(
    (value) => {
      const start = parseCanonicalEpisodeNumber(value.startEpisodeId);
      const end = parseCanonicalEpisodeNumber(value.endEpisodeId);
      return start !== null && end !== null && start <= end;
    },
    { message: "Episode range must use canonical E### ids with start <= end." }
  );
export type PlanningEpisodeRange = z.infer<typeof planningEpisodeRangeSchema>;

export const rollingPlanPayloadSchema = z
  .object({
    schemaVersion: z.literal(ROLLING_PLAN_SCHEMA_VERSION),
    seriesId: seriesIdSchema,
    seasonId: seasonIdSchema,
    planningHorizon: planningHorizonSchema,
    anchoredSnapshotRevisionId: narrativeRevisionIdSchema,
    anchoredSnapshotId: narrativeSnapshotIdSchema,
    storyArcId: storyArcIdSchema.optional(),
    productionEpisodeId: microdramaCanonicalEpisodeIdSchema,
    episodeRange: planningEpisodeRangeSchema,
    intentions: z.array(planningIntentionSchema).min(1),
    nearHorizonSize: z.number().int().min(1).max(NEAR_HORIZON_MAX_SIZE).optional(),
    provenance: z
      .object({
        sourceKind: z.literal("planning"),
        sourceRevisionIds: z.array(narrativeRevisionIdSchema).min(1),
        notes: z.string().max(2_000).optional(),
      })
      .strict(),
  })
  .strict();
export type RollingPlanPayload = z.infer<typeof rollingPlanPayloadSchema>;

export const rollingPlanRevisionSchema = z
  .object({
    schemaVersion: z.literal(ROLLING_PLAN_SCHEMA_VERSION),
    revisionId: narrativeRevisionIdSchema,
    aggregateId: z.string().min(1).max(160),
    revisionNumber: z.number().int().positive(),
    payload: rollingPlanPayloadSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    parentRevisionIds: z.array(narrativeRevisionIdSchema),
    status: rollingPlanRevisionStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .strict();
export type RollingPlanRevision = z.infer<typeof rollingPlanRevisionSchema>;

export type RollingPlanIssueCode =
  | "invalid_episode_id"
  | "season_boundary_exceeded"
  | "horizon_range_invalid"
  | "snapshot_anchor_missing"
  | "canon_rewrite_forbidden"
  | "promise_deadline_violation"
  | "forbidden_reveal"
  | "horizon_size_exceeded"
  | "production_scope_violation"
  | "payload_invalid";

export type RollingPlanIssue = {
  code: RollingPlanIssueCode;
  message: string;
  path?: string;
};

export type RollingPlanValidationResult =
  | { ok: true; revision: RollingPlanRevision }
  | { ok: false; issues: RollingPlanIssue[] };

export function validateRollingPlanRevision(revision: unknown): RollingPlanRevision {
  return rollingPlanRevisionSchema.parse(revision);
}

export function validateRollingPlanPayload(payload: unknown): RollingPlanPayload {
  return rollingPlanPayloadSchema.parse(payload);
}
