import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bindMathPortableScene,
  bindMathRenderBenchmarkInput,
  bindMathRenderPlan,
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
  mathRenderBenchmarkArtifactSchema,
  MATH_SEMANTIC_CHALK_VERSION,
  type MathRenderBenchmarkMode,
  type MathRenderBenchmarkRun,
} from "@mediaforge/math-rendering";
import {
  runMathRenderBenchmark,
  type MathRenderBenchmarkCaseExecutor,
} from "./math-render-benchmark.js";

vi.mock(
  "@mediaforge/math-rendering",
  async () => import("../../../packages/math-rendering/src/index.js")
);

const hash = (digit: string) => digit.repeat(64);

function benchmarkInput() {
  const encoding = createMathFragmentEncoding("publish");
  const toolchain = createMathRenderToolchainIdentity("local:benchmark-test");
  const scenes = Array.from({ length: 9 }, (_, index) => {
    const sceneId = `scene-${String(index + 1).padStart(3, "0")}`;
    return bindMathPortableScene({
      sceneId,
      order: index,
      startFrame: index * 600,
      endFrame: (index + 1) * 600,
      expectedFrameCount: 600,
      svgRelativePath: `inputs/${sceneId}.svg`,
      svgHash: hash(((index + 1) % 10).toString()),
      minimumGlyphPx: 72,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      animation: {
        mode: "progressive-chalk-reveal",
        rendererVersion: MATH_SEMANTIC_CHALK_VERSION,
        cues: [],
        activity: "standard",
      },
      fragmentRelativePath: `work/fragments/${sceneId}.mp4`,
      encoding,
      toolchain,
    });
  });
  return bindMathRenderBenchmarkInput({
    artifactVersion: "math-render-benchmark-input.v1",
    lessonId: "m5-zo-001-standard",
    language: "de",
    plan: bindMathRenderPlan({
      artifactVersion: "math-render-plan.v1",
      jobId: "m5-zo-001-standard",
      compositionId: "m5-zo-001-standard",
      durationInFrames: 5_400,
      scenes,
    }),
    narration: {
      relativePath: "audio/narration.wav",
      sha256: hash("a"),
    },
    identities: {
      timingHash: hash("b"),
      visualPlanHash: hash("c"),
    },
  });
}

function runFixture(
  mode: MathRenderBenchmarkMode,
  cacheState: "cold" | "warm",
  hybridOverlap = true
): MathRenderBenchmarkRun {
  const clientWallMs =
    mode === "native-local" && cacheState === "warm"
      ? 1_000
      : mode === "hybrid" && cacheState === "warm"
        ? 750
        : 1_200;
  const scenes = Array.from({ length: 9 }, (_, index) => {
    const remote =
      mode === "remote-container" ||
      (mode === "hybrid" && hybridOverlap && index >= 4);
    const startMs = mode === "hybrid" ? (index % 4) * 50 : index * 100;
    return {
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sourceSvgHash: hash(((index + 1) % 10).toString()),
      fragmentSha256: hash(((index + 2) % 10).toString()),
      workerAssignment: remote ? ("remote" as const) : ("local" as const),
      predictedDurationMs: { status: "available" as const, value: 200 },
      actualDurationMs: { status: "available" as const, value: 200 },
      actualInterval: { startMs, finishMs: startMs + 200 },
      cache: {
        rasterHits: cacheState === "warm" ? 1 : 0,
        rasterMisses: cacheState === "cold" ? 1 : 0,
        videoHits: cacheState === "warm" ? 1 : 0,
        videoMisses: cacheState === "cold" ? 1 : 0,
      },
      transferBytes: remote ? 100 : 0,
      attempts: 1,
    };
  });
  return {
    runId: `${mode}-${cacheState}`,
    mode,
    cacheState,
    clientWallMs,
    timings: {
      renderMs: { status: "available", value: 900 },
      assemblyMs: { status: "available", value: 100 },
      qaMs: { status: "unavailable", reason: "not-instrumented" },
    },
    cache: {
      hitCount: cacheState === "warm" ? 18 : 0,
      missCount: cacheState === "cold" ? 18 : 0,
    },
    transferBytes: scenes.reduce(
      (total, scene) => total + scene.transferBytes,
      0
    ),
    output: {
      byteLength: 1_000_000,
      sha256: hash("d"),
      validated: true,
    },
    resources: {
      localCpuSlots: { status: "available", value: 2 },
      remoteCpuSlots:
        mode === "remote-container" || mode === "hybrid"
          ? { status: "available", value: 2 }
          : { status: "unavailable", reason: "not-applicable" },
      peakMemoryBytes: {
        status: "unavailable",
        reason: "not-supported",
      },
    },
    toolchain: createMathRenderToolchainIdentity(
      mode === "native-local"
        ? "local:benchmark-test"
        : `sha256:${"e".repeat(64)}`
    ),
    scenes,
    overlap: { status: "not-proved", reason: "single-lane-run" },
  };
}

describe("math renderer benchmark artifact", () => {
  it("records eight isolated provider-free runs, real overlap, and a passing ratio", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-benchmark-test-")
    );
    const executor: MathRenderBenchmarkCaseExecutor = {
      execute: async ({ mode, cacheState }) => runFixture(mode, cacheState),
    };
    try {
      const artifact = await runMathRenderBenchmark({
        benchmarkInput: benchmarkInput(),
        temporaryRoot: root,
        executeCase: executor,
        createdAt: new Date("2026-07-26T12:00:00.000Z"),
      });
      expect(artifact.runs).toHaveLength(8);
      expect(artifact.acceptance).toMatchObject({
        status: "passed",
        ratio: { status: "available", value: 0.75 },
        observedSpeedup: {
          status: "available",
          value: 4 / 3,
        },
      });
      expect(
        artifact.runs.find(
          (run) => run.mode === "hybrid" && run.cacheState === "warm"
        )?.overlap.status
      ).toBe("proved");
      expect(artifact.recommendation).toEqual({
        configuredDefault: "local",
        recommendHybrid: true,
        reason: "acceptance-passed",
      });
      expect(mathRenderBenchmarkArtifactSchema.parse(artifact)).toEqual(
        artifact
      );
      const serialized = JSON.stringify(artifact);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain("Narration text must never appear");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps local recommended and marks ratios unavailable when hybrid overlap is not proved", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-benchmark-test-")
    );
    try {
      const artifact = await runMathRenderBenchmark({
        benchmarkInput: benchmarkInput(),
        temporaryRoot: root,
        executeCase: {
          execute: async ({ mode, cacheState }) =>
            runFixture(mode, cacheState, false),
        },
      });
      expect(artifact.acceptance).toMatchObject({
        status: "blocked-inconclusive",
        ratio: { status: "unavailable", reason: "not-reported" },
      });
      expect(artifact.recommendation).toEqual({
        configuredDefault: "local",
        recommendHybrid: false,
        reason: "overlap-not-proved",
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
