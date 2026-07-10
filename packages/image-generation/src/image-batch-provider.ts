import type { OpenAiBatchOutputLine } from "@mediaforge/story-localization";
import type { ImageBatchStatus } from "./image-batch.types.js";

export type OpenAiBatchId = string & { readonly __brand: "OpenAiBatchId" };
export type OpenAiFileId = string & { readonly __brand: "OpenAiFileId" };

export interface ImageBatchProviderStatus {
  readonly batchId: string;
  readonly status: ImageBatchStatus;
  readonly outputFileId?: string;
  readonly errorFileId?: string;
  readonly completedAt?: string;
  readonly rawStatus?: string;
}

export interface ImageBatchProvider {
  uploadInputFile(
    inputFilePath: string
  ): Promise<{ readonly fileId: string }>;
  createBatch(args: {
    readonly inputFileId: string;
    readonly endpoint: "/v1/images/generations" | "/v1/images/edits";
    readonly completionWindow: "24h";
    readonly metadata: Readonly<Record<string, string>>;
  }): Promise<{ readonly batchId: string; readonly status: ImageBatchStatus }>;
  retrieveStatus(batchId: string): Promise<ImageBatchProviderStatus>;
  downloadOutputFile(fileId: string): Promise<string>;
  downloadErrorFile(fileId: string): Promise<string>;
  parseOutputJsonl(content: string): readonly OpenAiBatchOutputLine[];
  normalizeErrorCode(code: string | undefined): string;
}
