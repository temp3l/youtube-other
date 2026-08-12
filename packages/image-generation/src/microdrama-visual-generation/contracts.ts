import { z } from "zod";

import {
  shotVisualRegistryReferenceSchema,
  type ShotVisualRegistryReference,
} from "@mediaforge/domain";

export const MICRODRAMA_VISUAL_GENERATION_SCHEMA_VERSION =
  "mediaforge.microdrama.visual-generation.v1" as const;

export const microdramaVisualAssetKindSchema = z.enum([
  "source_plate",
  "editorial_shot",
]);
export type MicrodramaVisualAssetKind = z.infer<
  typeof microdramaVisualAssetKindSchema
>;

export const microdramaVisualGenerationRequestSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_VISUAL_GENERATION_SCHEMA_VERSION),
    requestId: z.string().min(1).max(160),
    seriesId: z.string().min(1).max(160),
    episodeId: z.string().regex(/^E\d{3}$/u),
    sceneShotPlanRevisionId: z.string().min(1).max(160),
    assetKind: microdramaVisualAssetKindSchema,
    shotSemanticId: z.string().min(1),
    sourcePlateSemanticId: z.string().min(1),
    sceneSemanticId: z.string().min(1),
    blockingKind: z.string().min(1).max(40),
    registryReferences: z.array(shotVisualRegistryReferenceSchema),
    promptText: z.string().min(1).max(16_000),
    forceRegeneration: z.boolean().default(false),
  })
  .strict();
export type MicrodramaVisualGenerationRequest = z.infer<
  typeof microdramaVisualGenerationRequestSchema
>;

export const microdramaVisualGenerationEffectSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_VISUAL_GENERATION_SCHEMA_VERSION),
    requestId: z.string().min(1).max(160),
    cacheKey: z.string().regex(/^[a-f0-9]{64}$/u),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/u),
    storageUri: z.string().min(1),
    providerRequestId: z.string().min(1).optional(),
    cacheHit: z.boolean(),
    estimatedCostMinor: z.number().int().nonnegative(),
  })
  .strict();
export type MicrodramaVisualGenerationEffect = z.infer<
  typeof microdramaVisualGenerationEffectSchema
>;

export type MicrodramaVisualDispatchBlockCode =
  | "registry_continuity_failed"
  | "localized_readable_text_in_prompt"
  | "scene_shot_plan_not_approved"
  | "duplicate_request_id";

export type MicrodramaVisualDispatchIssue = {
  readonly code: MicrodramaVisualDispatchBlockCode;
  readonly message: string;
};

export type MicrodramaVisualDispatchDecision =
  | { readonly approved: true }
  | { readonly approved: false; readonly issues: readonly MicrodramaVisualDispatchIssue[] };

export type MicrodramaImageProviderPort = {
  readonly id: string;
  generate(input: {
    readonly request: MicrodramaVisualGenerationRequest;
    readonly cacheKey: string;
    readonly abortSignal?: AbortSignal;
  }): Promise<{
    readonly artifactHash: string;
    readonly storageUri: string;
    readonly providerRequestId?: string;
    readonly estimatedCostMinor: number;
  }>;
};

export type { ShotVisualRegistryReference };
