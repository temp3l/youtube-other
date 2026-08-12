import { z } from "zod";

import {
  beatPlanPayloadSchema,
  episodeSpecPayloadSchema,
  type BeatPlanPayload,
  type EpisodeSpecPayload,
} from "@mediaforge/narrative-core";

import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";

export const v5EpisodeProductionRecordSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    episodeSpecRevisionId: z.string().min(1).max(160),
    beatPlanRevisionId: z.string().min(1).max(160),
    boundaryRevisionId: z.string().min(1).max(160),
    enScriptRevisionId: z.string().min(1).max(160),
    episodeSpec: episodeSpecPayloadSchema,
    beatPlan: beatPlanPayloadSchema,
  })
  .strict();
export type V5EpisodeProductionRecord = z.infer<
  typeof v5EpisodeProductionRecordSchema
>;

export const v5EpisodeProductionBundleSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    importId: z.string().regex(/^[a-f0-9]{64}$/u),
    seriesBibleRevisionId: z.string().min(1).max(160),
    compiledAt: z.string(),
    records: z.array(v5EpisodeProductionRecordSchema).length(100),
  })
  .strict();
export type V5EpisodeProductionBundle = z.infer<
  typeof v5EpisodeProductionBundleSchema
>;

export const v5EpisodeProductionProjectionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    importId: z.string().regex(/^[a-f0-9]{64}$/u),
    episodeSpecRevisionIds: z.array(z.string()).length(100),
    beatPlanRevisionIds: z.array(z.string()).length(100),
    compiledAt: z.string(),
  })
  .strict();
export type V5EpisodeProductionProjection = z.infer<
  typeof v5EpisodeProductionProjectionSchema
>;

export type V5EpisodeProductionIssueCode =
  | "canon_bundle_invalid"
  | "boundary_missing"
  | "script_missing"
  | "production_compile_invalid";

export type V5EpisodeProductionIssue = {
  code: V5EpisodeProductionIssueCode;
  message: string;
  path?: string;
};

export type V5EpisodeProductionResult =
  | { ok: true; bundle: V5EpisodeProductionBundle }
  | { ok: false; issues: V5EpisodeProductionIssue[] };

export function validateV5EpisodeProductionBundle(
  bundle: unknown
): V5EpisodeProductionBundle {
  return v5EpisodeProductionBundleSchema.parse(bundle);
}

export function validateV5EpisodeProductionRecord(
  record: unknown
): V5EpisodeProductionRecord {
  return v5EpisodeProductionRecordSchema.parse(record);
}

export type CompiledEpisodeProduction = {
  episodeSpec: EpisodeSpecPayload;
  beatPlan: BeatPlanPayload;
  episodeSpecRevisionId: string;
  beatPlanRevisionId: string;
  boundaryRevisionId: string;
  enScriptRevisionId: string;
};
