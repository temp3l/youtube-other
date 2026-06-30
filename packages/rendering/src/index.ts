import {
  MediaValidationError,
  ProcessExecutionError,
  type RenderProfile,
  type ScenePlan,
  scenePlanSchema,
} from "@mediaforge/domain";
import { runCommand, runCommandJson } from "@mediaforge/process-runner";
import {
  ensureDir,
  copyAtomic,
  fileExists,
  hashFile,
  hashText,
  resolveSceneImageCandidatePaths,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

type ProcessEnv = Readonly<Record<string, string | undefined>>;

const mediaStageVariantSchema = z.enum(["full", "short"]);
type MediaStageVariant = z.infer<typeof mediaStageVariantSchema>;
const mediaStageOwnerSchema = z.enum([
  "narration",
  "scene-plan",
  "image-plan",
  "image-generation",
  "render",
  "thumbnail",
  "publication",
]);
const mediaStageStatusSchema = z.enum([
  "planned",
  "ready",
  "generated",
  "reused",
  "uploaded",
  "failed",
]);
const mediaStageIdentitySchema = z
  .object({
    episodeId: z.string().min(1),
    language: z.string().min(1),
    locale: z.string().min(1),
    variant: mediaStageVariantSchema,
    owner: mediaStageOwnerSchema,
  })
  .strict();
type MediaStageIdentity = z.infer<typeof mediaStageIdentitySchema>;
const mediaStageDependencySchema = z
  .object({
    owner: mediaStageOwnerSchema,
    episodeId: z.string().min(1),
    language: z.string().min(1),
    locale: z.string().min(1),
    variant: mediaStageVariantSchema,
    fingerprint: z.string().min(1),
    path: z.string().min(1).optional(),
    status: mediaStageStatusSchema.optional(),
  })
  .strict();
type MediaStageDependency = z.infer<typeof mediaStageDependencySchema>;
const shortMediaRequirementsSchema = z
  .object({
    aspectRatio: z.literal("9:16"),
    durationSeconds: z.number().positive().optional(),
    targetDurationSeconds: z.number().positive().optional(),
    targetSceneCount: z.number().int().positive().optional(),
    safeVerticalComposition: z.boolean(),
    focalSubjectPlacement: z.string().min(1),
    textSafeArea: z.string().min(1),
    parentFullFingerprint: z.string().min(1).optional(),
  })
  .strict();
type ShortMediaRequirements = z.infer<typeof shortMediaRequirementsSchema>;
interface MediaStageContext {
  readonly identity: MediaStageIdentity;
  readonly narration: MediaStageDependency;
  readonly parentFullNarration?: MediaStageDependency;
}
function buildMediaStageDependency(input: {
  readonly owner: z.infer<typeof mediaStageOwnerSchema>;
  readonly episodeId: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: MediaStageVariant;
  readonly fingerprint: string;
  readonly path?: string;
  readonly status?: z.infer<typeof mediaStageStatusSchema>;
}): MediaStageDependency {
  return mediaStageDependencySchema.parse(input);
}

export interface VideoRenderRequest {
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly captionsPath?: string;
  readonly outputDir: string;
  readonly renderProfile: RenderProfile;
  readonly captionBurnIn: boolean;
  readonly clipsDirName?: string;
  readonly sceneAudioDir?: string;
  readonly imageDir?: string;
  readonly outputSuffix?: string;
  readonly outputBasename?: string;
  readonly trailingSilenceRatio?: number;
  readonly trailingSilenceBufferSeconds?: number;
  readonly mediaContext?: MediaStageContext & {
    readonly scenePlanDependency?: MediaStageDependency;
    readonly imagePlanDependency?: MediaStageDependency;
    readonly audioDependency?: MediaStageDependency;
    readonly subtitleDependency?: MediaStageDependency;
    readonly shortMediaRequirements?: ShortMediaRequirements;
  };
}

export interface VideoRenderResult {
  readonly cleanPath: string;
  readonly captionedPath?: string;
  readonly validation: RenderValidation;
}

export interface SceneClipRenderResult {
  readonly clipsDir: string;
  readonly clipPaths: string[];
}

export interface RemoteAssetRecord {
  readonly localPath: string;
  readonly sourcePath: string;
  readonly contentHash: string;
  readonly remotePath: string;
  readonly sizeBytes: number;
}

interface SceneClipManifest {
  readonly schemaVersion: 2;
  readonly sceneId: string;
  readonly sceneHash: string;
  readonly imageSha256: string;
  readonly audioSha256: string;
  readonly captionsSha256?: string;
  readonly renderProfile: {
    readonly aspectRatio: string;
    readonly width: number;
    readonly height: number;
    readonly fps: number;
  };
  readonly trailingSilenceRatio: number;
  readonly trailingSilenceBufferSeconds: number;
  readonly renderFingerprint?: string;
  readonly renderer?: "local" | "remote";
  readonly outputSha256: string;
  readonly generatedAt: string;
}

interface RenderManifest {
  readonly stageIdentity: MediaStageIdentity;
  readonly narrationDependency?: MediaStageDependency;
  readonly scenePlanDependency?: MediaStageDependency;
  readonly imagePlanDependency?: MediaStageDependency;
  readonly audioDependency?: MediaStageDependency;
  readonly subtitleDependency?: MediaStageDependency;
  readonly renderFingerprint: string;
  readonly renderProfile: RenderProfile;
  readonly shortMediaRequirements?: ShortMediaRequirements;
  readonly cleanPath: string;
  readonly captionedPath?: string;
  readonly validation: RenderValidation;
  readonly status: "generated";
  readonly generatedAt: string;
}

interface SpawnedProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface SpawnedBackgroundProcess {
  readonly child: ReturnType<typeof spawn>;
  readonly promise: Promise<SpawnedProcessResult>;
}

const renderManifestSchema = z.object({
  stageIdentity: mediaStageIdentitySchema,
  narrationDependency: mediaStageDependencySchema.optional(),
  scenePlanDependency: mediaStageDependencySchema.optional(),
  imagePlanDependency: mediaStageDependencySchema.optional(),
  audioDependency: mediaStageDependencySchema.optional(),
  subtitleDependency: mediaStageDependencySchema.optional(),
  renderFingerprint: z.string().min(1),
  renderProfile: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    fps: z.number().positive(),
    aspectRatio: z.enum(["16:9", "9:16"]),
    burnCaptions: z.boolean().optional(),
  }),
  shortMediaRequirements: shortMediaRequirementsSchema.optional(),
  cleanPath: z.string().min(1),
  captionedPath: z.string().min(1).optional(),
  validation: z.object({
    valid: z.boolean(),
    width: z.number(),
    height: z.number(),
    durationSeconds: z.number(),
    videoCodec: z.string(),
    audioCodec: z.string(),
    pixelFormat: z.string(),
    issues: z.array(z.string()),
  }),
  status: z.literal("generated"),
  generatedAt: z.string().min(1),
});

function defaultRenderContext(request: VideoRenderRequest): MediaStageContext {
  const variant: MediaStageVariant =
    request.renderProfile.aspectRatio === "9:16" ? "short" : "full";
  const fingerprint = hashText(
    `${request.scenePlan.sourceId}:narration:${variant}:en:en-US`
  );
  return {
    identity: mediaStageIdentitySchema.parse({
      episodeId: request.scenePlan.sourceId,
      language: "en",
      locale: "en-US",
      variant,
      owner: "render",
    }),
    narration: buildMediaStageDependency({
      owner: "narration",
      episodeId: request.scenePlan.sourceId,
      language: "en",
      locale: "en-US",
      variant,
      fingerprint,
      status: "ready",
    }),
  };
}

function resolveRenderContext(
  request: VideoRenderRequest
): NonNullable<VideoRenderRequest["mediaContext"]> {
  return request.mediaContext ?? defaultRenderContext(request);
}

function validateVariantSpecificRenderRequest(
  request: VideoRenderRequest,
  context: NonNullable<VideoRenderRequest["mediaContext"]>
): void {
  const expectedVariant =
    request.renderProfile.aspectRatio === "9:16" ? "short" : "full";
  if (context.identity.variant !== expectedVariant) {
    throw new MediaValidationError(
      `Render profile ${request.renderProfile.id} requires ${expectedVariant} media inputs, received ${context.identity.variant}.`
    );
  }
  if (context.identity.variant === "short") {
    if (request.renderProfile.width >= request.renderProfile.height) {
      throw new MediaValidationError(
        "Short render profile must be portrait 9:16."
      );
    }
    if (
      context.shortMediaRequirements &&
      context.shortMediaRequirements.aspectRatio !== "9:16"
    ) {
      throw new MediaValidationError(
        "Short media requirements must preserve a 9:16 aspect ratio."
      );
    }
  }
}

function buildSceneClipManifest(
  request: {
    readonly sceneId: string;
    readonly sceneHash: string;
    readonly imageSha256: string;
    readonly audioSha256: string;
    readonly captionsSha256?: string;
    readonly renderProfile: SceneClipManifest["renderProfile"];
    readonly trailingSilenceRatio: number;
    readonly trailingSilenceBufferSeconds: number;
    readonly renderFingerprint?: string;
  },
  outputSha256: string,
  renderer?: "local" | "remote"
): SceneClipManifest {
  return {
    schemaVersion: 2,
    sceneId: request.sceneId,
    sceneHash: request.sceneHash,
    imageSha256: request.imageSha256,
    audioSha256: request.audioSha256,
    ...(request.captionsSha256
      ? { captionsSha256: request.captionsSha256 }
      : {}),
    renderProfile: request.renderProfile,
    trailingSilenceRatio: request.trailingSilenceRatio,
    trailingSilenceBufferSeconds: request.trailingSilenceBufferSeconds,
    ...(request.renderFingerprint
      ? { renderFingerprint: request.renderFingerprint }
      : {}),
    ...(renderer ? { renderer } : {}),
    outputSha256,
    generatedAt: new Date().toISOString(),
  };
}

async function writeSceneClipManifest(
  manifestPath: string,
  manifest: SceneClipManifest
): Promise<void> {
  await writeJsonAtomic(manifestPath, manifest);
}

async function writeSceneClipManifestFromRequest(
  request: ClipRenderRequest,
  outputSha256: string,
  renderer?: "local" | "remote"
): Promise<void> {
  if (!request.sceneManifest) {
    return;
  }
  await writeSceneClipManifest(
    request.sceneManifest.manifestPath,
    buildSceneClipManifest(
      {
        sceneId: request.clipId,
        sceneHash: request.sceneManifest.sceneHash,
        imageSha256: request.sceneManifest.imageSha256,
        audioSha256: request.sceneManifest.audioSha256,
        ...(request.sceneManifest.captionsSha256
          ? { captionsSha256: request.sceneManifest.captionsSha256 }
          : {}),
        renderProfile: request.sceneManifest.renderProfile,
        trailingSilenceRatio: request.sceneManifest.trailingSilenceRatio,
        trailingSilenceBufferSeconds:
          request.sceneManifest.trailingSilenceBufferSeconds,
        renderFingerprint: request.sceneManifest.renderFingerprint,
      },
      outputSha256,
      renderer
    )
  );
}

export interface BackfillSceneClipManifestsRequest {
  readonly episodeDir: string;
  readonly scenePlan: ScenePlan;
  readonly outputDir: string;
  readonly renderProfile: RenderProfile;
  readonly captionBurnIn: boolean;
  readonly clipsDirName?: string;
  readonly sceneAudioDir?: string;
  readonly imageDir?: string;
  readonly trailingSilenceRatio?: number;
  readonly trailingSilenceBufferSeconds?: number;
}

export interface BackfillSceneClipManifestsResult {
  readonly clipsDir: string;
  readonly written: number;
  readonly skipped: number;
}

function scenePlanDurationSeconds(scenePlan: ScenePlan): number {
  return scenePlan.scenes.reduce(
    (maxDuration, scene) => Math.max(maxDuration, scene.timing.endSeconds),
    0
  );
}

export interface RenderValidation {
  readonly valid: boolean;
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly pixelFormat: string;
  readonly issues: string[];
}

export interface VideoRenderer {
  render(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<VideoRenderResult>;
  renderSceneClips(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<SceneClipRenderResult>;
}

export async function backfillSceneClipManifests(
  request: BackfillSceneClipManifestsRequest
): Promise<BackfillSceneClipManifestsResult> {
  await ensureDir(request.outputDir);
  const clipsDir = path.join(
    request.outputDir,
    request.clipsDirName ?? "clips"
  );
  await ensureDir(clipsDir);
  const imageDir =
    request.imageDir ?? path.join(request.episodeDir, "images", "generated");
  const audioDir =
    request.sceneAudioDir ?? path.join(request.episodeDir, "audio", "segments");
  const sortedScenePlan = stableSortScenes(request.scenePlan);
  let written = 0;
  let skipped = 0;
  for (const [index, scene] of sortedScenePlan.scenes.entries()) {
    const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
    const manifestPath = path.join(clipsDir, `${scene.id}.json`);
    if (!(await fileExists(clipPath))) {
      skipped += 1;
      continue;
    }
    const imagePath = await resolveSceneImagePath(
      request.episodeDir,
      sortedScenePlan,
      index,
      imageDir
    );
    const audioPath = await resolveSceneAudioPath(
      request.episodeDir,
      sortedScenePlan,
      index,
      audioDir
    );
    const currentSceneHash = sceneHash(scene);
    const currentImageSha256 = await hashFile(imagePath).catch(() => "");
    const currentAudioSha256 = await hashFile(audioPath).catch(() => "");
    const clipRequest = await buildSceneClipRenderRequest({
      episodeId: sortedScenePlan.sourceId,
      clipId: scene.id,
      sequenceNumber: scene.sequenceNumber,
      imagePath,
      audioPath,
      sceneHash: currentSceneHash,
      imageSha256: currentImageSha256,
      audioSha256: currentAudioSha256,
      manifestPath,
      outputPath: clipPath,
      fps: request.renderProfile.fps,
      width: request.renderProfile.width,
      height: request.renderProfile.height,
      minimumDurationSeconds: Math.max(
        0.1,
        scene.timing.endSeconds - scene.timing.startSeconds
      ),
      trailingSilenceRatio: request.trailingSilenceRatio ?? 0.8,
      trailingSilenceBufferSeconds: request.trailingSilenceBufferSeconds ?? 0,
    });
    const existingManifest = await loadSceneClipManifest(manifestPath);
    if (
      existingManifest &&
      existingManifest.sceneHash === currentSceneHash &&
      existingManifest.imageSha256 === currentImageSha256 &&
      existingManifest.audioSha256 === currentAudioSha256 &&
      ((existingManifest.renderFingerprint !== undefined &&
        existingManifest.renderFingerprint === clipRequest.renderFingerprint) ||
        (existingManifest.renderFingerprint === undefined &&
          existingManifest.renderProfile.aspectRatio ===
            clipRequest.sceneManifest?.renderProfile.aspectRatio &&
          existingManifest.renderProfile.width ===
            clipRequest.sceneManifest?.renderProfile.width &&
          existingManifest.renderProfile.height ===
            clipRequest.sceneManifest?.renderProfile.height &&
          existingManifest.renderProfile.fps ===
            clipRequest.sceneManifest?.renderProfile.fps &&
          existingManifest.trailingSilenceRatio ===
            (request.trailingSilenceRatio ?? 0.8) &&
          existingManifest.trailingSilenceBufferSeconds ===
            (request.trailingSilenceBufferSeconds ?? 0))) &&
      existingManifest.outputSha256 ===
        (await hashFile(clipPath).catch(() => ""))
    ) {
      skipped += 1;
      continue;
    }
    const validation = await validateRenderOutput(clipPath, {
      ...(clipRequest.expectedDurationSeconds !== undefined
        ? { expectedDurationSeconds: clipRequest.expectedDurationSeconds }
        : {}),
      ...(clipRequest.expectedWidth !== undefined
        ? { expectedWidth: clipRequest.expectedWidth }
        : {}),
      ...(clipRequest.expectedHeight !== undefined
        ? { expectedHeight: clipRequest.expectedHeight }
        : {}),
    });
    if (!validation.valid) {
      throw new MediaValidationError(
        `Unable to backfill ${scene.id}: ${validation.issues.join("; ")}`
      );
    }
    await writeSceneClipManifestFromRequest(
      clipRequest,
      await hashFile(clipPath),
      existingManifest?.renderer
    );
    written += 1;
  }
  return {
    clipsDir,
    written,
    skipped,
  };
}

export interface ClipRenderRequest {
  readonly episodeId: string;
  readonly clipId: string;
  readonly sequenceNumber: number;
  readonly inputPaths: readonly string[];
  readonly outputPath: string;
  readonly ffmpegArguments: readonly string[];
  readonly expectedDurationSeconds?: number;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly sceneManifest?: {
    readonly manifestPath: string;
    readonly sceneHash: string;
    readonly imageSha256: string;
    readonly audioSha256: string;
    readonly captionsSha256?: string;
    readonly renderProfile: SceneClipManifest["renderProfile"];
    readonly trailingSilenceRatio: number;
    readonly trailingSilenceBufferSeconds: number;
    readonly renderFingerprint: string;
  };
}

export interface ClipRenderResult {
  readonly clipId: string;
  readonly sequenceNumber: number;
  readonly renderer: "local" | "remote";
  readonly outputPath: string;
  readonly durationMs: number;
  readonly attempts: number;
  readonly transferredBytes?: number;
  readonly fallbackUsed: boolean;
}

export interface ClipRenderer {
  readonly type: "local" | "remote";
  render(request: ClipRenderRequest): Promise<ClipRenderResult>;
}

export function assignClipRenderers(
  requests: readonly ClipRenderRequest[]
): Array<ClipRenderRequest & { readonly renderer: "local" | "remote" }> {
  return [...requests]
    .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
    .map((request, index) => ({
      ...request,
      renderer: index % 2 === 0 ? ("local" as const) : ("remote" as const),
    }));
}

export interface RenderOutputValidationOptions {
  readonly expectedDurationSeconds?: number;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly durationToleranceSeconds?: number;
}

interface ProbeMediaResult {
  readonly valid: boolean;
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly pixelFormat: string;
  readonly issues: string[];
}

function isUnsafePath(pathValue: string): boolean {
  return pathValue.trim().length === 0 || pathValue.includes("\u0000");
}

function quoteForPathMap(value: string): string {
  return value.replace(/\\/gu, "\\\\");
}

function stableSortScenes(scenePlan: ScenePlan): ScenePlan {
  return scenePlanSchema.parse({
    sourceId: scenePlan.sourceId,
    scenes: [...scenePlan.scenes].sort(
      (left, right) => left.sequenceNumber - right.sequenceNumber
    ),
  });
}

function safeClipFilename(clipId: string, extension: string): string {
  if (!/^scene-[0-9]{3}$/u.test(clipId)) {
    throw new MediaValidationError(`Unsafe clip ID: ${clipId}`);
  }
  return `${clipId}${extension}`;
}

function buildRenderFingerprint(
  request: ClipRenderRequest,
  extra: Record<string, unknown>
): string {
  return hashText(
    JSON.stringify({
      episodeId: request.episodeId,
      clipId: request.clipId,
      sequenceNumber: request.sequenceNumber,
      inputPaths: [...request.inputPaths].map((value) => path.resolve(value)),
      ffmpegArguments: [...request.ffmpegArguments],
      expectedDurationSeconds: request.expectedDurationSeconds ?? null,
      expectedWidth: request.expectedWidth ?? null,
      expectedHeight: request.expectedHeight ?? null,
      ...extra,
    })
  );
}

function mapCommandPaths(
  args: readonly string[],
  pathMap: ReadonlyMap<string, string>
): string[] {
  const ordered = [...pathMap.entries()].sort(
    (left, right) => right[0].length - left[0].length
  );
  return args.map((argument) => {
    let next = argument;
    for (const [from, to] of ordered) {
      if (next === from) {
        next = to;
        continue;
      }
      if (next.includes(from)) {
        next = next.split(from).join(to);
      }
    }
    return next;
  });
}

async function spawnWithResult(
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: ProcessEnv;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            child.kill("SIGKILL");
            reject(
              new ProcessExecutionError(`Command timed out: ${executable}`)
            );
          }, options.timeoutMs)
        : null;
    const abortHandler = (): void => {
      child.kill("SIGKILL");
      reject(new ProcessExecutionError(`Command aborted: ${executable}`));
    };
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener("abort", abortHandler);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener("abort", abortHandler);
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });
  });
}

function spawnBackgroundProcess(
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: ProcessEnv;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
  } = {}
): SpawnedBackgroundProcess {
  const child = spawn(executable, [...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const promise = new Promise<SpawnedProcessResult>((resolve, reject) => {
    const timeout =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            child.kill("SIGKILL");
            reject(
              new ProcessExecutionError(`Command timed out: ${executable}`)
            );
          }, options.timeoutMs)
        : null;
    const abortHandler = (): void => {
      child.kill("SIGKILL");
      reject(new ProcessExecutionError(`Command aborted: ${executable}`));
    };
    const cleanup = (): void => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener("abort", abortHandler);
    };
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      cleanup();
      reject(
        new ProcessExecutionError(
          `Failed to start ${executable}: ${(error as Error).message}`
        )
      );
    });
    child.on("close", (exitCode) => {
      cleanup();
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });
  });
  return { child, promise };
}

function toPositiveFiniteNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

async function promisePool<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<Array<TOutput | undefined>> {
  const results: Array<TOutput | undefined> = Array.from(
    { length: items.length },
    () => undefined
  );
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current] as TInput, current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function validateRenderOutput(
  filePath: string,
  options: RenderOutputValidationOptions = {}
): Promise<RenderValidation> {
  const validation = await probeMedia(filePath);
  const issues = [...validation.issues];
  if (options.expectedWidth && validation.width !== options.expectedWidth) {
    issues.push(
      `Unexpected width ${validation.width}; expected ${options.expectedWidth}.`
    );
  }
  if (options.expectedHeight && validation.height !== options.expectedHeight) {
    issues.push(
      `Unexpected height ${validation.height}; expected ${options.expectedHeight}.`
    );
  }
  const expectedDuration = toPositiveFiniteNumber(
    options.expectedDurationSeconds
  );
  if (expectedDuration !== undefined) {
    const tolerance = options.durationToleranceSeconds ?? 0.5;
    if (Math.abs(validation.durationSeconds - expectedDuration) > tolerance) {
      issues.push(
        `Unexpected duration ${validation.durationSeconds.toFixed(3)}s; expected about ${expectedDuration.toFixed(3)}s.`
      );
    }
  }
  return {
    ...validation,
    valid: issues.length === 0,
    issues,
  };
}

async function probeMedia(filePath: string): Promise<RenderValidation> {
  const probe = await runCommandJson(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      filePath,
    ],
    { timeoutMs: 30000 },
    (value: unknown) =>
      value as {
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          duration?: string;
          sample_rate?: string;
          pix_fmt?: string;
        }>;
        format?: { duration?: string };
      }
  );
  const video = probe.streams?.find(
    (stream: { codec_type?: string }) => stream.codec_type === "video"
  );
  const audio = probe.streams?.find(
    (stream: { codec_type?: string }) => stream.codec_type === "audio"
  );
  const duration = Number.parseFloat(
    probe.format?.duration ?? video?.duration ?? "0"
  );
  const issues: string[] = [];
  if (!video) {
    issues.push("Missing video stream.");
  }
  if (!audio) {
    issues.push("Missing audio stream.");
  }
  return {
    valid: issues.length === 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    durationSeconds: duration,
    videoCodec: video?.codec_name ?? "",
    audioCodec: audio?.codec_name ?? "",
    pixelFormat: video?.pix_fmt ?? "",
    issues,
  };
}

async function isReusableSceneClip(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats || stats.size < 1024) {
    return false;
  }
  const probe = await probeMedia(filePath).catch(() => null);
  return Boolean(probe?.valid);
}

function sceneHash(scene: ScenePlan["scenes"][number]): string {
  return hashText(
    JSON.stringify({
      id: scene.id,
      sequenceNumber: scene.sequenceNumber,
      canonicalNarration: scene.canonicalNarration,
      sourceSegmentIds: scene.sourceSegmentIds,
      timing: scene.timing,
      expectedImageFilenames: scene.expectedImageFilenames,
      visualPurpose: scene.visualPurpose,
    })
  );
}

function parseSceneImageFilename(
  filename: string
): {
  readonly sceneId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly aspectRatio: string;
} | null {
  const match = /^(.+?)__(\d{6})-(\d{6})__([0-9]+:[0-9]+)\.png$/u.exec(filename);
  if (!match) {
    return null;
  }
  const startSeconds = Number.parseInt(match[2] ?? "", 10);
  const endSeconds = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return null;
  }
  return {
    sceneId: match[1] ?? "",
    startSeconds,
    endSeconds,
    aspectRatio: match[4] ?? "",
  };
}

function scoreSceneImageFilenameMatch(
  expectedFilename: string,
  candidateFilename: string
): number | null {
  const expected = parseSceneImageFilename(expectedFilename);
  const candidate = parseSceneImageFilename(candidateFilename);
  if (
    !expected ||
    !candidate ||
    expected.sceneId !== candidate.sceneId ||
    expected.aspectRatio !== candidate.aspectRatio
  ) {
    return null;
  }
  return (
    Math.abs(candidate.startSeconds - expected.startSeconds) * 1000 +
    Math.abs(candidate.endSeconds - expected.endSeconds)
  );
}

async function loadSceneClipManifest(
  manifestPath: string
): Promise<SceneClipManifest | null> {
  if (!(await fileExists(manifestPath))) {
    return null;
  }
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Partial<SceneClipManifest>;
  if (
    value.schemaVersion !== 2 ||
    typeof value.sceneId !== "string" ||
    typeof value.sceneHash !== "string" ||
    typeof value.imageSha256 !== "string" ||
    typeof value.audioSha256 !== "string" ||
    typeof value.outputSha256 !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.trailingSilenceRatio !== "number" ||
    typeof value.trailingSilenceBufferSeconds !== "number" ||
    !value.renderProfile ||
    typeof value.renderProfile.aspectRatio !== "string" ||
    typeof value.renderProfile.width !== "number" ||
    typeof value.renderProfile.height !== "number" ||
    typeof value.renderProfile.fps !== "number"
  ) {
    return null;
  }
  return value as SceneClipManifest;
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  const probe = await runCommandJson(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", filePath],
    { timeoutMs: 30000 },
    (value: unknown) => value as { format?: { duration?: string } }
  );
  const duration = Number.parseFloat(probe.format?.duration ?? "0");
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaValidationError(
      `Unable to inspect duration for ${filePath}.`
    );
  }
  return duration;
}

async function detectTrailingSilenceSeconds(filePath: string): Promise<number> {
  const result = await runCommand(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-af",
      "silencedetect=n=-40dB:d=0.25",
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 120000 }
  );
  const matches = [
    ...result.stderr.matchAll(/silence_start:\s*([0-9]+(?:\.[0-9]+)?)/gu),
  ];
  if (matches.length === 0) {
    return 0;
  }
  const lastMatch = matches[matches.length - 1];
  const silenceStart = Number.parseFloat(lastMatch?.[1] ?? "0");
  if (!Number.isFinite(silenceStart) || silenceStart < 0) {
    return 0;
  }
  const duration = await probeDurationSeconds(filePath);
  return Math.max(0, duration - silenceStart);
}

async function calculateClipDurationSeconds(
  filePath: string,
  trailingSilenceRatio: number,
  trailingSilenceBufferSeconds: number
): Promise<number> {
  const duration = await probeDurationSeconds(filePath);
  if (trailingSilenceRatio >= 1) {
    return duration;
  }
  const trailingSilence = await detectTrailingSilenceSeconds(filePath);
  if (trailingSilence <= 0) {
    return duration;
  }
  const preservedSilence = trailingSilence * Math.max(0, trailingSilenceRatio);
  const trimmedDuration =
    duration -
    trailingSilence +
    preservedSilence +
    Math.max(0, trailingSilenceBufferSeconds);
  return Math.max(0.1, Math.min(duration, trimmedDuration));
}

function buildSceneClipFilterGraph(
  width: number,
  height: number,
  captionsPath?: string
): string {
  const scaleFilter =
    width < height
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
  return captionsPath
    ? `subtitles=${captionsPath.replace(/:/g, "\\:")},${scaleFilter}`
    : scaleFilter;
}

export async function buildSceneClipRenderRequest(request: {
  readonly episodeId: string;
  readonly clipId: string;
  readonly sequenceNumber: number;
  readonly imagePath: string;
  readonly audioPath: string;
  readonly sceneHash?: string;
  readonly imageSha256?: string;
  readonly audioSha256?: string;
  readonly manifestPath?: string;
  readonly captionsSha256?: string;
  readonly outputPath: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly minimumDurationSeconds: number;
  readonly captionsPath?: string;
  readonly trailingSilenceRatio?: number;
  readonly trailingSilenceBufferSeconds?: number;
}): Promise<ClipRenderRequest & { readonly renderFingerprint: string }> {
  const clipDurationSeconds = await calculateClipDurationSeconds(
    request.audioPath,
    request.trailingSilenceRatio ?? 0.8,
    request.trailingSilenceBufferSeconds ?? 0
  );
  const framePaddingSeconds = 1 / request.fps;
  const targetDurationSeconds = Math.max(
    request.minimumDurationSeconds,
    clipDurationSeconds
  ) + framePaddingSeconds;
  const ffmpegArguments = [
    "-y",
    "-loop",
    "1",
    "-i",
    request.imagePath,
    "-i",
    request.audioPath,
    "-vf",
    buildSceneClipFilterGraph(
      request.width,
      request.height,
      request.captionsPath
    ),
    "-t",
    String(targetDurationSeconds),
    "-r",
    String(request.fps),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    request.outputPath,
  ];
  const renderFingerprint = buildRenderFingerprint(
    {
      episodeId: request.episodeId,
      clipId: request.clipId,
      sequenceNumber: request.sequenceNumber,
      inputPaths: [
        request.imagePath,
        request.audioPath,
        ...(request.captionsPath ? [request.captionsPath] : []),
      ],
      outputPath: request.outputPath,
      ffmpegArguments,
      expectedDurationSeconds: targetDurationSeconds,
      expectedWidth: request.width,
      expectedHeight: request.height,
    },
    {
      fps: request.fps,
      width: request.width,
      height: request.height,
      captionsPath: request.captionsPath ?? null,
      trailingSilenceRatio: request.trailingSilenceRatio ?? 0.8,
      trailingSilenceBufferSeconds: request.trailingSilenceBufferSeconds ?? 0,
    }
  );
  return {
    episodeId: request.episodeId,
    clipId: request.clipId,
    sequenceNumber: request.sequenceNumber,
    inputPaths: [
      request.imagePath,
      request.audioPath,
      ...(request.captionsPath ? [request.captionsPath] : []),
    ],
    outputPath: request.outputPath,
    ffmpegArguments,
    expectedDurationSeconds: targetDurationSeconds,
    expectedWidth: request.width,
    expectedHeight: request.height,
    renderFingerprint,
    ...(request.sceneHash &&
    request.imageSha256 &&
    request.audioSha256 &&
    request.manifestPath
      ? {
          sceneManifest: {
            manifestPath: request.manifestPath,
            sceneHash: request.sceneHash,
            imageSha256: request.imageSha256,
            audioSha256: request.audioSha256,
            ...(request.captionsSha256
              ? { captionsSha256: request.captionsSha256 }
              : {}),
            renderProfile: {
              aspectRatio: request.width < request.height ? "9:16" : "16:9",
              width: request.width,
              height: request.height,
              fps: request.fps,
            },
            trailingSilenceRatio: request.trailingSilenceRatio ?? 0.8,
            trailingSilenceBufferSeconds:
              request.trailingSilenceBufferSeconds ?? 0,
            renderFingerprint,
          },
        }
      : {}),
  };
}

async function renderSceneClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  fps: number,
  width: number,
  height: number,
  minimumDurationSeconds: number,
  captionsPath?: string,
  trailingSilenceRatio = 0.8,
  trailingSilenceBufferSeconds = 0
): Promise<void> {
  const request = await buildSceneClipRenderRequest({
    episodeId: "episode",
    clipId: path.basename(outputPath, path.extname(outputPath)),
    sequenceNumber: 0,
    imagePath,
    audioPath,
    outputPath,
    fps,
    width,
    height,
    minimumDurationSeconds,
    ...(captionsPath ? { captionsPath } : {}),
    trailingSilenceRatio,
    trailingSilenceBufferSeconds,
  });
  await runCommand("ffmpeg", request.ffmpegArguments, { timeoutMs: 600000 });
}

export class LocalClipRenderer implements ClipRenderer {
  public readonly type = "local" as const;

  public async render(request: ClipRenderRequest): Promise<ClipRenderResult> {
    const startedAt = Date.now();
    await runCommand("ffmpeg", request.ffmpegArguments, { timeoutMs: 600000 });
    const validation = await validateRenderOutput(request.outputPath, {
      ...(request.expectedDurationSeconds !== undefined
        ? { expectedDurationSeconds: request.expectedDurationSeconds }
        : {}),
      ...(request.expectedWidth !== undefined
        ? { expectedWidth: request.expectedWidth }
        : {}),
      ...(request.expectedHeight !== undefined
        ? { expectedHeight: request.expectedHeight }
        : {}),
    });
    if (!validation.valid) {
      throw new MediaValidationError(
        `Rendered clip ${request.clipId} failed validation: ${validation.issues.join("; ")}`
      );
    }
    const outputSha256 = await hashFile(request.outputPath);
    await writeSceneClipManifestFromRequest(request, outputSha256, "local");
    return {
      clipId: request.clipId,
      sequenceNumber: request.sequenceNumber,
      renderer: "local",
      outputPath: request.outputPath,
      durationMs: Date.now() - startedAt,
      attempts: 1,
      fallbackUsed: false,
    };
  }
}

async function resolveSceneImagePath(
  episodeDir: string,
  scenePlan: ScenePlan,
  sceneIndex: number,
  imageDir: string
): Promise<string> {
  const scene = scenePlan.scenes[sceneIndex];
  if (!scene) {
    throw new MediaValidationError(`Missing scene at index ${sceneIndex}.`);
  }
  const expectedFilename = scene.expectedImageFilenames[0];
  const candidates = [
    expectedFilename ? path.join(imageDir, expectedFilename) : undefined,
    ...Object.values(
      resolveSceneImageCandidatePaths({
        episodeDir,
        sceneId: scene.id,
        ...(expectedFilename ? { expectedFilename } : {}),
      })
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  const directoryMatches = (await fs.readdir(imageDir).catch(() => [])).filter(
    (entry) => entry.startsWith(`${scene.id}__`) && entry.endsWith(".png")
  );
  if (directoryMatches.length === 1) {
    return path.join(imageDir, directoryMatches[0] ?? "");
  }
  if (directoryMatches.length > 1) {
    const rankedMatches = expectedFilename
      ? directoryMatches
          .map((entry) => ({
            entry,
            score: scoreSceneImageFilenameMatch(expectedFilename, entry),
          }))
          .filter(
            (
              item
            ): item is { readonly entry: string; readonly score: number } =>
              item.score !== null
          )
          .sort((left, right) => {
            if (left.score !== right.score) {
              return left.score - right.score;
            }
            return left.entry.localeCompare(right.entry);
          })
      : [];
    if (rankedMatches.length > 0) {
      return path.join(imageDir, rankedMatches[0]?.entry ?? "");
    }
    throw new MediaValidationError(
      `Multiple image assets found for ${scene.id} in ${imageDir}: ${directoryMatches.join(", ")}`
    );
  }
  throw new MediaValidationError(
    `Missing image asset for ${scene.id} in ${episodeDir}.`
  );
}

async function resolveSceneAudioPath(
  episodeDir: string,
  scenePlan: ScenePlan,
  sceneIndex: number,
  audioDir: string
): Promise<string> {
  const scene = scenePlan.scenes[sceneIndex];
  if (!scene) {
    throw new MediaValidationError(`Missing scene at index ${sceneIndex}.`);
  }
  const candidates = [path.join(audioDir, `${scene.id}.wav`)];
  const segmentMatch = scene.id.match(/^scene-(\d{3})$/u);
  if (segmentMatch?.[1]) {
    candidates.push(path.join(audioDir, `segment-${segmentMatch[1]}.wav`));
  }
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  const narrationCandidates = [
    path.join(path.dirname(audioDir), "narration.wav"),
    path.join(path.dirname(audioDir), "narration-en.wav"),
  ];
  for (const candidate of narrationCandidates) {
    if (await fileExists(candidate)) {
      const targetPath =
        candidates[0] ?? path.join(audioDir, `${scene.id}.wav`);
      await ensureDir(path.dirname(targetPath));
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(scene.timing.startSeconds),
          "-t",
          String(
            Math.max(0.1, scene.timing.endSeconds - scene.timing.startSeconds)
          ),
          "-i",
          candidate,
          "-vn",
          "-acodec",
          "pcm_s16le",
          targetPath,
        ],
        { timeoutMs: 600000 }
      );
      return targetPath;
    }
  }
  throw new MediaValidationError(
    `Missing scene audio for ${scene.id} in ${audioDir} and no narration source was found.`
  );
}

export interface RemoteRenderSettings {
  readonly enabled: boolean;
  readonly host: string;
  readonly user: string;
  readonly port: number;
  readonly baseDir: string;
  readonly concurrency: number;
  readonly connectTimeoutSeconds: number;
  readonly commandTimeoutSeconds: number;
  readonly maxRetries: number;
  readonly fallbackToLocal: boolean;
  readonly keepFiles: boolean;
  readonly verifyHostKey: boolean;
  readonly knownHostsFile?: string;
  readonly sshPrivateKey?: string;
  readonly uploadMethod: "rsync";
  readonly localRenderConcurrency?: number;
  readonly cleanupMaxAgeHours: number;
}

export interface RemoteBatchRenderResult {
  readonly results: ClipRenderResult[];
  readonly uploadedBytes: number;
  readonly downloadedBytes: number;
  readonly remoteWallTimeMs: number;
}

function sanitizeWorkspaceSegment(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/gu, "-")
      .replace(/-+/gu, "-")
      .replace(/^[-.]+|[-.]+$/gu, "")
      .slice(0, 48) || "run"
  );
}

function createRemoteRunId(episodeId: string): string {
  return `run-${sanitizeWorkspaceSegment(episodeId)}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export function remoteAssetFileName(contentHash: string): string {
  return contentHash;
}

export function remoteAssetRoot(baseDir: string): string {
  return path.posix.join(baseDir, "assets");
}

function remoteAssetManifestPath(baseDir: string): string {
  return path.posix.join(remoteAssetRoot(baseDir), "manifest.json");
}

export function remoteAssetRemotePath(
  baseDir: string,
  contentHash: string
): string {
  return path.posix.join(remoteAssetRoot(baseDir), remoteAssetFileName(contentHash));
}

async function ensureCachedAsset(
  localCacheDir: string,
  sourcePath: string,
  contentHash: string
): Promise<string> {
  const cachedPath = path.join(localCacheDir, remoteAssetFileName(contentHash));
  if (!(await fileExists(cachedPath))) {
    await copyAtomic(sourcePath, cachedPath);
  }
  return cachedPath;
}

function buildSshArgs(settings: RemoteRenderSettings): string[] {
  const args = [
    "-p",
    String(settings.port),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${settings.connectTimeoutSeconds}`,
    "-o",
    `StrictHostKeyChecking=${settings.verifyHostKey ? "yes" : "no"}`,
  ];
  if (settings.knownHostsFile) {
    args.push("-o", `UserKnownHostsFile=${settings.knownHostsFile}`);
  }
  if (settings.sshPrivateKey) {
    args.push("-i", settings.sshPrivateKey);
  }
  return args;
}

function buildRsyncArgs(
  settings: RemoteRenderSettings,
  sourcePath: string,
  targetPath: string
): string[] {
  return [
    "-a",
    "--partial",
    "--append-verify",
    "--no-compress",
    "-whole-file",
    "-e",
    ["ssh", ...buildSshArgs(settings)].join(" "),
    sourcePath,
    targetPath,
  ];
}

function remoteResultPathForClip(baseDir: string, clipId: string): string {
  return path.join(baseDir, "metadata", `${clipId}.json`);
}

class RemoteWorkspaceManager {
  public constructor(private readonly settings: RemoteRenderSettings) {}

  public createWorkspace(episodeId: string): {
    readonly runId: string;
    readonly localRoot: string;
    readonly remoteRoot: string;
    readonly inputDir: string;
    readonly outputDir: string;
    readonly logsDir: string;
    readonly metadataDir: string;
  } {
    const runId = createRemoteRunId(episodeId);
    const localRoot = path.join(os.tmpdir(), "mediaforge-remote", runId);
    const remoteRoot = path.posix.join(this.settings.baseDir, "jobs", runId);
    return {
      runId,
      localRoot,
      remoteRoot,
      inputDir: path.join(localRoot, "input"),
      outputDir: path.join(localRoot, "output"),
      logsDir: path.join(localRoot, "logs"),
      metadataDir: path.join(localRoot, "metadata"),
    };
  }

  public remoteAssetPath(baseDir: string, contentHash: string): string {
    return remoteAssetRemotePath(baseDir, contentHash);
  }

  public remotePath(remoteRoot: string, ...segments: string[]): string {
    return path.posix.join(
      remoteRoot,
      ...segments.map((segment) => segment.replace(/\\/gu, "/"))
    );
  }
}

class RemoteClipRenderer implements ClipRenderer {
  public readonly type = "remote" as const;

  public constructor(
    private readonly settings: RemoteRenderSettings,
    private readonly localRenderer: LocalClipRenderer,
    private readonly workspaceManager = new RemoteWorkspaceManager(settings)
  ) {}

  public async render(request: ClipRenderRequest): Promise<ClipRenderResult> {
    const [result] = await this.renderBatch([request]);
    if (!result) {
      throw new MediaValidationError(
        `Remote render produced no result for ${request.clipId}.`
      );
    }
    return result;
  }

  public async renderBatch(
    requests: readonly ClipRenderRequest[]
  ): Promise<ClipRenderResult[]> {
    if (!this.settings.enabled) {
      return Promise.all(
        requests.map((request) => this.localRenderer.render(request))
      );
    }
    if (requests.length === 0) {
      return [];
    }
    await spawnWithResult("rsync", ["--version"], {}).catch(() => {
      throw new ProcessExecutionError(
        "rsync is required for remote rendering."
      );
    });
    const workspace = this.workspaceManager.createWorkspace(
      requests[0]?.episodeId ?? "episode"
    );
    await fs
      .rm(workspace.localRoot, { recursive: true, force: true })
      .catch(() => {});
    await ensureDir(workspace.inputDir);
    await ensureDir(workspace.outputDir);
    await ensureDir(workspace.logsDir);
    await ensureDir(workspace.metadataDir);
    const localAssetCacheDir = path.join(
      os.tmpdir(),
      "mediaforge-remote-assets"
    );
    await ensureDir(localAssetCacheDir);
    const inputPathMap = new Map<string, string>();
    const assetFiles = new Map<string, RemoteAssetRecord>();
    const seenContentHashes = new Set<string>();
    for (const request of requests) {
      for (const inputPath of request.inputPaths) {
        const resolved = path.resolve(inputPath);
        if (inputPathMap.has(resolved)) {
          continue;
        }
        const contentHash = await hashFile(resolved);
        const remotePath = this.workspaceManager.remoteAssetPath(
          this.settings.baseDir,
          contentHash
        );
        inputPathMap.set(resolved, remotePath);
        if (!seenContentHashes.has(contentHash)) {
          seenContentHashes.add(contentHash);
          const cachedPath = await ensureCachedAsset(
            localAssetCacheDir,
            resolved,
            contentHash
          );
          const sizeBytes = (await fs.stat(cachedPath)).size;
          assetFiles.set(contentHash, {
            localPath: cachedPath,
            sourcePath: resolved,
            contentHash,
            remotePath,
            sizeBytes,
          });
        }
      }
    }
    const bootstrapRelativePaths = [
      "metadata/job-manifest.json",
      "metadata/remote-render-worker.mjs",
    ];
    const remoteRequests = await Promise.all(
      requests.map(async (request) => {
        const mappedArgs = mapCommandPaths(
          request.ffmpegArguments,
          inputPathMap
        );
        const remoteOutputPath = this.workspaceManager.remotePath(
          workspace.remoteRoot,
          "output",
          path.basename(request.outputPath)
        );
        const remoteInputPaths = request.inputPaths.map((inputPath) => {
          const mapped = inputPathMap.get(path.resolve(inputPath));
          if (!mapped) {
            throw new ProcessExecutionError(
              `Missing remote input mapping for ${inputPath} in ${request.clipId}.`
            );
          }
          return mapped;
        });
        return {
          ...request,
          inputPaths: remoteInputPaths,
          outputPath: remoteOutputPath,
          ffmpegArguments: mapCommandPaths(
            mappedArgs,
            new Map([[request.outputPath, remoteOutputPath]])
          ),
          expectedDurationSeconds: request.expectedDurationSeconds,
          expectedWidth: request.expectedWidth,
          expectedHeight: request.expectedHeight,
        };
      })
    );
    const manifest = {
      schemaVersion: 1,
      runId: workspace.runId,
      episodeId: requests[0]?.episodeId ?? "episode",
      concurrency: this.settings.concurrency,
      jobs: remoteRequests.map((request) => ({
        clipId: request.clipId,
        sequenceNumber: request.sequenceNumber,
        inputPaths: request.inputPaths,
        outputPath: request.outputPath,
        metadataPath: remoteResultPathForClip(
          workspace.remoteRoot,
          request.clipId
        ),
        logPath: this.workspaceManager.remotePath(
          workspace.remoteRoot,
          "logs",
          `${request.clipId}.log`
        ),
        ffmpegArguments: request.ffmpegArguments,
        expectedDurationSeconds: request.expectedDurationSeconds,
        expectedWidth: request.expectedWidth,
        expectedHeight: request.expectedHeight,
      })),
      generatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(
      path.join(workspace.metadataDir, "job-manifest.json"),
      manifest
    );
    const workerSource = path.resolve("scripts", "remote-render-worker.mjs");
    await fs.copyFile(
      workerSource,
      path.join(workspace.metadataDir, "remote-render-worker.mjs")
    );
    await spawnWithResult("ssh", [
      ...buildSshArgs(this.settings),
      `${this.settings.user}@${this.settings.host}`,
      "mkdir",
      "-p",
      workspace.remoteRoot,
      remoteAssetRoot(this.settings.baseDir),
    ]);
    const remoteTarget = `${this.settings.user}@${this.settings.host}:${workspace.remoteRoot}/`;
    const bootstrapListPath = path.join(
      workspace.metadataDir,
      "bootstrap-files.txt"
    );
    await writeTextAtomic(bootstrapListPath, bootstrapRelativePaths.join("\n"));
    await spawnWithResult("rsync", [
      "-a",
      "--partial",
      "--append-verify",
      "-e",
      ["ssh", ...buildSshArgs(this.settings)].join(" "),
      "--files-from",
      bootstrapListPath,
      `${workspace.localRoot}/`,
      remoteTarget,
    ]);
    const assetListPath = path.join(workspace.metadataDir, "asset-files.txt");
    await writeTextAtomic(
      assetListPath,
      [...assetFiles.values()]
        .map((assetFile) =>
          path
            .relative(localAssetCacheDir, assetFile.localPath)
            .replace(/\\/gu, "/")
        )
        .join("\n")
    );
    const backgroundUpload = spawnBackgroundProcess("rsync", [
      "-a",
      "--partial",
      "--append-verify",
      "-e",
      ["ssh", ...buildSshArgs(this.settings)].join(" "),
      "--files-from",
      assetListPath,
      `${localAssetCacheDir}/`,
      `${this.settings.user}@${this.settings.host}:${remoteAssetRoot(this.settings.baseDir)}/`,
    ]);
    await writeJsonAtomic(
      path.join(workspace.metadataDir, "asset-manifest.json"),
      {
        schemaVersion: 1,
        remoteAssetRoot: remoteAssetRoot(this.settings.baseDir),
        remoteAssetManifestPath: remoteAssetManifestPath(this.settings.baseDir),
        assets: [...assetFiles.values()].map((assetFile) => ({
          sourcePath: assetFile.sourcePath,
          contentHash: assetFile.contentHash,
          remotePath: assetFile.remotePath,
          sizeBytes: assetFile.sizeBytes,
        })),
      }
    );
    const sshArgs = [
      ...buildSshArgs(this.settings),
      `${this.settings.user}@${this.settings.host}`,
      "node",
      path.posix.join(
        workspace.remoteRoot,
        "metadata",
        "remote-render-worker.mjs"
      ),
      path.posix.join(workspace.remoteRoot, "metadata", "job-manifest.json"),
    ];
    const startedAt = Date.now();
    const worker = spawnBackgroundProcess("ssh", sshArgs, {
      timeoutMs: Math.max(1, this.settings.commandTimeoutSeconds) * 1000,
    });
    const runResult = await worker.promise.catch((error: unknown) => {
      backgroundUpload.child.kill("SIGTERM");
      throw error;
    });
    if (runResult.exitCode !== 0) {
      backgroundUpload.child.kill("SIGTERM");
      throw new ProcessExecutionError(
        `Remote render worker exited with code ${runResult.exitCode}: ${runResult.stderr.slice(0, 400)}`
      );
    }
    const uploadResult = await backgroundUpload.promise.catch(
      (error: unknown) => {
        worker.child.kill("SIGTERM");
        throw error;
      }
    );
    if (uploadResult.exitCode !== 0) {
      throw new ProcessExecutionError(
        `Background remote upload exited with code ${uploadResult.exitCode}: ${uploadResult.stderr.slice(0, 400)}`
      );
    }
    await spawnWithResult("rsync", [
      "-a",
      "--partial",
      "--append-verify",
      "-e",
      ["ssh", ...buildSshArgs(this.settings)].join(" "),
      `${this.settings.user}@${this.settings.host}:${workspace.remoteRoot}/output/`,
      `${workspace.outputDir}/`,
    ]);
    await spawnWithResult("rsync", [
      "-a",
      "--partial",
      "--append-verify",
      "-e",
      ["ssh", ...buildSshArgs(this.settings)].join(" "),
      `${this.settings.user}@${this.settings.host}:${workspace.remoteRoot}/logs/`,
      `${workspace.logsDir}/`,
    ]);
    await spawnWithResult("rsync", [
      "-a",
      "--partial",
      "--append-verify",
      "-e",
      ["ssh", ...buildSshArgs(this.settings)].join(" "),
      `${this.settings.user}@${this.settings.host}:${workspace.remoteRoot}/metadata/`,
      `${workspace.metadataDir}/`,
    ]);
    const results: ClipRenderResult[] = [];
    for (const request of requests) {
      const localResultPath = path.join(
        workspace.metadataDir,
        `${request.clipId}.json`
      );
      if (!(await fileExists(localResultPath))) {
        const fallbackResult = await this.localRenderer.render(request);
        results.push({
          ...fallbackResult,
          renderer: "local",
          fallbackUsed: true,
        });
        continue;
      }
      const remoteResult = JSON.parse(
        await fs.readFile(localResultPath, "utf8")
      ) as {
        status?: string;
        outputPath?: string;
        outputSizeBytes?: number;
        durationMs?: number;
        attempt?: number;
        errorMessage?: string;
      };
      const localOutputPath = request.outputPath;
      const partialPath = `${localOutputPath}.partial`;
      if (remoteResult.status !== "succeeded") {
        if (!this.settings.fallbackToLocal) {
          throw new MediaValidationError(
            `Remote clip ${request.clipId} failed: ${remoteResult.errorMessage ?? "unknown error"}`
          );
        }
        const fallbackResult = await this.localRenderer.render(request);
        results.push({
          ...fallbackResult,
          renderer: "local",
          fallbackUsed: true,
        });
        continue;
      }
      await ensureDir(path.dirname(localOutputPath));
      await fs.copyFile(
        path.join(workspace.outputDir, path.basename(localOutputPath)),
        partialPath
      );
      const validation = await validateRenderOutput(partialPath, {
        ...(request.expectedDurationSeconds !== undefined
          ? { expectedDurationSeconds: request.expectedDurationSeconds }
          : {}),
        ...(request.expectedWidth !== undefined
          ? { expectedWidth: request.expectedWidth }
          : {}),
        ...(request.expectedHeight !== undefined
          ? { expectedHeight: request.expectedHeight }
          : {}),
      });
      if (!validation.valid) {
        if (!this.settings.fallbackToLocal) {
          throw new MediaValidationError(
            `Remote clip ${request.clipId} failed validation: ${validation.issues.join("; ")}`
          );
        }
        const fallbackResult = await this.localRenderer.render(request);
        results.push({
          ...fallbackResult,
          renderer: "local",
          fallbackUsed: true,
        });
        await fs.rm(partialPath, { force: true }).catch(() => {});
        continue;
      }
      await fs.rename(partialPath, localOutputPath);
      await writeSceneClipManifestFromRequest(
        request,
        await hashFile(localOutputPath),
        "remote"
      );
        results.push({
          clipId: request.clipId,
          sequenceNumber: request.sequenceNumber,
          renderer: "remote",
          outputPath: localOutputPath,
        durationMs:
          typeof remoteResult.durationMs === "number"
            ? remoteResult.durationMs
            : Date.now() - startedAt,
        attempts:
          typeof remoteResult.attempt === "number" ? remoteResult.attempt : 1,
        transferredBytes:
          [...assetFiles.values()].reduce((sum, file) => sum + file.sizeBytes, 0) +
          (await fs.stat(localOutputPath)).size,
        fallbackUsed: false,
      });
    }
    if (!this.settings.keepFiles) {
      await spawnWithResult("ssh", [
        ...buildSshArgs(this.settings),
        `${this.settings.user}@${this.settings.host}`,
        "rm",
        "-rf",
        workspace.remoteRoot,
      ]).catch(() => {});
    }
    return results;
  }
}

class HybridClipRenderScheduler {
  public constructor(
    private readonly localRenderer: LocalClipRenderer,
    private readonly remoteRenderer: RemoteClipRenderer | null,
    private readonly localConcurrency: number,
    private readonly remoteConcurrency: number
  ) {}

  public async render(
    requests: readonly ClipRenderRequest[]
  ): Promise<ClipRenderResult[]> {
    const sorted = assignClipRenderers(requests);
    if (!this.remoteRenderer) {
      const localResults = await promisePool(
        sorted,
        this.localConcurrency,
        async (request) =>
          this.localRenderer.render(request).catch(() => undefined)
      );
      return localResults.filter(
        (result): result is ClipRenderResult => result !== undefined
      );
    }
    const localJobs: ClipRenderRequest[] = [];
    const remoteJobs: ClipRenderRequest[] = [];
    for (const request of sorted) {
      if (request.renderer === "local") {
        localJobs.push(request);
      } else {
        remoteJobs.push(request);
      }
    }
    const localErrors: string[] = [];
    const remoteErrors: string[] = [];
    const remoteQueue = this.remoteRenderer
      .renderBatch(remoteJobs)
      .catch((error: unknown) => {
        remoteErrors.push(
          error instanceof Error ? error.message : String(error)
        );
        return [];
      });
    const localQueue = promisePool(
      localJobs,
      this.localConcurrency,
      async (request) =>
        this.localRenderer.render(request).catch((error: unknown) => {
          localErrors.push(
            error instanceof Error ? error.message : String(error)
          );
          return undefined;
        })
    );
    const [localResults, remoteResults] = await Promise.all([
      localQueue,
      remoteQueue,
    ]);
    if (localErrors.length > 0 || remoteErrors.length > 0) {
      throw new MediaValidationError(
        `Hybrid rendering failed: ${[...localErrors, ...remoteErrors].join("; ")}`
      );
    }
    return [
      ...localResults.filter(
        (result): result is ClipRenderResult => result !== undefined
      ),
      ...remoteResults,
    ].sort((left, right) => left.sequenceNumber - right.sequenceNumber);
  }
}

export class FFmpegVideoRenderer implements VideoRenderer {
  public async renderSceneClips(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<SceneClipRenderResult> {
    signal.throwIfAborted();
    await ensureDir(request.outputDir);
    const clipsDir = path.join(
      request.outputDir,
      request.clipsDirName ?? "clips"
    );
    await ensureDir(clipsDir);
    const imageDir =
      request.imageDir ?? path.join(request.episodeDir, "images", "generated");
    const audioDir =
      request.sceneAudioDir ??
      path.join(request.episodeDir, "audio", "segments");
    const clipPaths: string[] = Array.from(
      { length: request.scenePlan.scenes.length },
      () => ""
    );
    let nextIndex = 0;
    const takeIndex = (): number | null => {
      if (nextIndex >= request.scenePlan.scenes.length) {
        return null;
      }
      const current = nextIndex;
      nextIndex += 1;
      return current;
    };
    const workerCount = Math.min(2, request.scenePlan.scenes.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = takeIndex();
        if (index === null) {
          return;
        }
        const scene = request.scenePlan.scenes[index];
        if (!scene) {
          continue;
        }
        const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
        const imagePath = await resolveSceneImagePath(
          request.episodeDir,
          request.scenePlan,
          index,
          imageDir
        );
        const audioPath = await resolveSceneAudioPath(
          request.episodeDir,
          request.scenePlan,
          index,
          audioDir
        );
        const manifestPath = path.join(clipsDir, `${scene.id}.json`);
        const existingManifest = await loadSceneClipManifest(manifestPath);
        const currentSceneHash = sceneHash(scene);
        const currentImageSha256 = await hashFile(imagePath).catch(() => "");
        const currentAudioSha256 = await hashFile(audioPath).catch(() => "");
        const currentCaptionsSha256 =
          request.captionBurnIn && request.captionsPath
            ? await hashFile(request.captionsPath).catch(() => "")
            : undefined;
        const clipRequest = await buildSceneClipRenderRequest({
          episodeId: request.scenePlan.sourceId,
          clipId: scene.id,
          sequenceNumber: scene.sequenceNumber,
          imagePath,
          audioPath,
          sceneHash: currentSceneHash,
          imageSha256: currentImageSha256,
          audioSha256: currentAudioSha256,
          manifestPath,
          ...(currentCaptionsSha256
            ? { captionsSha256: currentCaptionsSha256 }
            : {}),
          outputPath: clipPath,
          fps: request.renderProfile.fps,
          width: request.renderProfile.width,
          height: request.renderProfile.height,
          minimumDurationSeconds: Math.max(
            0.1,
            scene.timing.endSeconds - scene.timing.startSeconds
          ),
          ...(request.captionBurnIn && request.captionsPath
            ? { captionsPath: request.captionsPath }
            : {}),
          trailingSilenceRatio: request.trailingSilenceRatio ?? 0.8,
          trailingSilenceBufferSeconds:
            request.trailingSilenceBufferSeconds ?? 0,
        });
        const clipIsReusable =
          existingManifest &&
          existingManifest.sceneId === scene.id &&
          existingManifest.sceneHash === currentSceneHash &&
          existingManifest.imageSha256 === currentImageSha256 &&
          existingManifest.audioSha256 === currentAudioSha256 &&
          (existingManifest.captionsSha256 ?? undefined) ===
            (currentCaptionsSha256 ?? undefined) &&
          ((existingManifest.renderFingerprint !== undefined &&
            existingManifest.renderFingerprint ===
              clipRequest.renderFingerprint) ||
            (existingManifest.renderFingerprint === undefined &&
              existingManifest.renderProfile.aspectRatio ===
                request.renderProfile.aspectRatio &&
              existingManifest.renderProfile.width ===
                request.renderProfile.width &&
              existingManifest.renderProfile.height ===
                request.renderProfile.height &&
              existingManifest.renderProfile.fps ===
                request.renderProfile.fps &&
              existingManifest.trailingSilenceRatio ===
                (request.trailingSilenceRatio ?? 0.8) &&
              existingManifest.trailingSilenceBufferSeconds ===
                (request.trailingSilenceBufferSeconds ?? 0))) &&
          (await isReusableSceneClip(clipPath)) &&
          (await hashFile(clipPath).catch(() => "")) ===
            existingManifest.outputSha256;
        if (clipIsReusable) {
          clipPaths[index] = clipPath;
          continue;
        }
        await runCommand("ffmpeg", clipRequest.ffmpegArguments, {
          timeoutMs: 600000,
        });
        const outputSha256 = await hashFile(clipPath);
        await writeSceneClipManifestFromRequest(
          clipRequest,
          outputSha256,
          "local"
        );
        clipPaths[index] = clipPath;
      }
    });
    await Promise.all(workers);
    return {
      clipsDir,
      clipPaths: clipPaths.filter((clipPath) => clipPath.length > 0),
    };
  }

  public async render(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<VideoRenderResult> {
    signal.throwIfAborted();
    const context = resolveRenderContext(request);
    validateVariantSpecificRenderRequest(request, context);
    const { clipPaths } = await this.renderSceneClips(request, signal);
    const concatListPath = path.join(request.outputDir, "concat.txt");
    await writeTextAtomic(
      concatListPath,
      clipPaths
        .map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`)
        .join("\n")
    );
    const suffix = request.outputSuffix ?? "";
    const baseName =
      request.outputBasename ??
      `youtube-${request.renderProfile.aspectRatio.replace(":", "x")}${suffix}`;
    const cleanPath = path.join(request.outputDir, `${baseName}-clean.mp4`);
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        cleanPath,
      ],
      {
        timeoutMs: 600000,
      }
    );
    let captionedPath: string | undefined;
    if (request.captionsPath && request.captionBurnIn) {
      captionedPath = path.join(request.outputDir, `${baseName}-captioned.mp4`);
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-i",
          cleanPath,
          "-vf",
          `subtitles=${request.captionsPath}`,
          "-c:v",
          "libx264",
          "-c:a",
          "copy",
          captionedPath,
        ],
        { timeoutMs: 600000 }
      );
    }
    const validation = await probeMedia(captionedPath ?? cleanPath);
    if (!validation.valid) {
      throw new MediaValidationError(
        `Rendered media failed validation: ${validation.issues.join("; ")}`
      );
    }
    const expectedDurationSeconds = scenePlanDurationSeconds(request.scenePlan);
    if (validation.durationSeconds + 0.25 < expectedDurationSeconds) {
      throw new MediaValidationError(
        `Rendered media is shorter than the planned scene duration. Expected at least ${expectedDurationSeconds.toFixed(3)}s but got ${validation.durationSeconds.toFixed(3)}s.`
      );
    }
    const renderFingerprint = hashText(
      JSON.stringify({
        variant: context.identity.variant,
        narrationFingerprint: context.narration.fingerprint,
        scenePlanFingerprint: context.scenePlanDependency?.fingerprint ?? null,
        imagePlanFingerprint: context.imagePlanDependency?.fingerprint ?? null,
        audioFingerprint: context.audioDependency?.fingerprint ?? null,
        subtitleFingerprint: context.subtitleDependency?.fingerprint ?? null,
        renderProfile: request.renderProfile,
        clipPaths,
        captionsPath: request.captionsPath ?? null,
      })
    );
    await writeJsonAtomic(
      path.join(request.outputDir, "render.json"),
      renderManifestSchema.parse({
        stageIdentity: {
          ...context.identity,
          owner: "render",
        },
        narrationDependency: context.narration,
        scenePlanDependency: context.scenePlanDependency,
        imagePlanDependency: context.imagePlanDependency,
        audioDependency: context.audioDependency,
        subtitleDependency: context.subtitleDependency,
        renderFingerprint,
        renderProfile: request.renderProfile,
        shortMediaRequirements: context.shortMediaRequirements,
        cleanPath,
        ...(captionedPath ? { captionedPath } : {}),
        validation,
        status: "generated",
        generatedAt: new Date().toISOString(),
      })
    );
    return captionedPath
      ? {
          cleanPath,
          captionedPath,
          validation,
        }
      : {
          cleanPath,
          validation,
        };
  }
}

export class HybridFFmpegVideoRenderer extends FFmpegVideoRenderer {
  private readonly localRenderer: LocalClipRenderer;
  private readonly remoteRenderer: RemoteClipRenderer | null;
  private readonly scheduler: HybridClipRenderScheduler;

  public constructor(private readonly remoteSettings: RemoteRenderSettings) {
    super();
    this.localRenderer = new LocalClipRenderer();
    this.remoteRenderer = remoteSettings.enabled
      ? new RemoteClipRenderer(remoteSettings, this.localRenderer)
      : null;
    this.scheduler = new HybridClipRenderScheduler(
      this.localRenderer,
      this.remoteRenderer,
      remoteSettings.localRenderConcurrency ?? remoteSettings.concurrency,
      remoteSettings.concurrency
    );
  }

  public override async renderSceneClips(
    request: VideoRenderRequest,
    signal: AbortSignal
  ): Promise<SceneClipRenderResult> {
    if (!this.remoteSettings.enabled) {
      return super.renderSceneClips(request, signal);
    }
    signal.throwIfAborted();
    await ensureDir(request.outputDir);
    const clipsDir = path.join(
      request.outputDir,
      request.clipsDirName ?? "clips"
    );
    await ensureDir(clipsDir);
    const imageDir =
      request.imageDir ?? path.join(request.episodeDir, "images", "generated");
    const audioDir =
      request.sceneAudioDir ??
      path.join(request.episodeDir, "audio", "segments");
    const sortedScenePlan = stableSortScenes(request.scenePlan);
    const scenes = sortedScenePlan.scenes;
    const clipPaths: string[] = Array.from({ length: scenes.length }, () => "");
    const jobs: ClipRenderRequest[] = [];
    const jobIndexByClipId = new Map<string, number>();
    for (const [index, scene] of scenes.entries()) {
      const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
      const imagePath = await resolveSceneImagePath(
        request.episodeDir,
        sortedScenePlan,
        index,
        imageDir
      );
      const audioPath = await resolveSceneAudioPath(
        request.episodeDir,
        sortedScenePlan,
        index,
        audioDir
      );
      const manifestPath = path.join(clipsDir, `${scene.id}.json`);
      const existingManifest = await loadSceneClipManifest(manifestPath);
      const currentSceneHash = sceneHash(scene);
      const currentImageSha256 = await hashFile(imagePath).catch(() => "");
      const currentAudioSha256 = await hashFile(audioPath).catch(() => "");
      const currentCaptionsSha256 =
        request.captionBurnIn && request.captionsPath
          ? await hashFile(request.captionsPath).catch(() => "")
          : undefined;
      const clipRequest = await buildSceneClipRenderRequest({
        episodeId: sortedScenePlan.sourceId,
        clipId: scene.id,
        sequenceNumber: scene.sequenceNumber,
        imagePath,
        audioPath,
        sceneHash: currentSceneHash,
        imageSha256: currentImageSha256,
        audioSha256: currentAudioSha256,
        manifestPath,
        ...(currentCaptionsSha256
          ? { captionsSha256: currentCaptionsSha256 }
          : {}),
        outputPath: clipPath,
        fps: request.renderProfile.fps,
        width: request.renderProfile.width,
        height: request.renderProfile.height,
        minimumDurationSeconds: Math.max(
          0.1,
          scene.timing.endSeconds - scene.timing.startSeconds
        ),
        trailingSilenceRatio: request.trailingSilenceRatio ?? 0.8,
        trailingSilenceBufferSeconds: request.trailingSilenceBufferSeconds ?? 0,
        ...(request.captionBurnIn && request.captionsPath
          ? { captionsPath: request.captionsPath }
          : {}),
      });
      const clipIsReusable =
        existingManifest &&
        existingManifest.sceneId === scene.id &&
        existingManifest.sceneHash === currentSceneHash &&
        existingManifest.imageSha256 === currentImageSha256 &&
        existingManifest.audioSha256 === currentAudioSha256 &&
        (existingManifest.captionsSha256 ?? undefined) ===
          (currentCaptionsSha256 ?? undefined) &&
        ((existingManifest.renderFingerprint !== undefined &&
          existingManifest.renderFingerprint ===
            clipRequest.renderFingerprint) ||
          (existingManifest.renderFingerprint === undefined &&
            existingManifest.renderProfile.aspectRatio ===
              request.renderProfile.aspectRatio &&
            existingManifest.renderProfile.width ===
              request.renderProfile.width &&
            existingManifest.renderProfile.height ===
              request.renderProfile.height &&
            existingManifest.renderProfile.fps === request.renderProfile.fps &&
            existingManifest.trailingSilenceRatio ===
              (request.trailingSilenceRatio ?? 0.8) &&
            existingManifest.trailingSilenceBufferSeconds ===
              (request.trailingSilenceBufferSeconds ?? 0))) &&
        (await isReusableSceneClip(clipPath)) &&
        (await hashFile(clipPath).catch(() => "")) ===
          existingManifest.outputSha256;
      if (clipIsReusable) {
        clipPaths[index] = clipPath;
        continue;
      }
      jobs.push(clipRequest);
      jobIndexByClipId.set(scene.id, index);
    }
    const results = await this.scheduler.render(jobs);
    for (const result of results) {
      const index = jobIndexByClipId.get(result.clipId);
      if (index === undefined) {
        continue;
      }
      clipPaths[index] = result.outputPath;
    }
    return {
      clipsDir,
      clipPaths: clipPaths.filter((clipPath) => clipPath.length > 0),
    };
  }
}

export async function validateRenderedVideo(
  filePath: string,
  options: RenderOutputValidationOptions = {}
): Promise<RenderValidation> {
  return validateRenderOutput(filePath, options);
}
