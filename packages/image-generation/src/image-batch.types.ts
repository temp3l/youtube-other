import type { ContentVariant, EpisodeLanguage } from "@mediaforge/shared";

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

export interface ImageBatchAssetIdentity {
  readonly schemaVersion: "image-asset-identity-v1";
  readonly episodeId: string;
  readonly language: EpisodeLanguage;
  readonly variant: ContentVariant;
  readonly assetRole: ImageBatchAssetRole;
  readonly operation: ImageBatchOperation;
  readonly subject: ImageBatchSubject;
  readonly promptHash: string;
  readonly model: string;
  readonly size: string;
  readonly quality: ImageBatchQuality;
  readonly dependencyHashes: readonly string[];
  readonly destination: ImageBatchDestinationIdentity;
  readonly identityHash: string;
}

export interface SceneImageJob {
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
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly expectedOutputPath: string;
  readonly providerRequestHash: string;
  readonly generationConfigurationHash: string;
}

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
  readonly requestedSize: string;
  readonly quality?: ImageBatchQuality;
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly status: ImageBatchItemStatus;
  readonly imageHash?: string;
  readonly actualWidth?: number;
  readonly actualHeight?: number;
  readonly actualMimeType?: string;
  readonly actualByteSize?: number;
  readonly usage?: {
    readonly inputTokens: number;
    readonly cachedInputTokens?: number;
    readonly outputTokens: number;
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
}
