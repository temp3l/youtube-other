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

export interface SceneImageJob {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: "en";
  readonly format: "full";
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
  readonly reusedFromSceneId?: string;
  readonly startTimeSeconds?: number;
  readonly endTimeSeconds?: number;
  readonly promptPath?: string;
  readonly positivePrompt: string;
  readonly negativePrompt?: string;
  readonly characterIds: readonly string[];
  readonly characterReferencePaths: readonly string[];
  readonly model: string;
  readonly quality: string;
  readonly requestedSize: string;
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly expectedOutputPath: string;
  readonly promptHash: string;
  readonly generationConfigurationHash: string;
}

export interface ImageBatchManifestItem {
  readonly customId: string;
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: "en";
  readonly format: "full";
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly renderability?: "direct" | "requiresInference" | "mergeWithPrevious" | "mergeWithNext" | "skip";
  readonly reusedFromSceneId?: string;
  readonly promptHash: string;
  readonly generationConfigurationHash: string;
  readonly expectedOutputPath: string;
  readonly characterIds: readonly string[];
  readonly characterReferenceHashes: readonly string[];
  readonly requestedSize: string;
  readonly quality?: string;
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
  readonly schemaVersion: string;
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
