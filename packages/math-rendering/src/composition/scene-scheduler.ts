import fs from "node:fs/promises";
import os from "node:os";

import type { MathPortableScene } from "./portable-scene-contract.js";

export interface MathWorkerCapability {
  readonly workerId: string;
  readonly workerImageId: string;
  readonly cpuSlots: number;
  readonly cache: {
    readonly raster: boolean;
    readonly sceneVideo: boolean;
  };
  readonly calibration: {
    readonly rasterSamplesPerSecond: number;
    readonly encodeFramesPerSecond: number;
    readonly startupLatencyMs: number;
    readonly transferMegabytesPerSecond?: number;
  };
}

export interface MathSceneCostInputs {
  readonly rasterCacheMissCount: number;
  readonly semanticRasterSampleCount: number;
  readonly videoCacheMiss: boolean;
  readonly expectedEncodedFrames: number;
  readonly transferBytes?: number;
}

export interface MathSceneCostEstimate {
  readonly rasterMs: number;
  readonly encodeMs: number;
  readonly startupMs: number;
  readonly transferMs: number;
  readonly totalMs: number;
}

export interface MathSceneScheduleInput<TScene extends { readonly sceneId: string; readonly order: number }> {
  readonly scene: TScene;
  readonly costsByWorkerId: Readonly<Record<string, MathSceneCostEstimate>>;
}

export interface MathSceneAssignment<TScene extends { readonly sceneId: string; readonly order: number }> {
  readonly scene: TScene;
  readonly workerId: string;
  readonly laneId: string;
  readonly predictedStartMs: number;
  readonly predictedFinishMs: number;
  readonly predictedCost: MathSceneCostEstimate;
}

export interface MathSceneExecutionResult<TResult> {
  readonly resultsBySceneId: Readonly<Record<string, TResult>>;
  readonly orderedResults: readonly TResult[];
  readonly assignments: readonly MathSceneAssignment<MathSceneScheduleInputScene>[];
  readonly peakActiveWork: number;
}

type MathSceneScheduleInputScene = {
  readonly sceneId: string;
  readonly order: number;
};

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be a positive finite number.`);
  return value;
}

export function validateMathWorkerCapability(
  capability: MathWorkerCapability
): MathWorkerCapability {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(capability.workerId))
    throw new Error("Math worker ID is invalid.");
  if (
    !/^(?:sha256:[a-f0-9]{64}|local:[a-z0-9][a-z0-9._:-]*)$/u.test(
      capability.workerImageId
    )
  )
    throw new Error("Math worker image/toolchain ID is invalid.");
  if (!Number.isInteger(capability.cpuSlots) || capability.cpuSlots <= 0)
    throw new Error("Math worker CPU slots must be a positive integer.");
  positiveFinite(
    capability.calibration.rasterSamplesPerSecond,
    "Raster calibration"
  );
  positiveFinite(
    capability.calibration.encodeFramesPerSecond,
    "Encode calibration"
  );
  if (
    !Number.isFinite(capability.calibration.startupLatencyMs) ||
    capability.calibration.startupLatencyMs < 0
  )
    throw new Error("Worker startup latency must be non-negative.");
  if (capability.calibration.transferMegabytesPerSecond !== undefined)
    positiveFinite(
      capability.calibration.transferMegabytesPerSecond,
      "Transfer calibration"
    );
  return capability;
}

export function estimateMathSceneCost(
  inputs: MathSceneCostInputs,
  rawCapability: MathWorkerCapability
): MathSceneCostEstimate {
  const capability = validateMathWorkerCapability(rawCapability);
  if (
    !Number.isInteger(inputs.rasterCacheMissCount) ||
    inputs.rasterCacheMissCount < 0 ||
    !Number.isInteger(inputs.semanticRasterSampleCount) ||
    inputs.semanticRasterSampleCount < 0 ||
    inputs.rasterCacheMissCount > inputs.semanticRasterSampleCount ||
    !Number.isInteger(inputs.expectedEncodedFrames) ||
    inputs.expectedEncodedFrames <= 0 ||
    !Number.isInteger(inputs.transferBytes ?? 0) ||
    (inputs.transferBytes ?? 0) < 0
  )
    throw new Error("Math scene cost inputs are invalid.");
  const rasterMs =
    (inputs.rasterCacheMissCount /
      capability.calibration.rasterSamplesPerSecond) *
    1_000;
  const encodeMs = inputs.videoCacheMiss
    ? (inputs.expectedEncodedFrames /
        capability.calibration.encodeFramesPerSecond) *
      1_000
    : 0;
  const startupMs = capability.calibration.startupLatencyMs;
  const transferMegabytesPerSecond =
    capability.calibration.transferMegabytesPerSecond;
  const transferMs =
    transferMegabytesPerSecond === undefined
      ? 0
      : ((inputs.transferBytes ?? 0) / 1_000_000 /
          transferMegabytesPerSecond) *
        1_000;
  return {
    rasterMs,
    encodeMs,
    startupMs,
    transferMs,
    totalMs: rasterMs + encodeMs + startupMs + transferMs,
  };
}

export function scheduleMathScenes<
  TScene extends { readonly sceneId: string; readonly order: number },
>(
  inputs: readonly MathSceneScheduleInput<TScene>[],
  rawWorkers: readonly MathWorkerCapability[]
): readonly MathSceneAssignment<TScene>[] {
  const workers = rawWorkers.map(validateMathWorkerCapability);
  if (workers.length === 0) throw new Error("At least one math worker is required.");
  if (new Set(workers.map((worker) => worker.workerId)).size !== workers.length)
    throw new Error("Math worker IDs must be unique.");
  if (new Set(inputs.map(({ scene }) => scene.sceneId)).size !== inputs.length)
    throw new Error("Every math scene may be scheduled only once.");
  const lanes = workers.flatMap((worker) =>
    Array.from({ length: worker.cpuSlots }, (_, slot) => ({
      worker,
      laneId: `${worker.workerId}:${String(slot).padStart(3, "0")}`,
      availableAtMs: 0,
    }))
  );
  const predictedCostFor = (
    input: MathSceneScheduleInput<TScene>,
    workerId: string
  ): MathSceneCostEstimate => {
    const cost = input.costsByWorkerId[workerId];
    if (!cost || !Number.isFinite(cost.totalMs) || cost.totalMs < 0)
      throw new Error(
        `Scene ${input.scene.sceneId} is incompatible with worker ${workerId}.`
      );
    return cost;
  };
  const pending = inputs
    .slice()
    .sort((left, right) => {
      const leftCost = Math.max(
        ...workers.map((worker) =>
          predictedCostFor(left, worker.workerId).totalMs
        )
      );
      const rightCost = Math.max(
        ...workers.map((worker) =>
          predictedCostFor(right, worker.workerId).totalMs
        )
      );
      return rightCost - leftCost || left.scene.order - right.scene.order;
    });
  const assignments: MathSceneAssignment<TScene>[] = [];
  for (const input of pending) {
    const lane = lanes
      .map((candidate) => {
        const cost = predictedCostFor(input, candidate.worker.workerId);
        return {
          candidate,
          cost,
          finishMs: candidate.availableAtMs + cost.totalMs,
        };
      })
      .sort(
        (left, right) =>
          left.finishMs - right.finishMs ||
          left.candidate.availableAtMs - right.candidate.availableAtMs ||
          left.candidate.laneId.localeCompare(right.candidate.laneId)
      )[0]!;
    assignments.push({
      scene: input.scene,
      workerId: lane.candidate.worker.workerId,
      laneId: lane.candidate.laneId,
      predictedStartMs: lane.candidate.availableAtMs,
      predictedFinishMs: lane.finishMs,
      predictedCost: lane.cost,
    });
    lane.candidate.availableAtMs = lane.finishMs;
  }
  return assignments;
}

export async function executeMathSceneSchedule<
  TScene extends { readonly sceneId: string; readonly order: number },
  TResult,
>(input: {
  readonly assignments: readonly MathSceneAssignment<TScene>[];
  readonly execute: (
    assignment: MathSceneAssignment<TScene>,
    signal: AbortSignal
  ) => Promise<TResult>;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly resultsBySceneId: Readonly<Record<string, TResult>>;
  readonly orderedResults: readonly TResult[];
  readonly peakActiveWork: number;
}> {
  const assignmentIds = input.assignments.map(
    ({ scene }) => scene.sceneId
  );
  if (new Set(assignmentIds).size !== assignmentIds.length)
    throw new Error("Every math scene may be claimed only once.");
  const controller = new AbortController();
  const abortFromCaller = (): void =>
    controller.abort(input.signal?.reason ?? new Error("Math render cancelled."));
  if (input.signal?.aborted) abortFromCaller();
  else input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const byWorker = new Map<
    string,
    {
      laneIds: Set<string>;
      pending: MathSceneAssignment<TScene>[];
    }
  >();
  for (const assignment of input.assignments) {
    const worker = byWorker.get(assignment.workerId) ?? {
      laneIds: new Set<string>(),
      pending: [],
    };
    worker.laneIds.add(assignment.laneId);
    worker.pending.push(assignment);
    byWorker.set(assignment.workerId, worker);
  }
  for (const worker of byWorker.values())
    worker.pending.sort(
      (left, right) =>
        left.predictedStartMs - right.predictedStartMs ||
        left.scene.order - right.scene.order
    );
  const claimed = new Set<string>();
  const results = new Map<string, TResult>();
  let activeWork = 0;
  let peakActiveWork = 0;
  try {
    await Promise.all(
      [...byWorker.values()].flatMap((worker) =>
        [...worker.laneIds].sort().map(async (laneId) => {
          while (worker.pending.length > 0) {
            if (controller.signal.aborted) break;
            const scheduledAssignment = worker.pending.shift();
            if (!scheduledAssignment) break;
            const assignment = { ...scheduledAssignment, laneId };
            if (claimed.has(assignment.scene.sceneId)) {
              controller.abort(
                new Error(
                  `Math scene claimed twice: ${assignment.scene.sceneId}.`
                )
              );
              break;
            }
            claimed.add(assignment.scene.sceneId);
            activeWork += 1;
            peakActiveWork = Math.max(peakActiveWork, activeWork);
            try {
              const result = await input.execute(
                assignment,
                controller.signal
              );
              results.set(assignment.scene.sceneId, result);
            } catch (error) {
              controller.abort(error);
              throw error;
            } finally {
              activeWork -= 1;
            }
          }
        })
      )
    );
    if (controller.signal.aborted)
      throw controller.signal.reason ?? new Error("Math render cancelled.");
    if (results.size !== input.assignments.length)
      throw new Error("Math scene schedule ended before every scene completed.");
    const orderedAssignments = input.assignments
      .slice()
      .sort((left, right) => left.scene.order - right.scene.order);
    return {
      resultsBySceneId: Object.fromEntries(results),
      orderedResults: orderedAssignments.map(
        ({ scene }) => results.get(scene.sceneId)!
      ),
      peakActiveWork,
    };
  } finally {
    input.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function readCpuQuotaFile(filePath: string): Promise<number | null> {
  try {
    const raw = (await fs.readFile(filePath, "utf8")).trim();
    const [quota, period] = raw.split(/\s+/u);
    if (quota === "max") return null;
    const parsedQuota = Number(quota);
    const parsedPeriod = Number(period);
    return parsedQuota > 0 && parsedPeriod > 0
      ? Math.max(1, Math.floor(parsedQuota / parsedPeriod))
      : null;
  } catch {
    return null;
  }
}

export async function detectMathCpuSlotBudget(): Promise<number> {
  const hostVisible = Math.max(1, os.availableParallelism());
  const unifiedQuota = await readCpuQuotaFile("/sys/fs/cgroup/cpu.max");
  if (unifiedQuota !== null) return Math.min(hostVisible, unifiedQuota);
  try {
    const [quotaRaw, periodRaw] = await Promise.all([
      fs.readFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "utf8"),
      fs.readFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us", "utf8"),
    ]);
    const quota = Number(quotaRaw.trim());
    const period = Number(periodRaw.trim());
    if (quota > 0 && period > 0)
      return Math.min(hostVisible, Math.max(1, Math.floor(quota / period)));
  } catch {
    // The host-visible count is authoritative when no cgroup quota is exposed.
  }
  return hostVisible;
}

export function defaultLocalMathWorkerCapability(input: {
  readonly workerImageId: string;
  readonly cpuSlots: number;
}): MathWorkerCapability {
  return validateMathWorkerCapability({
    workerId: "local",
    workerImageId: input.workerImageId,
    cpuSlots: input.cpuSlots,
    cache: { raster: true, sceneVideo: true },
    calibration: {
      rasterSamplesPerSecond: 8,
      encodeFramesPerSecond: 30,
      startupLatencyMs: 25,
    },
  });
}

export function conservativeMathSceneCostInputs(
  scene: MathPortableScene,
  semanticRasterSampleCount: number
): MathSceneCostInputs {
  return {
    rasterCacheMissCount: semanticRasterSampleCount,
    semanticRasterSampleCount,
    videoCacheMiss: true,
    expectedEncodedFrames: scene.expectedFrameCount,
  };
}
