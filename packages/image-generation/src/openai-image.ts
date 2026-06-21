import {
  ConfigurationError,
  imageAssetSchema,
  ProviderAuthenticationError,
  ProviderResponseError,
  type ImageAsset,
  type Scene,
} from "@mediaforge/domain";
import {
  ensureDir,
  hashFile,
  hashText,
  writeBinaryAtomic,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

export interface OpenAiImageGenerationSettings {
  readonly apiKey: string;
  readonly baseUrl: string | undefined;
  readonly organization: string | undefined;
  readonly project: string | undefined;
  readonly model: string;
  readonly requestedSize: string;
  readonly apiSize: string;
  readonly quality: "low" | "medium" | "high" | "auto";
  readonly outputFormat: "png" | "jpeg" | "webp";
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly debug: boolean;
}

export interface OpenAiImageGenerationJob {
  readonly scene: Scene;
  readonly prompt: string;
  readonly episodeSlug: string;
  readonly episodeDir: string;
  readonly normalizedFilename: string;
}

export interface OpenAiImageGenerationResult extends ImageAsset {
  readonly sequenceNumber: number;
  readonly promptPath: string;
  readonly rawPath: string;
  readonly metadataPath: string;
  readonly requestedSize: string;
  readonly apiSize: string;
  readonly rawChecksumSha256: string;
  readonly finalChecksumSha256: string;
}

export interface OpenAiImageClientLike {
  readonly images: {
    generate(
      body: {
        readonly model: string;
        readonly prompt: string;
        readonly size: string;
        readonly quality: "low" | "medium" | "high" | "auto";
        readonly output_format?: "png" | "jpeg" | "webp";
        readonly n: number;
        readonly background?: "opaque";
      },
      options?: { readonly signal?: AbortSignal }
    ): Promise<{
      readonly data?: Array<{
        readonly b64_json?: string;
      }>;
    }>;
  };
}

type ImageGenerationEnv = Readonly<Record<string, string | undefined>>;

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDotEnv(text: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();

    entries[key] = rawValue.replace(/^['"]|['"]$/gu, "");
  }

  return entries;
}

function isImageQuality(
  value: string | undefined
): value is "low" | "medium" | "high" | "auto" {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
  );
}

function isImageOutputFormat(
  value: string | undefined
): value is "png" | "jpeg" | "webp" {
  return value === "png" || value === "jpeg" || value === "webp";
}

function resolveImageQuality(
  value: string | undefined
): "low" | "medium" | "high" | "auto" {
  if (value === undefined) return "low";

  if (!isImageQuality(value)) {
    throw new ConfigurationError(
      `Invalid OPENAI_IMAGE_QUALITY value: ${value}`
    );
  }

  return value;
}

function resolveImageOutputFormat(
  value: string | undefined
): "png" | "jpeg" | "webp" {
  if (value === undefined) return "png";

  if (!isImageOutputFormat(value)) {
    throw new ConfigurationError(`Invalid OPENAI_IMAGE_FORMAT value: ${value}`);
  }

  return value;
}

function isSupportedApiSize(size: string): boolean {
  return (
    /^(?:\d+)x(?:\d+)$/u.test(size) &&
    size.split("x").every((part) => Number.parseInt(part, 10) % 16 === 0)
  );
}

const standardImageSizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);

function resolveCompatibleApiSize(requestedSize: string, model: string): string {
  const normalizedSize = requestedSize.trim();

  if (!/^(?:\d+)x(?:\d+)$/u.test(normalizedSize)) {
    throw new ConfigurationError(
      `Invalid OPENAI_IMAGE_SIZE value: ${requestedSize}. Expected WIDTHxHEIGHT.`
    );
  }

  if (model.startsWith("gpt-image-2")) {
    if (!isSupportedApiSize(normalizedSize)) {
      throw new ConfigurationError(
        `OPENAI_IMAGE_SIZE=${requestedSize} is not supported by ${model}. Use a WIDTHxHEIGHT size divisible by 16, for example 1920x1088.`
      );
    }

    return normalizedSize;
  }

  if (!standardImageSizes.has(normalizedSize)) {
    throw new ConfigurationError(
      `OPENAI_IMAGE_SIZE=${requestedSize} is not supported by ${model}. Use one of: ${Array.from(standardImageSizes).join(", ")}.`
    );
  }

  return normalizedSize;
}

function bytesFromBase64(b64: string): Buffer {
  return Buffer.from(b64.replace(/\s+/gu, ""), "base64");
}

function formatJsonValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify(String(value));
  }
}

function getOpenAiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const apiError = error as {
    readonly code?: unknown;
    readonly error?: {
      readonly code?: unknown;
    };
  };

  if (typeof apiError.code === "string") return apiError.code;
  if (typeof apiError.error?.code === "string") return apiError.error.code;

  return undefined;
}

function isRetryableOpenAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;

  const apiError = error as {
    readonly status?: unknown;
  };

  const code = getOpenAiErrorCode(error);

  if (
    code === "billing_hard_limit_reached" ||
    code === "insufficient_quota" ||
    code === "invalid_api_key" ||
    code === "model_not_found"
  ) {
    return false;
  }

  if (typeof apiError.status === "number") {
    return (
      apiError.status === 408 ||
      apiError.status === 409 ||
      apiError.status === 429 ||
      apiError.status >= 500
    );
  }

  return true;
}

function formatOpenAiError(error: unknown): string {
  if (error && typeof error === "object") {
    const apiError = error as {
      readonly message?: unknown;
      readonly status?: unknown;
      readonly error?: unknown;
      readonly code?: unknown;
      readonly type?: unknown;
      readonly param?: unknown;
      readonly requestID?: unknown;
    };

    return formatJsonValue({
      message:
        typeof apiError.message === "string"
          ? apiError.message
          : "OpenAI image generation failed.",
      status: typeof apiError.status === "number" ? apiError.status : undefined,
      code: typeof apiError.code === "string" ? apiError.code : undefined,
      type: typeof apiError.type === "string" ? apiError.type : undefined,
      param: typeof apiError.param === "string" ? apiError.param : undefined,
      requestID:
        typeof apiError.requestID === "string" ? apiError.requestID : undefined,
      error: apiError.error,
      retryable: isRetryableOpenAiError(error),
    });
  }

  return formatJsonValue({
    message:
      error instanceof Error
        ? error.message
        : "OpenAI image generation failed.",
    cause: error instanceof Error ? error.cause : undefined,
  });
}

function logOpenAiImageSettings(settings: OpenAiImageGenerationSettings): void {
  if (!settings.debug) return;

  console.info("[openai:image-generation] runtime settings", {
    baseUrl: settings.baseUrl ?? "default",
    organization: settings.organization ?? "default",
    project: settings.project ?? "default-from-api-key",
    model: settings.model,
    requestedSize: settings.requestedSize,
    apiSize: settings.apiSize,
    quality: settings.quality,
    outputFormat: settings.outputFormat,
    concurrency: settings.concurrency,
    maxRetries: settings.maxRetries,
    timeoutMs: settings.timeoutMs,
  });
}

async function validateDecodedImage(
  filePath: string
): Promise<{ readonly width: number; readonly height: number }> {
  const metadata = await sharp(filePath).metadata();

  if (!metadata.width || !metadata.height) {
    throw new ProviderResponseError(
      `OpenAI image could not be decoded as a valid image: ${filePath}`
    );
  }

  return { width: metadata.width, height: metadata.height };
}

async function writePromptArtifacts(
  baseDir: string,
  scene: Scene,
  prompt: string
): Promise<{ readonly promptPath: string; readonly promptHash: string }> {
  const promptsDir = path.join(baseDir, "prompts");

  await ensureDir(promptsDir);

  const promptPath = path.join(
    promptsDir,
    `scene-${String(scene.sequenceNumber).padStart(3, "0")}.txt`
  );

  await writeTextAtomic(promptPath, `${prompt}\n`);

  return {
    promptPath,
    promptHash: hashText(prompt),
  };
}

async function normalizeImage(
  rawPath: string,
  normalizedPath: string,
  requestedSize: string
): Promise<{
  readonly width: number;
  readonly height: number;
  readonly checksumSha256: string;
}> {
  const match = /^(\d+)x(\d+)$/u.exec(requestedSize);
  const width = match ? Number.parseInt(match[1] ?? "", 10) : 1920;
  const height = match ? Number.parseInt(match[2] ?? "", 10) : 1080;

  const buffer = await sharp(rawPath)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  await writeBinaryAtomic(normalizedPath, buffer);

  const metadata = await validateDecodedImage(normalizedPath);

  return {
    width: metadata.width,
    height: metadata.height,
    checksumSha256: await hashFile(normalizedPath),
  };
}

async function generateSingleImage(
  client: OpenAiImageClientLike,
  job: OpenAiImageGenerationJob,
  settings: OpenAiImageGenerationSettings
): Promise<OpenAiImageGenerationResult> {
  const generatedDir = path.join(job.episodeDir, "images", "generated");
  const rawDir = path.join(generatedDir, "raw");
  const metadataDir = path.join(generatedDir, "metadata");

  await Promise.all([ensureDir(rawDir), ensureDir(metadataDir)]);

  const { promptPath, promptHash } = await writePromptArtifacts(
    generatedDir,
    job.scene,
    job.prompt
  );
  const baseName = path.basename(job.normalizedFilename, ".png");
  const rawPath = path.join(
    rawDir,
    `${baseName}.openai.${settings.outputFormat}`
  );
  const normalizedPath = path.join(generatedDir, job.normalizedFilename);

  let response:
    | Awaited<ReturnType<OpenAiImageClientLike["images"]["generate"]>>
    | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
    try {
      const requestBody =
        settings.outputFormat === "png"
          ? {
              model: settings.model,
              prompt: job.prompt,
              size: settings.apiSize,
              quality: settings.quality,
              n: 1,
            }
          : {
              model: settings.model,
              prompt: job.prompt,
              size: settings.apiSize,
              quality: settings.quality,
              output_format: settings.outputFormat,
              n: 1,
            };

      response = await client.images.generate(
        requestBody,
        { signal: AbortSignal.timeout(settings.timeoutMs) }
      );

      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;

      if (!isRetryableOpenAiError(error) || attempt >= settings.maxRetries) {
        break;
      }

      const delayMs = Math.min(5000, 500 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!response) {
    throw new ProviderResponseError(formatOpenAiError(lastError));
  }

  const payload = response.data?.[0]?.b64_json;

  if (!payload) {
    throw new ProviderResponseError(
      formatJsonValue({
        message:
          "OpenAI image generation response did not include base64 image data.",
        response,
      })
    );
  }

  const rawBuffer = bytesFromBase64(payload);

  if (rawBuffer.byteLength === 0) {
    throw new ProviderResponseError(
      formatJsonValue({
        message: "OpenAI image generation returned an empty image payload.",
        response,
      })
    );
  }

  await writeBinaryAtomic(rawPath, rawBuffer);
  await validateDecodedImage(rawPath);

  const finalDimensions = await normalizeImage(
    rawPath,
    normalizedPath,
    settings.requestedSize
  );
  const rawChecksumSha256 = await hashFile(rawPath);
  const finalChecksumSha256 = finalDimensions.checksumSha256;
  const generatedAt = new Date().toISOString();

  const metadata = {
    schemaVersion: 1,
    episodeSlug: job.episodeSlug,
    sceneId: job.scene.id,
    sequence: job.scene.sequenceNumber,
    rawImagePath: rawPath,
    normalizedImagePath: normalizedPath,
    promptPath,
    sourceSceneHash: hashText(JSON.stringify(job.scene)),
    originalPromptHash: hashText(job.scene.imagePrompt),
    optimizedPromptHash: promptHash,
    optimizerVersion: "openai-image-generator-1",
    optimizedAt: generatedAt,
    metrics: {
      originalCharacters: job.scene.imagePrompt.length,
      optimizedCharacters: job.prompt.length,
      reductionCharacters: Math.max(
        0,
        job.scene.imagePrompt.length - job.prompt.length
      ),
      reductionPercent:
        job.scene.imagePrompt.length === 0
          ? 0
          : Math.max(
              0,
              ((job.scene.imagePrompt.length - job.prompt.length) /
                job.scene.imagePrompt.length) *
                100
            ),
      originalEstimatedTokens: Math.ceil(job.scene.imagePrompt.length / 4),
      optimizedEstimatedTokens: Math.ceil(job.prompt.length / 4),
    },
    preservedRequirements: [
      job.scene.visualPurpose,
      ...job.scene.negativeConstraints,
    ],
    omittedNonVisualContent: [],
    warnings: [],
  };

  const metadataPath = path.join(
    metadataDir,
    `scene-${String(job.scene.sequenceNumber).padStart(3, "0")}.json`
  );

  await writeJsonAtomic(metadataPath, metadata);

  const imageAsset = imageAssetSchema.parse({
    sceneId: job.scene.id,
    sourcePath: rawPath,
    renderedPath: normalizedPath,
    width: finalDimensions.width,
    height: finalDimensions.height,
    mimeType: "image/png",
    checksumSha256: finalChecksumSha256,
    validated: true,
    generationStatus: "validated",
    originalImagePrompt: job.scene.imagePrompt,
    optimizedImagePrompt: job.prompt,
    optimizedImagePromptPath: promptPath,
    optimizedImagePromptHash: promptHash,
    provenance: {
      ...metadata,
      model: settings.model,
      size: settings.requestedSize,
      quality: settings.quality,
      outputFormat: settings.outputFormat,
      candidateCount: 1,
      cacheKey: crypto
        .createHash("sha256")
        .update(
          [
            job.scene.id,
            promptHash,
            settings.model,
            settings.requestedSize,
            settings.quality,
            settings.outputFormat,
            rawChecksumSha256,
          ].join("\u0000"),
          "utf8"
        )
        .digest("hex"),
      generatedAt,
      validation: {
        valid: true,
        width: finalDimensions.width,
        height: finalDimensions.height,
        checksumSha256: finalChecksumSha256,
        warnings: [],
      },
    },
  });

  return {
    ...imageAsset,
    sequenceNumber: job.scene.sequenceNumber,
    promptPath,
    rawPath,
    metadataPath,
    requestedSize: settings.requestedSize,
    apiSize: settings.apiSize,
    rawChecksumSha256,
    finalChecksumSha256,
  };
}

export function loadOpenAiImageGenerationSettings(
  env: ImageGenerationEnv = process.env
): OpenAiImageGenerationSettings {
  const dotenvPath = path.join(process.cwd(), ".env");

  let dotenvValues: Record<string, string> = {};

  try {
    dotenvValues = parseDotEnv(readFileSync(dotenvPath, "utf8"));
  } catch {
    dotenvValues = {};
  }

  const mergedEnv = { ...dotenvValues, ...env };
  const apiKey = mergedEnv["OPENAI_API_KEY"];

  if (!apiKey) {
    throw new ProviderAuthenticationError(
      "OPENAI_API_KEY is required for OpenAI image generation."
    );
  }

  const requestedSize = mergedEnv["OPENAI_IMAGE_SIZE"] ?? "1024x1024";
  const model = mergedEnv["OPENAI_IMAGE_MODEL"] ?? "gpt-image-1-mini";

  return {
    apiKey,
    baseUrl: mergedEnv["OPENAI_BASE_URL"],
    organization: mergedEnv["OPENAI_ORG_ID"],
    project: mergedEnv["OPENAI_PROJECT"],
    model,
    requestedSize,
    apiSize: resolveCompatibleApiSize(requestedSize, model),
    quality: resolveImageQuality(mergedEnv["OPENAI_IMAGE_QUALITY"]),
    outputFormat: resolveImageOutputFormat(mergedEnv["OPENAI_IMAGE_FORMAT"]),
    concurrency: parseEnvInt(mergedEnv["OPENAI_IMAGE_CONCURRENCY"], 1),
    maxRetries: parseEnvInt(mergedEnv["OPENAI_IMAGE_MAX_RETRIES"], 2),
    timeoutMs: parseEnvInt(mergedEnv["OPENAI_IMAGE_TIMEOUT_MS"], 180000),
    debug: mergedEnv["OPENAI_IMAGE_DEBUG"] === "true",
  };
}

export async function generateOpenAiSceneImages(
  jobs: ReadonlyArray<OpenAiImageGenerationJob>,
  settings: OpenAiImageGenerationSettings,
  options?: {
    readonly client?: OpenAiImageClientLike;
  }
): Promise<OpenAiImageGenerationResult[]> {
  logOpenAiImageSettings(settings);

  const client =
    options?.client ??
    new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      organization: settings.organization,
      project: settings.project,
    });

  const queue = [...jobs];
  const results: OpenAiImageGenerationResult[] = [];

  const workers = Array.from(
    { length: Math.max(1, settings.concurrency) },
    async () => {
      while (queue.length > 0) {
        const job = queue.shift();

        if (!job) return;

        const result = await generateSingleImage(client, job, settings);
        results.push(result);
      }
    }
  );

  await Promise.all(workers);

  return results.sort(
    (left, right) => left.sequenceNumber - right.sequenceNumber
  );
}
