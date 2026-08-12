import { z } from "zod";

import {
  microdramaAssetTypeSchema,
  microdramaCacheStatusSchema,
  type MicrodramaCacheStatus,
} from "@mediaforge/domain";
import { shotSemanticIdSchema } from "@mediaforge/scene-planning";

export const VIDEO_GENERATION_SCHEMA_VERSION =
  "mediaforge.video-generation.v1" as const;
export const VIDEO_GENERATION_CACHE_KEY_VERSION =
  "video-generation-cache-key-v1" as const;

export const VIDEO_GENERATION_APPROVAL_GATE = "render-qa" as const;

export const VIDEO_CLIP_KINDS = [
  "source-plate-motion",
  "editorial-cut",
] as const;
export const videoClipKindSchema = z.enum(VIDEO_CLIP_KINDS);
export type VideoClipKind = z.infer<typeof videoClipKindSchema>;

export const VIDEO_GENERATION_EFFECT_STATUSES = [
  "submitted",
  "pending",
  "succeeded",
  "failed",
  "ambiguous",
] as const;
export const videoGenerationEffectStatusSchema = z.enum(
  VIDEO_GENERATION_EFFECT_STATUSES
);
export type VideoGenerationEffectStatus = z.infer<
  typeof videoGenerationEffectStatusSchema
>;

const boundedString = (maximum: number) =>
  z.string().trim().min(1).max(maximum);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const videoGenerationRequestSchema = z
  .object({
    schemaVersion: z.literal(VIDEO_GENERATION_SCHEMA_VERSION),
    generationId: boundedString(200),
    episodeId: z.string().regex(/^E\d{3}$/u),
    shotSemanticId: shotSemanticIdSchema,
    shotPlanRevisionId: boundedString(160),
    clipKind: videoClipKindSchema,
    providerCapabilityId: boundedString(120),
    promptHash: sha256Schema,
    sourceImageHash: sha256Schema,
    durationSeconds: z.number().finite().positive().max(120),
    forceRegeneration: z.boolean(),
  })
  .strict();
export type VideoGenerationRequest = z.infer<
  typeof videoGenerationRequestSchema
>;

export const videoGenerationCostEstimateSchema = z
  .object({
    estimatedCostMinor: z.number().int().nonnegative(),
    billableSeconds: z.number().finite().nonnegative(),
    currency: z.string().length(3).toUpperCase().default("USD"),
  })
  .strict();
export type VideoGenerationCostEstimate = z.infer<
  typeof videoGenerationCostEstimateSchema
>;

export const videoGenerationResultSchema = z
  .object({
    schemaVersion: z.literal(VIDEO_GENERATION_SCHEMA_VERSION),
    generationId: boundedString(200),
    cacheKey: boundedString(200),
    cacheStatus: microdramaCacheStatusSchema,
    artifactHash: sha256Schema,
    durationMs: z.number().int().positive(),
    providerRequestId: boundedString(200).optional(),
    estimate: videoGenerationCostEstimateSchema,
    actualCostMinor: z.number().int().nonnegative(),
    completedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type VideoGenerationResult = z.infer<typeof videoGenerationResultSchema>;

export const videoGenerationEffectSchema = z
  .object({
    schemaVersion: z.literal(VIDEO_GENERATION_SCHEMA_VERSION),
    effectId: boundedString(200),
    generationId: boundedString(200),
    providerRequestId: boundedString(200).optional(),
    status: videoGenerationEffectStatusSchema,
    cacheKey: boundedString(200),
    submittedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    reconciliationRequired: z.boolean(),
    message: boundedString(500).optional(),
  })
  .strict();
export type VideoGenerationEffect = z.infer<typeof videoGenerationEffectSchema>;

export const videoGenerationCacheEntrySchema = z
  .object({
    schemaVersion: z.literal(VIDEO_GENERATION_SCHEMA_VERSION),
    cacheKey: boundedString(200),
    request: videoGenerationRequestSchema,
    result: videoGenerationResultSchema,
    cachedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type VideoGenerationCacheEntry = z.infer<
  typeof videoGenerationCacheEntrySchema
>;

export type VideoProviderAdapterResult =
  | {
      readonly kind: "completed";
      readonly providerRequestId: string;
      readonly artifactHash: string;
      readonly durationMs: number;
      readonly actualCostMinor: number;
    }
  | {
      readonly kind: "pending";
      readonly providerRequestId: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly providerRequestId: string;
      readonly message: string;
    }
  | {
      readonly kind: "failed";
      readonly providerRequestId?: string;
      readonly message: string;
    };

export interface VideoProviderAdapter {
  readonly capabilityId: string;
  estimate(request: VideoGenerationRequest): Promise<VideoGenerationCostEstimate>;
  submit(
    request: VideoGenerationRequest,
    input: { readonly cacheKey: string }
  ): Promise<VideoProviderAdapterResult>;
  reconcile?(input: {
    readonly effect: VideoGenerationEffect;
    readonly providerEvidence: unknown;
  }): Promise<VideoProviderAdapterResult>;
}

export function validateVideoGenerationRequest(
  value: unknown
): VideoGenerationRequest {
  return videoGenerationRequestSchema.parse(value);
}

export function validateVideoGenerationResult(
  value: unknown
): VideoGenerationResult {
  return videoGenerationResultSchema.parse(value);
}

export function isTerminalVideoEffectStatus(
  status: VideoGenerationEffectStatus
): boolean {
  return status === "succeeded" || status === "failed";
}

export const VIDEO_GENERATION_ASSET_TYPE = microdramaAssetTypeSchema.enum.video;
export type { MicrodramaCacheStatus };
