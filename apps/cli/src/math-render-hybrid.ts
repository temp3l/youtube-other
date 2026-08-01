import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { RuntimeConfig } from "@mediaforge/config";
import {
  bindMathPortableScene,
  bindMathSceneShardRequest,
  bindMathSceneShardResult,
  countSemanticRasterSamples,
  createMathRenderToolchainIdentity,
  defaultLocalMathWorkerCapability,
  estimateMathSceneCost,
  executeMathSceneSchedule,
  mathRenderWorkerResultRelativePaths,
  mathSceneShardRequestSchema,
  resolveMathJobPath,
  scheduleMathScenes,
  validateMathSceneFragmentFile,
  validateMathSceneShardRoundTrip,
  type MathFragmentMetadata,
  type MathSceneShardExecutionContext,
  type MathSceneShardExecutor,
  type MathSceneShardRequest,
  type MathSceneShardResult,
  type MathWorkerCapability,
} from "@mediaforge/math-rendering";
import {
  checkMathRemoteWorker,
  createMathRemoteJobId,
  downloadMathRemoteShard,
  launchMathRemoteShard,
  MathRemoteOperationError,
  parseMathRemoteSettings,
  promoteDownloadedMathFragment,
  readMathRemoteDeploymentReceipt,
  stageMathRemoteShard,
  systemMathRemoteProcessExecutor,
  uploadMathRemoteShard,
  validateDownloadedWorkerResult,
  type MathRemoteDeploymentReceipt,
  type MathRemoteProcessExecutor,
  type MathRemoteSettings,
} from "./math-render-remote.js";

export type MathRenderExecutorMode = "local" | "remote" | "hybrid";
export type MathSceneLaneFailureClass =
  | "ssh"
  | "transfer"
  | "timeout"
  | "capacity"
  | "worker-process"
  | "schema"
  | "containment"
  | "image-identity"
  | "request-identity"
  | "dependency-hash"
  | "result-hash";

const retryableFailureClasses = new Set<MathSceneLaneFailureClass>([
  "ssh",
  "transfer",
  "timeout",
  "capacity",
  "worker-process",
]);

export class MathSceneLaneError extends Error {
  readonly failureClass: MathSceneLaneFailureClass;

  constructor(failureClass: MathSceneLaneFailureClass, message: string) {
    super(message);
    this.name = "MathSceneLaneError";
    this.failureClass = failureClass;
  }
}

export function isRetryableMathSceneLaneFailure(error: unknown): boolean {
  return (
    error instanceof MathSceneLaneError &&
    retryableFailureClasses.has(error.failureClass)
  );
}

export function resolveMathRenderExecutorMode(
  explicit: MathRenderExecutorMode | undefined,
  configured: MathRenderExecutorMode | undefined
): MathRenderExecutorMode {
  return explicit ?? configured ?? "local";
}

export interface MathSceneLaneRunResult {
  readonly result: MathSceneShardResult;
  readonly transferBytes: number;
  readonly startupLatencyMs?: number;
  readonly transferDurationMs?: number;
  readonly remoteJobId?: string;
}

async function createMathRenderWorkingDirectory(
  workingRoot: string,
  prefix: string
): Promise<string> {
  await fs.mkdir(workingRoot, { recursive: true });
  return fs.mkdtemp(path.join(workingRoot, prefix));
}

interface MathSceneLaneExecutionContext extends MathSceneShardExecutionContext {
  readonly onRemoteJob?: (jobId: string) => void | Promise<void>;
}

export interface MathSceneLaneRunner {
  execute(
    request: MathSceneShardRequest,
    context: MathSceneLaneExecutionContext
  ): Promise<MathSceneLaneRunResult>;
}

export interface MathHybridSceneEvent {
  readonly jobRoot: string;
  readonly sceneId: string;
  readonly requestFingerprint: string;
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly assignmentId?: string;
  readonly lane?: "local" | "remote";
  readonly remoteJobId?: string;
  readonly attempt?: number;
  readonly reassigned?: boolean;
}

export interface MathHybridSceneExecutorOptions {
  readonly mode: "local-container" | Exclude<MathRenderExecutorMode, "local">;
  readonly imageId: string;
  readonly localCapability: MathWorkerCapability;
  readonly remoteCapability: MathWorkerCapability;
  readonly localRunner: MathSceneLaneRunner;
  readonly remoteRunner: MathSceneLaneRunner;
  readonly remoteMaxRetries: number;
  readonly reuse?: (
    request: MathSceneShardRequest,
    context: MathSceneShardExecutionContext
  ) => Promise<MathSceneShardResult | undefined>;
  readonly now?: () => number;
  readonly observer?: (event: MathHybridSceneEvent) => void | Promise<void>;
}

function emptyExecution(
  workerId: string,
  actualCostMs: number
): NonNullable<MathFragmentMetadata["execution"]> {
  return {
    workerId,
    predictedCostMs: 0,
    actualCostMs,
    queueWaitMs: 0,
    peakActiveWork: 1,
    phases: {
      svgGenerationMs: 0,
      rasterizationMs: 0,
      sceneEncodingMs: actualCostMs,
      validationMs: 0,
    },
    cache: {
      rasterHits: 0,
      rasterMisses: 0,
      videoHits: 0,
      videoMisses: 1,
    },
  };
}

function bindScheduledResult(input: {
  readonly request: MathSceneShardRequest;
  readonly result: MathSceneShardResult;
  readonly lane: "local" | "remote";
  readonly assignmentId: string;
  readonly predictedStartMs: number;
  readonly predictedFinishMs: number;
  readonly actualStartMs: number;
  readonly actualFinishMs: number;
  readonly attempts: number;
  readonly transferBytes: number;
  readonly fallback: boolean;
  readonly cacheStatus: "hit" | "miss";
}): MathSceneShardResult {
  const validated = validateMathSceneShardRoundTrip(
    input.request,
    input.result
  ).result;
  return bindMathSceneShardResult({
    artifactVersion: validated.artifactVersion,
    jobId: validated.jobId,
    planHash: validated.planHash,
    assignmentId: validated.assignmentId,
    requestHash: validated.requestHash,
    fragments: validated.fragments.map((fragment) => {
      const actualCostMs = Math.max(
        0,
        input.actualFinishMs - input.actualStartMs
      );
      const execution =
        fragment.execution ?? emptyExecution(input.lane, actualCostMs);
      return {
        ...fragment,
        execution: {
          ...execution,
          workerId: input.lane,
          predictedCostMs: Math.max(
            0,
            input.predictedFinishMs - input.predictedStartMs
          ),
          actualCostMs,
          scheduling: {
            lane: input.lane,
            assignmentId: input.assignmentId,
            predictedStartMs: input.predictedStartMs,
            predictedFinishMs: input.predictedFinishMs,
            actualStartMs: input.actualStartMs,
            actualFinishMs: input.actualFinishMs,
            attempts: input.attempts,
            ...(input.fallback ? { reassignedFrom: "remote" as const } : {}),
            transferBytes: input.transferBytes,
            fallbackStatus: input.fallback
              ? ("reassigned-local" as const)
              : ("none" as const),
            cacheStatus: input.cacheStatus,
          },
        },
      };
    }),
  });
}

function createBoundedRunner(
  slots: number,
  runner: MathSceneLaneRunner
): MathSceneLaneRunner {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < slots) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
  };
  const release = (): void => {
    active -= 1;
    waiting.shift()?.();
  };
  return {
    async execute(request, context) {
      await acquire();
      try {
        return await runner.execute(request, context);
      } finally {
        release();
      }
    },
  };
}

export function createHybridMathSceneShardExecutor(
  options: MathHybridSceneExecutorOptions
): MathSceneShardExecutor {
  const now = options.now ?? Date.now;
  const localRunner = createBoundedRunner(
    options.localCapability.cpuSlots,
    options.localRunner
  );
  const remoteRunner = createBoundedRunner(
    options.remoteCapability.cpuSlots,
    options.remoteRunner
  );

  const executeBatch = async (
    rawRequests: readonly MathSceneShardRequest[],
    context: MathSceneShardExecutionContext
  ): Promise<readonly MathSceneShardResult[]> => {
    const requests = rawRequests.map((request) =>
      mathSceneShardRequestSchema.parse(request)
    );
    if (
      requests.length === 0 ||
      new Set(requests.map((request) => request.scenes[0]?.sceneId)).size !==
        requests.length ||
      requests.some(
        (request) =>
          request.scenes.length !== 1 ||
          request.scenes[0]!.toolchain.workerImageId !== options.imageId
      )
    ) {
      throw new MathSceneLaneError(
        "request-identity",
        "Hybrid rendering requires unique single-scene requests with one immutable image."
      );
    }
    const batchStartedAt = now();
    const reused = new Map<string, MathSceneShardResult>();
    if (options.reuse) {
      for (const request of requests) {
        const result = await options.reuse(request, context);
        if (!result) continue;
        const elapsed = Math.max(0, now() - batchStartedAt);
        reused.set(
          request.scenes[0]!.sceneId,
          bindScheduledResult({
            request,
            result,
            lane: "local",
            assignmentId: `resume-${request.scenes[0]!.sceneId}`,
            predictedStartMs: 0,
            predictedFinishMs: 0,
            actualStartMs: elapsed,
            actualFinishMs: elapsed,
            attempts: 1,
            transferBytes: 0,
            fallback: false,
            cacheStatus: "hit",
          })
        );
      }
    }
    const pending = requests.filter(
      (request) => !reused.has(request.scenes[0]!.sceneId)
    );
    await Promise.all(
      requests.map(async (request) => {
        const sceneId = request.scenes[0]!.sceneId;
        await options.observer?.({
          jobRoot: context.jobRoot,
          sceneId,
          requestFingerprint: request.requestHash,
          status: reused.has(sceneId) ? "succeeded" : "queued",
          ...(reused.has(sceneId)
            ? {
                assignmentId: `resume-${sceneId}`,
                lane: "local" as const,
                attempt: 1,
              }
            : {}),
        });
      })
    );
    const workers =
      options.mode === "local-container"
        ? [options.localCapability]
        : options.mode === "remote"
          ? [options.remoteCapability]
          : [options.localCapability, options.remoteCapability];
    const scheduleInputs = await Promise.all(
      pending.map(async (request) => {
        const scene = request.scenes[0]!;
        const svg = await fs.readFile(
          resolveMathJobPath(context.jobRoot, scene.svgRelativePath),
          "utf8"
        );
        const sampleCount = countSemanticRasterSamples({
          svgMarkup: svg,
          sceneFrames: scene.expectedFrameCount,
          animation: scene.animation,
        });
        const transferBytes = Buffer.byteLength(svg);
        return {
          scene,
          costsByWorkerId: Object.fromEntries(
            workers.map((worker) => [
              worker.workerId,
              estimateMathSceneCost(
                {
                  rasterCacheMissCount: sampleCount,
                  semanticRasterSampleCount: sampleCount,
                  videoCacheMiss: true,
                  expectedEncodedFrames: scene.expectedFrameCount,
                  ...(worker.workerId === options.remoteCapability.workerId
                    ? { transferBytes }
                    : {}),
                },
                worker
              ),
            ])
          ),
        };
      })
    );
    const assignments = scheduleMathScenes(scheduleInputs, workers);
    const execution = await executeMathSceneSchedule({
      assignments,
      ...(context.signal ? { signal: context.signal } : {}),
      execute: async (assignment, signal) => {
        const request = pending.find(
          (candidate) =>
            candidate.scenes[0]!.sceneId === assignment.scene.sceneId
        )!;
        const predictedStartMs = assignment.predictedStartMs;
        const predictedFinishMs = assignment.predictedFinishMs;
        const actualStartMs = Math.max(0, now() - batchStartedAt);
        let attempts = 1;
        let lane: "local" | "remote" =
          assignment.workerId === options.remoteCapability.workerId
            ? "remote"
            : "local";
        let fallback = false;
        let laneResult: MathSceneLaneRunResult;
        await options.observer?.({
          jobRoot: context.jobRoot,
          sceneId: assignment.scene.sceneId,
          requestFingerprint: request.requestHash,
          status: "running",
          assignmentId: `${lane}-${assignment.scene.sceneId}-1`,
          lane,
          attempt: 1,
        });
        if (lane === "local") {
          laneResult = await localRunner.execute(request, {
            jobRoot: context.jobRoot,
            signal,
          });
        } else {
          let lastError: unknown;
          const maximumRemoteAttempts = options.remoteMaxRetries + 1;
          for (attempts = 1; attempts <= maximumRemoteAttempts; attempts += 1) {
            try {
              laneResult = await remoteRunner.execute(request, {
                jobRoot: context.jobRoot,
                signal,
                onRemoteJob: async (remoteJobId) => {
                  await options.observer?.({
                    jobRoot: context.jobRoot,
                    sceneId: assignment.scene.sceneId,
                    requestFingerprint: request.requestHash,
                    status: "running",
                    assignmentId: `remote-${assignment.scene.sceneId}-${attempts}`,
                    lane: "remote",
                    remoteJobId,
                    attempt: attempts,
                  });
                },
              });
              lastError = undefined;
              break;
            } catch (error) {
              lastError = error;
              if (!isRetryableMathSceneLaneFailure(error)) throw error;
            }
          }
          if (lastError !== undefined) {
            fallback = true;
            lane = "local";
            attempts = maximumRemoteAttempts + 1;
            await options.observer?.({
              jobRoot: context.jobRoot,
              sceneId: assignment.scene.sceneId,
              requestFingerprint: request.requestHash,
              status: "running",
              assignmentId: `local-${assignment.scene.sceneId}-${attempts}`,
              lane,
              attempt: attempts,
              reassigned: true,
            });
            laneResult = await localRunner.execute(request, {
              jobRoot: context.jobRoot,
              signal,
            });
          }
        }
        const actualFinishMs = Math.max(actualStartMs, now() - batchStartedAt);
        const scheduled = bindScheduledResult({
          request,
          result: laneResult!.result,
          lane,
          assignmentId: `${lane}-${assignment.scene.sceneId}-${attempts}`,
          predictedStartMs,
          predictedFinishMs,
          actualStartMs,
          actualFinishMs,
          attempts,
          transferBytes: laneResult!.transferBytes,
          fallback,
          cacheStatus: "miss",
        });
        await options.observer?.({
          jobRoot: context.jobRoot,
          sceneId: assignment.scene.sceneId,
          requestFingerprint: request.requestHash,
          status: "succeeded",
          assignmentId: `${lane}-${assignment.scene.sceneId}-${attempts}`,
          lane,
          ...(laneResult!.remoteJobId
            ? { remoteJobId: laneResult!.remoteJobId }
            : {}),
          attempt: attempts,
          ...(fallback ? { reassigned: true } : {}),
        });
        return scheduled;
      },
    });
    const completed = new Map(reused);
    for (const result of execution.orderedResults) {
      completed.set(result.fragments[0]!.sceneId, result);
    }
    return requests.map((request) => {
      const result = completed.get(request.scenes[0]!.sceneId);
      if (!result)
        throw new Error("Hybrid rendering ended without every scene result.");
      return result;
    });
  };

  return {
    workerImageId: options.imageId,
    executeBatch,
    async execute(request, context) {
      return (await executeBatch([request], context))[0]!;
    },
  };
}

function classifyWorkerStatus(status: number): MathSceneLaneFailureClass {
  if (status === 64) return "schema";
  if (status === 65) return "containment";
  if (status === 69) return "capacity";
  if (status === 75 || status === 130) return "worker-process";
  if (status === 255) return "ssh";
  return "worker-process";
}

function transformedWorkerRequest(
  request: MathSceneShardRequest,
  lane: "local" | "remote"
): MathSceneShardRequest {
  const scene = request.scenes[0]!;
  const workerScene = bindMathPortableScene({
    ...scene,
    svgRelativePath: `inputs/${scene.svgHash}.svg`,
    fragmentRelativePath: `output/${scene.sceneId}.mp4`,
  });
  return bindMathSceneShardRequest({
    artifactVersion: request.artifactVersion,
    jobId: createMathRemoteJobId(),
    planHash: request.planHash,
    assignmentId: `${lane}-${scene.sceneId}`,
    workRelativePath: "work",
    scenes: [workerScene],
  });
}

async function checkedWorkerResult(input: {
  readonly originalRequest: MathSceneShardRequest;
  readonly workerRequest: MathSceneShardRequest;
  readonly rawWorkerResult: unknown;
  readonly imageId: string;
  readonly downloadedRoot: string;
  readonly jobRoot: string;
  readonly signal?: AbortSignal;
}): Promise<MathSceneShardResult> {
  const workerResult = validateDownloadedWorkerResult(
    input.rawWorkerResult,
    input.imageId
  );
  const workerRoundTrip = validateMathSceneShardRoundTrip(
    input.workerRequest,
    workerResult.shardResult
  ).result;
  const workerFragment = workerRoundTrip.fragments[0]!;
  const originalScene = input.originalRequest.scenes[0]!;
  const downloaded = resolveMathJobPath(
    input.downloadedRoot,
    workerFragment.relativePath
  );
  const partial = `${downloaded}.partial`;
  await fs.rename(downloaded, partial);
  const finalPath = resolveMathJobPath(
    input.jobRoot,
    originalScene.fragmentRelativePath
  );
  await promoteDownloadedMathFragment({
    partialPath: partial,
    finalPath,
    expected: workerFragment,
  });
  const inspected = await validateMathSceneFragmentFile({
    filePath: finalPath,
    scene: originalScene,
    renderDurationMs: workerFragment.renderDurationMs,
    cacheHitCount: workerFragment.cacheHitCount,
    cacheMissCount: workerFragment.cacheMissCount,
    ...(input.signal ? { signal: input.signal } : {}),
  }).catch((error) => {
    throw new MathSceneLaneError(
      "result-hash",
      error instanceof Error
        ? `Downloaded math fragment failed local QA: ${error.message}`
        : "Downloaded math fragment failed local QA."
    );
  });
  if (
    inspected.sha256 !== workerFragment.sha256 ||
    inspected.byteLength !== workerFragment.byteLength ||
    inspected.codecProfile !== workerFragment.codecProfile ||
    inspected.timeBase !== workerFragment.timeBase
  ) {
    throw new MathSceneLaneError(
      "result-hash",
      "Downloaded math fragment metadata does not match the worker result."
    );
  }
  const reboundFragment = workerFragment.execution
    ? { ...inspected, execution: workerFragment.execution }
    : inspected;
  return bindMathSceneShardResult({
    artifactVersion: "math-scene-shard-result.v1",
    jobId: input.originalRequest.jobId,
    planHash: input.originalRequest.planHash,
    assignmentId: input.originalRequest.assignmentId,
    requestHash: input.originalRequest.requestHash,
    fragments: [reboundFragment],
  });
}

async function stageWorkerRequest(input: {
  readonly request: MathSceneShardRequest;
  readonly context: MathSceneShardExecutionContext;
  readonly stagingRoot: string;
  readonly lane: "local" | "remote";
}): Promise<{
  readonly workerRequest: MathSceneShardRequest;
  readonly stagedJobRoot: string;
  readonly svgBytes: number;
}> {
  const workerRequest = transformedWorkerRequest(input.request, input.lane);
  const scene = input.request.scenes[0]!;
  const svg = await fs.readFile(
    resolveMathJobPath(input.context.jobRoot, scene.svgRelativePath)
  );
  if (createHash("sha256").update(svg).digest("hex") !== scene.svgHash) {
    throw new MathSceneLaneError(
      "dependency-hash",
      "Semantic SVG changed before shard staging."
    );
  }
  const stagedJobRoot = await stageMathRemoteShard({
    stagingRoot: input.stagingRoot,
    request: workerRequest,
    svgInputs: new Map([[scene.svgHash, svg]]),
  });
  return {
    workerRequest,
    stagedJobRoot,
    svgBytes: svg.byteLength,
  };
}

export function createLocalDockerMathLaneRunner(input: {
  readonly imageId: string;
  readonly buildRevision: string;
  readonly cpuSlots: number;
  readonly cacheRoot: string;
  readonly workingRoot: string;
  readonly executor?: MathRemoteProcessExecutor;
}): MathSceneLaneRunner {
  const executor = input.executor ?? systemMathRemoteProcessExecutor;
  return {
    async execute(request, context) {
      const stagingRoot = await createMathRenderWorkingDirectory(
        input.workingRoot,
        "local-shard-"
      );
      try {
        const staged = await stageWorkerRequest({
          request,
          context,
          stagingRoot,
          lane: "local",
        });
        await fs.mkdir(input.cacheRoot, { recursive: true, mode: 0o777 });
        await Promise.all([
          fs.chmod(staged.stagedJobRoot, 0o777),
          fs.chmod(input.cacheRoot, 0o777),
          fs.chmod(path.join(staged.stagedJobRoot, "inputs"), 0o777),
          fs.chmod(path.join(staged.stagedJobRoot, "metadata"), 0o777),
          fs.chmod(path.join(staged.stagedJobRoot, "output"), 0o777),
          fs.chmod(path.join(staged.stagedJobRoot, "logs"), 0o777),
          fs.chmod(
            path.join(staged.stagedJobRoot, "metadata", "request.json"),
            0o644
          ),
          ...staged.workerRequest.scenes.map((scene) =>
            fs.chmod(
              path.join(staged.stagedJobRoot, scene.svgRelativePath),
              0o644
            )
          ),
        ]);
        const launchStartedAt = Date.now();
        const result = await executor.run({
          command: "docker",
          args: [
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            "64",
            "--cpus",
            String(input.cpuSlots),
            "-e",
            `MATH_RENDER_WORKER_IMAGE_ID=${input.imageId}`,
            "-e",
            `MATH_RENDER_WORKER_BUILD_REVISION=${input.buildRevision}`,
            "-v",
            `${staged.stagedJobRoot}:/job`,
            "-v",
            `${input.cacheRoot}:/cache`,
            input.imageId,
            "/job",
            "/cache",
            "/job/metadata/request.json",
          ],
          timeoutMs: 30 * 60_000,
        });
        const launchDurationMs = Math.max(0, Date.now() - launchStartedAt);
        if (result.status !== 0) {
          throw new MathSceneLaneError(
            classifyWorkerStatus(result.status),
            "The immutable local Docker math worker failed."
          );
        }
        const resultPath = mathRenderWorkerResultRelativePaths(
          staged.workerRequest
        ).shardResult;
        const raw = JSON.parse(
          await fs.readFile(
            resolveMathJobPath(staged.stagedJobRoot, resultPath),
            "utf8"
          )
        ) as unknown;
        const rebound = await checkedWorkerResult({
          originalRequest: request,
          workerRequest: staged.workerRequest,
          rawWorkerResult: raw,
          imageId: input.imageId,
          downloadedRoot: staged.stagedJobRoot,
          jobRoot: context.jobRoot,
          ...(context.signal ? { signal: context.signal } : {}),
        });
        return {
          result: rebound,
          transferBytes: 0,
          startupLatencyMs: Math.max(
            0,
            launchDurationMs -
              (rebound.fragments[0]?.execution?.actualCostMs ?? 0)
          ),
        };
      } finally {
        await fs.rm(stagingRoot, { recursive: true, force: true });
      }
    },
  };
}

export function createRemoteMathLaneRunner(input: {
  readonly settings: MathRemoteSettings;
  readonly workingRoot: string;
  readonly executor?: MathRemoteProcessExecutor;
}): MathSceneLaneRunner {
  const executor = input.executor ?? systemMathRemoteProcessExecutor;
  return {
    async execute(request, context) {
      const stagingRoot = await createMathRenderWorkingDirectory(
        input.workingRoot,
        "remote-shard-"
      );
      const downloadRoot = await createMathRenderWorkingDirectory(
        input.workingRoot,
        "remote-result-"
      );
      try {
        const staged = await stageWorkerRequest({
          request,
          context,
          stagingRoot,
          lane: "remote",
        });
        await context.onRemoteJob?.(staged.workerRequest.jobId);
        let transferDurationMs = 0;
        let launchDurationMs = 0;
        try {
          const uploadStartedAt = Date.now();
          await uploadMathRemoteShard({
            settings: input.settings,
            localJobRoot: staged.stagedJobRoot,
            jobId: staged.workerRequest.jobId,
            executor,
          });
          transferDurationMs = Math.max(0, Date.now() - uploadStartedAt);
        } catch (error) {
          throw new MathSceneLaneError(
            error instanceof MathRemoteOperationError && error.status === 255
              ? "ssh"
              : "transfer",
            "Remote math shard upload failed."
          );
        }
        try {
          const launchStartedAt = Date.now();
          await launchMathRemoteShard({
            settings: input.settings,
            jobId: staged.workerRequest.jobId,
            executor,
          });
          launchDurationMs = Math.max(0, Date.now() - launchStartedAt);
        } catch (error) {
          const status =
            error instanceof MathRemoteOperationError ? error.status : 75;
          throw new MathSceneLaneError(
            classifyWorkerStatus(status),
            "Remote math worker execution failed."
          );
        }
        try {
          const downloadStartedAt = Date.now();
          await downloadMathRemoteShard({
            settings: input.settings,
            jobId: staged.workerRequest.jobId,
            localPartialRoot: downloadRoot,
            executor,
          });
          transferDurationMs += Math.max(0, Date.now() - downloadStartedAt);
        } catch {
          throw new MathSceneLaneError(
            "transfer",
            "Remote math shard download failed."
          );
        }
        const resultPath = mathRenderWorkerResultRelativePaths(
          staged.workerRequest
        ).shardResult;
        const raw = JSON.parse(
          await fs.readFile(
            resolveMathJobPath(downloadRoot, resultPath),
            "utf8"
          )
        ) as unknown;
        const rebound = await checkedWorkerResult({
          originalRequest: request,
          workerRequest: staged.workerRequest,
          rawWorkerResult: raw,
          imageId: input.settings.imageId!,
          downloadedRoot: downloadRoot,
          jobRoot: context.jobRoot,
          ...(context.signal ? { signal: context.signal } : {}),
        });
        return {
          result: rebound,
          transferBytes: staged.svgBytes + rebound.fragments[0]!.byteLength,
          remoteJobId: staged.workerRequest.jobId,
          startupLatencyMs: Math.max(
            0,
            launchDurationMs -
              (rebound.fragments[0]?.execution?.actualCostMs ?? 0)
          ),
          transferDurationMs,
        };
      } catch (error) {
        if (error instanceof MathSceneLaneError) throw error;
        throw new MathSceneLaneError(
          "result-hash",
          "Remote math result failed strict local validation."
        );
      } finally {
        await Promise.all([
          fs.rm(stagingRoot, { recursive: true, force: true }),
          fs.rm(downloadRoot, { recursive: true, force: true }),
        ]);
      }
    },
  };
}

type MathLaneCalibrations = NonNullable<
  MathRemoteDeploymentReceipt["calibration"]
>;

function capabilitiesFromCalibration(
  imageId: string,
  settings: MathRemoteSettings,
  calibration: MathLaneCalibrations
): {
  readonly local: MathWorkerCapability;
  readonly remote: MathWorkerCapability;
} {
  return {
    local: {
      workerId: "local",
      workerImageId: imageId,
      cpuSlots: settings.localSceneSlots,
      cache: { raster: true, sceneVideo: true },
      calibration: calibration.local,
    },
    remote: {
      workerId: "remote",
      workerImageId: imageId,
      cpuSlots: Math.min(
        settings.remoteSceneSlots,
        settings.remoteJobConcurrency
      ),
      cache: { raster: true, sceneVideo: true },
      calibration: calibration.remote,
    },
  };
}

async function calibrationRequest(input: {
  readonly source: MathSceneShardRequest;
  readonly lane: "local" | "remote";
  readonly imageId: string;
  readonly sourceJobRoot: string;
  readonly calibrationJobRoot: string;
}): Promise<{
  readonly request: MathSceneShardRequest;
  readonly sampleCount: number;
}> {
  const sourceScene = input.source.scenes[0]!;
  const { sceneHash: sourceSceneHash, ...sourceSceneFields } = sourceScene;
  void sourceSceneHash;
  const sourceSvg = await fs.readFile(
    resolveMathJobPath(input.sourceJobRoot, sourceScene.svgRelativePath),
    "utf8"
  );
  const calibrationSvg = sourceSvg.replace(
    /<\/svg>\s*$/u,
    `<metadata data-mediaforge-calibration="${input.lane}"/></svg>`
  );
  if (calibrationSvg === sourceSvg) {
    throw new Error("Math calibration requires a complete SVG scene.");
  }
  const svgHash = createHash("sha256").update(calibrationSvg).digest("hex");
  const svgRelativePath = `inputs/calibration-${input.lane}.svg`;
  await fs.mkdir(path.join(input.calibrationJobRoot, "inputs"), {
    recursive: true,
  });
  await fs.writeFile(
    resolveMathJobPath(input.calibrationJobRoot, svgRelativePath),
    calibrationSvg,
    { mode: 0o600 }
  );
  const scene = bindMathPortableScene({
    ...sourceSceneFields,
    sceneId: "scene-001",
    order: 0,
    startFrame: 0,
    endFrame: sourceScene.expectedFrameCount,
    svgRelativePath,
    svgHash,
    fragmentRelativePath: `fragments/calibration-${input.lane}.mp4`,
    toolchain: createMathRenderToolchainIdentity(input.imageId),
  });
  return {
    request: bindMathSceneShardRequest({
      artifactVersion: "math-scene-shard-request.v1",
      jobId: `calibration-${input.lane}`,
      planHash: input.source.planHash,
      assignmentId: `calibration-${input.lane}`,
      workRelativePath: "work",
      scenes: [scene],
    }),
    sampleCount: countSemanticRasterSamples({
      svgMarkup: calibrationSvg,
      sceneFrames: scene.expectedFrameCount,
      animation: scene.animation,
    }),
  };
}

function measuredCalibration(input: {
  readonly lane: "local" | "remote";
  readonly request: MathSceneShardRequest;
  readonly sampleCount: number;
  readonly result: MathSceneLaneRunResult;
  readonly elapsedMs: number;
}): MathLaneCalibrations["local"] | MathLaneCalibrations["remote"] {
  const fragment = validateMathSceneShardRoundTrip(
    input.request,
    input.result.result
  ).result.fragments[0]!;
  const phases = fragment.execution?.phases;
  if (!phases) {
    throw new Error(
      `Bounded ${input.lane} math calibration did not return phase timings.`
    );
  }
  const rasterSamplesPerSecond =
    (input.sampleCount * 1_000) / Math.max(1, phases.rasterizationMs);
  const encodeFramesPerSecond =
    (fragment.frameCount * 1_000) / Math.max(1, phases.sceneEncodingMs);
  const startupLatencyMs =
    input.result.startupLatencyMs ??
    Math.max(0, input.elapsedMs - fragment.execution!.actualCostMs);
  if (input.lane === "local") {
    return {
      rasterSamplesPerSecond,
      encodeFramesPerSecond,
      startupLatencyMs,
    };
  }
  if (input.result.transferBytes <= 0) {
    throw new Error(
      "Bounded remote math calibration did not measure transfer bytes."
    );
  }
  const transferDurationMs = Math.max(
    1,
    input.result.transferDurationMs ??
      input.elapsedMs - fragment.execution!.actualCostMs - startupLatencyMs
  );
  return {
    rasterSamplesPerSecond,
    encodeFramesPerSecond,
    startupLatencyMs,
    transferMegabytesPerSecond:
      input.result.transferBytes / 1_000_000 / (transferDurationMs / 1_000),
  };
}

export async function runBoundedNoProviderMathSceneCalibration(input: {
  readonly imageId: string;
  readonly requests: readonly MathSceneShardRequest[];
  readonly context: MathSceneShardExecutionContext;
  readonly workingRoot: string;
  readonly localRunner: MathSceneLaneRunner;
  readonly remoteRunner: MathSceneLaneRunner;
  readonly now?: () => number;
}): Promise<MathLaneCalibrations> {
  if (input.requests.length === 0) {
    throw new Error("Math calibration requires at least one scene request.");
  }
  const now = input.now ?? Date.now;
  const root = await createMathRenderWorkingDirectory(
    input.workingRoot,
    "calibration-"
  );
  try {
    const localRoot = path.join(root, "local");
    const remoteRoot = path.join(root, "remote");
    const [localFixture, remoteFixture] = await Promise.all([
      calibrationRequest({
        source: input.requests[0]!,
        lane: "local",
        imageId: input.imageId,
        sourceJobRoot: input.context.jobRoot,
        calibrationJobRoot: localRoot,
      }),
      calibrationRequest({
        source: input.requests[1] ?? input.requests[0]!,
        lane: "remote",
        imageId: input.imageId,
        sourceJobRoot: input.context.jobRoot,
        calibrationJobRoot: remoteRoot,
      }),
    ]);
    const run = async (
      lane: "local" | "remote",
      fixture: typeof localFixture,
      runner: MathSceneLaneRunner,
      jobRoot: string
    ) => {
      const startedAt = now();
      const result = await runner.execute(fixture.request, {
        jobRoot,
        ...(input.context.signal ? { signal: input.context.signal } : {}),
      });
      return measuredCalibration({
        lane,
        request: fixture.request,
        sampleCount: fixture.sampleCount,
        result,
        elapsedMs: Math.max(0, now() - startedAt),
      });
    };
    const [local, remote] = await Promise.all([
      run("local", localFixture, input.localRunner, localRoot),
      run("remote", remoteFixture, input.remoteRunner, remoteRoot),
    ]);
    return {
      local: local as MathLaneCalibrations["local"],
      remote: remote as MathLaneCalibrations["remote"],
    };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function reusableLocalFragment(
  request: MathSceneShardRequest,
  context: MathSceneShardExecutionContext
): Promise<MathSceneShardResult | undefined> {
  const scene = request.scenes[0]!;
  try {
    const fragment = await validateMathSceneFragmentFile({
      filePath: resolveMathJobPath(context.jobRoot, scene.fragmentRelativePath),
      scene,
      renderDurationMs: 0,
      cacheHitCount: 1,
      cacheMissCount: 0,
      ...(context.signal ? { signal: context.signal } : {}),
    });
    return bindMathSceneShardResult({
      artifactVersion: "math-scene-shard-result.v1",
      jobId: request.jobId,
      planHash: request.planHash,
      assignmentId: request.assignmentId,
      requestHash: request.requestHash,
      fragments: [fragment],
    });
  } catch {
    return undefined;
  }
}

export interface MathWorkflowRenderExecution {
  readonly mode: MathRenderExecutorMode;
  readonly imageId?: string;
  readonly sceneShardExecutor?: MathSceneShardExecutor;
}

export interface MathLocalContainerRenderExecution {
  readonly mode: "local-container";
  readonly imageId: string;
  readonly sceneShardExecutor: MathSceneShardExecutor;
}

export async function createMathLocalContainerRenderExecution(input: {
  readonly config: RuntimeConfig;
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly processExecutor?: MathRemoteProcessExecutor;
  readonly observer?: (event: MathHybridSceneEvent) => void | Promise<void>;
}): Promise<MathLocalContainerRenderExecution> {
  const settings = parseMathRemoteSettings(input.config);
  const receipt = await readMathRemoteDeploymentReceipt(
    input.repositoryRoot,
    settings.transport
  );
  const imageId = settings.imageId ?? receipt?.imageId;
  if (!imageId) {
    throw new Error(
      "Local-container benchmarking requires a deployment receipt or explicit immutable image ID."
    );
  }
  if (settings.imageId && receipt && settings.imageId !== receipt.imageId) {
    throw new Error(
      "The configured math image ID does not match the deployment receipt."
    );
  }
  const localRunner = createLocalDockerMathLaneRunner({
    imageId,
    buildRevision:
      receipt?.repositoryRevision ??
      createHash("sha256").update(imageId).digest("hex"),
    cpuSlots: settings.localSceneSlots,
    cacheRoot: path.join(
      input.workspaceRoot,
      "state",
      "math-render-cache",
      imageId.slice("sha256:".length)
    ),
    workingRoot: path.join(input.workspaceRoot, "state", "math-render-work"),
    ...(input.processExecutor ? { executor: input.processExecutor } : {}),
  });
  const defaultCapability = defaultLocalMathWorkerCapability({
    workerImageId: imageId,
    cpuSlots: settings.localSceneSlots,
  });
  const localCapability: MathWorkerCapability = receipt?.calibration
    ? {
        ...defaultCapability,
        calibration: receipt.calibration.local,
      }
    : defaultCapability;
  const unusedRemoteCapability: MathWorkerCapability = {
    ...localCapability,
    workerId: "remote-unused",
  };
  return {
    mode: "local-container",
    imageId,
    sceneShardExecutor: createHybridMathSceneShardExecutor({
      mode: "local-container",
      imageId,
      localCapability,
      remoteCapability: unusedRemoteCapability,
      localRunner,
      remoteRunner: localRunner,
      remoteMaxRetries: 0,
      reuse: reusableLocalFragment,
      ...(input.observer ? { observer: input.observer } : {}),
    }),
  };
}

export async function createMathWorkflowRenderExecution(input: {
  readonly config: RuntimeConfig;
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly explicitMode?: MathRenderExecutorMode;
  readonly processExecutor?: MathRemoteProcessExecutor;
  readonly observer?: (event: MathHybridSceneEvent) => void | Promise<void>;
}): Promise<MathWorkflowRenderExecution> {
  const mode = resolveMathRenderExecutorMode(
    input.explicitMode,
    input.config.mathRenderExecutor
  );
  if (mode === "local") return { mode };
  const settings = parseMathRemoteSettings({
    ...input.config,
    mathRenderExecutor: mode,
  });
  if (
    !settings.transport.enabled ||
    !settings.transport.verifyHostKey ||
    !settings.transport.fallbackToLocal
  ) {
    throw new Error(
      "Remote math rendering requires enablement, strict host keys, and bounded local fallback."
    );
  }
  const receipt = await readMathRemoteDeploymentReceipt(
    input.repositoryRoot,
    settings.transport
  );
  const imageId = settings.imageId ?? receipt?.imageId;
  if (!imageId) {
    throw new Error(
      "Remote math rendering requires a deployment receipt or explicit immutable image ID."
    );
  }
  if (settings.imageId && receipt && settings.imageId !== receipt.imageId) {
    throw new Error(
      "The configured math image ID does not match the deployment receipt."
    );
  }
  const preparedSettings: MathRemoteSettings = {
    ...settings,
    imageId,
  };
  await checkMathRemoteWorker({
    settings: preparedSettings,
    repositoryRoot: input.repositoryRoot,
    ...(input.processExecutor ? { executor: input.processExecutor } : {}),
  });
  const buildRevision =
    receipt?.repositoryRevision ??
    createHash("sha256").update(imageId).digest("hex");
  const localRunner = createLocalDockerMathLaneRunner({
    imageId,
    buildRevision,
    cpuSlots: preparedSettings.localSceneSlots,
    cacheRoot: path.join(
      input.workspaceRoot,
      "state",
      "math-render-cache",
      imageId.slice("sha256:".length)
    ),
    workingRoot: path.join(input.workspaceRoot, "state", "math-render-work"),
    ...(input.processExecutor ? { executor: input.processExecutor } : {}),
  });
  const remoteRunner = createRemoteMathLaneRunner({
    settings: { ...preparedSettings, remoteSceneSlots: 1 },
    workingRoot: path.join(input.workspaceRoot, "state", "math-render-work"),
    ...(input.processExecutor ? { executor: input.processExecutor } : {}),
  });
  const createExecutor = (calibration: MathLaneCalibrations) => {
    const capabilities = capabilitiesFromCalibration(
      imageId,
      preparedSettings,
      calibration
    );
    return createHybridMathSceneShardExecutor({
      mode,
      imageId,
      localCapability: capabilities.local,
      remoteCapability: capabilities.remote,
      localRunner,
      remoteRunner,
      remoteMaxRetries: preparedSettings.transport.maxRetries,
      reuse: reusableLocalFragment,
      ...(input.observer ? { observer: input.observer } : {}),
    });
  };
  if (receipt?.calibration) {
    return {
      mode,
      imageId,
      sceneShardExecutor: createExecutor(receipt.calibration),
    };
  }
  let calibratedExecutor: Promise<MathSceneShardExecutor> | undefined;
  const resolveCalibratedExecutor = (
    requests: readonly MathSceneShardRequest[],
    context: MathSceneShardExecutionContext
  ): Promise<MathSceneShardExecutor> => {
    calibratedExecutor ??= runBoundedNoProviderMathSceneCalibration({
      imageId,
      requests,
      context,
      workingRoot: path.join(input.workspaceRoot, "state", "math-render-work"),
      localRunner,
      remoteRunner,
    }).then(createExecutor);
    return calibratedExecutor;
  };
  const sceneShardExecutor: MathSceneShardExecutor = {
    workerImageId: imageId,
    async execute(request, context) {
      return (await resolveCalibratedExecutor([request], context)).execute(
        request,
        context
      );
    },
    async executeBatch(requests, context) {
      const executor = await resolveCalibratedExecutor(requests, context);
      if (!executor.executeBatch) {
        throw new Error("Calibrated math executor is missing batch support.");
      }
      return executor.executeBatch(requests, context);
    },
  };
  return {
    mode,
    imageId,
    sceneShardExecutor,
  };
}
