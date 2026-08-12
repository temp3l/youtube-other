import { z } from "zod";

import {
  beatPlanPayloadSchema,
  episodeSpecPayloadSchema,
  type BeatPlanPayload,
  type EpisodeSpecPayload,
} from "@mediaforge/narrative-core";

import { ROLLING_PLAN_SCHEMA_VERSION } from "./rolling-plan-contracts.js";
import type { RollingPlanIssue, RollingPlanIssueCode } from "./rolling-plan-contracts.js";

export const rollingPlanEpisodeProductionRecordSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    rollingPlanRevisionId: z.string().min(1).max(160),
    episodeSpecRevisionId: z.string().min(1).max(160),
    beatPlanRevisionId: z.string().min(1).max(160),
    boundaryRevisionId: z.string().min(1).max(160),
    pendingScriptRevisionId: z.string().min(1).max(160),
    episodeSpec: episodeSpecPayloadSchema,
    beatPlan: beatPlanPayloadSchema,
  })
  .strict();
export type RollingPlanEpisodeProductionRecord = z.infer<
  typeof rollingPlanEpisodeProductionRecordSchema
>;

export const rollingPlanEpisodeProductionBundleSchema = z
  .object({
    schemaVersion: z.literal(ROLLING_PLAN_SCHEMA_VERSION),
    rollingPlanRevisionId: z.string().min(1).max(160),
    anchoredSnapshotRevisionId: z.string().min(1).max(160),
    compiledAt: z.string(),
    records: z.array(rollingPlanEpisodeProductionRecordSchema).min(1),
  })
  .strict();
export type RollingPlanEpisodeProductionBundle = z.infer<
  typeof rollingPlanEpisodeProductionBundleSchema
>;

export type RollingPlanEpisodeProductionIssueCode =
  | RollingPlanIssueCode
  | "revision_not_accepted"
  | "not_future_episode"
  | "boundary_missing"
  | "production_compile_invalid"
  | "boundary_production_mismatch";

export type RollingPlanEpisodeProductionIssue = {
  code: RollingPlanEpisodeProductionIssueCode;
  message: string;
  path?: string;
};

export type RollingPlanEpisodeProductionResult =
  | { ok: true; bundle: RollingPlanEpisodeProductionBundle }
  | { ok: false; issues: RollingPlanEpisodeProductionIssue[] };

export function validateRollingPlanEpisodeProductionBundle(
  bundle: unknown
): RollingPlanEpisodeProductionBundle {
  return rollingPlanEpisodeProductionBundleSchema.parse(bundle);
}

export type CompiledRollingEpisodeProduction = {
  episodeSpec: EpisodeSpecPayload;
  beatPlan: BeatPlanPayload;
  rollingPlanRevisionId: string;
  episodeSpecRevisionId: string;
  beatPlanRevisionId: string;
  boundaryRevisionId: string;
  pendingScriptRevisionId: string;
};

export function mapRollingPlanIssues(
  issues: readonly RollingPlanIssue[]
): RollingPlanEpisodeProductionIssue[] {
  return issues.map((entry) => ({
    code: entry.code,
    message: entry.message,
    ...(entry.path === undefined ? {} : { path: entry.path }),
  }));
}
