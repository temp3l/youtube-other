import fs from "node:fs";
import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared.js";
import type {
  Batch as OpenAIBatch,
  BatchRequestCounts,
} from "openai/resources/batches";
import type { FileObject } from "openai/resources/files";
import type { BatchEndpoint } from "./story-localization.types.js";
import {
  StoryLocalizationApiError,
  StoryLocalizationConfigurationError,
} from "./story-localization.errors.js";

export interface OpenAiStoryClient {
  readonly responses: {
    create(
      request: {
        readonly model: string;
        readonly input: ReadonlyArray<{
          readonly role: "system" | "user";
          readonly content: ReadonlyArray<{
            readonly type: "input_text";
            readonly text: string;
          }>;
        }>;
        readonly text?: {
          readonly format: unknown;
        };
        readonly max_output_tokens?: number;
        readonly temperature?: number;
        readonly reasoning?: {
          readonly effort?: ReasoningEffort;
        };
      },
      options?: { readonly signal?: AbortSignal }
    ): Promise<{
      readonly id: string;
      readonly output_text?: string;
      readonly output?: readonly unknown[];
      readonly usage?: {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
        readonly input_tokens_details?: { readonly cached_tokens?: number };
        readonly output_tokens_details?: { readonly reasoning_tokens?: number };
        readonly total_tokens?: number;
      };
    }>;
    parse<ParsedT>(
      request: {
        readonly model: string;
        readonly input: ReadonlyArray<{
          readonly role: "system" | "user";
          readonly content: ReadonlyArray<{
            readonly type: "input_text";
            readonly text: string;
          }>;
        }>;
        readonly text?: {
          readonly format: unknown;
        };
        readonly max_output_tokens?: number;
        readonly temperature?: number;
        readonly reasoning?: {
          readonly effort?: ReasoningEffort;
        };
      },
      options?: { readonly signal?: AbortSignal }
    ): Promise<{
      readonly id: string;
      readonly output_parsed: ParsedT | null;
      readonly output_text?: string;
      readonly output?: readonly unknown[];
      readonly status?: string;
      readonly model?: string;
      readonly created_at?: number;
      readonly usage?: {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
        readonly input_tokens_details?: { readonly cached_tokens?: number };
        readonly output_tokens_details?: { readonly reasoning_tokens?: number };
        readonly total_tokens?: number;
      };
      readonly incomplete_details?: {
        readonly reason?: string;
      } | null;
    }>;
  };
  readonly files?: {
    create(body: {
      readonly file: fs.ReadStream;
      readonly purpose: "batch";
    }): Promise<FileObject>;
    content(fileId: string): Promise<Response>;
  };
  readonly batches?: {
    create(body: {
      readonly input_file_id: string;
      readonly endpoint: BatchEndpoint;
      readonly completion_window: "24h";
      readonly metadata?: Record<string, string>;
    }): Promise<OpenAIBatch>;
    retrieve(batchId: string): Promise<OpenAIBatch>;
    cancel(batchId: string): Promise<OpenAIBatch>;
  };
}

export interface OpenAiBatchOutputLine {
  readonly custom_id: string;
  readonly response?: {
    readonly status_code: number;
    readonly body: {
      readonly id?: string;
      readonly output_text?: string;
      readonly usage?: {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
        readonly input_tokens_details?: {
          readonly cached_tokens?: number;
        };
      };
    };
  };
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
}

export function requireBatchCapabilities(
  client: OpenAiStoryClient
): asserts client is OpenAiStoryClient & {
  readonly files: NonNullable<OpenAiStoryClient["files"]>;
  readonly batches: NonNullable<OpenAiStoryClient["batches"]>;
} {
  if (!client.files || !client.batches) {
    throw new StoryLocalizationConfigurationError(
      "The configured OpenAI client does not support batch operations."
    );
  }
}

export function createOpenAiStoryClient(): OpenAiStoryClient {
  return createOpenAiStoryClientWithOptions({});
}

export function createOpenAiStoryClientWithOptions(options: {
  readonly apiKey?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly maxRetries?: number | undefined;
  readonly timeoutMs?: number | undefined;
}): OpenAiStoryClient {
  const apiKey =
    options.apiKey ??
    process.env["OPENAI_API_KEY"] ??
    process.env["OPENAI_API_TOKEN"];
  if (!apiKey) {
    throw new StoryLocalizationConfigurationError(
      "OPENAI_API_KEY or OPENAI_API_TOKEN is required for story localization."
    );
  }
  return new OpenAI({
    apiKey,
    maxRetries: options.maxRetries ?? 5,
    timeout: options.timeoutMs ?? 120_000,
    ...(options.baseUrl ?? process.env["OPENAI_BASE_URL"]
      ? { baseURL: options.baseUrl ?? process.env["OPENAI_BASE_URL"] }
      : {}),
  }) as unknown as OpenAiStoryClient;
}

export function normalizeBatchStatus(
  status: OpenAIBatch["status"]
): OpenAIBatch["status"] {
  return status;
}

export function batchRequestCounts(
  batch: OpenAIBatch
): BatchRequestCounts | undefined {
  return batch.request_counts;
}

export async function readRemoteFileText(
  client: OpenAiStoryClient & {
    readonly files: NonNullable<OpenAiStoryClient["files"]>;
  },
  fileId: string
): Promise<string> {
  try {
    const response = await client.files.content(fileId);
    return await response.text();
  } catch (error) {
    throw new StoryLocalizationApiError(
      `Failed to download OpenAI file ${fileId}.`,
      error
    );
  }
}

export function parseBatchOutputJsonl(
  content: string
): OpenAiBatchOutputLine[] {
  return content
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as OpenAiBatchOutputLine);
}
