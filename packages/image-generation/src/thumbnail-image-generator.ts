import { readFileSync } from "node:fs";
import { File } from "node:buffer";
import path from "node:path";
import sharp from "sharp";
import OpenAI from "openai";
import {
  currentExecutionTelemetry,
  estimateImageGenerationCost,
} from "@mediaforge/observability";
import {
  type CompiledThumbnailPrompt,
  type GenerateThumbnailInput,
  type ResolvedThumbnailReference,
  type ThumbnailGenerationConfig,
  type ThumbnailQuality,
  THUMBNAIL_OUTPUTS,
  StoryThumbnailError,
  ThumbnailAuthenticationError,
  ThumbnailGenerationError,
  ThumbnailImageValidationError,
  ThumbnailPolicyError,
  ThumbnailRateLimitError,
  ThumbnailResponseError,
} from "./thumbnail-contracts.js";

export interface ThumbnailOpenAiImageResponse {
  readonly data?: ReadonlyArray<{
    readonly b64_json?: string;
    readonly url?: string;
  }>;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly total_tokens?: number;
  };
}

export interface ThumbnailOpenAiClientLike {
  readonly images: {
    edit(
      body: {
        readonly model: string;
        readonly image: File;
        readonly prompt: string;
        readonly size: string;
        readonly quality: ThumbnailQuality;
        readonly output_format: "png";
        readonly background: "opaque";
        readonly n: 1;
      },
      options?: { readonly signal?: AbortSignal }
    ): Promise<ThumbnailOpenAiImageResponse>;
  };
}

export interface GeneratedThumbnailBackground {
  readonly buffer: Buffer;
  readonly requestId?: string;
  readonly estimatedCostMicros: number | null;
  readonly pricingVersion: string;
  readonly retryCount: number;
}

type TelemetryEventRecorder = {
  recordEvent?: (event: {
    readonly name: string;
    readonly at: string;
    readonly details?: Record<string, unknown>;
  }) => void;
};

function recordRetryEvent(details: Record<string, unknown>): void {
  const telemetry = currentExecutionTelemetry() as
    | (typeof currentExecutionTelemetry extends () => infer T ? T : never)
    | TelemetryEventRecorder
    | undefined;
  if (telemetry && "recordEvent" in telemetry && typeof telemetry.recordEvent === "function") {
    telemetry.recordEvent({
      name: "thumbnail_background_generation_retry",
      at: new Date().toISOString(),
      details,
    });
  }
}

function getErrorStatus(error: unknown): number | undefined {
  return typeof (error as { readonly status?: unknown })?.status === "number"
    ? (error as { readonly status: number }).status
    : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getRequestId(error: unknown): string | undefined {
  const maybe = error as {
    readonly request_id?: unknown;
    readonly headers?: { readonly get?: (name: string) => string | null };
  };
  if (typeof maybe.request_id === "string") {
    return maybe.request_id;
  }
  return maybe.headers?.get?.("x-request-id") ?? undefined;
}

function isRetryable(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === undefined) {
    return true;
  }
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function classifyError(args: {
  readonly error: unknown;
  readonly input: Pick<GenerateThumbnailInput, "episodeSlug" | "locale" | "format">;
  readonly model: string;
  readonly backgroundFingerprint: string;
}): StoryThumbnailError {
  const status = getErrorStatus(args.error);
  const message = [
    getErrorMessage(args.error),
    `episode=${args.input.episodeSlug}`,
    `locale=${args.input.locale}`,
    `format=${args.input.format}`,
    `model=${args.model}`,
    `backgroundFingerprint=${args.backgroundFingerprint}`,
  ].join(" | ");
  if (status === 401) {
    return new ThumbnailAuthenticationError(message, args.error);
  }
  if (status === 429) {
    return new ThumbnailRateLimitError(message, args.error);
  }
  if (status === 400 || status === 403) {
    return new ThumbnailPolicyError(message, args.error);
  }
  return new ThumbnailGenerationError(message, isRetryable(args.error), args.error);
}

export function buildOpenAiThumbnailEditRequest(args: {
  readonly input: GenerateThumbnailInput;
  readonly config: Pick<ThumbnailGenerationConfig, "model" | "quality">;
  readonly prompt: CompiledThumbnailPrompt;
  readonly reference: ResolvedThumbnailReference;
}): {
  readonly model: string;
  readonly image: File;
  readonly prompt: string;
  readonly size: string;
  readonly quality: ThumbnailQuality;
  readonly output_format: "png";
  readonly background: "opaque";
  readonly n: 1;
} {
  return {
    model: args.config.model,
    image: new File(
      [readFileSync(args.reference.path)],
      path.basename(args.reference.path),
      { type: args.reference.mimeType }
    ),
    prompt: args.prompt.prompt,
    size: THUMBNAIL_OUTPUTS[args.input.format].generationSize,
    quality: args.input.quality ?? args.config.quality,
    output_format: "png",
    background: "opaque",
    n: 1,
  };
}

async function decodeResponseImage(args: {
  readonly response: ThumbnailOpenAiImageResponse;
  readonly maxGeneratedBytes: number;
}): Promise<Buffer> {
  if (!args.response.data || args.response.data.length !== 1) {
    throw new ThumbnailResponseError(
      "OpenAI thumbnail response must contain exactly one image.",
      false
    );
  }
  const payload = args.response.data[0];
  if (!payload?.b64_json || payload.b64_json.length === 0) {
    throw new ThumbnailResponseError(
      "OpenAI thumbnail response did not include a base64 image payload.",
      false
    );
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload.b64_json, "base64");
  } catch (error) {
    throw new ThumbnailResponseError("Invalid base64 image payload.", false, error);
  }
  if (buffer.length === 0) {
    throw new ThumbnailResponseError("OpenAI thumbnail response was empty.", false);
  }
  if (buffer.length > args.maxGeneratedBytes) {
    throw new ThumbnailResponseError(
      `Generated image exceeds the configured byte limit (${buffer.length} > ${args.maxGeneratedBytes}).`,
      false
    );
  }
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (error) {
    throw new ThumbnailImageValidationError(
      "Generated thumbnail image could not be decoded.",
      error
    );
  }
  if (!metadata.format || !["png", "jpeg", "jpg", "webp"].includes(metadata.format)) {
    throw new ThumbnailImageValidationError(
      `Generated thumbnail image uses an unsupported format: ${metadata.format ?? "unknown"}.`
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new ThumbnailImageValidationError(
      "Generated thumbnail image dimensions are unavailable."
    );
  }
  return buffer;
}

export class ThumbnailImageGenerator {
  public constructor(
    private readonly config: ThumbnailGenerationConfig,
    private readonly client: ThumbnailOpenAiClientLike = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
      project: config.project,
    }) as unknown as ThumbnailOpenAiClientLike
  ) {}

  public async generateBackground(args: {
    readonly input: GenerateThumbnailInput;
    readonly prompt: CompiledThumbnailPrompt;
    readonly reference: ResolvedThumbnailReference;
    readonly backgroundFingerprint: string;
  }): Promise<GeneratedThumbnailBackground> {
    const telemetry = currentExecutionTelemetry();
    const body = buildOpenAiThumbnailEditRequest({
      input: args.input,
      config: this.config,
      prompt: args.prompt,
      reference: args.reference,
    });
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const startedAt = new Date().toISOString();
      try {
        const response = await this.client.images.edit(body, {
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        const buffer = await decodeResponseImage({
          response,
          maxGeneratedBytes: this.config.maxGeneratedBytes,
        });
        const endedAt = new Date().toISOString();
        const cost = telemetry
          ? estimateImageGenerationCost(telemetry.catalog, {
              provider: "openai",
              model: this.config.model,
              operation: "edit",
              size: body.size,
              quality: body.quality,
            })
          : { costMicros: null, pricingVersion: "unconfigured", warning: undefined };
        telemetry?.recordApiCall({
          provider: "openai",
          model: this.config.model,
          operation: "image-edit",
          startedAt,
          endedAt,
          durationMs: Date.parse(endedAt) - Date.parse(startedAt),
          attempt: attempt + 1,
          success: true,
          usage: {
            imageCount: 1,
            ...(response.usage?.input_tokens !== undefined
              ? { inputTokens: response.usage.input_tokens }
              : {}),
            ...(response.usage?.output_tokens !== undefined
              ? { outputTokens: response.usage.output_tokens }
              : {}),
          },
          details: { size: body.size, quality: body.quality },
        });
        telemetry?.recordCost({
          provider: "openai",
          model: this.config.model,
          operation: "image-edit",
          costMicros: cost.costMicros,
          warning: cost.warning,
        });
        return {
          buffer,
          estimatedCostMicros: cost.costMicros,
          pricingVersion: cost.pricingVersion,
          retryCount: attempt,
        };
      } catch (error) {
        const endedAt = new Date().toISOString();
        const retryable = isRetryable(error);
        const requestId = getRequestId(error);
        telemetry?.recordApiCall({
          provider: "openai",
          model: this.config.model,
          operation: "image-edit",
          startedAt,
          endedAt,
          durationMs: Date.parse(endedAt) - Date.parse(startedAt),
          attempt: attempt + 1,
          success: false,
          retryable,
          details: { size: body.size, quality: body.quality },
          ...(requestId ? { requestId } : {}),
          error: {
            message: getErrorMessage(error),
          },
        });
        if (error instanceof StoryThumbnailError && !error.retryable) {
          throw error;
        }
        if (!retryable || attempt >= this.config.maxRetries) {
          throw classifyError({
            error,
            input: args.input,
            model: this.config.model,
            backgroundFingerprint: args.backgroundFingerprint,
          });
        }
        recordRetryEvent({
          episodeSlug: args.input.episodeSlug,
          locale: args.input.locale,
          format: args.input.format,
          style: args.input.style ?? "cinematic-horror",
          model: this.config.model,
          retryCount: attempt + 1,
          backgroundFingerprint: args.backgroundFingerprint,
        });
        const delayMs = Math.min(
          5000,
          400 * 2 ** attempt + Math.floor(Math.random() * 250)
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new ThumbnailGenerationError("Background generation exhausted retries.", true);
  }
}
