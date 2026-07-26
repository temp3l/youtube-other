import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
} from "./portable-scene-contract.js";
import { createMathCacheNamespaces } from "./remotion-runner.js";
import {
  estimateMathSceneCost,
  executeMathSceneSchedule,
  scheduleMathScenes,
  type MathWorkerCapability,
} from "./scene-scheduler.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { force: true, recursive: true })
    )
  );
});

function worker(
  workerId: string,
  input: Partial<MathWorkerCapability> = {}
): MathWorkerCapability {
  return {
    workerId,
    workerImageId: "local:test-image",
    cpuSlots: 1,
    cache: { raster: true, sceneVideo: true },
    calibration: {
      rasterSamplesPerSecond: 10,
      encodeFramesPerSecond: 30,
      startupLatencyMs: 0,
    },
    ...input,
  };
}

function cost(totalMs: number) {
  return {
    rasterMs: 0,
    encodeMs: totalMs,
    startupMs: 0,
    transferMs: 0,
    totalMs,
  };
}

function scenes(count: number) {
  return Array.from({ length: count }, (_, order) => ({
    sceneId: `scene-${String(order + 1).padStart(3, "0")}`,
    order,
  }));
}

function assignments(
  count: number,
  capability: MathWorkerCapability
) {
  return scheduleMathScenes(
    scenes(count).map((scene) => ({
      scene,
      costsByWorkerId: { [capability.workerId]: cost(10) },
    })),
    [capability]
  );
}

describe("bounded math scene scheduling", () => {
  it("never exceeds the configured CPU-slot budget and preserves canonical result order", async () => {
    const capability = worker("local", { cpuSlots: 2 });
    let active = 0;
    let observedPeak = 0;
    const completionOrder: string[] = [];
    const scheduled = assignments(5, capability);
    const runtimeLanes = new Map<string, string>();
    const execution = await executeMathSceneSchedule({
      assignments: scheduled,
      execute: async (assignment) => {
        runtimeLanes.set(assignment.scene.sceneId, assignment.laneId);
        active += 1;
        observedPeak = Math.max(observedPeak, active);
        await new Promise((resolve) =>
          setTimeout(resolve, assignment.scene.order % 2 === 0 ? 20 : 2)
        );
        completionOrder.push(assignment.scene.sceneId);
        active -= 1;
        return assignment.scene.sceneId;
      },
    });

    expect(observedPeak).toBeLessThanOrEqual(2);
    expect(execution.peakActiveWork).toBe(observedPeak);
    expect(completionOrder).not.toEqual(scenes(5).map(({ sceneId }) => sceneId));
    expect(execution.orderedResults).toEqual(
      scenes(5).map(({ sceneId }) => sceneId)
    );
    expect(Object.keys(execution.resultsBySceneId)).toHaveLength(5);
    expect(runtimeLanes.get("scene-003")).not.toBe(
      scheduled.find(({ scene }) => scene.sceneId === "scene-003")?.laneId
    );
  });

  it("balances unequal scene costs better than canonical round-robin", () => {
    const workers = [worker("local"), worker("remote")];
    const predictedCosts = [90, 80, 70, 60];
    const scheduled = scheduleMathScenes(
      scenes(4).map((scene, index) => ({
        scene,
        costsByWorkerId: {
          local: cost(predictedCosts[index]!),
          remote: cost(predictedCosts[index]!),
        },
      })),
      workers
    );
    const finishes = Object.values(
      scheduled.reduce<Record<string, number>>((byWorker, assignment) => {
        byWorker[assignment.workerId] = Math.max(
          byWorker[assignment.workerId] ?? 0,
          assignment.predictedFinishMs
        );
        return byWorker;
      }, {})
    );
    const roundRobinFinish = Math.max(
      predictedCosts[0]! + predictedCosts[2]!,
      predictedCosts[1]! + predictedCosts[3]!
    );

    expect(Math.max(...finishes)).toBe(150);
    expect(Math.max(...finishes)).toBeLessThan(roundRobinFinish);
    expect(scheduled.map(({ scene }) => scene.sceneId)).toEqual([
      "scene-001",
      "scene-002",
      "scene-003",
      "scene-004",
    ]);
  });

  it("gives a faster cache-warm lane proportionally more work without starving the other lane", () => {
    const scheduled = scheduleMathScenes(
      scenes(8).map((scene) => ({
        scene,
        costsByWorkerId: {
          warm: cost(10),
          cold: cost(30),
        },
      })),
      [worker("warm"), worker("cold")]
    );
    const warmCount = scheduled.filter(
      ({ workerId }) => workerId === "warm"
    ).length;
    const coldCount = scheduled.length - warmCount;

    expect(warmCount).toBeGreaterThan(coldCount);
    expect(coldCount).toBeGreaterThan(0);
  });

  it("rejects duplicate claims and keeps single-slot execution sequential", async () => {
    const capability = worker("local");
    const scheduled = assignments(3, capability);
    await expect(
      executeMathSceneSchedule({
        assignments: [scheduled[0]!, scheduled[0]!],
        execute: async ({ scene }) => scene.sceneId,
      })
    ).rejects.toThrow("claimed only once");

    let active = 0;
    let peak = 0;
    const execution = await executeMathSceneSchedule({
      assignments: scheduled,
      execute: async ({ scene }) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return scene.order;
      },
    });
    expect(peak).toBe(1);
    expect(execution.orderedResults).toEqual([0, 1, 2]);
  });

  it("stops new work on cancellation, retains completed cache files, and removes partial files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-cancel-"));
    temporaryDirectories.push(root);
    const controller = new AbortController();
    const started: string[] = [];
    const scheduled = assignments(3, worker("local"));

    await expect(
      executeMathSceneSchedule({
        assignments: scheduled,
        signal: controller.signal,
        execute: async ({ scene }, signal) => {
          started.push(scene.sceneId);
          const completedPath = path.join(root, `${scene.sceneId}.cache`);
          const partialPath = `${completedPath}.partial`;
          await fs.writeFile(partialPath, scene.sceneId);
          try {
            if (scene.order === 0) {
              await fs.rename(partialPath, completedPath);
              return scene.sceneId;
            }
            controller.abort(new Error("cancelled by test"));
            await new Promise<void>((resolve, reject) => {
              const onAbort = (): void => reject(signal.reason);
              signal.addEventListener("abort", onAbort, { once: true });
              if (signal.aborted) onAbort();
              else setTimeout(resolve, 100);
            });
            await fs.rename(partialPath, completedPath);
            return scene.sceneId;
          } finally {
            await fs.unlink(partialPath).catch(() => undefined);
          }
        },
      })
    ).rejects.toThrow("cancelled by test");

    expect(started).toEqual(["scene-001", "scene-002"]);
    await expect(fs.readFile(path.join(root, "scene-001.cache"), "utf8")).resolves.toBe(
      "scene-001"
    );
    await expect(fs.access(path.join(root, "scene-002.cache.partial"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "scene-003.cache"))).rejects.toThrow();
  });
});

describe("math scene cost and cache identity", () => {
  it("estimates misses, encoded frames, startup, and transfer from worker calibration", () => {
    const estimate = estimateMathSceneCost(
      {
        rasterCacheMissCount: 20,
        semanticRasterSampleCount: 25,
        videoCacheMiss: true,
        expectedEncodedFrames: 300,
        transferBytes: 2_000_000,
      },
      worker("remote", {
        calibration: {
          rasterSamplesPerSecond: 10,
          encodeFramesPerSecond: 30,
          startupLatencyMs: 100,
          transferMegabytesPerSecond: 20,
        },
      })
    );
    expect(estimate).toEqual({
      rasterMs: 2_000,
      encodeMs: 10_000,
      startupMs: 100,
      transferMs: 100,
      totalMs: 12_200,
    });
  });

  it("separates renderer, toolchain, Sharp, FFmpeg, encoding, and format namespaces deterministically", () => {
    const base = {
      toolchain: createMathRenderToolchainIdentity("local:image-a"),
      encoding: createMathFragmentEncoding("publish"),
      sharpVersion: "0.34.3",
      ffmpegVersion: "ffmpeg 7.1",
    };
    const first = createMathCacheNamespaces(base);
    expect(createMathCacheNamespaces(base)).toEqual(first);
    expect(
      createMathCacheNamespaces({
        ...base,
        toolchain: createMathRenderToolchainIdentity("local:image-b"),
      })
    ).not.toEqual(first);
    expect(
      createMathCacheNamespaces({ ...base, sharpVersion: "0.35.0" }).raster
    ).not.toBe(first.raster);
    expect(
      createMathCacheNamespaces({
        ...base,
        ffmpegVersion: "ffmpeg 8.0",
      }).sceneVideo
    ).not.toBe(first.sceneVideo);
    expect(
      createMathCacheNamespaces({
        ...base,
        encoding: createMathFragmentEncoding("review"),
      }).sceneVideo
    ).not.toBe(first.sceneVideo);
  });
});
