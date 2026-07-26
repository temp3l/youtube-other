import { canonicalHash } from "@mediaforge/math-education/canonical-json.js";
import { z } from "zod";
import {
  mathRenderPlanSchema,
  portableRelativePathSchema,
} from "../composition/portable-scene-contract.js";

export const MATH_RENDER_BENCHMARK_INPUT_VERSION =
  "math-render-benchmark-input.v1" as const;
export const MATH_RENDER_BENCHMARK_VERSION =
  "math-render-benchmark.v1" as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const imageIdSchema = z
  .string()
  .regex(/^(?:sha256:[a-f0-9]{64}|local:[a-z0-9][a-z0-9._:-]*)$/u);
const safeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);
const unavailableReasonSchema = z.enum([
  "not-instrumented",
  "not-supported",
  "not-reported",
  "not-applicable",
]);

const integerMeasurementSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("available"),
    value: z.number().int().nonnegative(),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: unavailableReasonSchema,
  }),
]);

const positiveRatioMeasurementSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("available"),
    value: z.number().positive(),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: unavailableReasonSchema,
  }),
]);

const benchmarkInputFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_BENCHMARK_INPUT_VERSION),
  lessonId: safeIdSchema,
  language: z.literal("de"),
  plan: mathRenderPlanSchema,
  narration: z.strictObject({
    relativePath: portableRelativePathSchema,
    sha256: hashSchema,
  }),
  identities: z.strictObject({
    timingHash: hashSchema,
    visualPlanHash: hashSchema,
  }),
});

export const mathRenderBenchmarkInputSchema = benchmarkInputFieldsSchema
  .extend({ contentHash: hashSchema })
  .strict()
  .superRefine((input, context) => {
    if (input.plan.jobId !== input.lessonId) {
      context.addIssue({
        code: "custom",
        path: ["plan", "jobId"],
        message: "Benchmark input plan does not match the lesson.",
      });
    }
    const { contentHash, ...payload } = input;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Benchmark input hash does not match its content.",
      });
    }
  });

export function bindMathRenderBenchmarkInput(
  input: z.input<typeof benchmarkInputFieldsSchema>
): MathRenderBenchmarkInput {
  const payload = benchmarkInputFieldsSchema.parse(input);
  return mathRenderBenchmarkInputSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export const mathRenderBenchmarkModeSchema = z.enum([
  "native-local",
  "local-container",
  "remote-container",
  "hybrid",
]);
export const mathRenderBenchmarkCacheStateSchema = z.enum(["cold", "warm"]);

const benchmarkSceneSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  sourceSvgHash: hashSchema,
  fragmentSha256: hashSchema,
  workerAssignment: z.enum(["local", "remote"]),
  predictedDurationMs: integerMeasurementSchema,
  actualDurationMs: integerMeasurementSchema,
  actualInterval: z.strictObject({
    startMs: z.number().int().nonnegative(),
    finishMs: z.number().int().nonnegative(),
  }),
  cache: z.strictObject({
    rasterHits: z.number().int().nonnegative(),
    rasterMisses: z.number().int().nonnegative(),
    videoHits: z.number().int().nonnegative(),
    videoMisses: z.number().int().nonnegative(),
  }),
  transferBytes: z.number().int().nonnegative(),
  attempts: z.number().int().positive(),
  reassignedFrom: z.literal("remote").optional(),
});

const benchmarkRunSchema = z.strictObject({
  runId: safeIdSchema,
  mode: mathRenderBenchmarkModeSchema,
  cacheState: mathRenderBenchmarkCacheStateSchema,
  clientWallMs: z.number().int().positive(),
  timings: z.strictObject({
    renderMs: integerMeasurementSchema,
    assemblyMs: integerMeasurementSchema,
    qaMs: integerMeasurementSchema,
  }),
  cache: z.strictObject({
    hitCount: z.number().int().nonnegative(),
    missCount: z.number().int().nonnegative(),
  }),
  transferBytes: z.number().int().nonnegative(),
  output: z.strictObject({
    byteLength: z.number().int().positive(),
    sha256: hashSchema,
    validated: z.literal(true),
  }),
  resources: z.strictObject({
    localCpuSlots: integerMeasurementSchema,
    remoteCpuSlots: integerMeasurementSchema,
    peakMemoryBytes: integerMeasurementSchema,
  }),
  toolchain: z.strictObject({
    workerImageId: imageIdSchema,
    remotionRunnerVersion: z.string().min(1).max(120),
    svgRendererVersion: z.string().min(1).max(120),
    semanticChalkVersion: z.string().min(1).max(120),
    mediaQaVersion: z.string().min(1).max(120),
  }),
  scenes: z.array(benchmarkSceneSchema).length(9),
  overlap: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("proved"),
      startMs: z.number().int().nonnegative(),
      finishMs: z.number().int().positive(),
      durationMs: z.number().int().positive(),
    }),
    z.strictObject({
      status: z.literal("not-proved"),
      reason: z.enum(["single-lane-run", "no-cross-lane-overlap"]),
    }),
  ]),
});

const benchmarkArtifactFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_BENCHMARK_VERSION),
  createdAt: z.string().datetime(),
  selection: z.strictObject({
    lessonId: safeIdSchema,
    language: z.literal("de"),
    inputHash: hashSchema,
    planHash: hashSchema,
    timingHash: hashSchema,
    visualPlanHash: hashSchema,
  }),
  safeguards: z.strictObject({
    providerCalls: z.literal(0),
    canonicalOutputsReplaced: z.literal(false),
    isolatedTemporaryOutputs: z.literal(true),
    containsHostAddress: z.literal(false),
    containsAbsolutePaths: z.literal(false),
    containsNarrationContent: z.literal(false),
  }),
  runs: z.array(benchmarkRunSchema).length(8),
  acceptance: z.strictObject({
    thresholdRatio: z.literal(0.8),
    hybridWarmClientWallMs: integerMeasurementSchema,
    nativeLocalWarmClientWallMs: integerMeasurementSchema,
    ratio: positiveRatioMeasurementSchema,
    observedSpeedup: positiveRatioMeasurementSchema,
    status: z.enum(["passed", "blocked-slower", "blocked-inconclusive"]),
  }),
  throughputComparison: z.strictObject({
    idealCombinedThroughputBoundMs: integerMeasurementSchema,
    measuredHybridWarmClientWallMs: integerMeasurementSchema,
    gapMs: integerMeasurementSchema,
    contributors: z.array(
      z.enum([
        "startup",
        "transfer",
        "assembly",
        "qa",
        "cache",
        "tail-imbalance",
        "unmeasured",
      ])
    ),
  }),
  recommendation: z.strictObject({
    configuredDefault: z.literal("local"),
    recommendHybrid: z.boolean(),
    reason: z.enum([
      "acceptance-passed",
      "acceptance-not-met",
      "measurement-inconclusive",
      "overlap-not-proved",
    ]),
  }),
});

const expectedRunKeys = new Set(
  mathRenderBenchmarkModeSchema.options.flatMap((mode) =>
    mathRenderBenchmarkCacheStateSchema.options.map(
      (cacheState) => `${mode}:${cacheState}`
    )
  )
);

export const mathRenderBenchmarkArtifactSchema = benchmarkArtifactFieldsSchema
  .extend({ contentHash: hashSchema })
  .strict()
  .superRefine((artifact, context) => {
    const runKeys = new Set(
      artifact.runs.map((run) => `${run.mode}:${run.cacheState}`)
    );
    if (
      runKeys.size !== expectedRunKeys.size ||
      [...expectedRunKeys].some((key) => !runKeys.has(key))
    ) {
      context.addIssue({
        code: "custom",
        path: ["runs"],
        message:
          "Benchmark artifact must contain one cold and warm run per mode.",
      });
    }
    for (const [runIndex, run] of artifact.runs.entries()) {
      const expectedScenes = run.scenes.every(
        (scene, sceneIndex) =>
          scene.sceneId ===
            `scene-${String(sceneIndex + 1).padStart(3, "0")}` &&
          scene.actualInterval.finishMs >= scene.actualInterval.startMs
      );
      if (!expectedScenes) {
        context.addIssue({
          code: "custom",
          path: ["runs", runIndex, "scenes"],
          message: "Benchmark scenes must be canonical with valid intervals.",
        });
      }
    }
    const { contentHash, ...payload } = artifact;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Benchmark artifact hash does not match its content.",
      });
    }
  });

export function bindMathRenderBenchmarkArtifact(
  input: z.input<typeof benchmarkArtifactFieldsSchema>
): MathRenderBenchmarkArtifact {
  const payload = benchmarkArtifactFieldsSchema.parse(input);
  return mathRenderBenchmarkArtifactSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export type MathRenderBenchmarkInput = z.infer<
  typeof mathRenderBenchmarkInputSchema
>;
export type MathRenderBenchmarkArtifact = z.infer<
  typeof mathRenderBenchmarkArtifactSchema
>;
export type MathRenderBenchmarkMode = z.infer<
  typeof mathRenderBenchmarkModeSchema
>;
export type MathRenderBenchmarkCacheState = z.infer<
  typeof mathRenderBenchmarkCacheStateSchema
>;
export type MathRenderBenchmarkRun = z.infer<typeof benchmarkRunSchema>;
export type MathRenderIntegerMeasurement = z.infer<
  typeof integerMeasurementSchema
>;
