import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "@mediaforge/config";
import {
  bindMathPortableScene,
  bindMathRenderBenchmarkArtifact,
  bindMathRenderPlan,
  createMathRenderToolchainIdentity,
  executeCompatibleMathRenderPlan,
  mathRenderBenchmarkInputSchema,
  mathRenderBenchmarkModeSchema,
  resolveMathJobPath,
  type MathRenderBenchmarkArtifact,
  type MathRenderBenchmarkCacheState,
  type MathRenderBenchmarkInput,
  type MathRenderBenchmarkMode,
  type MathRenderBenchmarkRun,
  type MathRenderIntegerMeasurement,
  type MathRenderPlan,
  type MathRenderResult,
  type MathSceneShardExecutor,
} from "@mediaforge/math-rendering";
import { hashFile, writeJsonAtomic } from "@mediaforge/shared";
import {
  createMathLocalContainerRenderExecution,
  createMathWorkflowRenderExecution,
} from "./math-render-hybrid.js";

const runOrder = mathRenderBenchmarkModeSchema.options.flatMap((mode) =>
  (["cold", "warm"] as const).map((cacheState) => ({ mode, cacheState }))
);

function available(value: number): MathRenderIntegerMeasurement {
  return { status: "available", value: Math.max(0, Math.round(value)) };
}

const notInstrumented = {
  status: "unavailable" as const,
  reason: "not-instrumented" as const,
};
const notSupported = {
  status: "unavailable" as const,
  reason: "not-supported" as const,
};
const notApplicable = {
  status: "unavailable" as const,
  reason: "not-applicable" as const,
};

export interface MathRenderBenchmarkCase {
  readonly mode: MathRenderBenchmarkMode;
  readonly cacheState: MathRenderBenchmarkCacheState;
  readonly runId: string;
  readonly outputRoot: string;
}

export interface MathRenderBenchmarkCaseExecutor {
  execute(input: MathRenderBenchmarkCase): Promise<MathRenderBenchmarkRun>;
}

function provedOverlap(
  scenes: MathRenderBenchmarkRun["scenes"],
  mode: MathRenderBenchmarkMode
): MathRenderBenchmarkRun["overlap"] {
  if (mode !== "hybrid") {
    return { status: "not-proved", reason: "single-lane-run" };
  }
  const local = scenes.filter((scene) => scene.workerAssignment === "local");
  const remote = scenes.filter((scene) => scene.workerAssignment === "remote");
  if (local.length === 0 || remote.length === 0) {
    return { status: "not-proved", reason: "no-cross-lane-overlap" };
  }
  const startMs = Math.max(
    Math.min(...local.map((scene) => scene.actualInterval.startMs)),
    Math.min(...remote.map((scene) => scene.actualInterval.startMs))
  );
  const finishMs = Math.min(
    Math.max(...local.map((scene) => scene.actualInterval.finishMs)),
    Math.max(...remote.map((scene) => scene.actualInterval.finishMs))
  );
  return finishMs > startMs
    ? {
        status: "proved",
        startMs,
        finishMs,
        durationMs: finishMs - startMs,
      }
    : { status: "not-proved", reason: "no-cross-lane-overlap" };
}

function availableValue(
  measurement: MathRenderIntegerMeasurement
): number | undefined {
  return measurement.status === "available" ? measurement.value : undefined;
}

export async function runMathRenderBenchmark(input: {
  readonly benchmarkInput: MathRenderBenchmarkInput;
  readonly temporaryRoot: string;
  readonly executeCase: MathRenderBenchmarkCaseExecutor;
  readonly createdAt?: Date;
}): Promise<MathRenderBenchmarkArtifact> {
  const benchmarkInput = mathRenderBenchmarkInputSchema.parse(
    input.benchmarkInput
  );
  const runs: MathRenderBenchmarkRun[] = [];
  for (const { mode, cacheState } of runOrder) {
    const runId = `${mode}-${cacheState}`;
    const outputRoot = path.join(input.temporaryRoot, "runs", runId);
    await fs.mkdir(outputRoot, { recursive: true });
    const run = await input.executeCase.execute({
      mode,
      cacheState,
      runId,
      outputRoot,
    });
    if (
      run.mode !== mode ||
      run.cacheState !== cacheState ||
      run.runId !== runId
    ) {
      throw new Error(
        "Benchmark case executor returned the wrong run identity."
      );
    }
    runs.push({ ...run, overlap: provedOverlap(run.scenes, mode) });
  }
  const nativeWarm = runs.find(
    (run) => run.mode === "native-local" && run.cacheState === "warm"
  );
  const hybridWarm = runs.find(
    (run) => run.mode === "hybrid" && run.cacheState === "warm"
  );
  const overlapProved = hybridWarm?.overlap.status === "proved";
  const ratio =
    nativeWarm && hybridWarm && overlapProved
      ? hybridWarm.clientWallMs / nativeWarm.clientWallMs
      : undefined;
  const observedSpeedup =
    nativeWarm && hybridWarm && overlapProved
      ? nativeWarm.clientWallMs / hybridWarm.clientWallMs
      : undefined;
  const acceptanceStatus =
    ratio === undefined
      ? ("blocked-inconclusive" as const)
      : ratio <= 0.8
        ? ("passed" as const)
        : ("blocked-slower" as const);
  const localSlots = hybridWarm
    ? availableValue(hybridWarm.resources.localCpuSlots)
    : undefined;
  const remoteSlots = hybridWarm
    ? availableValue(hybridWarm.resources.remoteCpuSlots)
    : undefined;
  const sceneWorkMs = hybridWarm?.scenes.reduce(
    (sum, scene) => sum + (availableValue(scene.actualDurationMs) ?? 0),
    0
  );
  const idealBound =
    hybridWarm &&
    localSlots !== undefined &&
    remoteSlots !== undefined &&
    localSlots + remoteSlots > 0
      ? Math.ceil((sceneWorkMs ?? 0) / (localSlots + remoteSlots))
      : undefined;
  const gap =
    idealBound === undefined || !hybridWarm
      ? undefined
      : Math.max(0, hybridWarm.clientWallMs - idealBound);
  const contributors: Array<
    | "startup"
    | "transfer"
    | "assembly"
    | "qa"
    | "cache"
    | "tail-imbalance"
    | "unmeasured"
  > = [];
  if ((hybridWarm?.transferBytes ?? 0) > 0) contributors.push("transfer");
  if (
    hybridWarm?.timings.assemblyMs.status === "available" &&
    hybridWarm.timings.assemblyMs.value > 0
  )
    contributors.push("assembly");
  if ((hybridWarm?.cache.missCount ?? 0) > 0) contributors.push("cache");
  if (gap !== undefined && gap > 0) contributors.push("tail-imbalance");
  if (hybridWarm?.timings.qaMs.status !== "available")
    contributors.push("unmeasured");
  if (contributors.length === 0) contributors.push("startup");

  return bindMathRenderBenchmarkArtifact({
    artifactVersion: "math-render-benchmark.v1",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    selection: {
      lessonId: benchmarkInput.lessonId,
      language: benchmarkInput.language,
      inputHash: benchmarkInput.contentHash,
      planHash: benchmarkInput.plan.contentHash,
      timingHash: benchmarkInput.identities.timingHash,
      visualPlanHash: benchmarkInput.identities.visualPlanHash,
    },
    safeguards: {
      providerCalls: 0,
      canonicalOutputsReplaced: false,
      isolatedTemporaryOutputs: true,
      containsHostAddress: false,
      containsAbsolutePaths: false,
      containsNarrationContent: false,
    },
    runs,
    acceptance: {
      thresholdRatio: 0.8,
      hybridWarmClientWallMs: hybridWarm
        ? available(hybridWarm.clientWallMs)
        : notInstrumented,
      nativeLocalWarmClientWallMs: nativeWarm
        ? available(nativeWarm.clientWallMs)
        : notInstrumented,
      ratio:
        ratio === undefined
          ? { status: "unavailable", reason: "not-reported" }
          : { status: "available", value: ratio },
      observedSpeedup:
        observedSpeedup === undefined
          ? { status: "unavailable", reason: "not-reported" }
          : { status: "available", value: observedSpeedup },
      status: acceptanceStatus,
    },
    throughputComparison: {
      idealCombinedThroughputBoundMs:
        idealBound === undefined ? notInstrumented : available(idealBound),
      measuredHybridWarmClientWallMs: hybridWarm
        ? available(hybridWarm.clientWallMs)
        : notInstrumented,
      gapMs: gap === undefined ? notInstrumented : available(gap),
      contributors,
    },
    recommendation: {
      configuredDefault: "local",
      recommendHybrid: acceptanceStatus === "passed",
      reason: !overlapProved
        ? "overlap-not-proved"
        : acceptanceStatus === "passed"
          ? "acceptance-passed"
          : acceptanceStatus === "blocked-slower"
            ? "acceptance-not-met"
            : "measurement-inconclusive",
    },
  });
}

function rebindPlanImage(
  plan: MathRenderPlan,
  imageId: string
): MathRenderPlan {
  const scenes = plan.scenes.map((scene) => {
    const { sceneHash: _sceneHash, ...fields } = scene;
    return bindMathPortableScene({
      ...fields,
      toolchain: createMathRenderToolchainIdentity(imageId),
    });
  });
  const { contentHash: _contentHash, ...fields } = plan;
  return bindMathRenderPlan({ ...fields, scenes });
}

async function copyBenchmarkInputs(input: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly benchmarkInput: MathRenderBenchmarkInput;
}): Promise<void> {
  const files = [
    {
      relativePath: input.benchmarkInput.narration.relativePath,
      sha256: input.benchmarkInput.narration.sha256,
    },
    ...input.benchmarkInput.plan.scenes.map((scene) => ({
      relativePath: scene.svgRelativePath,
      sha256: scene.svgHash,
    })),
  ];
  for (const file of files) {
    const source = resolveMathJobPath(input.sourceRoot, file.relativePath);
    if ((await hashFile(source)) !== file.sha256) {
      throw new Error("Benchmark source input failed its declared hash.");
    }
    const destination = resolveMathJobPath(
      input.destinationRoot,
      file.relativePath
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
}

function runFromRenderResult(input: {
  readonly runId: string;
  readonly mode: MathRenderBenchmarkMode;
  readonly cacheState: MathRenderBenchmarkCacheState;
  readonly result: MathRenderResult;
  readonly clientWallMs: number;
  readonly localCpuSlots: number;
  readonly remoteCpuSlots?: number;
}): MathRenderBenchmarkRun {
  const scenes = input.result.scenes.map((scene) => {
    const scheduling = scene.execution?.scheduling;
    const startMs =
      scheduling?.actualStartMs ?? scene.execution?.queueWaitMs ?? 0;
    const actualDurationMs =
      scheduling === undefined
        ? (scene.execution?.actualCostMs ?? scene.renderDurationMs)
        : Math.max(0, scheduling.actualFinishMs - scheduling.actualStartMs);
    const assignment =
      input.mode === "remote-container"
        ? ("remote" as const)
        : input.mode === "native-local" || input.mode === "local-container"
          ? ("local" as const)
          : (scheduling?.lane ?? "local");
    return {
      sceneId: scene.sceneId,
      sourceSvgHash: scene.svgHash,
      fragmentSha256: scene.sha256,
      workerAssignment: assignment,
      predictedDurationMs:
        scene.execution === undefined
          ? notInstrumented
          : available(scene.execution.predictedCostMs),
      actualDurationMs: available(actualDurationMs),
      actualInterval: {
        startMs,
        finishMs: startMs + actualDurationMs,
      },
      cache: scene.execution?.cache ?? {
        rasterHits: 0,
        rasterMisses: 0,
        videoHits: scene.cacheMissCount === 0 ? 1 : 0,
        videoMisses: scene.cacheMissCount > 0 ? 1 : 0,
      },
      transferBytes: scheduling?.transferBytes ?? 0,
      attempts: scheduling?.attempts ?? 1,
      ...(scheduling?.reassignedFrom
        ? { reassignedFrom: scheduling.reassignedFrom }
        : {}),
    };
  });
  const renderMs = Math.max(
    ...scenes.map((scene) => scene.actualInterval.finishMs)
  );
  return {
    runId: input.runId,
    mode: input.mode,
    cacheState: input.cacheState,
    clientWallMs: Math.max(1, Math.round(input.clientWallMs)),
    timings: {
      renderMs: available(renderMs),
      assemblyMs: available(input.result.assembly.durationMs),
      qaMs: notInstrumented,
    },
    cache: {
      hitCount: input.result.cacheHitCount,
      missCount: input.result.cacheMissCount,
    },
    transferBytes: scenes.reduce(
      (total, scene) => total + scene.transferBytes,
      0
    ),
    output: {
      byteLength: input.result.validation.byteLength,
      sha256: input.result.validation.sha256,
      validated: true,
    },
    resources: {
      localCpuSlots: available(input.localCpuSlots),
      remoteCpuSlots:
        input.remoteCpuSlots === undefined
          ? notApplicable
          : available(input.remoteCpuSlots),
      peakMemoryBytes: notSupported,
    },
    toolchain: input.result.scenes[0]!.toolchain,
    scenes,
    overlap: { status: "not-proved", reason: "single-lane-run" },
  };
}

export async function runSystemMathRenderBenchmark(input: {
  readonly benchmarkInput: MathRenderBenchmarkInput;
  readonly sourceRoot: string;
  readonly config: RuntimeConfig;
  readonly repositoryRoot: string;
  readonly artifactPath: string;
  readonly authorizedResourceUse: boolean;
  readonly now?: Date;
}): Promise<MathRenderBenchmarkArtifact> {
  if (!input.authorizedResourceUse) {
    throw new Error(
      "Benchmark execution requires explicit --authorize-resource-use."
    );
  }
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediaforge-math-benchmark-")
  );
  const cacheRoots = new Map<MathRenderBenchmarkMode, string>();
  try {
    const executor: MathRenderBenchmarkCaseExecutor = {
      execute: async (benchmarkCase) => {
        const caseRoot = benchmarkCase.outputRoot;
        await copyBenchmarkInputs({
          sourceRoot: input.sourceRoot,
          destinationRoot: caseRoot,
          benchmarkInput: input.benchmarkInput,
        });
        const cacheRoot =
          cacheRoots.get(benchmarkCase.mode) ??
          path.join(temporaryRoot, "cache", benchmarkCase.mode);
        cacheRoots.set(benchmarkCase.mode, cacheRoot);
        if (benchmarkCase.cacheState === "cold") {
          await fs.rm(cacheRoot, { recursive: true, force: true });
        }
        await fs.mkdir(cacheRoot, { recursive: true });
        let sceneShardExecutor: MathSceneShardExecutor | undefined;
        let imageId = createMathRenderToolchainIdentity().workerImageId;
        if (benchmarkCase.mode === "local-container") {
          const execution = await createMathLocalContainerRenderExecution({
            config: input.config,
            repositoryRoot: input.repositoryRoot,
            workspaceRoot: path.join(temporaryRoot, "local-container"),
          });
          imageId = execution.imageId;
          sceneShardExecutor = execution.sceneShardExecutor;
        } else if (
          benchmarkCase.mode === "remote-container" ||
          benchmarkCase.mode === "hybrid"
        ) {
          const execution = await createMathWorkflowRenderExecution({
            config: input.config,
            repositoryRoot: input.repositoryRoot,
            workspaceRoot: path.join(temporaryRoot, benchmarkCase.mode),
            explicitMode:
              benchmarkCase.mode === "remote-container" ? "remote" : "hybrid",
          });
          if (!execution.imageId || !execution.sceneShardExecutor) {
            throw new Error("Container benchmark execution is unavailable.");
          }
          imageId = execution.imageId;
          sceneShardExecutor = execution.sceneShardExecutor;
        }
        const plan = rebindPlanImage(input.benchmarkInput.plan, imageId);
        const outputRelativePath = "output/final.mp4";
        const startedAt = Date.now();
        const result = await executeCompatibleMathRenderPlan({
          plan,
          jobRoot: caseRoot,
          narrationRelativePath: input.benchmarkInput.narration.relativePath,
          outputRelativePath,
          workRelativePath: "work",
          cacheRoot,
          cpuSlotBudget: input.config.mathLocalSceneSlots,
          ...(sceneShardExecutor ? { sceneShardExecutor } : {}),
        });
        return runFromRenderResult({
          runId: benchmarkCase.runId,
          mode: benchmarkCase.mode,
          cacheState: benchmarkCase.cacheState,
          result,
          clientWallMs: Date.now() - startedAt,
          localCpuSlots: input.config.mathLocalSceneSlots,
          ...(benchmarkCase.mode === "remote-container" ||
          benchmarkCase.mode === "hybrid"
            ? { remoteCpuSlots: input.config.mathRemoteSceneSlots }
            : {}),
        });
      },
    };
    const artifact = await runMathRenderBenchmark({
      benchmarkInput: input.benchmarkInput,
      temporaryRoot,
      executeCase: executor,
      ...(input.now ? { createdAt: input.now } : {}),
    });
    await writeJsonAtomic(input.artifactPath, artifact);
    return artifact;
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function benchmarkArtifactName(
  lessonId: string,
  now = new Date()
): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "z")
    .toLowerCase();
  const suffix = createHash("sha256")
    .update(`${lessonId}:${stamp}`)
    .digest("hex")
    .slice(0, 8);
  return `${lessonId}-${stamp}-${suffix}.json`;
}
