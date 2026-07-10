import fs from "node:fs";
import {
  normalizeBatchStatus,
  parseBatchOutputJsonl,
  readRemoteFileText,
  requireBatchCapabilities,
  type OpenAiStoryClient,
} from "@mediaforge/story-localization";
import type {
  ImageBatchProvider,
  ImageBatchProviderStatus,
  OpenAiBatchId,
  OpenAiFileId,
} from "./image-batch-provider.js";
import type { ImageBatchStatus } from "./image-batch.types.js";

function toImageBatchStatus(status: string): ImageBatchStatus {
  return normalizeBatchStatus(status as never) as ImageBatchStatus;
}

export class OpenAiImageBatchProvider implements ImageBatchProvider {
  private readonly files: NonNullable<OpenAiStoryClient["files"]>;
  private readonly batches: NonNullable<OpenAiStoryClient["batches"]>;

  constructor(private readonly client: OpenAiStoryClient) {
    requireBatchCapabilities(client);
    this.files = client.files;
    this.batches = client.batches;
  }

  async uploadInputFile(
    inputFilePath: string
  ): Promise<{ readonly fileId: OpenAiFileId }> {
    const uploaded = await this.files.create({
      file: fs.createReadStream(inputFilePath),
      purpose: "batch",
    });
    return { fileId: uploaded.id as OpenAiFileId };
  }

  async createBatch(args: {
    readonly inputFileId: string;
    readonly endpoint: "/v1/images/generations" | "/v1/images/edits";
    readonly completionWindow: "24h";
    readonly metadata: Readonly<Record<string, string>>;
  }): Promise<{
    readonly batchId: OpenAiBatchId;
    readonly status: ImageBatchStatus;
  }> {
    const created = await this.batches.create({
      input_file_id: args.inputFileId,
      endpoint: args.endpoint,
      completion_window: args.completionWindow,
      metadata: { ...args.metadata },
    });
    return {
      batchId: created.id as OpenAiBatchId,
      status: toImageBatchStatus(created.status),
    };
  }

  async retrieveStatus(batchId: string): Promise<ImageBatchProviderStatus> {
    const remote = await this.batches.retrieve(batchId);
    return {
      batchId: remote.id as OpenAiBatchId,
      status: toImageBatchStatus(remote.status),
      rawStatus: remote.status,
      ...(remote.output_file_id
        ? { outputFileId: remote.output_file_id as OpenAiFileId }
        : {}),
      ...(remote.error_file_id
        ? { errorFileId: remote.error_file_id as OpenAiFileId }
        : {}),
      ...(remote.completed_at
        ? { completedAt: new Date(remote.completed_at * 1000).toISOString() }
        : {}),
    };
  }

  async downloadOutputFile(fileId: string): Promise<string> {
    return readRemoteFileText({ ...this.client, files: this.files }, fileId);
  }

  async downloadErrorFile(fileId: string): Promise<string> {
    return this.downloadOutputFile(fileId);
  }

  parseOutputJsonl(content: string) {
    return parseBatchOutputJsonl(content);
  }

  normalizeErrorCode(code: string | undefined): string {
    return code?.toLowerCase() ?? "";
  }
}

export function createOpenAiImageBatchProvider(
  client: OpenAiStoryClient
): OpenAiImageBatchProvider {
  return new OpenAiImageBatchProvider(client);
}
