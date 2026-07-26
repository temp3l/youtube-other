import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { ProcessExecutionError } from "@mediaforge/domain";
import { runCommand } from "@mediaforge/process-runner";
import { hashFile } from "@mediaforge/shared";
import sharp from "sharp";
import { ZodError } from "zod";
import {
  createMathCacheNamespaces,
  createLocalMathSceneShardExecutor,
} from "../composition/remotion-runner.js";
import {
  mathSceneShardRequestSchema,
  resolveMathJobPath,
  validateMathSceneShardRoundTrip,
  type MathSceneShardExecutor,
  type MathSceneShardRequest,
} from "../composition/portable-scene-contract.js";
import { MATH_REMOTION_RUNNER_VERSION } from "../composition/renderer-versions.js";
import { detectMathCpuSlotBudget } from "../composition/scene-scheduler.js";
import {
  bindMathRenderWorkerResult,
  bindMathRenderWorkerSceneResult,
  isPathInside,
  mathRenderWorkerLogSchema,
  mathRenderWorkerResultRelativePaths,
  mathRenderWorkerProvenanceSchema,
  MATH_RENDER_WORKER_EXIT_CODES,
  MATH_RENDER_WORKER_GID,
  MATH_RENDER_WORKER_MAX_LOG_BYTES,
  MATH_RENDER_WORKER_MAX_MANIFEST_BYTES,
  MATH_RENDER_WORKER_UID,
  resolveMathRenderWorkerResultPaths,
  type MathRenderWorkerExitClass,
  type MathRenderWorkerLog,
  type MathRenderWorkerProvenance,
} from "./math-render-worker-contract.js";

const MINIMUM_WRITABLE_BYTES = 64 * 1024 * 1024;

export class MathRenderWorkerError extends Error {
  readonly exitClass: MathRenderWorkerExitClass;

  constructor(exitClass: MathRenderWorkerExitClass, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "MathRenderWorkerError";
    this.exitClass = exitClass;
  }
}

export interface MathRenderWorkerDependencies {
  readonly getUid: () => number | undefined;
  readonly getGid: () => number | undefined;
  readonly networkInterfaces: () => Promise<readonly string[]>;
  readonly cpuQuota: () => Promise<number>;
  readonly ffmpegVersion: (signal: AbortSignal) => Promise<string>;
  readonly ensureResources: (roots: readonly string[]) => Promise<void>;
  readonly createExecutor: (input: {
    readonly cacheRoot: string;
    readonly cpuSlots: number;
    readonly imageId: string;
    readonly signal: AbortSignal;
  }) => MathSceneShardExecutor;
}

const defaultDependencies: MathRenderWorkerDependencies = {
  getUid: () => process.getuid?.(),
  getGid: () => process.getgid?.(),
  networkInterfaces: async () =>
    (await fs.readdir("/sys/class/net")).slice().sort(),
  cpuQuota: detectMathCpuSlotBudget,
  ffmpegVersion: async (signal) => {
    const { stdout } = await runCommand("ffmpeg", ["-version"], {
      signal,
      timeoutMs: 30_000,
    });
    return stdout.split(/\r?\n/u)[0]?.trim() ?? "ffmpeg-unavailable";
  },
  ensureResources: async (roots) => {
    for (const root of roots) {
      const stats = await fs.statfs(root);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (!Number.isFinite(freeBytes) || freeBytes < MINIMUM_WRITABLE_BYTES) {
        throw new MathRenderWorkerError(
          "insufficient-resources",
          "Worker roots do not have enough writable space."
        );
      }
    }
  },
  createExecutor: ({ cacheRoot, cpuSlots, imageId, signal }) =>
    createLocalMathSceneShardExecutor({
      cacheRoot,
      cpuSlotBudget: cpuSlots,
      signal,
      capability: {
        workerId: "docker",
        workerImageId: imageId,
        cpuSlots,
        cache: { raster: true, sceneVideo: true },
        calibration: {
          rasterSamplesPerSecond: 8,
          encodeFramesPerSecond: 30,
          startupLatencyMs: 25,
        },
      },
    }),
};

function classifyError(error: unknown): MathRenderWorkerError {
  if (error instanceof MathRenderWorkerError) return error;
  if (
    error instanceof ZodError &&
    error.issues.some((issue) => /contained|relative path|escape/iu.test(issue.message))
  ) {
    return new MathRenderWorkerError(
      "containment-integrity",
      "Worker request contains an unsafe path.",
      error
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return new MathRenderWorkerError(
      "invalid-job",
      "Worker request is not schema-valid.",
      error
    );
  }
  if (error instanceof ProcessExecutionError) {
    return new MathRenderWorkerError(
      "transient-process",
      "A worker subprocess failed.",
      error
    );
  }
  if (
    error instanceof Error &&
    /aborted|cancelled|canceled|SIGTERM/iu.test(error.message)
  ) {
    return new MathRenderWorkerError(
      "cancellation",
      "Worker execution was cancelled.",
      error
    );
  }
  return new MathRenderWorkerError(
    "transient-process",
    "Worker execution failed.",
    error
  );
}

async function realDirectory(rawPath: string, label: string): Promise<string> {
  if (!path.isAbsolute(rawPath)) {
    throw new MathRenderWorkerError(
      "invalid-job",
      `${label} must be an absolute mounted path.`
    );
  }
  const [realPath, stat] = await Promise.all([
    fs.realpath(rawPath),
    fs.stat(rawPath),
  ]);
  if (!stat.isDirectory() || path.dirname(realPath) === realPath) {
    throw new MathRenderWorkerError(
      "containment-integrity",
      `${label} is not a safe mounted directory.`
    );
  }
  return realPath;
}

async function assertExistingPathContained(
  root: string,
  candidate: string,
  label: string
): Promise<void> {
  const realCandidate = await fs.realpath(candidate).catch((error) => {
    throw new MathRenderWorkerError(
      "containment-integrity",
      `${label} is missing or inaccessible.`,
      error
    );
  });
  if (!isPathInside(root, realCandidate)) {
    throw new MathRenderWorkerError(
      "containment-integrity",
      `${label} escapes the mounted job root.`
    );
  }
}

async function assertOutputPathContained(
  root: string,
  candidate: string,
  label: string
): Promise<void> {
  if (!isPathInside(root, candidate)) {
    throw new MathRenderWorkerError(
      "containment-integrity",
      `${label} escapes the mounted job root.`
    );
  }
  let ancestor = path.dirname(candidate);
  while (true) {
    try {
      const realAncestor = await fs.realpath(ancestor);
      if (realAncestor !== root && !isPathInside(root, realAncestor)) {
        throw new MathRenderWorkerError(
          "containment-integrity",
          `${label} traverses a symlink outside the mounted job root.`
        );
      }
      return;
    } catch (error) {
      if (
        error instanceof MathRenderWorkerError ||
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        )
      ) {
        throw error;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        throw new MathRenderWorkerError(
          "containment-integrity",
          `${label} has no contained writable ancestor.`
        );
      }
      ancestor = parent;
    }
  }
}

async function readRequest(
  jobRoot: string,
  manifestPath: string
): Promise<MathSceneShardRequest> {
  if (!path.isAbsolute(manifestPath)) {
    throw new MathRenderWorkerError(
      "invalid-job",
      "Request manifest path must be absolute."
    );
  }
  const realManifest = await fs.realpath(manifestPath).catch((error) => {
    throw new MathRenderWorkerError(
      "containment-integrity",
      "Request manifest is missing or inaccessible.",
      error
    );
  });
  if (!isPathInside(jobRoot, realManifest)) {
    throw new MathRenderWorkerError(
      "containment-integrity",
      "Request manifest escapes the mounted job root."
    );
  }
  const stat = await fs.stat(realManifest);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MATH_RENDER_WORKER_MAX_MANIFEST_BYTES) {
    throw new MathRenderWorkerError(
      "invalid-job",
      "Request manifest size is invalid."
    );
  }
  return mathSceneShardRequestSchema.parse(
    JSON.parse(await fs.readFile(realManifest, "utf8")) as unknown
  );
}

async function preflightRequest(input: {
  readonly jobRoot: string;
  readonly imageId: string;
  readonly request: MathSceneShardRequest;
}): Promise<void> {
  const resultPaths = resolveMathRenderWorkerResultPaths(
    input.jobRoot,
    input.request
  );
  for (const scene of input.request.scenes) {
    if (scene.toolchain.workerImageId !== input.imageId) {
      throw new MathRenderWorkerError(
        "containment-integrity",
        "Request image identity does not match the running worker."
      );
    }
    const svgPath = resolveMathJobPath(input.jobRoot, scene.svgRelativePath);
    await assertExistingPathContained(
      input.jobRoot,
      svgPath,
      `SVG for ${scene.sceneId}`
    );
    if ((await hashFile(svgPath)) !== scene.svgHash) {
      throw new MathRenderWorkerError(
        "containment-integrity",
        `SVG integrity failed for ${scene.sceneId}.`
      );
    }
    await assertOutputPathContained(
      input.jobRoot,
      resolveMathJobPath(input.jobRoot, scene.fragmentRelativePath),
      `fragment for ${scene.sceneId}`
    );
  }
  await assertOutputPathContained(
    input.jobRoot,
    resolveMathJobPath(input.jobRoot, input.request.workRelativePath),
    "worker work path"
  );
  await Promise.all([
    assertOutputPathContained(input.jobRoot, resultPaths.log, "worker log"),
    assertOutputPathContained(
      input.jobRoot,
      resultPaths.shardResult,
      "worker shard result"
    ),
    ...resultPaths.scenes.map((value) =>
      assertOutputPathContained(input.jobRoot, value, "worker scene result")
    ),
  ]);
}

async function writeAtomic(filePath: string, text: string): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(temporary, text, {
      encoding: "utf8",
      mode: 0o644,
      flag: "wx",
    });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function appendBoundedLog(
  logPath: string,
  event: MathRenderWorkerLog
): Promise<void> {
  const parsed = mathRenderWorkerLogSchema.parse(event);
  const line = `${JSON.stringify(parsed)}\n`;
  const existingBytes = await fs
    .stat(logPath)
    .then((stat) => stat.size)
    .catch(() => 0);
  if (existingBytes + Buffer.byteLength(line) > MATH_RENDER_WORKER_MAX_LOG_BYTES) {
    throw new MathRenderWorkerError(
      "transient-process",
      "Worker lifecycle log exceeded its bound."
    );
  }
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, line, { encoding: "utf8", mode: 0o644 });
}

function lifecycleLog(
  request: MathSceneShardRequest,
  event: MathRenderWorkerLog["event"],
  exitClass: MathRenderWorkerExitClass
): MathRenderWorkerLog {
  return mathRenderWorkerLogSchema.parse({
    artifactVersion: "math-render-worker-log.v1",
    event,
    jobId: request.jobId,
    assignmentId: request.assignmentId,
    requestHash: request.requestHash,
    exitClass,
    sceneCount: request.scenes.length,
  });
}

function requiredImageId(): string {
  const value = process.env["MATH_RENDER_WORKER_IMAGE_ID"];
  if (!value || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new MathRenderWorkerError(
      "invalid-job",
      "Worker image identity is missing or invalid."
    );
  }
  return value;
}

function requiredBuildRevision(): string {
  const value = process.env["MATH_RENDER_WORKER_BUILD_REVISION"];
  if (!value || !/^[a-f0-9]{40,64}$/u.test(value)) {
    throw new MathRenderWorkerError(
      "invalid-job",
      "Worker build revision is missing or invalid."
    );
  }
  return value;
}

async function runMathRenderWorkerInternal(
  args: readonly string[],
  dependencies: MathRenderWorkerDependencies = defaultDependencies
): Promise<void> {
  if (args.length !== 3) {
    throw new MathRenderWorkerError(
      "invalid-job",
      "Worker requires exactly job root, cache root, and request manifest."
    );
  }
  if (
    dependencies.getUid() !== MATH_RENDER_WORKER_UID ||
    dependencies.getGid() !== MATH_RENDER_WORKER_GID
  ) {
    throw new MathRenderWorkerError(
      "containment-integrity",
      "Worker must run as its fixed non-root UID and GID."
    );
  }
  const [jobArg, cacheArg, manifestArg] = args as [string, string, string];
  const [jobRoot, cacheRoot] = await Promise.all([
    realDirectory(jobArg, "Job root"),
    realDirectory(cacheArg, "Cache root"),
  ]);
  if (
    jobRoot === cacheRoot ||
    isPathInside(jobRoot, cacheRoot) ||
    isPathInside(cacheRoot, jobRoot)
  ) {
    throw new MathRenderWorkerError(
      "containment-integrity",
      "Job and cache roots must be distinct mounts."
    );
  }
  const interfaces = (await dependencies.networkInterfaces()).slice().sort();
  if (interfaces.length !== 1 || interfaces[0] !== "lo") {
    throw new MathRenderWorkerError(
      "containment-integrity",
      "Worker networking is not disabled."
    );
  }
  const imageId = requiredImageId();
  const buildRevision = requiredBuildRevision();
  const request = await readRequest(jobRoot, manifestArg);
  await preflightRequest({ jobRoot, imageId, request });
  await dependencies.ensureResources([jobRoot, cacheRoot]);
  const cpuQuota = await dependencies.cpuQuota();
  if (!Number.isInteger(cpuQuota) || cpuQuota <= 0) {
    throw new MathRenderWorkerError(
      "insufficient-resources",
      "Worker has no usable CPU quota."
    );
  }

  const controller = new AbortController();
  const cancel = (): void =>
    controller.abort(new Error("Math render cancelled by SIGTERM."));
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const paths = resolveMathRenderWorkerResultPaths(jobRoot, request);
  try {
    await Promise.all([
      fs.mkdir(path.join(cacheRoot, "tmp"), { recursive: true }),
      fs.mkdir(path.join(cacheRoot, "runtime"), { recursive: true }),
    ]);
    const ffmpegVersion = await dependencies.ffmpegVersion(controller.signal);
    const cacheNamespaces = createMathCacheNamespaces({
      toolchain: request.scenes[0]!.toolchain,
      encoding: request.scenes[0]!.encoding,
      sharpVersion: sharp.versions.sharp,
      ffmpegVersion,
    });
    const worker = mathRenderWorkerProvenanceSchema.parse({
      imageId,
      buildRevision,
      nodeVersion: process.version,
      sharpVersion: sharp.versions.sharp,
      ffmpegVersion,
      rendererVersion: MATH_REMOTION_RUNNER_VERSION,
      encoder: "libx264",
      cpuQuota,
      cacheNamespaces,
      securityPolicyVersion: "math-render-worker-security.v1",
      uid: MATH_RENDER_WORKER_UID,
      gid: MATH_RENDER_WORKER_GID,
      networkInterfaces: ["lo"],
    } satisfies MathRenderWorkerProvenance);
    await appendBoundedLog(
      paths.log,
      lifecycleLog(request, "started", "success")
    );
    const executor = dependencies.createExecutor({
      cacheRoot,
      cpuSlots: cpuQuota,
      imageId,
      signal: controller.signal,
    });
    const shardResult = validateMathSceneShardRoundTrip(
      request,
      await executor.execute(request, {
        jobRoot,
        signal: controller.signal,
      })
    ).result;
    const relativePaths = mathRenderWorkerResultRelativePaths(request);
    for (const [index, fragment] of shardResult.fragments.entries()) {
      const sceneResult = bindMathRenderWorkerSceneResult({
        request,
        fragment,
        worker,
      });
      await writeAtomic(
        paths.scenes[index]!,
        `${JSON.stringify(sceneResult)}\n`
      );
    }
    const result = bindMathRenderWorkerResult({
      request,
      worker,
      shardResult,
      sceneResultRelativePaths: relativePaths.scenes,
    });
    await writeAtomic(paths.shardResult, `${JSON.stringify(result)}\n`);
    await appendBoundedLog(
      paths.log,
      lifecycleLog(request, "succeeded", "success")
    );
  } catch (error) {
    const classified = controller.signal.aborted
      ? new MathRenderWorkerError(
          "cancellation",
          "Worker execution was cancelled.",
          error
        )
      : classifyError(error);
    await appendBoundedLog(
      paths.log,
      lifecycleLog(request, "failed", classified.exitClass)
    ).catch(() => undefined);
    throw classified;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

export async function runMathRenderWorker(
  args: readonly string[],
  dependencies: MathRenderWorkerDependencies = defaultDependencies
): Promise<void> {
  try {
    await runMathRenderWorkerInternal(args, dependencies);
  } catch (error) {
    throw classifyError(error);
  }
}

export function mathRenderWorkerExitCode(error: unknown): number {
  return MATH_RENDER_WORKER_EXIT_CODES[classifyError(error).exitClass];
}

export function mathRenderWorkerFailureEvent(error: unknown): string {
  const classified = classifyError(error);
  return `${JSON.stringify({
    artifactVersion: "math-render-worker-log.v1",
    event: "failed",
    exitClass: classified.exitClass,
  })}\n`;
}
