import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  episodeManifestSchema,
  scenePlanSchema,
  type EpisodeManifest,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  buildVeronicaVisualRemediationPrompt,
  buildEpisodeImageMediaContext,
  createOpenAiVeronicaVisualQaEvaluator,
  generateEpisodeImages,
  isVeronicaVisualReviewApproved,
  loadEpisodeSceneManifest,
  loadEpisodeImageGenerationSettings,
  persistVeronicaAcceptedImageBinding,
  reviewVeronicaGeneratedImage,
  veronicaPostGenerationVisualReviewSchema,
  type SceneGenerationManifest,
  type VeronicaVisualQaEvaluator,
} from "@mediaforge/image-generation";
import {
  assertHistoryVisualApprovalV35,
  deriveHistorySemanticImagePromptBrief,
  loadHistoryVisualPlanV35,
  persistHistorySemanticImagePromptReview,
} from "@mediaforge/history";
import { createLogger } from "@mediaforge/observability";
import {
  assertScriptScoreGate,
  createOpenAiStoryClientWithOptions,
} from "@mediaforge/story-localization";
import {
  positioningProductionPlanSchema,
  type PositioningVisualPlanV2,
} from "@mediaforge/strategic-reinvention";
import {
  ensureDir,
  fileExists,
  hashFile,
  hashText,
  normalizeWhitespace,
  requireOpenAiResponsesPolicy,
  resolveEpisodeImageManifestPath,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { assertVeronicaPreImageReviewPackCurrent } from "./veronica-pre-image-review-pack.js";
import { assertPreImageReviewPackCurrent } from "./pre-image-review-pack.js";
import type { VeronicaVisualQaBrief } from "@mediaforge/image-generation";
import {
  loadVeronicaImageReconciliationInventory,
  type VeronicaImageReconciliationInventory,
  type VeronicaImageReconciliationInventoryEntry,
} from "./veronica-image-reconciliation.js";

export interface ExistingVeronicaImageQaResult {
  readonly sceneId: string;
  readonly status: "approved" | "rejected" | "failed";
  readonly cacheStatus?: "hit" | "miss";
  readonly manifestReconciled?: boolean;
  readonly reconciliationClassification?: string;
  readonly error?: string;
}

export interface ImagesResumeCliOptions {
  readonly episode?: string;
  readonly scene?: string;
  readonly source?: string;
  readonly concurrency?: number;
  readonly maxProviderCalls?: number;
  readonly maxVeronicaRegenerationAttempts?: number;
  readonly veronicaRemediationReview?: string;
  readonly veronicaVisualEncodingDecision?: string;
  readonly adoptVeronicaDiagramPrototype?: string;
  readonly qaExisting?: boolean;
  readonly reconciliationInventory?: string;
  readonly allowUnapprovedCharacterReferences?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly workspace?: string;
  readonly variant?: "full" | "short";
}

export interface ResolvedEpisodeManifest {
  readonly episodeDir: string;
  readonly manifestPath: string;
  readonly manifest: EpisodeManifest & { readonly scenePlan: ScenePlan };
  readonly created: boolean;
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const veronicaHumanVisualEncodingDecisionSchema = z.strictObject({
  schemaVersion: z.literal("veronica-human-visual-encoding-decision.v1"),
  episodeId: z.string().min(1),
  language: z.literal("en"),
  variant: z.enum(["short", "full"]),
  sceneId: z.string().min(1),
  visualBeatId: z.string().min(1),
  decision: z.literal("approved"),
  reviewer: z.literal("operator"),
  authorizationReference: z.string().min(1),
  approvedAt: z.string().min(1),
  bindings: z.strictObject({
    sourceSha256: sha256Schema,
    semanticPlanSha256: sha256Schema,
    reviewManifestPath: z.string().min(1),
    reviewManifestSha256: sha256Schema,
    humanApprovalPath: z.string().min(1),
    humanApprovalSha256: sha256Schema,
    failedReviewSha256: sha256Schema,
    rejectedImageSha256: sha256Schema,
    semanticBriefHash: sha256Schema,
    failedPromptHash: sha256Schema,
  }),
  approvedTreatment: z.strictObject({
    visualThesis: z.string().min(1),
    composition: z.string().min(1),
    mustShow: z.array(z.string().min(1)).min(1),
    mustNotShow: z.array(z.string().min(1)).min(1),
    promptInstructions: z.array(z.string().min(1)).min(1),
  }),
  scope: z.string().min(1),
});

export const veronicaDeterministicDiagramPrototypeSchema = z.strictObject({
  schemaVersion: z.literal("veronica-deterministic-diagram-prototype.v1"),
  episodeId: z.string().min(1),
  language: z.literal("en"),
  variant: z.enum(["short", "full"]),
  sceneId: z.string().min(1),
  visualBeatId: z.string().min(1),
  status: z.literal("PENDING_HUMAN_MODALITY_REVIEW"),
  canonicalAssetReplaced: z.literal(false),
  createdAt: z.string().min(1),
  authorizationReference: z.string().min(1),
  provenance: z.strictObject({
    sourceSha256: sha256Schema,
    semanticPlanSha256: sha256Schema,
    reviewManifestSha256: sha256Schema,
    visualEncodingDecisionSha256: sha256Schema,
    failedProviderImageSha256: sha256Schema,
    failedProviderReviewSha256: sha256Schema,
    semanticBriefHash: sha256Schema,
  }),
  artifacts: z.strictObject({
    svgPath: z.string().min(1),
    svgSha256: sha256Schema,
    pngPath: z.string().min(1),
    pngSha256: sha256Schema,
    renderEngine: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.literal("9:16"),
  }),
  geometryContract: z.strictObject({
    unit: z.string().min(1),
    inputUnits: z.number().positive(),
    removedUnitsByGate: z.array(z.number().positive()).min(1),
    retainedRemainderUnits: z.number().positive(),
    conservationEquation: z.string().min(1),
    continuousValuePath: z.literal(true),
    removalGateCount: z.number().int().positive(),
    removedFragmentCount: z.number().int().positive(),
    finalRemainderCount: z.literal(1),
  }),
  compositionContract: z.strictObject({
    evidenceBounds: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    subtitleSafeRegion: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    evidenceIntersectsSubtitleSafeRegion: z.literal(false),
    palette: z.array(z.string().min(1)).min(1),
    genericHumanAction: z.string().min(1),
    materiallyDistinctFromS01B02: z.literal(true),
    s01B02ImageSha256: sha256Schema,
  }),
  localChecks: z.strictObject({
    nativeDimensions: z.literal("PASS"),
    exactConservation: z.literal("PASS"),
    singleContinuousValuePath: z.literal("PASS"),
    singleFinalRemainder: z.literal("PASS"),
    subtitleSafeComposition: z.literal("PASS"),
    svgTextElementsAbsent: z.literal("PASS"),
    externalAssetsAbsent: z.literal("PASS"),
    logosAndUiAbsent: z.literal("PASS"),
    syntheticCreatorLikenessAbsent: z.literal("PASS"),
    providerCalls: z.literal(0),
    paidQaCalls: z.literal(0),
  }),
  scope: z.string().min(1),
});

export const veronicaDeterministicVisualPrototypeSchema = z.strictObject({
  schemaVersion: z.literal("veronica-deterministic-visual-prototype.v1"),
  episodeId: z.string().min(1),
  language: z.literal("en"),
  variant: z.enum(["short", "full"]),
  sceneId: z.string().min(1),
  visualBeatId: z.string().min(1),
  status: z.literal("PENDING_HUMAN_MODALITY_REVIEW"),
  canonicalAssetReplaced: z.literal(false),
  createdAt: z.string().min(1),
  authorizationReference: z.string().min(1),
  provenance: z.strictObject({
    sourceSha256: sha256Schema,
    semanticPlanSha256: sha256Schema,
    reviewManifestSha256: sha256Schema,
    failedProviderImageSha256: sha256Schema,
    failedProviderReviewSha256: sha256Schema,
    semanticBriefHash: sha256Schema,
    approvedAdjacentImageSha256: sha256Schema,
    approvedAdjacentReviewSha256: sha256Schema,
  }),
  artifacts: z.strictObject({
    svgPath: z.string().min(1),
    svgSha256: sha256Schema,
    pngPath: z.string().min(1),
    pngSha256: sha256Schema,
    renderEngine: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.literal("9:16"),
  }),
  semanticContract: z.strictObject({
    visualThesis: z.string().min(1),
    encodingFamily: z.string().min(1),
    causalRelationship: z.string().min(1),
    mustShow: z.array(z.string().min(1)).min(1),
    mustNotShow: z.array(z.string().min(1)).min(1),
    materiallyDistinctFrom: z.array(z.strictObject({
      sceneId: z.string().min(1),
      imageSha256: sha256Schema,
      distinction: z.string().min(1),
    })).min(1),
  }),
  geometryContract: z.strictObject({
    unit: z.string().min(1),
    completedSaleInputUnits: z.number().positive(),
    costDrainGroups: z.array(z.number().positive()).min(1),
    totalCostDrainUnits: z.number().positive(),
    retainedRemainderUnits: z.number().positive(),
    conservationEquation: z.string().min(1),
    conservationVerified: z.literal(true),
    completedSalePathCount: z.literal(1),
    withheldProspectiveOrderCount: z.literal(1),
    withheldProspectiveOrderExcludedFromCompletedSaleConservation: z.literal(true),
  }),
  compositionContract: z.strictObject({
    evidenceBounds: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    subtitleSafeRegion: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    evidenceIntersectsSubtitleSafeRegion: z.literal(false),
    palette: z.array(z.string().min(1)).min(1),
    genericHumanAction: z.string().min(1),
    portraitDominance: z.literal(false),
  }),
  localChecks: z.strictObject({
    nativeDimensions: z.literal("PASS"),
    exactConservation: z.literal("PASS"),
    singleCompletedSalePath: z.literal("PASS"),
    singleWithheldProspectiveOrder: z.literal("PASS"),
    subtitleSafeComposition: z.literal("PASS"),
    materiallyDistinctFromS02B01: z.literal("PASS"),
    svgTextElementsAbsent: z.literal("PASS"),
    externalAssetsAbsent: z.literal("PASS"),
    logosAndUiAbsent: z.literal("PASS"),
    syntheticCreatorLikenessAbsent: z.literal("PASS"),
    providerCalls: z.literal(0),
    paidQaCalls: z.literal(0),
  }),
  scope: z.string().min(1),
});

export const veronicaDeterministicVisualPrototypeV2Schema = z.strictObject({
  schemaVersion: z.literal("veronica-deterministic-visual-prototype.v2"),
  episodeId: z.string().min(1),
  language: z.literal("en"),
  variant: z.enum(["short", "full"]),
  sceneId: z.string().min(1),
  visualBeatId: z.string().min(1),
  status: z.literal("PENDING_EXACT_HASH_MODALITY_REVIEW"),
  canonicalAssetReplaced: z.literal(false),
  createdAt: z.string().min(1),
  authorizationReference: z.string().min(1),
  provenance: z.strictObject({
    sourceSha256: sha256Schema,
    semanticPlanSha256: sha256Schema,
    reviewManifestSha256: sha256Schema,
    currentSceneManifestSha256: sha256Schema,
    currentAdoptionSha256: sha256Schema,
    failedCanonicalImageSha256: sha256Schema,
    failedCanonicalReviewSha256: sha256Schema,
    semanticBriefHash: sha256Schema,
    approvedAdjacentImageSha256: sha256Schema,
    approvedAdjacentReviewSha256: sha256Schema,
  }),
  artifacts: z.strictObject({
    svgPath: z.string().min(1),
    svgSha256: sha256Schema,
    pngPath: z.string().min(1),
    pngSha256: sha256Schema,
    renderEngine: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.literal("9:16"),
  }),
  semanticContract: z.strictObject({
    narration: z.string().min(1),
    visualThesis: z.string().min(1),
    encodingFamily: z.string().min(1),
    causalRelationship: z.string().min(1),
    mustShow: z.array(z.string().min(1)).min(1),
    mustNotShow: z.array(z.string().min(1)).min(1),
    materiallyDistinctFrom: z.array(z.strictObject({
      sceneId: z.string().min(1),
      imageSha256: sha256Schema,
      distinction: z.string().min(1),
    })).min(1),
  }),
  geometryContract: z.strictObject({
    unit: z.string().min(1),
    completedSaleInputUnits: z.number().positive(),
    costDrainGroups: z.array(z.number().positive()).min(1),
    totalCostDrainUnits: z.number().positive(),
    retainedRemainderUnits: z.number().positive(),
    conservationEquation: z.string().min(1),
    conservationVerified: z.literal(true),
    completedOrderBundleCount: z.literal(1),
    withheldMatchingOrderBundleCount: z.literal(1),
    orderIdentityPaymentEmblemsExcludedFromOutputPelletCount: z.literal(true),
    withheldOrderExcludedFromCompletedSaleConservation: z.literal(true),
  }),
  compositionContract: z.strictObject({
    evidenceBounds: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    subtitleSafeRegion: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    evidenceIntersectsSubtitleSafeRegion: z.literal(false),
    palette: z.array(z.string().min(1)).min(1),
    genericHumanAction: z.string().min(1),
    portraitDominance: z.literal(false),
  }),
  localChecks: z.strictObject({
    nativeDimensions: z.literal("PASS"),
    exactConservation: z.literal("PASS"),
    singleCompletedOrderBundle: z.literal("PASS"),
    singleWithheldMatchingOrderBundle: z.literal("PASS"),
    physicalStopSeparation: z.literal("PASS"),
    subtitleSafeComposition: z.literal("PASS"),
    materiallyDistinctFromS02B01: z.literal("PASS"),
    svgTextElementsAbsent: z.literal("PASS"),
    externalAssetsAbsent: z.literal("PASS"),
    logosAndUiAbsent: z.literal("PASS"),
    syntheticCreatorLikenessAbsent: z.literal("PASS"),
    providerCalls: z.literal(0),
    paidQaCalls: z.literal(0),
  }),
  scope: z.string().min(1),
});

export const veronicaDeterministicVisualPrototypeV3Schema = z.strictObject({
  schemaVersion: z.literal("veronica-deterministic-visual-prototype.v3"),
  episodeId: z.string().min(1),
  language: z.literal("en"),
  variant: z.enum(["short", "full"]),
  sceneId: z.string().min(1),
  visualBeatId: z.string().min(1),
  status: z.literal("PENDING_EXACT_HASH_MODALITY_REVIEW"),
  canonicalAssetReplaced: z.literal(false),
  createdAt: z.string().min(1),
  authorizationReference: z.string().min(1),
  provenance: z.strictObject({
    sourceSha256: sha256Schema,
    semanticPlanSha256: sha256Schema,
    reviewManifestSha256: sha256Schema,
    currentSceneManifestSha256: sha256Schema,
    currentAdoptionSha256: sha256Schema,
    failedCanonicalImageSha256: sha256Schema,
    failedCanonicalReviewSha256: sha256Schema,
    semanticBriefHash: sha256Schema,
    approvedAdjacentImageSha256: sha256Schema,
    approvedAdjacentReviewSha256: sha256Schema,
  }),
  artifacts: z.strictObject({
    svgPath: z.string().min(1),
    svgSha256: sha256Schema,
    pngPath: z.string().min(1),
    pngSha256: sha256Schema,
    renderEngine: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: z.literal("9:16"),
  }),
  semanticContract: z.strictObject({
    narration: z.string().min(1),
    visualThesis: z.string().min(1),
    encodingFamily: z.string().min(1),
    causalRelationship: z.string().min(1),
    mustShow: z.array(z.string().min(1)).min(1),
    mustNotShow: z.array(z.string().min(1)).min(1),
    materiallyDistinctFrom: z.array(z.strictObject({
      sceneId: z.string().min(1),
      imageSha256: sha256Schema,
      distinction: z.string().min(1),
    })).min(1),
  }),
  geometryContract: z.strictObject({
    unit: z.string().min(1),
    completedSaleInputUnits: z.number().positive(),
    costDrainGroups: z.array(z.number().positive()).min(1),
    costDrainRowPattern: z.array(z.number().positive()).min(1),
    totalCostDrainUnits: z.number().positive(),
    retainedRemainderUnits: z.number().positive(),
    conservationEquation: z.string().min(1),
    conservationVerified: z.literal(true),
    continuousCostReservoirCount: z.literal(1),
    retainedContainerCount: z.literal(1),
    completedOrderBundleCount: z.literal(1),
    withheldMatchingOrderBundleCount: z.literal(1),
    orderIdentityPaymentEmblemsExcludedFromOutputPelletCount: z.literal(true),
    withheldOrderExcludedFromCompletedSaleConservation: z.literal(true),
  }),
  compositionContract: z.strictObject({
    evidenceBounds: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    subtitleSafeRegion: z.strictObject({
      x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
    }),
    evidenceIntersectsSubtitleSafeRegion: z.literal(false),
    palette: z.array(z.string().min(1)).min(1),
    genericHumanAction: z.string().min(1),
    portraitDominance: z.literal(false),
  }),
  localChecks: z.strictObject({
    nativeDimensions: z.literal("PASS"),
    exactConservation: z.literal("PASS"),
    singleContinuousCostReservoir: z.literal("PASS"),
    singleRetainedContainer: z.literal("PASS"),
    singleCompletedOrderBundle: z.literal("PASS"),
    singleWithheldMatchingOrderBundle: z.literal("PASS"),
    physicalStopSeparation: z.literal("PASS"),
    subtitleSafeComposition: z.literal("PASS"),
    materiallyDistinctFromS02B01: z.literal("PASS"),
    materiallyDistinctFromHookV2: z.literal("PASS"),
    svgTextElementsAbsent: z.literal("PASS"),
    externalAssetsAbsent: z.literal("PASS"),
    logosAndUiAbsent: z.literal("PASS"),
    syntheticCreatorLikenessAbsent: z.literal("PASS"),
    providerCalls: z.literal(0),
    paidQaCalls: z.literal(0),
  }),
  scope: z.string().min(1),
});

export const veronicaDeterministicVisualPrototypeV4Schema =
  veronicaDeterministicVisualPrototypeV3Schema.extend({
    schemaVersion: z.literal("veronica-deterministic-visual-prototype.v4"),
    geometryContract: z.strictObject({
      unit: z.string().min(1),
      completedSaleInputUnits: z.number().positive(),
      costDrainGroups: z.array(z.number().positive()).min(1),
      costDrainRowPattern: z.array(z.number().positive()).min(1),
      totalCostDrainUnits: z.number().positive(),
      retainedRemainderUnits: z.number().positive(),
      conservationEquation: z.string().min(1),
      conservationVerified: z.literal(true),
      continuousCostReservoirCount: z.literal(1),
      retainedContainerCount: z.literal(1),
      completedOrderBundleCount: z.literal(1),
      withheldMatchingOrderBundleCount: z.literal(1),
      wideGroundedGateCount: z.literal(1),
      withheldBundleEntirelyOutsideGate: z.literal(true),
      orderIdentityPaymentEmblemsExcludedFromOutputPelletCount: z.literal(true),
      withheldOrderExcludedFromCompletedSaleConservation: z.literal(true),
    }),
    localChecks: z.strictObject({
      nativeDimensions: z.literal("PASS"),
      exactConservation: z.literal("PASS"),
      singleContinuousCostReservoir: z.literal("PASS"),
      singleRetainedContainer: z.literal("PASS"),
      singleCompletedOrderBundle: z.literal("PASS"),
      singleWithheldMatchingOrderBundle: z.literal("PASS"),
      wideGroundedGate: z.literal("PASS"),
      withheldBundleEntirelyOutsideGate: z.literal("PASS"),
      reducedHandArmClutter: z.literal("PASS"),
      v3OutputGeometryPreserved: z.literal("PASS"),
      subtitleSafeComposition: z.literal("PASS"),
      materiallyDistinctFromS02B01: z.literal("PASS"),
      materiallyDistinctFromHookV3: z.literal("PASS"),
      svgTextElementsAbsent: z.literal("PASS"),
      externalAssetsAbsent: z.literal("PASS"),
      logosAndUiAbsent: z.literal("PASS"),
      syntheticCreatorLikenessAbsent: z.literal("PASS"),
      providerCalls: z.literal(0),
      paidQaCalls: z.literal(0),
    }),
  });

const veronicaDeterministicPrototypeSchema = z.union([
  veronicaDeterministicDiagramPrototypeSchema,
  veronicaDeterministicVisualPrototypeSchema,
  veronicaDeterministicVisualPrototypeV2Schema,
  veronicaDeterministicVisualPrototypeV3Schema,
  veronicaDeterministicVisualPrototypeV4Schema,
]);

const veronicaDeterministicDiagramAdoptionSchema = z.strictObject({
  schemaVersion: z.literal("veronica-deterministic-diagram-adoption.v1"),
  status: z.enum(["PREPARED", "ADOPTED_PENDING_QA"]),
  episodeId: z.string().min(1),
  language: z.literal("en"),
  variant: z.enum(["short", "full"]),
  sceneId: z.string().min(1),
  visualBeatId: z.string().min(1),
  authorizationReference: z.string().min(1),
  authorizedAt: z.string().min(1),
  bindings: z.strictObject({
    prototypeManifestPath: z.string().min(1),
    prototypeManifestSha256: sha256Schema,
    sourceSha256: sha256Schema,
    semanticPlanSha256: sha256Schema,
    reviewManifestSha256: sha256Schema,
    visualEncodingDecisionSha256: sha256Schema.optional(),
    failedProviderImageSha256: sha256Schema,
    failedProviderReviewSha256: sha256Schema,
    semanticBriefHash: sha256Schema,
    svgSha256: sha256Schema,
    pngSha256: sha256Schema,
    previousManifestSha256: sha256Schema,
    previousAdoptionSha256: sha256Schema.optional(),
  }),
  adopted: z.strictObject({
    canonicalOutputPath: z.string().min(1),
    sceneManifestPath: z.string().min(1),
    archivePath: z.string().min(1),
    finalPromptHash: sha256Schema,
    providerRequestHash: sha256Schema,
    supersededAdoptionPath: z.string().min(1).optional(),
  }),
  effects: z.strictObject({
    imageGenerationProviderCalls: z.literal(0),
    qaProviderCalls: z.literal(0),
    automaticRetries: z.literal(0),
  }),
});

export function assertVeronicaHierarchicalImageReadiness(
  plan: Pick<
    PositioningVisualPlanV2,
    "validation" | "providerReadiness" | "hierarchicalReadiness"
  >,
  options?: { readonly currentApprovedReviewPack?: boolean },
): void {
  if (
    plan.validation.status !== "pass" ||
    plan.providerReadiness?.status !== "PASS" ||
    (plan.hierarchicalReadiness?.providerCandidate !== true &&
      options?.currentApprovedReviewPack !== true)
  ) {
    throw new Error("VERONICA_HIERARCHICAL_PRE_IMAGE_READINESS_REQUIRED: prompt-level PASS cannot override deterministic, sequence, or source-grounded blockers.");
  }
}

export function materializeVeronicaImageAssetScenePlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
}): ScenePlan {
  const wrapperBySemanticSceneId = new Map(
    input.plan.scenes.map((scene, index) => [
      scene.sceneId,
      input.scenePlan.scenes[index],
    ] as const),
  );
  const scenes = input.plan.assets.map((asset, index) => {
    const parent = wrapperBySemanticSceneId.get(asset.sceneId);
    const compilation = asset.promptCompilation?.input;
    if (!parent || !compilation || asset.prompt.trim().length === 0) {
      throw new Error(
        `VERONICA_IMAGE_ASSET_MATERIALIZATION_INCOMPLETE:${asset.assetId}`,
      );
    }
    const visualEvent = input.plan.visualEvents.find(
      (event) => event.assetId === asset.assetId,
    );
    const startSeconds = visualEvent
      ? visualEvent.startMs / 1_000
      : parent.timing.startSeconds;
    const endSeconds = visualEvent
      ? (visualEvent.startMs + visualEvent.durationMs) / 1_000
      : parent.timing.endSeconds;
    const beat = compilation.visualBeat;
    return {
      ...parent,
      id: `scene-${String(index + 1).padStart(3, "0")}`,
      sequenceNumber: index + 1,
      canonicalNarration: compilation.narrationBeat,
      sourceSegmentIds: [`scene-${String(index + 1).padStart(3, "0")}`],
      estimatedDurationSeconds: Math.max(0.001, endSeconds - startSeconds),
      timing: { startSeconds, endSeconds },
      visualPurpose: compilation.treatment.visualPurpose,
      subject: compilation.treatment.subject,
      action: beat?.action ?? parent.action,
      setting: compilation.treatment.environment,
      composition: compilation.treatment.composition,
      cameraFraming: compilation.treatment.camera,
      mood: `${compilation.treatment.lighting}; ${compilation.treatment.emotionalState}`,
      continuityReferences: [],
      referenceCharacterIds: parent.referenceCharacterIds,
      negativeConstraints: [
        ...compilation.treatment.negativeConstraints,
        ...compilation.constraints.providerSpecificConstraints,
      ],
      aspectRatios: [asset.nativeAspectRatio],
      imagePrompt: asset.prompt,
      expectedImageFilenames: [
        `${asset.assetId}-${asset.nativeAspectRatio.replace(":", "x")}.png`,
      ],
    };
  });
  return scenePlanSchema.parse({ ...input.scenePlan, scenes });
}

export function assertImageProviderCallCeiling(input: {
  readonly sceneCount: number;
  readonly maxRegenerationAttempts: number;
  readonly maxProviderCalls?: number;
}): number {
  const providerCallUpperBound =
    input.sceneCount * (1 + input.maxRegenerationAttempts);
  if (
    input.maxProviderCalls !== undefined &&
    providerCallUpperBound > input.maxProviderCalls
  ) {
    throw new Error(
      `IMAGE_PROVIDER_CALL_CEILING_EXCEEDED:${providerCallUpperBound}:${input.maxProviderCalls}`,
    );
  }
  return providerCallUpperBound;
}

export function resolveVeronicaImageAssetSelection(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly selections: readonly string[];
}): readonly string[] {
  return input.selections.map((selection) => {
    const index = input.plan.assets.findIndex(
      (asset) =>
        asset.assetId === selection || asset.visualBeatId === selection,
    );
    return index < 0
      ? selection
      : `scene-${String(index + 1).padStart(3, "0")}`;
  });
}

interface PersistedFailureResumeStatus {
  readonly retryable: boolean;
  readonly category?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildVeronicaVisualQaBriefs(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
  readonly variant: "short" | "full";
}): readonly VeronicaVisualQaBrief[] {
  if (input.plan.imagePromptGenerationStrategy !== "deterministic-v1" || !input.plan.imagePromptCompilation) {
    throw new Error("Veronica visual QA requires the canonical deterministic prompt-compilation artifact.");
  }
  const compilation = input.plan.imagePromptCompilation;
  const rules = [
    "The generated image must depict the canonical actor, action owner, polarity, state relation, cause, and consequence.",
    "Required evidence must be visible and forbidden evidence must be absent.",
    "Muted narration must still reveal the principal relationship in one to two seconds.",
  ];
  return input.scenePlan.scenes.map((wrapper, index) => {
    const asset = input.plan.assets[index];
    const scene = asset
      ? input.plan.scenes.find((candidate) => candidate.sceneId === asset.sceneId)
      : undefined;
    if (!scene?.semanticProposition || !asset?.promptCompilation) {
      throw new Error(`Veronica compiled prompt evidence is missing for ${wrapper.id}.`);
    }
    return {
      contentId: input.plan.contentId,
      assetId: wrapper.id,
      locale: "en",
      variant: input.variant,
      canonicalNarration: wrapper.canonicalNarration,
      spokenMeaning:
        asset.promptCompilation.input.visualBeat?.coreMeaning ??
        scene.semanticProposition.narrationClaim,
      viewerTakeaway:
        asset.promptCompilation.input.visualBeat?.viewerShouldUnderstand ??
        scene.visibleThesis,
      narrativePurpose: scene.treatment.communicationIntent,
      visualRelationship:
        asset.promptCompilation.input.visualBeat?.action ??
        `${scene.semanticProposition.cause ?? scene.semanticProposition.narrationClaim} -> ${scene.semanticProposition.consequence}`,
      mustShow: asset.promptCompilation.input.treatment.requiredEvidence,
      mustNotShow: asset.promptCompilation.input.treatment.forbiddenEvidence,
      relevanceAnchors: scene.semanticProposition.evidenceAnchors,
      genericDriftRisks: asset.promptCompilation.input.treatment.forbiddenEvidence,
      finalPrompt: wrapper.imagePrompt,
      visualDirectionRules: rules,
      semanticBriefHash: asset.promptCompilation.inputHash,
      visualDirectionVersion: compilation.compilerVersion,
    };
  });
}

export async function reviewExistingVeronicaImages(input: {
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly evaluator: VeronicaVisualQaEvaluator;
  readonly briefs: readonly VeronicaVisualQaBrief[];
  readonly reconciliationInventory?: VeronicaImageReconciliationInventory;
  readonly reconciliationInventoryPath?: string;
}): Promise<readonly ExistingVeronicaImageQaResult[]> {
  const briefs = new Map(input.briefs.map((brief) => [brief.assetId, brief]));
  const results: ExistingVeronicaImageQaResult[] = [];
  for (const scene of input.scenePlan.scenes) {
    try {
      const manifest = await loadEpisodeSceneManifest(
        input.episodeDir,
        scene.id,
      );
      if (
        !manifest ||
        manifest.status !== "generated" ||
        !manifest.outputSha256 ||
        !(await fileExists(manifest.outputPath))
      ) {
        throw new Error(
          `QA_EXISTING_IMAGE_NOT_GENERATED:${scene.id}`,
        );
      }
      const actualSha256 = await hashFile(manifest.outputPath);
      const brief = briefs.get(scene.id);
      if (!brief) {
        throw new Error(`QA_EXISTING_BRIEF_MISSING:${scene.id}`);
      }
      let reconciliationEntry: VeronicaImageReconciliationInventoryEntry | undefined;
      if (actualSha256 !== manifest.outputSha256) {
        reconciliationEntry = input.reconciliationInventory?.entries.find(
          (entry) => entry.sceneId === scene.id,
        );
        const inventoryPath = input.reconciliationInventoryPath;
        const generationDebugLogPath = reconciliationEntry?.generationDebugLogPath;
        const generationDebugLogSha256 = reconciliationEntry?.generationDebugLogSha256;
        if (!reconciliationEntry || !inventoryPath) {
          throw new Error(`QA_EXISTING_IMAGE_HASH_MISMATCH:${scene.id}`);
        }
        const evidenceComplete =
          reconciliationEntry.currentImageSha256 === actualSha256 &&
          reconciliationEntry.manifestImageSha256 === manifest.outputSha256 &&
          reconciliationEntry.currentSemanticInputHash === brief.semanticBriefHash &&
          reconciliationEntry.currentCanonicalFinalPromptHash === hashText(manifest.finalPrompt) &&
          reconciliationEntry.semanticPromptMateriallyChanged === false &&
          ["A", "B", "E"].includes(reconciliationEntry.classification) &&
          reconciliationEntry.postImageQaResult !== null &&
          reconciliationEntry.generationRequestId !== null &&
          reconciliationEntry.generationAttempt !== null &&
          generationDebugLogPath != null &&
          generationDebugLogSha256 != null &&
          reconciliationEntry.generationDebugTimestamp !== null;
        if (!evidenceComplete) {
          throw new Error(`QA_EXISTING_RECONCILIATION_UNSAFE:${scene.id}`);
        }
        const debugLogPath = path.resolve(
          input.episodeDir,
          generationDebugLogPath!,
        );
        if (
          !(await fileExists(debugLogPath)) ||
          await hashFile(debugLogPath) !== generationDebugLogSha256
        ) {
          throw new Error(`QA_EXISTING_RECONCILIATION_EVIDENCE_CHANGED:${scene.id}`);
        }
      }
      const review = await reviewVeronicaGeneratedImage({
        cacheDir: path.join(
          input.episodeDir,
          "state",
          "image-generation",
          "veronica-post-generation-visual-qa",
        ),
        imagePath: manifest.outputPath,
        brief: {
          ...brief,
          canonicalNarration: scene.canonicalNarration,
          finalPrompt: manifest.finalPrompt,
        },
        evaluator: input.evaluator,
      });
      let manifestReconciled = false;
      if (reconciliationEntry && review.approved) {
        const inventoryPath = path.resolve(input.reconciliationInventoryPath!);
        const previousManifestSha256 = manifest.outputSha256;
        const reconciledManifest: SceneGenerationManifest = {
          ...manifest,
          outputSha256: actualSha256,
          status: "generated",
          generatedAt: new Date().toISOString(),
        };
        delete reconciledManifest.error;
        await writeJsonAtomic(
          resolveEpisodeImageManifestPath(input.episodeDir, scene.id),
          reconciledManifest,
        );
        await persistVeronicaAcceptedImageBinding({
          episodeDir: input.episodeDir,
          sceneId: scene.id,
          manifest: reconciledManifest,
          semanticBrief: {
            ...brief,
            canonicalNarration: scene.canonicalNarration,
            finalPrompt: manifest.finalPrompt,
          },
          evaluator: input.evaluator,
          review: review.review,
          imageSha256: actualSha256,
          reconciliation: {
            inventoryPath,
            inventorySha256: await hashFile(inventoryPath),
            previousManifestSha256,
          },
          generationEvidence: {
            providerRequestHash: null,
            promptHash: reconciliationEntry.postImageQaResult!.finalPromptHash,
            requestId: reconciliationEntry.generationRequestId,
            attempts: reconciliationEntry.generationAttempt!,
            recordedAt: reconciliationEntry.generationDebugTimestamp!,
            debugLogPath: reconciliationEntry.generationDebugLogPath!,
            debugLogSha256: reconciliationEntry.generationDebugLogSha256!,
          },
        });
        manifestReconciled = true;
      }
      results.push({
        sceneId: scene.id,
        status: review.approved ? "approved" : "rejected",
        cacheStatus: review.cacheStatus,
        ...(manifestReconciled ? { manifestReconciled: true } : {}),
        ...(reconciliationEntry
          ? { reconciliationClassification: reconciliationEntry.classification }
          : {}),
      });
      if (!review.approved) break;
    } catch (error) {
      results.push({
        sceneId: scene.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return results;
}

export async function materializeVeronicaRemediationScenePlan(input: {
  readonly episodeId: string;
  readonly sourceSha256: string;
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly briefs: readonly VeronicaVisualQaBrief[];
  readonly reviewPath: string;
  readonly encodingDecisionPath?: string;
}): Promise<ScenePlan> {
  if (input.scenePlan.scenes.length !== 1) {
    throw new Error(
      "VERONICA_REMEDIATION_REQUIRES_ONE_SCENE: remediation is intentionally canary-scoped.",
    );
  }
  const scene = input.scenePlan.scenes[0];
  if (!scene) {
    throw new Error("VERONICA_REMEDIATION_REQUIRES_ONE_SCENE: no scene selected.");
  }
  const review = veronicaPostGenerationVisualReviewSchema.parse(
    JSON.parse(await fs.readFile(path.resolve(input.reviewPath), "utf8")) as unknown,
  );
  const brief = input.briefs.find((candidate) => candidate.assetId === scene.id);
  const manifest = await loadEpisodeSceneManifest(input.episodeDir, scene.id);
  if (!brief || !manifest || manifest.status !== "generated" || !manifest.outputSha256) {
    throw new Error(`VERONICA_REMEDIATION_PROVENANCE_INCOMPLETE:${scene.id}`);
  }
  if (isVeronicaVisualReviewApproved(review)) {
    throw new Error(`VERONICA_REMEDIATION_REVIEW_ALREADY_APPROVED:${scene.id}`);
  }
  const identityMismatches = [
    ...(review.assetId !== scene.id ? ["assetId"] : []),
    ...(review.contentId !== brief.contentId ? ["contentId"] : []),
    ...(review.semanticBriefHash !== brief.semanticBriefHash
      ? ["semanticBriefHash"]
      : []),
    ...(hashText(manifest.finalPrompt) !== review.finalPromptHash
      ? ["finalPromptHash"]
      : []),
  ];
  if (identityMismatches.length > 0) {
    throw new Error(
      `VERONICA_REMEDIATION_REVIEW_IDENTITY_MISMATCH:${scene.id}:${identityMismatches.join(",")}`,
    );
  }
  if (!(await fileExists(manifest.outputPath))) {
    throw new Error(`VERONICA_REMEDIATION_SOURCE_IMAGE_MISSING:${scene.id}`);
  }
  const currentImageHash = await hashFile(manifest.outputPath);
  if (
    currentImageHash !== manifest.outputSha256 ||
    currentImageHash !== review.imageFingerprint
  ) {
    throw new Error(`VERONICA_REMEDIATION_IMAGE_HASH_MISMATCH:${scene.id}`);
  }
  if (review.regenerationInstructions.length === 0) {
    throw new Error(`VERONICA_REMEDIATION_INSTRUCTIONS_MISSING:${scene.id}`);
  }

  let encodingDecision:
    | z.infer<typeof veronicaHumanVisualEncodingDecisionSchema>
    | undefined;
  if (input.encodingDecisionPath) {
    encodingDecision = veronicaHumanVisualEncodingDecisionSchema.parse(
      JSON.parse(
        await fs.readFile(path.resolve(input.encodingDecisionPath), "utf8"),
      ) as unknown,
    );
    const boundPaths = [
      encodingDecision.bindings.reviewManifestPath,
      encodingDecision.bindings.humanApprovalPath,
    ].map((relativePath) => path.resolve(input.episodeDir, relativePath));
    if (
      boundPaths.some(
        (boundPath) =>
          boundPath !== input.episodeDir &&
          !boundPath.startsWith(`${path.resolve(input.episodeDir)}${path.sep}`),
      )
    ) {
      throw new Error(`VERONICA_VISUAL_ENCODING_PATH_ESCAPE:${scene.id}`);
    }
    const [semanticPlanSha256, reviewManifestSha256, humanApprovalSha256, failedReviewSha256] =
      await Promise.all([
        hashFile(path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json")),
        hashFile(boundPaths[0]!),
        hashFile(boundPaths[1]!),
        hashFile(path.resolve(input.reviewPath)),
      ]);
    const decisionMismatches = [
      ...(encodingDecision.episodeId !== input.episodeId ? ["episodeId"] : []),
      ...(encodingDecision.sceneId !== scene.id ? ["sceneId"] : []),
      ...(encodingDecision.bindings.sourceSha256 !== input.sourceSha256
        ? ["sourceSha256"]
        : []),
      ...(encodingDecision.bindings.semanticPlanSha256 !== semanticPlanSha256
        ? ["semanticPlanSha256"]
        : []),
      ...(encodingDecision.bindings.reviewManifestSha256 !== reviewManifestSha256
        ? ["reviewManifestSha256"]
        : []),
      ...(encodingDecision.bindings.humanApprovalSha256 !== humanApprovalSha256
        ? ["humanApprovalSha256"]
        : []),
      ...(encodingDecision.bindings.failedReviewSha256 !== failedReviewSha256
        ? ["failedReviewSha256"]
        : []),
      ...(encodingDecision.bindings.rejectedImageSha256 !== review.imageFingerprint
        ? ["rejectedImageSha256"]
        : []),
      ...(encodingDecision.bindings.semanticBriefHash !== review.semanticBriefHash
        ? ["semanticBriefHash"]
        : []),
      ...(encodingDecision.bindings.failedPromptHash !== review.finalPromptHash
        ? ["failedPromptHash"]
        : []),
    ];
    if (decisionMismatches.length > 0) {
      throw new Error(
        `VERONICA_VISUAL_ENCODING_IDENTITY_MISMATCH:${scene.id}:${decisionMismatches.join(",")}`,
      );
    }
  }

  const archiveDir = path.join(
    input.episodeDir,
    "state",
    "image-generation",
    "superseded-assets",
  );
  const archivePath = path.join(
    archiveDir,
    `${scene.id}.${review.imageFingerprint}.png`,
  );
  await ensureDir(archiveDir);
  if (!(await fileExists(archivePath))) {
    await fs.copyFile(manifest.outputPath, archivePath);
  } else if ((await hashFile(archivePath)) !== review.imageFingerprint) {
    throw new Error(`VERONICA_REMEDIATION_ARCHIVE_CONFLICT:${scene.id}`);
  }

  const remediationPrompt = buildVeronicaVisualRemediationPrompt({
    brief,
    review,
  });
  const encodedPrompt = encodingDecision
    ? [
        remediationPrompt,
        `HUMAN-APPROVED CONCRETE ENCODING — ${encodingDecision.approvedTreatment.visualThesis}`,
        `Composition: ${encodingDecision.approvedTreatment.composition}`,
        `Mandatory evidence: ${encodingDecision.approvedTreatment.mustShow.join("; ")}.`,
        `Forbidden evidence: ${encodingDecision.approvedTreatment.mustNotShow.join("; ")}.`,
        `Execution: ${encodingDecision.approvedTreatment.promptInstructions.join("; ")}.`,
      ].join(" ")
    : remediationPrompt;
  return scenePlanSchema.parse({
    ...input.scenePlan,
    scenes: [{ ...scene, imagePrompt: encodedPrompt }],
  });
}

function assertPathWithin(root: string, candidate: string, code: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(code);
  }
}

async function findFileWithHash(
  directory: string,
  expectedSha256: string,
): Promise<string | null> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileWithHash(candidate, expectedSha256);
      if (nested) return nested;
    } else if (entry.isFile() && (await hashFile(candidate)) === expectedSha256) {
      return candidate;
    }
  }
  return null;
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, signature.length).equals(signature) ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error("VERONICA_DIAGRAM_INVALID_PNG");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function copyFileAtomic(source: string, destination: string): Promise<void> {
  await ensureDir(path.dirname(destination));
  const temporaryPath = `${destination}.adoption-${process.pid}-${Date.now()}.tmp`;
  try {
    await fs.copyFile(source, temporaryPath);
    await fs.rename(temporaryPath, destination);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function adoptVeronicaDeterministicDiagramPrototype(input: {
  readonly episodeId: string;
  readonly sourceSha256: string;
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly briefs: readonly VeronicaVisualQaBrief[];
  readonly prototypeManifestPath: string;
  readonly authorizationReference: string;
  readonly variant: "short" | "full";
}): Promise<{ readonly adoptionPath: string; readonly imageSha256: string }> {
  if (input.scenePlan.scenes.length !== 1) {
    throw new Error(
      "VERONICA_DIAGRAM_ADOPTION_REQUIRES_ONE_SCENE: adoption is intentionally canary-scoped.",
    );
  }
  const scene = input.scenePlan.scenes[0];
  if (!scene) {
    throw new Error("VERONICA_DIAGRAM_ADOPTION_REQUIRES_ONE_SCENE: no scene selected.");
  }
  const prototypeManifestPath = path.resolve(input.prototypeManifestPath);
  if (path.basename(path.dirname(prototypeManifestPath)) !== "prototypes") {
    throw new Error(`VERONICA_DIAGRAM_PROTOTYPE_LOCATION_INVALID:${scene.id}`);
  }
  const packDir = path.dirname(path.dirname(prototypeManifestPath));
  assertPathWithin(input.episodeDir, packDir, `VERONICA_DIAGRAM_PROTOTYPE_PATH_ESCAPE:${scene.id}`);
  const prototype = veronicaDeterministicPrototypeSchema.parse(
    JSON.parse(await fs.readFile(prototypeManifestPath, "utf8")) as unknown,
  );
  const isLegacyDiagram =
    prototype.schemaVersion === "veronica-deterministic-diagram-prototype.v1";
  const isChainedPrototype =
    prototype.schemaVersion === "veronica-deterministic-visual-prototype.v2" ||
    prototype.schemaVersion === "veronica-deterministic-visual-prototype.v3" ||
    prototype.schemaVersion === "veronica-deterministic-visual-prototype.v4";
  const failedImageSha256 = isChainedPrototype
    ? prototype.provenance.failedCanonicalImageSha256
    : prototype.provenance.failedProviderImageSha256;
  const failedReviewSha256 = isChainedPrototype
    ? prototype.provenance.failedCanonicalReviewSha256
    : prototype.provenance.failedProviderReviewSha256;
  const brief = input.briefs.find((candidate) => candidate.assetId === scene.id);
  const manifest = await loadEpisodeSceneManifest(input.episodeDir, scene.id);
  if (!brief || !manifest || manifest.status !== "generated" || !manifest.outputSha256) {
    throw new Error(`VERONICA_DIAGRAM_ADOPTION_PROVENANCE_INCOMPLETE:${scene.id}`);
  }
  const sceneManifestPath = path.join(
    input.episodeDir,
    "state",
    "image-generation",
    "manifests",
    `${scene.id}.json`,
  );
  const semanticPlanPath = path.join(
    input.episodeDir,
    "source",
    "pre-image-semantic-plan.v1.json",
  );
  const reviewManifestPath = path.join(packDir, "review-manifest.json");
  const encodingDecisionPath = isLegacyDiagram
    ? path.join(packDir, "human-visual-encoding-decision.v1.json")
    : undefined;
  const [
    prototypeManifestSha256,
    semanticPlanSha256,
    reviewManifestSha256,
    visualEncodingDecisionSha256,
  ] = await Promise.all([
    hashFile(prototypeManifestPath),
    hashFile(semanticPlanPath),
    hashFile(reviewManifestPath),
    encodingDecisionPath ? hashFile(encodingDecisionPath) : undefined,
  ]);
  const identityMismatches = [
    ...(prototype.episodeId !== input.episodeId ? ["episodeId"] : []),
    ...(prototype.variant !== input.variant ? ["variant"] : []),
    ...(prototype.sceneId !== scene.id ? ["sceneId"] : []),
    ...(prototype.provenance.sourceSha256 !== input.sourceSha256 ? ["sourceSha256"] : []),
    ...(prototype.provenance.semanticPlanSha256 !== semanticPlanSha256 ? ["semanticPlanSha256"] : []),
    ...(prototype.provenance.reviewManifestSha256 !== reviewManifestSha256 ? ["reviewManifestSha256"] : []),
    ...(isLegacyDiagram &&
    prototype.provenance.visualEncodingDecisionSha256 !== visualEncodingDecisionSha256
      ? ["visualEncodingDecisionSha256"]
      : []),
    ...(prototype.provenance.semanticBriefHash !== brief.semanticBriefHash
      ? ["semanticBriefHash"]
      : []),
    ...(isChainedPrototype &&
    prototype.provenance.currentSceneManifestSha256 !==
      await hashFile(sceneManifestPath)
      ? ["currentSceneManifestSha256"]
      : []),
  ];
  if (identityMismatches.length > 0) {
    throw new Error(
      `VERONICA_DIAGRAM_PROTOTYPE_IDENTITY_MISMATCH:${scene.id}:${identityMismatches.join(",")}`,
    );
  }

  let encodingDecision:
    | z.infer<typeof veronicaHumanVisualEncodingDecisionSchema>
    | undefined;
  if (encodingDecisionPath) {
    encodingDecision = veronicaHumanVisualEncodingDecisionSchema.parse(
      JSON.parse(await fs.readFile(encodingDecisionPath, "utf8")) as unknown,
    );
    const decisionReviewManifestPath = path.resolve(
      input.episodeDir,
      encodingDecision.bindings.reviewManifestPath,
    );
    const decisionHumanApprovalPath = path.resolve(
      input.episodeDir,
      encodingDecision.bindings.humanApprovalPath,
    );
    assertPathWithin(input.episodeDir, decisionReviewManifestPath, `VERONICA_DIAGRAM_DECISION_PATH_ESCAPE:${scene.id}`);
    assertPathWithin(input.episodeDir, decisionHumanApprovalPath, `VERONICA_DIAGRAM_DECISION_PATH_ESCAPE:${scene.id}`);
    const decisionMismatches = [
      ...(encodingDecision.episodeId !== input.episodeId ? ["decision.episodeId"] : []),
      ...(encodingDecision.variant !== input.variant ? ["decision.variant"] : []),
      ...(encodingDecision.sceneId !== scene.id ? ["decision.sceneId"] : []),
      ...(encodingDecision.bindings.sourceSha256 !== input.sourceSha256 ? ["decision.sourceSha256"] : []),
      ...(encodingDecision.bindings.semanticPlanSha256 !== semanticPlanSha256 ? ["decision.semanticPlanSha256"] : []),
      ...(encodingDecision.bindings.reviewManifestSha256 !== reviewManifestSha256 ? ["decision.reviewManifestSha256"] : []),
      ...((await hashFile(decisionReviewManifestPath)) !== encodingDecision.bindings.reviewManifestSha256
        ? ["decision.reviewManifestFile"]
        : []),
      ...((await hashFile(decisionHumanApprovalPath)) !== encodingDecision.bindings.humanApprovalSha256
        ? ["decision.humanApprovalFile"]
        : []),
    ];
    if (decisionMismatches.length > 0) {
      throw new Error(
        `VERONICA_DIAGRAM_DECISION_IDENTITY_MISMATCH:${scene.id}:${decisionMismatches.join(",")}`,
      );
    }
  }

  const svgPath = path.resolve(packDir, prototype.artifacts.svgPath);
  const pngPath = path.resolve(packDir, prototype.artifacts.pngPath);
  assertPathWithin(packDir, svgPath, `VERONICA_DIAGRAM_ARTIFACT_PATH_ESCAPE:${scene.id}`);
  assertPathWithin(packDir, pngPath, `VERONICA_DIAGRAM_ARTIFACT_PATH_ESCAPE:${scene.id}`);
  const [svgSha256, pngSha256, svgText, pngBytes] = await Promise.all([
    hashFile(svgPath),
    hashFile(pngPath),
    fs.readFile(svgPath, "utf8"),
    fs.readFile(pngPath),
  ]);
  const pngDimensions = readPngDimensions(pngBytes);
  const removedTotal = isLegacyDiagram
    ? prototype.geometryContract.removedUnitsByGate.reduce(
        (sum, value) => sum + value,
        0,
      )
    : prototype.geometryContract.costDrainGroups.reduce(
        (sum, value) => sum + value,
        0,
      );
  const geometryValid = isLegacyDiagram
    ? prototype.geometryContract.inputUnits ===
        removedTotal + prototype.geometryContract.retainedRemainderUnits &&
      prototype.geometryContract.removalGateCount ===
        prototype.geometryContract.removedUnitsByGate.length &&
      prototype.geometryContract.removedFragmentCount ===
        prototype.geometryContract.removedUnitsByGate.length
    : prototype.geometryContract.completedSaleInputUnits ===
        removedTotal + prototype.geometryContract.retainedRemainderUnits &&
      prototype.geometryContract.totalCostDrainUnits === removedTotal;
  if (
    svgSha256 !== prototype.artifacts.svgSha256 ||
    pngSha256 !== prototype.artifacts.pngSha256 ||
    pngDimensions.width !== prototype.artifacts.width ||
    pngDimensions.height !== prototype.artifacts.height ||
    !geometryValid ||
    /<text\b|(?:href|xlink:href)\s*=/iu.test(svgText)
  ) {
    throw new Error(`VERONICA_DIAGRAM_ARTIFACT_CONTRACT_MISMATCH:${scene.id}`);
  }

  const currentReviewPath = await findFileWithHash(
    path.join(
      input.episodeDir,
      "state",
      "image-generation",
      "veronica-post-generation-visual-qa",
    ),
    failedReviewSha256,
  );
  if (!currentReviewPath) {
    throw new Error(`VERONICA_DIAGRAM_FAILED_REVIEW_MISSING:${scene.id}`);
  }
  const failedReview = veronicaPostGenerationVisualReviewSchema.parse(
    JSON.parse(await fs.readFile(currentReviewPath, "utf8")) as unknown,
  );
  if (
    isVeronicaVisualReviewApproved(failedReview) ||
    failedReview.assetId !== scene.id ||
    failedReview.contentId !== brief.contentId ||
    failedReview.imageFingerprint !== failedImageSha256 ||
    failedReview.semanticBriefHash !== brief.semanticBriefHash
  ) {
    throw new Error(`VERONICA_DIAGRAM_FAILED_REVIEW_IDENTITY_MISMATCH:${scene.id}`);
  }
  if (!isLegacyDiagram) {
    const adjacentReviewPath = await findFileWithHash(
      path.join(
        input.episodeDir,
        "state",
        "image-generation",
        "veronica-post-generation-visual-qa",
      ),
      prototype.provenance.approvedAdjacentReviewSha256,
    );
    if (!adjacentReviewPath) {
      throw new Error(`VERONICA_DIAGRAM_ADJACENT_REVIEW_MISSING:${scene.id}`);
    }
    const adjacentReview = veronicaPostGenerationVisualReviewSchema.parse(
      JSON.parse(await fs.readFile(adjacentReviewPath, "utf8")) as unknown,
    );
    const distinctionBinding = prototype.semanticContract.materiallyDistinctFrom.find(
      (candidate) =>
        candidate.sceneId === adjacentReview.assetId &&
        candidate.imageSha256 === adjacentReview.imageFingerprint,
    );
    if (
      !isVeronicaVisualReviewApproved(adjacentReview) ||
      adjacentReview.imageFingerprint !==
        prototype.provenance.approvedAdjacentImageSha256 ||
      !distinctionBinding
    ) {
      throw new Error(`VERONICA_DIAGRAM_ADJACENT_REVIEW_IDENTITY_MISMATCH:${scene.id}`);
    }
  }

  const adoptionPath = path.join(
    input.episodeDir,
    "state",
    "image-generation",
    "deterministic-adoptions",
    `${scene.id}.json`,
  );
  const existingAdoption = await readJsonIfExists(adoptionPath, (raw) =>
    veronicaDeterministicDiagramAdoptionSchema.parse(raw),
  );
  const currentImageSha256 = await hashFile(manifest.outputPath);
  const currentSceneManifestSha256 = await hashFile(sceneManifestPath);
  const existingAdoptionSha256 = existingAdoption
    ? await hashFile(adoptionPath)
    : undefined;
  if (
    isChainedPrototype &&
    (!existingAdoption ||
      existingAdoptionSha256 !== prototype.provenance.currentAdoptionSha256 ||
      currentSceneManifestSha256 !== prototype.provenance.currentSceneManifestSha256)
  ) {
    throw new Error(`VERONICA_DIAGRAM_PRIOR_ADOPTION_IDENTITY_MISMATCH:${scene.id}`);
  }
  const samePrototypeReplay = Boolean(
    existingAdoption?.bindings.prototypeManifestSha256 === prototypeManifestSha256,
  );
  const previousManifestSha256 = samePrototypeReplay
    ? existingAdoption!.bindings.previousManifestSha256
    : currentSceneManifestSha256;
  const archivePath = path.join(
    input.episodeDir,
    "state",
    "image-generation",
    "superseded-assets",
    `${scene.id}.${failedImageSha256}.png`,
  );
  const supersededAdoptionPath =
    isChainedPrototype && existingAdoptionSha256
      ? path.join(
          input.episodeDir,
          "state",
          "image-generation",
          "superseded-adoptions",
          `${scene.id}.${existingAdoptionSha256}.json`,
        )
      : undefined;
  const treatment = isLegacyDiagram
    ? {
        visualThesis: encodingDecision!.approvedTreatment.visualThesis,
        composition: encodingDecision!.approvedTreatment.composition,
        mustShow: encodingDecision!.approvedTreatment.mustShow,
        mustNotShow: encodingDecision!.approvedTreatment.mustNotShow,
        geometrySummary: `one continuous value path, ${prototype.geometryContract.removalGateCount} removal gates, and one final retained remainder`,
      }
    : {
        visualThesis: prototype.semanticContract.visualThesis,
        composition: `${prototype.semanticContract.encodingFamily}; ${prototype.semanticContract.causalRelationship}`,
        mustShow: prototype.semanticContract.mustShow,
        mustNotShow: prototype.semanticContract.mustNotShow,
        geometrySummary: `one completed sale path, ${prototype.geometryContract.totalCostDrainUnits} drained units, one retained unit, and one separate withheld prospective order`,
      };
  const finalPrompt = [
    "DETERMINISTIC EDITORIAL DIAGRAM — evaluate the exact rendered pixels, not a provider-generation attempt.",
    `Visual thesis: ${treatment.visualThesis}`,
    `Composition: ${treatment.composition}`,
    `Mandatory evidence: ${treatment.mustShow.join("; ")}.`,
    `Forbidden evidence: ${treatment.mustNotShow.join("; ")}.`,
    `Exact conservation: ${prototype.geometryContract.conservationEquation}; ${treatment.geometrySummary}.`,
    "No readable text, labels, numbers, logos, interface elements, or identifiable creator likeness.",
  ].join(" ");
  const finalPromptHash = hashText(finalPrompt);
  const providerRequestHash = hashText(JSON.stringify({
    operation: "deterministic-diagram-adoption",
    schemaVersion: prototype.schemaVersion,
    prototypeManifestSha256,
    svgSha256,
    pngSha256,
    sourceSha256: input.sourceSha256,
    semanticBriefHash: brief.semanticBriefHash,
  }));
  const preparedAdoption = veronicaDeterministicDiagramAdoptionSchema.parse({
    schemaVersion: "veronica-deterministic-diagram-adoption.v1",
    status: "PREPARED",
    episodeId: input.episodeId,
    language: "en",
    variant: input.variant,
    sceneId: scene.id,
    visualBeatId: prototype.visualBeatId,
    authorizationReference: input.authorizationReference,
    authorizedAt:
      samePrototypeReplay && existingAdoption
        ? existingAdoption.authorizedAt
        : nowIso(),
    bindings: {
      prototypeManifestPath,
      prototypeManifestSha256,
      sourceSha256: input.sourceSha256,
      semanticPlanSha256,
      reviewManifestSha256,
      ...(visualEncodingDecisionSha256
        ? { visualEncodingDecisionSha256 }
        : {}),
      failedProviderImageSha256: failedImageSha256,
      failedProviderReviewSha256: failedReviewSha256,
      semanticBriefHash: brief.semanticBriefHash,
      svgSha256,
      pngSha256,
      previousManifestSha256,
      ...(existingAdoptionSha256 && !samePrototypeReplay
        ? { previousAdoptionSha256: existingAdoptionSha256 }
        : {}),
    },
    adopted: {
      canonicalOutputPath: manifest.outputPath,
      sceneManifestPath,
      archivePath,
      finalPromptHash,
      providerRequestHash,
      ...(supersededAdoptionPath ? { supersededAdoptionPath } : {}),
    },
    effects: {
      imageGenerationProviderCalls: 0,
      qaProviderCalls: 0,
      automaticRetries: 0,
    },
  });
  if (samePrototypeReplay && existingAdoption) {
    const replayMismatches = [
      ...(existingAdoption.bindings.prototypeManifestSha256 !== prototypeManifestSha256
        ? ["prototypeManifestSha256"]
        : []),
      ...(existingAdoption.bindings.pngSha256 !== pngSha256 ? ["pngSha256"] : []),
      ...(existingAdoption.adopted.canonicalOutputPath !== manifest.outputPath
        ? ["canonicalOutputPath"]
        : []),
      ...(existingAdoption.authorizationReference !== input.authorizationReference
        ? ["authorizationReference"]
        : []),
    ];
    if (replayMismatches.length > 0) {
      throw new Error(
        `VERONICA_DIAGRAM_ADOPTION_REPLAY_MISMATCH:${scene.id}:${replayMismatches.join(",")}`,
      );
    }
  } else {
    if (existingAdoption && existingAdoptionSha256 && supersededAdoptionPath) {
      await ensureDir(path.dirname(supersededAdoptionPath));
      if (!(await fileExists(supersededAdoptionPath))) {
        await fs.copyFile(adoptionPath, supersededAdoptionPath);
      } else if ((await hashFile(supersededAdoptionPath)) !== existingAdoptionSha256) {
        throw new Error(`VERONICA_DIAGRAM_ADOPTION_ARCHIVE_CONFLICT:${scene.id}`);
      }
    }
    await writeJsonAtomic(adoptionPath, preparedAdoption);
  }

  if (currentImageSha256 === failedImageSha256) {
    if (
      manifest.outputSha256 !== currentImageSha256 ||
      hashText(manifest.finalPrompt) !== failedReview.finalPromptHash
    ) {
      throw new Error(`VERONICA_DIAGRAM_SOURCE_IMAGE_IDENTITY_MISMATCH:${scene.id}`);
    }
    await ensureDir(path.dirname(archivePath));
    if (!(await fileExists(archivePath))) {
      await fs.copyFile(manifest.outputPath, archivePath);
    } else if ((await hashFile(archivePath)) !== currentImageSha256) {
      throw new Error(`VERONICA_DIAGRAM_ARCHIVE_CONFLICT:${scene.id}`);
    }
    await copyFileAtomic(pngPath, manifest.outputPath);
  } else if (currentImageSha256 !== pngSha256) {
    throw new Error(`VERONICA_DIAGRAM_CANONICAL_IMAGE_CONFLICT:${scene.id}`);
  }
  if ((await hashFile(manifest.outputPath)) !== pngSha256) {
    throw new Error(`VERONICA_DIAGRAM_ADOPTED_IMAGE_HASH_MISMATCH:${scene.id}`);
  }
  await writeJsonAtomic(sceneManifestPath, {
    ...manifest,
    finalPrompt,
    providerRequestHash,
    promptHash: finalPromptHash,
    model: "deterministic-svg",
    size: `${prototype.artifacts.width}x${prototype.artifacts.height}`,
    quality: "deterministic",
    outputSha256: pngSha256,
    status: "generated",
    attempts: 0,
    generatedAt: nowIso(),
    error: undefined,
  });
  await writeJsonAtomic(adoptionPath, {
    ...preparedAdoption,
    status: "ADOPTED_PENDING_QA",
  });
  return { adoptionPath, imageSha256: pngSha256 };
}

async function readJsonIfExists<T>(
  filePath: string,
  parser: (value: unknown) => T
): Promise<T | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  return parser(raw);
}

function isEpisodeSourceFile(fileName: string): boolean {
  return /-en-full\.md$/u.test(fileName);
}

async function resolveEpisodeSourceFile(
  episodeDir: string,
  explicitSource?: string
): Promise<string> {
  if (explicitSource) {
    const resolved = path.resolve(explicitSource);
    if (!(await fileExists(resolved))) {
      throw new Error(`Explicit source file not found: ${resolved}`);
    }
    return resolved;
  }
  const sourceDir = path.join(episodeDir, "source");
  const sourceEntries = await fs
    .readdir(sourceDir, { withFileTypes: true })
    .catch(() => []);
  const candidates = sourceEntries
    .filter((entry) => entry.isFile() && isEpisodeSourceFile(entry.name))
    .map((entry) => path.join(sourceDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
  if (candidates.length === 0) {
    throw new Error(
      `No English full-story source file found under ${sourceDir}.`
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      [
        `Multiple English full-story source files were found under ${sourceDir}.`,
        "Pass --source explicitly:",
        ...candidates.map((candidate) => `- ${candidate}`),
      ].join("\n")
    );
  }
  return candidates[0]!;
}

async function resolveScenePlan(episodeDir: string): Promise<ScenePlan> {
  const candidates = [
    path.join(episodeDir, "shared", "scenes.json"),
    path.join(episodeDir, "state", "image-generation", "scenes.json"),
    path.join(episodeDir, "scenes.json"),
  ];
  for (const candidate of candidates) {
    const value = await readJsonIfExists(candidate, (raw) =>
      scenePlanSchema.parse(raw)
    );
    if (value) {
      return value;
    }
  }
  throw new Error(
    [
      `No scene plan could be resolved for ${episodeDir}.`,
      "Expected one of:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n")
  );
}

async function readFailureResumeStatus(
  episodeDir: string,
  sceneId: string
): Promise<PersistedFailureResumeStatus | null> {
  const failurePath = path.join(
    episodeDir,
    "state",
    "image-generation",
    "failures",
    `${sceneId}.json`
  );
  const raw = await readJsonIfExists(failurePath, (value) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null
  );
  if (!raw) {
    return null;
  }
  return {
    retryable: typeof raw["retryable"] === "boolean" ? raw["retryable"] : false,
    ...(typeof raw["category"] === "string"
      ? { category: raw["category"] }
      : {}),
  };
}

async function buildResumeEligibleScenePlan(
  episodeDir: string,
  scenePlan: ScenePlan,
  force: boolean,
  qaExisting: boolean,
): Promise<{
  readonly scenePlan: ScenePlan;
  readonly skippedNonRetryableFailures: Array<{
    readonly sceneId: string;
    readonly category?: string;
  }>;
}> {
  if (force) {
    return { scenePlan, skippedNonRetryableFailures: [] };
  }
  const eligibleScenes: ScenePlan["scenes"] = [];
  const skippedNonRetryableFailures: Array<{
    readonly sceneId: string;
    readonly category?: string;
  }> = [];
  for (const scene of scenePlan.scenes) {
    const manifest = await loadEpisodeSceneManifest(episodeDir, scene.id);
    if (!manifest) {
      eligibleScenes.push(scene);
      continue;
    }
    if (manifest.status === "generated") {
      if (qaExisting || !(await fileExists(manifest.outputPath))) {
        eligibleScenes.push(scene);
      }
      continue;
    }
    if (manifest.status === "failed") {
      const failure = await readFailureResumeStatus(episodeDir, scene.id);
      const retryable =
        failure?.retryable ?? manifest.error?.retryable ?? false;
      if (retryable) {
        eligibleScenes.push(scene);
      } else {
        skippedNonRetryableFailures.push({
          sceneId: scene.id,
          ...(failure?.category ? { category: failure.category } : {}),
        });
      }
      continue;
    }
    eligibleScenes.push(scene);
  }
  return {
    scenePlan: scenePlanSchema.parse({
      ...scenePlan,
      scenes: eligibleScenes,
    }),
    skippedNonRetryableFailures,
  };
}

export async function loadOrBootstrapEpisodeManifest(
  options: ImagesResumeCliOptions
): Promise<ResolvedEpisodeManifest> {
  const runtimeConfig = await loadRuntimeConfig(
    options.workspace ? { workspaceDir: options.workspace } : {}
  );
  const episodeId = normalizeWhitespace(options.episode ?? "");
  if (episodeId.length === 0) {
    throw new Error("Episode id is required.");
  }
  const episodeDir = path.join(runtimeConfig.workspaceDir, episodeId);
  const manifestPath = path.join(episodeDir, "manifest.json");
  const existing = await readJsonIfExists(manifestPath, (raw) =>
    episodeManifestSchema.parse(raw)
  );
  if (existing) {
    const resolvedExistingScenePlan = existing.scenePlan;
    if (resolvedExistingScenePlan) {
      return {
        episodeDir,
        manifestPath,
        manifest: { ...existing, scenePlan: resolvedExistingScenePlan },
        created: false,
      };
    }
    const scenePlan = await resolveScenePlan(episodeDir);
    const updated = episodeManifestSchema.parse({
      ...existing,
      scenePlan,
      updatedAt: nowIso(),
    });
    const resolvedScenePlan = updated.scenePlan;
    if (!resolvedScenePlan) {
      throw new Error(`Unable to attach scene plan to ${manifestPath}.`);
    }
    await writeJsonAtomic(manifestPath, updated);
    return {
      episodeDir,
      manifestPath,
      manifest: { ...updated, scenePlan: resolvedScenePlan },
      created: true,
    };
  }
  await ensureDir(episodeDir);
  const sourceFile = await resolveEpisodeSourceFile(episodeDir, options.source);
  const scenePlan = await resolveScenePlan(episodeDir);
  const createdAt = nowIso();
  const manifest = episodeManifestSchema.parse({
    episodeId,
    slug: episodeId,
    source: {
      platform: "local-file" as const,
      filePath: sourceFile,
    },
    scenePlan,
    images: [],
    artifacts: [],
    pipelineRuns: [],
    createdAt,
    updatedAt: createdAt,
  });
  const resolvedScenePlan = manifest.scenePlan;
  if (!resolvedScenePlan) {
    throw new Error(`Unable to bootstrap scene plan for ${manifestPath}.`);
  }
  await writeJsonAtomic(manifestPath, manifest);
  return {
    episodeDir,
    manifestPath,
    manifest: { ...manifest, scenePlan: resolvedScenePlan },
    created: true,
  };
}

export async function commandImagesResume(
  options: ImagesResumeCliOptions
): Promise<void> {
  if (
    options.veronicaVisualEncodingDecision &&
    !options.veronicaRemediationReview
  ) {
    throw new Error(
      "VERONICA_VISUAL_ENCODING_REMEDIATION_REVIEW_REQUIRED: the decision must be paired with its failed QA review.",
    );
  }
  if (options.adoptVeronicaDiagramPrototype && !options.qaExisting) {
    throw new Error(
      "VERONICA_DIAGRAM_ADOPTION_QA_EXISTING_REQUIRED: deterministic adoption must be followed by strict existing-pixel QA.",
    );
  }
  let selectedSceneIds = (options.scene ?? "")
    .split(",")
    .map((sceneId) => sceneId.trim())
    .filter((sceneId) => sceneId.length > 0);
  if (options.force && selectedSceneIds.length === 0) {
    throw new Error(
      "Refusing episode-wide forced image resume. Pass --scene <scene-id> or comma-separated scene ids."
    );
  }
  if (options.qaExisting && options.force) {
    throw new Error(
      "QA_EXISTING_FORCE_CONFLICT: QA-only execution cannot force image generation.",
    );
  }
  if (options.reconciliationInventory && !options.qaExisting) {
    throw new Error(
      "VERONICA_RECONCILIATION_QA_EXISTING_REQUIRED: reconciliation can only run with --qa-existing.",
    );
  }
  const { episodeDir, manifestPath, manifest, created } =
    await loadOrBootstrapEpisodeManifest(options);
  const sourceGenre =
    manifest.sourceMetadata && typeof manifest.sourceMetadata === "object"
      ? Reflect.get(manifest.sourceMetadata, "genre")
      : undefined;
  const isVeronica =
    sourceGenre === "veronicabenini" || sourceGenre === "strategic-reinvention";
  const historyPlan = await loadHistoryVisualPlanV35(episodeDir);
  const isHistory = historyPlan !== null;
  if (isVeronica) {
    const positioningPlanHash = Reflect.get(
      manifest.sourceMetadata as object,
      "positioningPlanHash"
    );
    if (
      typeof positioningPlanHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(positioningPlanHash)
    ) {
      throw new Error(
        "Veronica image generation requires an approved, hash-bound positioning production plan."
      );
    }
    await assertVeronicaPreImageReviewPackCurrent({
      episodeDir,
      language: "en",
      variant: options.variant ?? "short",
    });
  } else {
    await assertPreImageReviewPackCurrent({
      episodeDir,
      language: "en",
      variant: options.variant ?? "full",
      genre: isHistory ? "history" : "dark-truth",
    });
  }
  if (!isHistory && !isVeronica) {
    await assertScriptScoreGate({
      outputRoot: path.dirname(episodeDir),
      episode: manifest.episodeId,
      locale: "en",
      format: "full",
    });
  }
  const settings = loadEpisodeImageGenerationSettings(
    {
      ...process.env,
      OPENAI_IMAGE_CONCURRENCY:
        options.concurrency !== undefined
          ? String(options.concurrency)
          : process.env["OPENAI_IMAGE_CONCURRENCY"],
      OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES:
        options.allowUnapprovedCharacterReferences
          ? "true"
          : process.env["OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES"],
      OPENAI_IMAGE_FORCE: options.force
        ? "true"
        : process.env["OPENAI_IMAGE_FORCE"],
    },
    {
      profile: options.variant ?? "full",
    }
  );
  let semanticScenePlan = manifest.scenePlan;
  let veronicaVisualQaEvaluator:
    | ReturnType<typeof createOpenAiVeronicaVisualQaEvaluator>
    | undefined;
  let veronicaVisualQaBriefs: readonly VeronicaVisualQaBrief[] | undefined;
  let veronicaSourceSha256: string | undefined;
  if (isVeronica || isHistory) {
    const runtime = await loadRuntimeConfig(
      options.workspace ? { workspaceDir: options.workspace } : {}
    );
    const client = createOpenAiStoryClientWithOptions({
      apiKey: settings.apiKey,
      ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
      ...(settings.organization ? { organization: settings.organization } : {}),
      ...(settings.project ? { project: settings.project } : {}),
      maxRetries: 0,
      timeoutMs: settings.timeoutMs,
    });
    if (isVeronica) {
      const authoritativeSource = Reflect.get(
        Reflect.get(manifest.sourceMetadata as object, "authoritativeSource") as object,
        "sha256",
      );
      if (
        typeof authoritativeSource !== "string" ||
        !/^[a-f0-9]{64}$/u.test(authoritativeSource)
      ) {
        throw new Error(
          "VERONICA_AUTHORITATIVE_SOURCE_HASH_REQUIRED: visual encoding decisions must bind the canonical source.",
        );
      }
      veronicaSourceSha256 = authoritativeSource;
      const planPath = path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json");
      const rawPlan = positioningProductionPlanSchema.parse(
        JSON.parse(await fs.readFile(planPath, "utf8")) as unknown
      ) as unknown as PositioningVisualPlanV2;
      if (rawPlan.imagePromptGenerationStrategy !== "deterministic-v1" || !rawPlan.imagePromptCompilation) {
        throw new Error("VERONICA_DETERMINISTIC_IMAGE_PROMPTS_NOT_COMPILED: rerun prepare-production before image generation.");
      }
      assertVeronicaHierarchicalImageReadiness(rawPlan, {
        currentApprovedReviewPack: true,
      });
      semanticScenePlan = materializeVeronicaImageAssetScenePlan({
        plan: rawPlan,
        scenePlan: manifest.scenePlan,
      });
      selectedSceneIds = [...resolveVeronicaImageAssetSelection({
        plan: rawPlan,
        selections: selectedSceneIds,
      })];
      const visualQaPolicy = requireOpenAiResponsesPolicy(runtime.openAiPolicy["veronica-post-generation-visual-qa"]);
      veronicaVisualQaEvaluator = createOpenAiVeronicaVisualQaEvaluator({
        client,
        model: visualQaPolicy.model,
        config: { reasoningEffort: visualQaPolicy.reasoning },
      });
      veronicaVisualQaBriefs = buildVeronicaVisualQaBriefs({
        plan: rawPlan,
        scenePlan: semanticScenePlan,
        variant:
          options.variant ?? (rawPlan.format === "short" ? "short" : "full"),
      });
    } else if (historyPlan) {
      await assertHistoryVisualApprovalV35(episodeDir);
      const derived = await deriveHistorySemanticImagePromptBrief({
        episodeDir,
        plan: historyPlan,
        client,
        model: runtime.openAiPolicy["history-visual-direction"].model,
      });
      semanticScenePlan = (
        await persistHistorySemanticImagePromptReview({
          episodeDir,
          plan: historyPlan,
          artifact: derived.artifact,
          cacheStatus: derived.cacheStatus,
          previousArtifact: derived.previousArtifact,
          findings: derived.findings,
        })
      ).scenePlan;
    }
  }
  const logger = createLogger(
    options.verbose ? "debug" : "info",
    process.stderr
  );
  if (selectedSceneIds.length > 0) {
    const availableSceneIds = new Set(
      semanticScenePlan.scenes.map((scene) => String(scene.id))
    );
    const unknownSceneIds = selectedSceneIds.filter(
      (sceneId) => !availableSceneIds.has(sceneId)
    );
    if (unknownSceneIds.length > 0) {
      throw new Error(
        `Unknown image scene IDs: ${unknownSceneIds.join(", ")}.`
      );
    }
    semanticScenePlan = scenePlanSchema.parse({
      ...semanticScenePlan,
      scenes: semanticScenePlan.scenes.filter((scene) =>
        selectedSceneIds.includes(String(scene.id))
      ),
    });
  }
  if (options.veronicaRemediationReview) {
    if (!isVeronica || !veronicaVisualQaBriefs || !veronicaSourceSha256) {
      throw new Error(
        "VERONICA_REMEDIATION_REVIEW_VERONICA_ONLY: remediation reviews require Veronica semantic briefs.",
      );
    }
    if (options.qaExisting) {
      throw new Error(
        "VERONICA_REMEDIATION_QA_EXISTING_CONFLICT: remediation generation is not QA-only.",
      );
    }
    if (!options.force) {
      throw new Error(
        "VERONICA_REMEDIATION_FORCE_REQUIRED: a reviewed rejected image may only be replaced explicitly.",
      );
    }
    if (options.maxVeronicaRegenerationAttempts !== 0) {
      throw new Error(
        "VERONICA_REMEDIATION_RETRY_CEILING_REQUIRED: pass --max-veronica-regeneration-attempts 0.",
      );
    }
    semanticScenePlan = await materializeVeronicaRemediationScenePlan({
      episodeId: manifest.episodeId,
      sourceSha256: veronicaSourceSha256,
      episodeDir,
      scenePlan: semanticScenePlan,
      briefs: veronicaVisualQaBriefs,
      reviewPath: options.veronicaRemediationReview,
      ...(options.veronicaVisualEncodingDecision
        ? { encodingDecisionPath: options.veronicaVisualEncodingDecision }
        : {}),
    });
  }
  let deterministicAdoption:
    | { readonly adoptionPath: string; readonly imageSha256: string }
    | undefined;
  if (options.adoptVeronicaDiagramPrototype) {
    if (!isVeronica || !veronicaVisualQaBriefs || !veronicaSourceSha256) {
      throw new Error(
        "VERONICA_DIAGRAM_ADOPTION_VERONICA_ONLY: deterministic diagram adoption requires Veronica semantic briefs.",
      );
    }
    deterministicAdoption = await adoptVeronicaDeterministicDiagramPrototype({
      episodeId: manifest.episodeId,
      sourceSha256: veronicaSourceSha256,
      episodeDir,
      scenePlan: semanticScenePlan,
      briefs: veronicaVisualQaBriefs,
      prototypeManifestPath: options.adoptVeronicaDiagramPrototype,
      authorizationReference:
        "operator-authorized-cli-invocation:--adopt-veronica-diagram-prototype",
      variant: options.variant ?? "short",
    });
  }
  if (options.qaExisting) {
    if (
      !isVeronica ||
      !veronicaVisualQaEvaluator ||
      !veronicaVisualQaBriefs
    ) {
      throw new Error(
        "QA_EXISTING_VERONICA_ONLY: strict existing-pixel QA requires Veronica semantic briefs.",
      );
    }
    const maxVeronicaRegenerationAttempts = Math.max(
      0,
      Math.trunc(options.maxVeronicaRegenerationAttempts ?? 0),
    );
    if (maxVeronicaRegenerationAttempts !== 0) {
      throw new Error(
        "QA_EXISTING_REGENERATION_FORBIDDEN: QA-only execution cannot regenerate images.",
      );
    }
    assertImageProviderCallCeiling({
      sceneCount: semanticScenePlan.scenes.length,
      maxRegenerationAttempts: 0,
      ...(options.maxProviderCalls !== undefined
        ? { maxProviderCalls: options.maxProviderCalls }
        : {}),
    });
    const qaResults = await reviewExistingVeronicaImages({
      episodeDir,
      scenePlan: semanticScenePlan,
      evaluator: veronicaVisualQaEvaluator,
      briefs: veronicaVisualQaBriefs,
      ...(options.reconciliationInventory
        ? {
            reconciliationInventory: await loadVeronicaImageReconciliationInventory(
              path.resolve(options.reconciliationInventory),
            ),
            reconciliationInventoryPath: path.resolve(options.reconciliationInventory),
          }
        : {}),
    });
    const summary = {
      episodeId: manifest.episodeId,
      manifestPath,
      createdManifest: created,
      generated: 0,
      skipped: 0,
      failed: qaResults.filter((result) => result.status !== "approved").length,
      qaApproved: qaResults.filter((result) => result.status === "approved").length,
      qaRejected: qaResults.filter((result) => result.status === "rejected").length,
      qaFailed: qaResults.filter((result) => result.status === "failed").length,
      qaCacheHits: qaResults.filter((result) => result.cacheStatus === "hit").length,
      ...(deterministicAdoption ? { deterministicAdoption } : {}),
      total: qaResults.length,
      results: qaResults,
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      process.stdout.write(
        [
          `Episode: ${summary.episodeId}`,
          `Manifest: ${summary.manifestPath}`,
          "Generated: 0",
          `QA approved: ${summary.qaApproved}`,
          `QA rejected: ${summary.qaRejected}`,
          `QA failed: ${summary.qaFailed}`,
          `QA cache hits: ${summary.qaCacheHits}`,
          `Total: ${summary.total}`,
        ].join("\n") + "\n",
      );
    }
    return;
  }
  const resumePlan = await buildResumeEligibleScenePlan(
    episodeDir,
    semanticScenePlan,
    options.force ?? false,
    options.qaExisting ?? false,
  );
  const maxVeronicaRegenerationAttempts = Math.max(
    0,
    Math.trunc(options.maxVeronicaRegenerationAttempts ?? 2),
  );
  assertImageProviderCallCeiling({
    sceneCount: resumePlan.scenePlan.scenes.length,
    maxRegenerationAttempts: maxVeronicaRegenerationAttempts,
    ...(options.maxProviderCalls !== undefined
      ? { maxProviderCalls: options.maxProviderCalls }
      : {}),
  });
  const results = await generateEpisodeImages(
    episodeDir,
    manifest.episodeId,
    resumePlan.scenePlan,
    { ...settings, logger },
    {
      ...(options.force !== undefined ? { force: options.force } : {}),
      ...(isVeronica
        ? {
            context: buildEpisodeImageMediaContext({
              episodeId: manifest.episodeId,
              contentGenre: "veronicabenini",
            }),
            ...(veronicaVisualQaEvaluator !== undefined
              ? { veronicaVisualQaEvaluator }
              : {}),
            ...(veronicaVisualQaBriefs !== undefined
              ? { veronicaVisualQaBriefs }
              : {}),
            maxVeronicaRegenerationAttempts,
          }
        : {}),
    }
  );
  const summary = {
    episodeId: manifest.episodeId,
    manifestPath,
    createdManifest: created,
    generated: results.filter((result) => result.status === "generated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    skippedNonRetryableFailures: resumePlan.skippedNonRetryableFailures.length,
    skippedNonRetryableFailureCategories:
      resumePlan.skippedNonRetryableFailures.reduce<Record<string, number>>(
        (counts, failure) => {
          const category = failure.category ?? "unknown-failure";
          counts[category] = (counts[category] ?? 0) + 1;
          return counts;
        },
        {}
      ),
    total: results.length,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `Episode: ${summary.episodeId}`,
      `Manifest: ${summary.manifestPath}${summary.createdManifest ? " (created)" : ""}`,
      `Generated: ${summary.generated}`,
      `Skipped: ${summary.skipped}`,
      `Failed: ${summary.failed}`,
      `Skipped non-retryable failures: ${summary.skippedNonRetryableFailures}`,
      `Total: ${summary.total}`,
    ].join("\n") + "\n"
  );
}
