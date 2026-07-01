import fs from "node:fs/promises";
import path from "node:path";
import {
  currentExecutionTelemetry,
} from "@mediaforge/observability";
import { readJsonFile } from "./thumbnail-contracts.js";
import {
  type CompiledThumbnailPrompt,
  type GenerateThumbnailInput,
  generateThumbnailInputSchema,
  type GeneratedThumbnailResult,
  type ThumbnailGenerationConfig,
  type ThumbnailStoryFile,
  thumbnailStoryFileSchema,
  THUMBNAIL_DEFAULT_MAX_GENERATED_BYTES,
  THUMBNAIL_DEFAULT_MAX_REFERENCE_BYTES,
  THUMBNAIL_DEFAULT_MAX_RETRIES,
  THUMBNAIL_DEFAULT_STYLE,
  THUMBNAIL_DEFAULT_TIMEOUT_MS,
  THUMBNAIL_MANIFEST_VERSION,
  THUMBNAIL_OUTPUTS,
  THUMBNAIL_PROMPT_VERSION,
  THUMBNAIL_TEXT_LAYOUT_VERSION,
  ThumbnailArtifactConflictError,
  ThumbnailAuthenticationError,
  ThumbnailCompositionError,
  ThumbnailGenerationError,
  ThumbnailImageValidationError,
  ThumbnailInputError,
  ThumbnailPersistenceError,
  ThumbnailPolicyError,
  ThumbnailPromptCompilationError,
  ThumbnailRateLimitError,
  ThumbnailReferenceNotFoundError,
  ThumbnailReferenceValidationError,
  ThumbnailResponseError,
  normalizeHookText,
  normalizeLocale,
  resolveRepoRoot,
} from "./thumbnail-contracts.js";
import {
  type ResolvedThumbnailReference,
} from "./thumbnail-contracts.js";
import {
  buildOpenAiThumbnailEditRequest,
  ThumbnailImageGenerator,
  type ThumbnailOpenAiClientLike,
} from "./thumbnail-image-generator.js";
import {
  selectThumbnailEmphasisWord,
  compileThumbnailPrompt,
  computeBackgroundFingerprint,
  computeCompositionFingerprint,
} from "./thumbnail-prompt-compiler.js";
import { resolveThumbnailReference } from "./thumbnail-reference-resolver.js";
import {
  compositeThumbnailText,
  normalizeThumbnailBackground,
  THUMBNAIL_FONT_FAMILY,
} from "./thumbnail-text-compositor.js";
import {
  ThumbnailArtifactRepository,
  createExpectedBackgroundManifest,
  createExpectedFinalManifest,
} from "./thumbnail-artifact-repository.js";

type TelemetryEventRecorder = {
  recordEvent?: (event: {
    readonly name: string;
    readonly at: string;
    readonly details?: Record<string, unknown>;
  }) => void;
};

function recordThumbnailEvent(
  name: string,
  details: Record<string, unknown>
): void {
  const telemetry = currentExecutionTelemetry() as
    | (typeof currentExecutionTelemetry extends () => infer T ? T : never)
    | TelemetryEventRecorder
    | undefined;
  if (telemetry && "recordEvent" in telemetry && typeof telemetry.recordEvent === "function") {
    telemetry.recordEvent({
      name,
      at: new Date().toISOString(),
      details,
    });
  }
}

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadThumbnailGenerationConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): ThumbnailGenerationConfig {
  const apiKey = env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new ThumbnailAuthenticationError(
      "OPENAI_API_KEY is required for thumbnail generation."
    );
  }
  const organization = env["OPENAI_ORGANIZATION"] ?? env["OPENAI_ORG_ID"];
  return {
    apiKey,
    model: env["OPENAI_THUMBNAIL_MODEL"] ?? "gpt-image-2",
    quality:
      env["OPENAI_THUMBNAIL_QUALITY"] === "low" ||
      env["OPENAI_THUMBNAIL_QUALITY"] === "medium" ||
      env["OPENAI_THUMBNAIL_QUALITY"] === "high" ||
      env["OPENAI_THUMBNAIL_QUALITY"] === "auto"
        ? env["OPENAI_THUMBNAIL_QUALITY"]
        : "high",
    defaultStyle:
      env["THUMBNAIL_DEFAULT_STYLE"] === "editorial-card"
        ? "editorial-card"
        : THUMBNAIL_DEFAULT_STYLE,
    fullReferencePath:
      env["THUMBNAIL_FULL_REFERENCE"] ??
      THUMBNAIL_OUTPUTS.full.referencePath,
    shortReferencePath:
      env["THUMBNAIL_SHORT_REFERENCE"] ??
      THUMBNAIL_OUTPUTS.short.referencePath,
    maxReferenceBytes: parseEnvInt(
      env["THUMBNAIL_MAX_REFERENCE_BYTES"],
      THUMBNAIL_DEFAULT_MAX_REFERENCE_BYTES
    ),
    maxGeneratedBytes: parseEnvInt(
      env["THUMBNAIL_MAX_GENERATED_BYTES"] ??
        env["OPENAI_THUMBNAIL_MAX_PAYLOAD_BYTES"],
      THUMBNAIL_DEFAULT_MAX_GENERATED_BYTES
    ),
    timeoutMs: parseEnvInt(
      env["THUMBNAIL_TIMEOUT_MS"] ?? env["OPENAI_THUMBNAIL_TIMEOUT_MS"],
      THUMBNAIL_DEFAULT_TIMEOUT_MS
    ),
    maxRetries: parseEnvInt(
      env["THUMBNAIL_MAX_RETRIES"] ?? env["OPENAI_THUMBNAIL_MAX_RETRIES"],
      THUMBNAIL_DEFAULT_MAX_RETRIES
    ),
    ...(env["OPENAI_BASE_URL"] ? { baseUrl: env["OPENAI_BASE_URL"] } : {}),
    ...(organization ? { organization } : {}),
    ...(env["OPENAI_PROJECT"] ? { project: env["OPENAI_PROJECT"] } : {}),
  };
}

export const loadOpenAiThumbnailGenerationSettings = loadThumbnailGenerationConfig;

export function buildOpenAiThumbnailRequestBody(args: {
  readonly input: GenerateThumbnailInput;
  readonly settings: Pick<ThumbnailGenerationConfig, "model" | "quality">;
  readonly promptText: string;
  readonly referenceImagePath: string;
}): ReturnType<typeof buildOpenAiThumbnailEditRequest> {
  return buildOpenAiThumbnailEditRequest({
    input: args.input,
    config: args.settings,
    prompt: {
      prompt: args.promptText,
      version: THUMBNAIL_PROMPT_VERSION,
      fingerprint: "",
      sourceFingerprint: "",
      format: args.input.format,
      style: args.input.style ?? THUMBNAIL_DEFAULT_STYLE,
      referencePath: args.referenceImagePath,
      referenceSha256: "",
    },
    reference: {
      format: args.input.format,
      path: args.referenceImagePath,
      repoRelativePath: args.referenceImagePath,
      sha256: "",
      byteSize: 0,
      width: 0,
      height: 0,
      mimeType: "image/png",
    },
  });
}

export async function readThumbnailStoryFile(args: {
  readonly workspaceRoot: string;
  readonly storyFilePath: string;
}): Promise<ThumbnailStoryFile> {
  const resolvedPath = path.isAbsolute(args.storyFilePath)
    ? args.storyFilePath
    : path.resolve(args.workspaceRoot, args.storyFilePath);
  try {
    const parsed = await readJsonFile(resolvedPath);
    return thumbnailStoryFileSchema.parse(parsed);
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      throw error;
    }
    throw new ThumbnailInputError(
      `Unable to read thumbnail story file: ${resolvedPath}`,
      error
    );
  }
}

export function compileStoryThumbnailPrompt(
  rawInput: GenerateThumbnailInput,
  settings: Pick<ThumbnailGenerationConfig, "model" | "quality" | "defaultStyle">,
  reference?: ResolvedThumbnailReference
): CompiledThumbnailPrompt {
  const input = generateThumbnailInputSchema.parse(rawInput);
  const style = input.style ?? settings.defaultStyle;
  const resolvedReference =
    reference ??
    ({
      format: input.format,
      path: THUMBNAIL_OUTPUTS[input.format].referencePath,
      repoRelativePath: THUMBNAIL_OUTPUTS[input.format].referencePath,
      sha256: "unresolved-reference",
      byteSize: 0,
      width: 0,
      height: 0,
      mimeType: "image/png",
    } as ResolvedThumbnailReference);
  return compileThumbnailPrompt({
    input,
    config: settings,
    reference: resolvedReference,
    style,
  });
}

function createDryRunReuseSummary(args: {
  readonly backgroundReused: boolean;
  readonly finalReused: boolean;
}): {
  readonly reused: boolean;
  readonly backgroundReused: boolean;
  readonly compositionReused: boolean;
  readonly generated: boolean;
} {
  return {
    reused: args.backgroundReused && args.finalReused,
    backgroundReused: args.backgroundReused,
    compositionReused: args.finalReused,
    generated: false,
  };
}

export async function generateStoryThumbnail(
  rawInput: GenerateThumbnailInput,
  options?: {
    readonly settings?: ThumbnailGenerationConfig;
    readonly client?: ThumbnailOpenAiClientLike;
  }
): Promise<GeneratedThumbnailResult> {
  const settings = options?.settings ?? loadThumbnailGenerationConfig();
  const input = generateThumbnailInputSchema.parse({
    ...rawInput,
    locale: normalizeLocale(rawInput.locale),
    style: rawInput.style ?? settings.defaultStyle,
  });
  const style = input.style ?? settings.defaultStyle;
  const repoRoot = resolveRepoRoot();
  const reference = await resolveThumbnailReference({
    repoRoot,
    format: input.format,
    ...(input.referenceImagePath
      ? { overridePath: input.referenceImagePath }
      : {}),
    config: settings,
  });
  const compiled = compileThumbnailPrompt({
    input,
    config: settings,
    reference,
    style,
  });
  const normalizedHook = normalizeHookText(input.hookText, input.locale);
  const emphasisWord = (
    input.emphasisWord
      ? input.emphasisWord
      : selectThumbnailEmphasisWord(normalizedHook, input.locale)
  ).toLocaleUpperCase(input.locale);
  const backgroundFingerprint = computeBackgroundFingerprint({
    input,
    style,
    prompt: compiled,
    config: settings,
  });
  const compositionFingerprint = computeCompositionFingerprint({
    input,
    style,
    backgroundFingerprint,
    emphasisWord,
    fontFamily: THUMBNAIL_FONT_FAMILY,
    textLayoutVersion: THUMBNAIL_TEXT_LAYOUT_VERSION,
  });
  const repository = new ThumbnailArtifactRepository();
  const paths = repository.resolvePaths({
    workspaceRoot: input.workspaceRoot,
    episodeSlug: input.episodeSlug,
    locale: input.locale,
    format: input.format,
  });
  const expectedBackground = createExpectedBackgroundManifest({
    input,
    style,
    model: settings.model,
    quality: input.quality ?? settings.quality,
    promptVersion: compiled.version,
    promptFingerprint: compiled.fingerprint,
    sourceFingerprint: compiled.sourceFingerprint,
    backgroundFingerprint,
    referencePath: reference.repoRelativePath,
    referenceSha256: reference.sha256,
    retryCount: 0,
    pricingVersion: "unconfigured",
    estimatedCostMicros: null,
    generatedAt: new Date().toISOString(),
  });
  const backgroundReuse = await repository.reuseBackground({
    path: paths.backgroundPath,
    manifestPath: paths.backgroundManifestPath,
    expectedManifest: {
      ...expectedBackground,
      outputPath: paths.backgroundPath,
      outputSha256: "0".repeat(64),
      outputBytes: 0,
    },
    force: input.force ?? false,
  });
  const expectedFinal = createExpectedFinalManifest({
    input,
    style,
    backgroundSha256: backgroundReuse.reused ? backgroundReuse.sha256 : "0".repeat(64),
    backgroundFingerprint,
    hookText: normalizedHook,
    emphasisWord,
    fontFamily: THUMBNAIL_FONT_FAMILY,
    textLayoutVersion: THUMBNAIL_TEXT_LAYOUT_VERSION,
    compositionFingerprint,
    generatedAt: new Date().toISOString(),
  });
  const finalReuse = await repository.reuseFinal({
    path: paths.outputPath,
    manifestPath: paths.manifestPath,
    expectedManifest: {
      ...expectedFinal,
      outputPath: paths.outputPath,
      outputSha256: "0".repeat(64),
      outputBytes: 0,
    },
    force: input.force ?? false,
  });

  if (input.dryRun) {
    return {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      outputPath: paths.outputPath,
      manifestPath: paths.manifestPath,
      backgroundPath: paths.backgroundPath,
      backgroundManifestPath: paths.backgroundManifestPath,
      model: settings.model,
      quality: input.quality ?? settings.quality,
      width: THUMBNAIL_OUTPUTS[input.format].width,
      height: THUMBNAIL_OUTPUTS[input.format].height,
      generationSize: THUMBNAIL_OUTPUTS[input.format].generationSize,
      promptVersion: compiled.version,
      promptFingerprint: compiled.fingerprint,
      sourceFingerprint: compiled.sourceFingerprint,
      backgroundFingerprint,
      compositionFingerprint,
      hookText: normalizedHook,
      emphasisWord,
      referencePath: reference.repoRelativePath,
      referenceSha256: reference.sha256,
      dryRun: true,
      ...createDryRunReuseSummary({
        backgroundReused: backgroundReuse.reused,
        finalReused: finalReuse.reused,
      }),
      ...(input.verbose ? { promptText: compiled.prompt } : {}),
    };
  }

  recordThumbnailEvent("thumbnail_reference_resolved", {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      referencePath: reference.repoRelativePath,
      referenceSha256: reference.sha256,
  });
  recordThumbnailEvent("thumbnail_prompt_compiled", {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      promptVersion: compiled.version,
      promptFingerprint: compiled.fingerprint,
      sourceFingerprint: compiled.sourceFingerprint,
  });

  let backgroundBuffer: Buffer;
  let backgroundSha256: string;
  let backgroundManifestPath = paths.backgroundManifestPath;
  let requestId: string | undefined;
  let pricingVersion = "unconfigured";
  let estimatedCostMicros: number | null = null;
  let retryCount = 0;
  if (backgroundReuse.reused) {
    backgroundBuffer = await fs.readFile(paths.backgroundPath);
    backgroundSha256 = backgroundReuse.sha256;
    recordThumbnailEvent("thumbnail_background_generation_reused", {
        episodeSlug: input.episodeSlug,
        locale: input.locale,
        format: input.format,
        style,
        backgroundFingerprint,
        outputPath: paths.backgroundPath,
    });
  } else {
    recordThumbnailEvent("thumbnail_background_generation_started", {
        episodeSlug: input.episodeSlug,
        locale: input.locale,
        format: input.format,
        style,
        model: settings.model,
        quality: input.quality ?? settings.quality,
        backgroundFingerprint,
        promptFingerprint: compiled.fingerprint,
    });
    const generator = new ThumbnailImageGenerator(settings, options?.client);
    const generated = await generator.generateBackground({
      input,
      prompt: compiled,
      reference,
      backgroundFingerprint,
    });
    requestId = generated.requestId;
    pricingVersion = generated.pricingVersion;
    estimatedCostMicros = generated.estimatedCostMicros;
    retryCount = generated.retryCount;
    backgroundBuffer = await normalizeThumbnailBackground({
      imageBuffer: generated.buffer,
      format: input.format,
    });
    const backgroundManifest = await repository.persistBackground({
      path: paths.backgroundPath,
      manifestPath: paths.backgroundManifestPath,
      buffer: backgroundBuffer,
      manifest: createExpectedBackgroundManifest({
        input,
        style,
        model: settings.model,
        quality: input.quality ?? settings.quality,
        promptVersion: compiled.version,
        promptFingerprint: compiled.fingerprint,
        sourceFingerprint: compiled.sourceFingerprint,
        backgroundFingerprint,
        referencePath: reference.repoRelativePath,
        referenceSha256: reference.sha256,
        ...(requestId ? { requestId } : {}),
        retryCount,
        pricingVersion,
        estimatedCostMicros,
        generatedAt: new Date().toISOString(),
      }),
    });
    backgroundManifestPath = paths.backgroundManifestPath;
    backgroundSha256 = backgroundManifest.outputSha256;
    recordThumbnailEvent("thumbnail_background_generation_succeeded", {
        episodeSlug: input.episodeSlug,
        locale: input.locale,
        format: input.format,
        style,
        model: settings.model,
        quality: input.quality ?? settings.quality,
        outputPath: paths.backgroundPath,
        responseBytes: backgroundManifest.outputBytes,
        retryCount,
        backgroundFingerprint,
    });
  }

  if (finalReuse.reused && backgroundReuse.reused) {
    recordThumbnailEvent("thumbnail_composition_reused", {
        episodeSlug: input.episodeSlug,
        locale: input.locale,
        format: input.format,
        style,
        compositionFingerprint,
        outputPath: paths.outputPath,
    });
    return {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      outputPath: paths.outputPath,
      manifestPath: paths.manifestPath,
      backgroundPath: paths.backgroundPath,
      backgroundManifestPath,
      model: settings.model,
      quality: input.quality ?? settings.quality,
      width: THUMBNAIL_OUTPUTS[input.format].width,
      height: THUMBNAIL_OUTPUTS[input.format].height,
      generationSize: THUMBNAIL_OUTPUTS[input.format].generationSize,
      promptVersion: compiled.version,
      promptFingerprint: compiled.fingerprint,
      sourceFingerprint: compiled.sourceFingerprint,
      backgroundFingerprint,
      compositionFingerprint,
      hookText: normalizedHook,
      emphasisWord,
      referencePath: reference.repoRelativePath,
      referenceSha256: reference.sha256,
      dryRun: false,
      reused: true,
      backgroundReused: true,
      compositionReused: true,
      generated: false,
      imageSha256: finalReuse.sha256,
      byteSize: finalReuse.byteSize,
    };
  }

  recordThumbnailEvent("thumbnail_composition_started", {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      compositionFingerprint,
      backgroundFingerprint,
  });
  const finalBuffer = await compositeThumbnailText({
    background: backgroundBuffer,
    input: {
      format: input.format,
      locale: input.locale,
      hookText: normalizedHook,
      style,
    },
    emphasisWord,
  });
  const finalManifest = await repository.persistFinal({
    path: paths.outputPath,
    manifestPath: paths.manifestPath,
    buffer: finalBuffer,
    manifest: createExpectedFinalManifest({
      input,
      style,
      backgroundSha256,
      backgroundFingerprint,
      hookText: normalizedHook,
      emphasisWord,
      fontFamily: THUMBNAIL_FONT_FAMILY,
      textLayoutVersion: THUMBNAIL_TEXT_LAYOUT_VERSION,
      compositionFingerprint,
      generatedAt: new Date().toISOString(),
    }),
  });
  recordThumbnailEvent("thumbnail_composition_succeeded", {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      compositionFingerprint,
      outputPath: paths.outputPath,
  });
  recordThumbnailEvent("thumbnail_generation_succeeded", {
      episodeSlug: input.episodeSlug,
      locale: input.locale,
      format: input.format,
      style,
      model: settings.model,
      quality: input.quality ?? settings.quality,
      outputPath: paths.outputPath,
      referencePath: reference.repoRelativePath,
      referenceSha256: reference.sha256,
      promptFingerprint: compiled.fingerprint,
      sourceFingerprint: compiled.sourceFingerprint,
      backgroundFingerprint,
      compositionFingerprint,
  });
  currentExecutionTelemetry()?.recordImage({
    outputPath: paths.outputPath,
    model: settings.model,
    generationMode: backgroundReuse.reused
      ? "thumbnail-compose-only"
      : "thumbnail-generate",
    attempts: retryCount + 1,
    promptHash: compiled.fingerprint,
    outputSha256: finalManifest.outputSha256,
    costMicros: estimatedCostMicros,
    ...(requestId ? { requestId } : {}),
  });
  return {
    episodeSlug: input.episodeSlug,
    locale: input.locale,
    format: input.format,
    style,
    outputPath: paths.outputPath,
    manifestPath: paths.manifestPath,
    backgroundPath: paths.backgroundPath,
    backgroundManifestPath,
    model: settings.model,
    quality: input.quality ?? settings.quality,
    width: THUMBNAIL_OUTPUTS[input.format].width,
    height: THUMBNAIL_OUTPUTS[input.format].height,
    generationSize: THUMBNAIL_OUTPUTS[input.format].generationSize,
    promptVersion: compiled.version,
    promptFingerprint: compiled.fingerprint,
    sourceFingerprint: compiled.sourceFingerprint,
    backgroundFingerprint,
    compositionFingerprint,
    hookText: normalizedHook,
    emphasisWord,
    referencePath: reference.repoRelativePath,
    referenceSha256: reference.sha256,
    dryRun: false,
    reused: false,
    backgroundReused: backgroundReuse.reused,
    compositionReused: false,
    generated: true,
    imageSha256: finalManifest.outputSha256,
    byteSize: finalManifest.outputBytes,
    pricingVersion,
    estimatedCostMicros,
    ...(requestId ? { requestId } : {}),
    ...(input.verbose ? { promptText: compiled.prompt } : {}),
  };
}

export {
  THUMBNAIL_FONT_FAMILY,
  THUMBNAIL_MANIFEST_VERSION,
  THUMBNAIL_OUTPUTS as THUMBNAIL_DIMENSIONS,
  THUMBNAIL_PROMPT_VERSION,
  THUMBNAIL_TEXT_LAYOUT_VERSION,
  THUMBNAIL_OUTPUTS,
  THUMBNAIL_DEFAULT_STYLE,
  selectThumbnailEmphasisWord,
  computeBackgroundFingerprint,
  computeCompositionFingerprint,
  resolveThumbnailReference,
  compileThumbnailPrompt,
  normalizeThumbnailBackground,
  compositeThumbnailText as compositeStoryThumbnailText,
  ThumbnailArtifactConflictError,
  ThumbnailAuthenticationError,
  ThumbnailInputError,
  ThumbnailReferenceNotFoundError,
  ThumbnailReferenceValidationError,
  ThumbnailPromptCompilationError,
  ThumbnailGenerationError,
  ThumbnailPolicyError,
  ThumbnailRateLimitError,
  ThumbnailResponseError,
  ThumbnailImageValidationError,
  ThumbnailCompositionError,
  ThumbnailPersistenceError,
};
