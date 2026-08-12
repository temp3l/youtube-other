import { z } from "zod";

import {
  shotVisualRegistryReferenceSchema,
  type ShotVisualRegistryReference,
} from "@mediaforge/domain";
import {
  beatSemanticIdSchema,
  sceneSemanticIdSchema,
  shotSemanticIdSchema,
  sourcePlateSemanticIdSchema,
} from "@mediaforge/scene-planning";

import { MICRODRAMA_PACK_SCHEMA_VERSION } from "./v5-pack-constants.js";

export const V5_SCENE_SHOT_SCHEMA_VERSION =
  "mediaforge.microdrama.scene-shot.v1" as const;

export const MICRODRAMA_SHOT_BLOCKING_KINDS = [
  "establishing",
  "reaction",
  "dialogue",
  "insert",
  "phone",
  "offscreen",
  "controlled_mouth",
  "listening",
] as const;
export const microdramaShotBlockingKindSchema = z.enum(MICRODRAMA_SHOT_BLOCKING_KINDS);
export type MicrodramaShotBlockingKind = z.infer<
  typeof microdramaShotBlockingKindSchema
>;

export const MICRODRAMA_SHOT_REACTION_KINDS = [
  "retain_open_loop",
  "honor_prior_opening_obligation",
  "listener_surprise",
  "listener_dread",
  "listener_resolve",
] as const;
export const microdramaShotReactionKindSchema = z.enum(MICRODRAMA_SHOT_REACTION_KINDS);
export type MicrodramaShotReactionKind = z.infer<
  typeof microdramaShotReactionKindSchema
>;

export const semanticTimingWindowSchema = z
  .object({
    startRatio: z.number().min(0).max(1),
    endRatio: z.number().min(0).max(1),
    targetSeconds: z.number().nonnegative(),
  })
  .strict()
  .refine((value) => value.startRatio <= value.endRatio, {
    message: "startRatio must be <= endRatio",
  });
export type SemanticTimingWindow = z.infer<typeof semanticTimingWindowSchema>;

export const semanticBeatPlanEntrySchema = z
  .object({
    beatSemanticId: beatSemanticIdSchema,
    beatPlanBeatId: z.string().min(1).max(160),
    category: z.string().min(1).max(40),
    order: z.number().int().nonnegative(),
    timing: semanticTimingWindowSchema,
    requiredReactions: z.array(microdramaShotReactionKindSchema),
    boundaryObligation: z
      .enum(["hook", "cliffhanger", "next_opening", "new_information", "open_loop"])
      .optional(),
  })
  .strict();
export type SemanticBeatPlanEntry = z.infer<typeof semanticBeatPlanEntrySchema>;

export const semanticScenePlanEntrySchema = z
  .object({
    sceneSemanticId: sceneSemanticIdSchema,
    beatSemanticId: beatSemanticIdSchema,
    order: z.number().int().positive(),
    sourcePlateSemanticId: sourcePlateSemanticIdSchema,
    timing: semanticTimingWindowSchema,
    registryReferences: z.array(shotVisualRegistryReferenceSchema),
    continuitySceneSemanticIds: z.array(sceneSemanticIdSchema),
    blockingKind: microdramaShotBlockingKindSchema,
  })
  .strict();
export type SemanticScenePlanEntry = z.infer<typeof semanticScenePlanEntrySchema>;

export const semanticShotPlanEntrySchema = z
  .object({
    shotSemanticId: shotSemanticIdSchema,
    sceneSemanticId: sceneSemanticIdSchema,
    beatSemanticId: beatSemanticIdSchema,
    order: z.number().int().positive(),
    sceneOrder: z.number().int().positive(),
    shotOrderInScene: z.number().int().positive(),
    sourcePlateSemanticId: sourcePlateSemanticIdSchema,
    timing: semanticTimingWindowSchema,
    blockingKind: microdramaShotBlockingKindSchema,
    reactions: z.array(microdramaShotReactionKindSchema),
    registryReferences: z.array(shotVisualRegistryReferenceSchema),
    continuitySceneSemanticIds: z.array(sceneSemanticIdSchema),
  })
  .strict();
export type SemanticShotPlanEntry = z.infer<typeof semanticShotPlanEntrySchema>;

export const microdramaAssetDensityPolicySchema = z
  .object({
    scope: z.enum(["canary", "standard"]),
    sourcePlateTarget: z.number().int().positive(),
    editorialCutTarget: z.number().int().positive(),
    sourcePlateMin: z.number().int().positive(),
    sourcePlateMax: z.number().int().positive(),
    editorialCutMin: z.number().int().positive(),
    editorialCutMax: z.number().int().positive(),
  })
  .strict();
export type MicrodramaAssetDensityPolicyRecord = z.infer<
  typeof microdramaAssetDensityPolicySchema
>;

export const v5SceneShotPlanRecordSchema = z
  .object({
    episodeId: z.string().regex(/^E\d{3}$/u),
    episodeNumber: z.number().int().min(1).max(100),
    episodeSpecRevisionId: z.string().min(1).max(160),
    beatPlanRevisionId: z.string().min(1).max(160),
    scenePlanRevisionId: z.string().min(1).max(160),
    shotPlanRevisionId: z.string().min(1).max(160),
    beats: z.array(semanticBeatPlanEntrySchema).length(9),
    scenes: z.array(semanticScenePlanEntrySchema).length(9),
    shots: z.array(semanticShotPlanEntrySchema).min(1),
    assetDensityPolicy: microdramaAssetDensityPolicySchema,
  })
  .strict();
export type V5SceneShotPlanRecord = z.infer<typeof v5SceneShotPlanRecordSchema>;

export const v5SceneShotPlanBundleSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PACK_SCHEMA_VERSION),
    importId: z.string().regex(/^[a-f0-9]{64}$/u),
    compiledAt: z.string(),
    records: z.array(v5SceneShotPlanRecordSchema).length(100),
  })
  .strict();
export type V5SceneShotPlanBundle = z.infer<typeof v5SceneShotPlanBundleSchema>;

export const projectedLocaleShotTimingSchema = z
  .object({
    shotSemanticId: shotSemanticIdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => value.endMs > value.startMs, {
    message: "endMs must be > startMs",
  });
export type ProjectedLocaleShotTiming = z.infer<
  typeof projectedLocaleShotTimingSchema
>;

export type V5SceneShotPlanIssueCode =
  | "production_record_invalid"
  | "scene_shot_compile_invalid";

export type V5SceneShotPlanIssue = {
  code: V5SceneShotPlanIssueCode;
  message: string;
  path?: string;
};

export type V5SceneShotPlanResult =
  | { ok: true; bundle: V5SceneShotPlanBundle }
  | { ok: false; issues: V5SceneShotPlanIssue[] };

export function validateV5SceneShotPlanRecord(record: unknown): V5SceneShotPlanRecord {
  return v5SceneShotPlanRecordSchema.parse(record);
}

export function validateV5SceneShotPlanBundle(bundle: unknown): V5SceneShotPlanBundle {
  return v5SceneShotPlanBundleSchema.parse(bundle);
}

export type { ShotVisualRegistryReference };
