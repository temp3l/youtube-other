import type { ContentVariant, EpisodeLanguage } from "@mediaforge/shared";
import type { PromptCachePlan } from "@mediaforge/shared";
import type { ImageGenerationIdentity } from "./cacheable-image-pipeline.js";

export type ImageBatchStatus =
  | "prepared"
  | "uploading"
  | "submitted"
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled"
  | "imported"
  | "imported_with_failures";

export type ImageBatchItemStatus =
  | "planned"
  | "submitted"
  | "api-succeeded"
  | "api-failed"
  | "expired"
  | "policy-rejected"
  | "decode-failed"
  | "validation-failed"
  | "persisted"
  | "skipped-cached"
  | "retry-required";

export type ImageBatchQuality = "low" | "medium" | "high" | "auto";

export type ImageBatchAssetRole =
  | "full-scene"
  | "short-scene"
  | "character-reference"
  | "location-reference"
  | "object-reference"
  | "continuity-asset"
  | "thumbnail";

export type ImageBatchOperation =
  | "generation"
  | "edit"
  | "deterministic-transform";

export type ImageBatchDependencyRole =
  | "character-reference"
  | "location-reference"
  | "object-reference"
  | "continuity-asset";

export type ImageBatchDependencyApprovalStatus =
  | "missing"
  | "generated"
  | "approved";

export type ImageBatchDestinationRoot =
  | "shared-images-generated"
  | "shared-short-images-generated"
  | "shared-character-references"
  | "shared-location-references"
  | "shared-object-references"
  | "shared-continuity-assets"
  | "locale-thumbnails";

export type ImageBatchSubject =
  | { readonly kind: "scene"; readonly id: string }
  | { readonly kind: "shot"; readonly id: string }
  | { readonly kind: "character"; readonly id: string }
  | { readonly kind: "location"; readonly id: string }
  | { readonly kind: "object"; readonly id: string }
  | { readonly kind: "continuity"; readonly id: string }
  | { readonly kind: "thumbnail"; readonly id: string };

export interface ImageBatchDestinationIdentity {
  readonly root: ImageBatchDestinationRoot;
  readonly relativePath: string;
}

export type ImageBatchAspectRatio = "16:9" | "9:16" | "1:1";
export type ImageBatchAssetPurpose = ImageBatchAssetRole;

export interface ImageBatchAssetIdentity {
  readonly schemaVersion: "image-asset-identity-v2";
  readonly episodeId: string;
  readonly episodeSlug: string;
  readonly language: EpisodeLanguage;
  readonly variant: ContentVariant;
  readonly aspectRatio: ImageBatchAspectRatio;
  readonly assetRole: ImageBatchAssetRole;
  readonly assetPurpose: ImageBatchAssetPurpose;
  readonly operation: ImageBatchOperation;
  readonly subject: ImageBatchSubject;
  readonly storyBeatId: string;
  readonly shotId?: string;
  readonly visualIntentHash: string;
  readonly promptHash: string;
  readonly dependencySourceHash: string;
  readonly sourceLanguage: EpisodeLanguage;
  readonly targetLanguage: EpisodeLanguage;
  readonly configurationHash: string;
  readonly model: string;
  readonly size: string;
  readonly quality: ImageBatchQuality;
  readonly dependencyHashes: readonly string[];
  readonly destination: ImageBatchDestinationIdentity;
  readonly identityHash: string;
}

export interface ImageBatchDependency {
  readonly role: ImageBatchDependencyRole;
  readonly approvalStatus: ImageBatchDependencyApprovalStatus;
  readonly sourcePath: string;
  readonly openAIFileId?: string;
  readonly sha256: string;
  readonly assetIdentity: ImageBatchAssetIdentity;
}

export interface ImageBatchJob {
  readonly identity: ImageBatchAssetIdentity;
  readonly sceneId?: string;
  readonly sceneIndex?: number;
  readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
  readonly reusedFromSceneId?: string;
  readonly startTimeSeconds?: number;
  readonly endTimeSeconds?: number;
  readonly promptPath?: string;
  readonly positivePrompt: string;
  readonly negativePrompt?: string;
  readonly characterIds: readonly string[];
  readonly characterReferencePaths: readonly string[];
  readonly dependencies: readonly ImageBatchDependency[];
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly expectedOutputPath: string;
  readonly providerRequestHash: string;
  readonly generationConfigurationHash: string;
}

export type SceneImageJob = ImageBatchJob;

export interface ImageBatchManifestItem {
  readonly customId: string;
  readonly identity: ImageBatchAssetIdentity;
  readonly sceneId?: string;
  readonly sceneIndex?: number;
  readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
  readonly reusedFromSceneId?: string;
  readonly providerRequestHash: string;
  readonly generationConfigurationHash: string;
  readonly expectedOutputPath: string;
  readonly characterIds: readonly string[];
  readonly dependencies: readonly ImageBatchDependency[];
  readonly sharedOutputKey?: string;
  readonly ownsSharedOutput?: boolean;
  readonly aliasedToCustomId?: string;
  readonly requestedSize: string;
  readonly quality?: ImageBatchQuality;
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly generationIdentity?: ImageGenerationIdentity;
  readonly generationIdentityHash?: string;
  readonly resultCachePath?: string;
  readonly localCacheState?: "miss" | "hit" | "stale" | "invalid" | "forced";
  readonly referenceBundleHash?: string;
  readonly promptCachePlan?: PromptCachePlan;
  readonly providerReference?: {
    readonly status: "not-required" | "pending" | "registered" | "failed";
    readonly providerFileId?: string;
    readonly contentHash?: string;
    readonly error?: string;
  };
  readonly status: ImageBatchItemStatus;
  readonly retryCount: number;
  readonly imageHash?: string;
  readonly actualWidth?: number;
  readonly actualHeight?: number;
  readonly actualMimeType?: string;
  readonly actualByteSize?: number;
  readonly outputFileId?: string;
  readonly importedAt?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly cachedInputTokens?: number;
    readonly cacheWriteTokens?: number;
    readonly outputTokens: number;
    readonly reasoningTokens?: number;
  };
  readonly estimatedCostUsd?: number;
  readonly error?: {
    readonly category: string;
    readonly code?: string;
    readonly message: string;
  };
}

export interface ImageBatchManifest {
  readonly schemaVersion: "image-batch-v2";
  readonly category: "image-generation";
  readonly localBatchId: string;
  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly endpoint: "/v1/images/generations" | "/v1/images/edits";
  readonly model: string;
  readonly completionWindow: "24h";
  readonly inputFilePath: string;
  readonly inputFileHash: string;
  readonly openAIInputFileId?: string;
  readonly openAIBatchId?: string;
  readonly outputFileId?: string;
  readonly errorFileId?: string;
  readonly status: ImageBatchStatus;
  readonly items: readonly ImageBatchManifestItem[];
  readonly resultFilePath?: string;
  readonly errorFilePath?: string;
  readonly reportFilePath?: string;
  readonly submittedAt?: string;
  readonly completedAt?: string;
  readonly importedAt?: string;
  readonly dependencyGraphSummary?: {
    readonly referenceItemCount: number;
    readonly sceneItemCount: number;
    readonly blockedItemCount: number;
  };
  readonly localCacheSummary?: {
    readonly hits: number;
    readonly misses: number;
    readonly stale: number;
    readonly invalid: number;
    readonly forced: number;
  };
  readonly promptCacheGroupingSummary?: {
    readonly groups: number;
    readonly explicitGroups: number;
    readonly implicitGroups: number;
    readonly disabledGroups: number;
  };
}
