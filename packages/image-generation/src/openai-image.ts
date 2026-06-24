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
  normalizeWhitespace,
  writeBinaryAtomic,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import crypto from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
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
  readonly reusedFromSceneId?: string;
  readonly reuseSimilarity?: number;
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
const execFile = promisify(execFileCallback);

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

const standardImageSizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);

function resolveCompatibleApiSize(requestedSize: string, model: string): string {
  const normalizedSize = requestedSize.trim();

  if (!/^(?:\d+)x(?:\d+)$/u.test(normalizedSize)) {
    throw new ConfigurationError(
      `Invalid OPENAI_IMAGE_SIZE value: ${requestedSize}. Expected WIDTHxHEIGHT.`
    );
  }

  if (standardImageSizes.has(normalizedSize)) {
    return normalizedSize;
  }

  const [widthText, heightText] = normalizedSize.split("x");
  const width = Number.parseInt(widthText ?? "", 10);
  const height = Number.parseInt(heightText ?? "", 10);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ConfigurationError(
      `Invalid OPENAI_IMAGE_SIZE value: ${requestedSize}. Expected WIDTHxHEIGHT.`
    );
  }

  if (width === height) {
    return "1024x1024";
  }

  return width > height ? "1536x1024" : "1024x1536";
}

const reuseStopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "there",
  "their",
  "about",
  "into",
  "your",
  "yours",
  "they",
  "them",
  "then",
  "than",
  "when",
  "what",
  "which",
  "while",
  "were",
  "was",
  "are",
  "been",
  "being",
  "have",
  "has",
  "had",
  "you",
  "our",
  "out",
  "over",
  "under",
  "just",
  "some",
  "more",
  "most",
  "very",
  "can",
  "could",
  "would",
  "should",
  "will",
  "not",
  "but",
  "because",
  "since",
  "scene",
  "visual",
  "purpose",
  "global",
  "style"
]);

function tokenSetFromPrompt(value: string): Set<string> {
  return new Set(
    normalizeWhitespace(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !reuseStopWords.has(token))
  );
}

function promptSimilarity(left: string, right: string): number {
  const leftTokens = tokenSetFromPrompt(left);
  const rightTokens = tokenSetFromPrompt(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function buildReuseSignature(scene: Scene): string {
  return normalizeWhitespace(
    [
      scene.visualPurpose,
      scene.subject,
      scene.action,
      scene.setting,
      scene.mood,
      scene.canonicalNarration
    ].join(" ")
  );
}

function shouldReuseImage(
  currentScene: Scene,
  previousScene: Scene,
  currentPrompt: string,
  previousPrompt: string
): number {
  const sceneSimilarity = promptSimilarity(buildReuseSignature(currentScene), buildReuseSignature(previousScene));
  const promptSimilarityScore = promptSimilarity(currentPrompt, previousPrompt);
  const combined = Math.max(sceneSimilarity, promptSimilarityScore);
  return Number.isFinite(combined) ? combined : 0;
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

export function redactApiKey(value: string): string {
  if (value.length <= 8) {
    return "[redacted]";
  }

  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function buildOpenAiImageRequestBody(
  job: OpenAiImageGenerationJob,
  settings: OpenAiImageGenerationSettings
): {
  readonly model: string;
  readonly prompt: string;
  readonly size: string;
  readonly quality: "low" | "medium" | "high" | "auto";
  readonly output_format?: "png" | "jpeg" | "webp";
  readonly n: number;
} {
  return settings.outputFormat === "png"
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
}

function logOpenAiImageRequest(
  job: OpenAiImageGenerationJob,
  settings: OpenAiImageGenerationSettings,
  baseUrl: string
): void {
  if (!settings.debug) return;

  console.info("[openai:image-generation] request envelope", {
    method: "POST",
    request: {
      url: baseUrl,
      headers: {
        Authorization: "Bearer [redacted]",
        "Content-Type": "application/json",
        ...(settings.organization ? { "OpenAI-Organization": "[redacted]" } : {}),
        ...(settings.project ? { "OpenAI-Project": "[redacted]" } : {}),
      },
      body: buildOpenAiImageRequestBody(job, settings),
    },
    apiKey: redactApiKey(settings.apiKey),
    url: baseUrl,
    model: settings.model,
    size: settings.apiSize,
    quality: settings.quality,
    outputFormat: settings.outputFormat,
    promptHash: hashText(job.prompt),
    promptPath: path.join(
      job.episodeDir,
      "images",
      "generated",
      "prompts",
      `scene-${String(job.scene.sequenceNumber).padStart(3, "0")}.txt`
    ),
  });
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderResponseError(
      formatJsonValue({
        message: "OpenAI image generation returned invalid JSON.",
        status: response.status,
        statusText: response.statusText,
        body: text,
        cause: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

async function readCurlJsonResponse(stdout: string): Promise<unknown> {
  if (stdout.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new ProviderResponseError(
      formatJsonValue({
        message: "OpenAI image generation returned invalid JSON from curl.",
        body: stdout,
        cause: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

function shouldFallbackToCurl(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "TypeError" ||
    error.message.includes("fetch failed") ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("ETIMEDOUT") ||
    error.message.includes("ENOTFOUND") ||
    error.message.includes("EAI_AGAIN")
  );
}

async function requestOpenAiImageWithCurl(
  body: ReturnType<typeof buildOpenAiImageRequestBody>,
  settings: OpenAiImageGenerationSettings,
  baseUrl: string
): Promise<unknown> {
  const args = [
    "--fail-with-body",
    "--silent",
    "--show-error",
    "--request",
    "POST",
    baseUrl,
    "-H",
    `Authorization: Bearer ${settings.apiKey}`,
    "-H",
    "Content-Type: application/json",
  ];

  if (settings.organization) {
    args.push("-H", `OpenAI-Organization: ${settings.organization}`);
  }

  if (settings.project) {
    args.push("-H", `OpenAI-Project: ${settings.project}`);
  }

  args.push("--data-binary", JSON.stringify(body));

  try {
    const { stdout } = await execFile("curl", args, {
      timeout: settings.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    return await readCurlJsonResponse(stdout);
  } catch (error) {
    const execError = error as {
      readonly stdout?: string;
      readonly stderr?: string;
      readonly code?: number | string | null;
      readonly signal?: string | null;
    };

    const stdout = typeof execError.stdout === "string" ? execError.stdout : "";
    const stderr = typeof execError.stderr === "string" ? execError.stderr : "";
    const parsedBody = await readCurlJsonResponse(stdout).catch(() => undefined);

    throw new ProviderResponseError(
      formatJsonValue({
        message: "OpenAI image generation request failed via curl.",
        code: execError.code ?? undefined,
        signal: execError.signal ?? undefined,
        stderr,
        body: parsedBody,
        retryable: isRetryableOpenAiError(parsedBody ?? error),
      })
    );
  }
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

async function cloneImageArtifacts(
  sourcePath: string,
  targetPath: string
): Promise<void> {
  await fs.copyFile(sourcePath, targetPath);
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
  client: OpenAiImageClientLike | null,
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
      if (client) {
        const requestBody = buildOpenAiImageRequestBody(job, settings);

        response = await client.images.generate(
          requestBody,
          { signal: AbortSignal.timeout(settings.timeoutMs) }
        );
      } else {
        const baseUrl = new URL("/v1/images/generations", settings.baseUrl ?? "https://api.openai.com").toString();
        const body = buildOpenAiImageRequestBody(job, settings);
        logOpenAiImageRequest(job, settings, baseUrl);
        try {
          const responseBody = await fetch(baseUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.apiKey}`,
              "Content-Type": "application/json",
              ...(settings.organization ? { "OpenAI-Organization": settings.organization } : {}),
              ...(settings.project ? { "OpenAI-Project": settings.project } : {}),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(settings.timeoutMs),
          });

          const parsed = await readJsonResponse(responseBody);
          if (!responseBody.ok) {
            throw new ProviderResponseError(
              formatJsonValue({
                message: "OpenAI image generation request failed.",
                status: responseBody.status,
                statusText: responseBody.statusText,
                body: parsed,
                retryable: isRetryableOpenAiError(parsed),
              })
            );
          }

          response = parsed as Awaited<ReturnType<OpenAiImageClientLike["images"]["generate"]>>;
        } catch (error) {
          if (!shouldFallbackToCurl(error)) {
            throw error;
          }

          const parsed = await requestOpenAiImageWithCurl(body, settings, baseUrl);

          response = parsed as Awaited<ReturnType<OpenAiImageClientLike["images"]["generate"]>>;
        }
      }

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

async function reuseSingleImage(
  source: OpenAiImageGenerationResult,
  job: OpenAiImageGenerationJob,
  settings: OpenAiImageGenerationSettings,
  similarity: number
): Promise<OpenAiImageGenerationResult> {
  const generatedDir = path.join(job.episodeDir, "images", "generated");
  const rawDir = path.join(generatedDir, "raw");
  const metadataDir = path.join(generatedDir, "metadata");

  await Promise.all([ensureDir(rawDir), ensureDir(metadataDir)]);

  const { promptPath, promptHash } = await writePromptArtifacts(generatedDir, job.scene, job.prompt);
  const baseName = path.basename(job.normalizedFilename, ".png");
  const rawPath = path.join(rawDir, `${baseName}.openai.${settings.outputFormat}`);
  const normalizedPath = path.join(generatedDir, job.normalizedFilename);

  await cloneImageArtifacts(source.rawPath, rawPath);
  if (!source.renderedPath) {
    throw new ProviderResponseError(
      `Cannot reuse image for ${job.scene.id} because the source rendered image is missing.`
    );
  }
  await cloneImageArtifacts(source.renderedPath, normalizedPath);

  const finalDimensions = await validateDecodedImage(normalizedPath);
  const rawChecksumSha256 = await hashFile(rawPath);
  const finalChecksumSha256 = await hashFile(normalizedPath);
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
    reusedFromSceneId: source.sceneId,
    reuseSimilarity: similarity,
    metrics: {
      originalCharacters: job.scene.imagePrompt.length,
      optimizedCharacters: job.prompt.length,
      reductionCharacters: Math.max(0, job.scene.imagePrompt.length - job.prompt.length),
      reductionPercent: job.scene.imagePrompt.length === 0 ? 0 : Math.max(0, ((job.scene.imagePrompt.length - job.prompt.length) / job.scene.imagePrompt.length) * 100),
      originalEstimatedTokens: Math.ceil(job.scene.imagePrompt.length / 4),
      optimizedEstimatedTokens: Math.ceil(job.prompt.length / 4)
    },
    preservedRequirements: [job.scene.visualPurpose, ...job.scene.negativeConstraints],
    omittedNonVisualContent: [],
    warnings: [`Reused image from ${source.sceneId} because the prompt similarity was ${(similarity * 100).toFixed(1)}%.`]
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
            rawChecksumSha256
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
        warnings: []
      }
    }
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
    reusedFromSceneId: source.sceneId,
    reuseSimilarity: similarity
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
    organization: mergedEnv["OPENAI_ORGANIZATION"] ?? mergedEnv["OPENAI_ORG_ID"],
    project: mergedEnv["OPENAI_PROJECT"],
    model,
    requestedSize,
    apiSize: resolveCompatibleApiSize(requestedSize, model),
    quality: resolveImageQuality(mergedEnv["OPENAI_IMAGE_QUALITY"]),
    outputFormat: resolveImageOutputFormat(mergedEnv["OPENAI_IMAGE_FORMAT"]),
    concurrency: parseEnvInt(mergedEnv["OPENAI_IMAGE_CONCURRENCY"], 2),
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
    options?.client ?? null;

  const generationPlan = jobs.map((job, index) => ({
    job,
    index
  }));
  const queue = [...generationPlan];
  const resultsByIndex = new Map<number, OpenAiImageGenerationResult>();

  const workers = Array.from(
    { length: Math.max(1, settings.concurrency) },
    async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) {
          return;
        }
        const result = await generateSingleImage(client, entry.job, settings);
        resultsByIndex.set(entry.index, result);
      }
    }
  );

  await Promise.all(workers);

  const results: OpenAiImageGenerationResult[] = [];
  for (const entry of generationPlan) {
    const generated = resultsByIndex.get(entry.index);
    if (!generated) {
      throw new ProviderResponseError(`Missing generated image for scene ${entry.job.scene.id}.`);
    }
    results.push(generated);
  }

  return results.sort((left, right) => left.sequenceNumber - right.sequenceNumber);
}
