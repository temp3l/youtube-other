import path from "node:path";
import { canonicalHash } from "@mediaforge/math-education/canonical-json.js";
import { z } from "zod";
import {
  mathFragmentMetadataSchema,
  mathSceneShardResultSchema,
  resolveMathJobPath,
  type MathFragmentMetadata,
  type MathSceneShardRequest,
} from "../composition/portable-scene-contract.js";
import { MATH_REMOTION_RUNNER_VERSION } from "../composition/renderer-versions.js";

export const MATH_RENDER_WORKER_RESULT_VERSION =
  "math-render-worker-result.v1" as const;
export const MATH_RENDER_WORKER_SCENE_RESULT_VERSION =
  "math-render-worker-scene-result.v1" as const;
export const MATH_RENDER_WORKER_LOG_VERSION =
  "math-render-worker-log.v1" as const;
export const MATH_RENDER_WORKER_SECURITY_POLICY_VERSION =
  "math-render-worker-security.v1" as const;

export const MATH_RENDER_WORKER_UID = 65_534;
export const MATH_RENDER_WORKER_GID = 65_534;
export const MATH_RENDER_WORKER_MAX_MANIFEST_BYTES = 512 * 1024;
export const MATH_RENDER_WORKER_MAX_LOG_BYTES = 32 * 1024;

export const mathRenderWorkerExitClassSchema = z.enum([
  "success",
  "invalid-job",
  "containment-integrity",
  "insufficient-resources",
  "transient-process",
  "cancellation",
]);

export type MathRenderWorkerExitClass = z.infer<
  typeof mathRenderWorkerExitClassSchema
>;

export const MATH_RENDER_WORKER_EXIT_CODES: Readonly<
  Record<MathRenderWorkerExitClass, number>
> = {
  success: 0,
  "invalid-job": 64,
  "containment-integrity": 65,
  "insufficient-resources": 69,
  "transient-process": 75,
  cancellation: 130,
};

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const safeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);
const boundedVersionSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => !/[\r\n\0]/u.test(value), "Version must be one line.");

export const mathRenderWorkerProvenanceSchema = z.strictObject({
  imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  buildRevision: z.string().regex(/^[a-f0-9]{40,64}$/u),
  nodeVersion: z.string().regex(/^v22\.\d+\.\d+$/u),
  sharpVersion: boundedVersionSchema,
  ffmpegVersion: boundedVersionSchema,
  rendererVersion: z.literal(MATH_REMOTION_RUNNER_VERSION),
  encoder: z.literal("libx264"),
  cpuQuota: z.number().int().positive().max(1_024),
  cacheNamespaces: z.strictObject({
    raster: hashSchema,
    sceneVideo: hashSchema,
  }),
  securityPolicyVersion: z.literal(
    MATH_RENDER_WORKER_SECURITY_POLICY_VERSION
  ),
  uid: z.literal(MATH_RENDER_WORKER_UID),
  gid: z.literal(MATH_RENDER_WORKER_GID),
  networkInterfaces: z.tuple([z.literal("lo")]),
});

export type MathRenderWorkerProvenance = z.infer<
  typeof mathRenderWorkerProvenanceSchema
>;

const workerSceneResultFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_WORKER_SCENE_RESULT_VERSION),
  jobId: safeIdSchema,
  planHash: hashSchema,
  assignmentId: safeIdSchema,
  requestHash: hashSchema,
  fragment: mathFragmentMetadataSchema,
  worker: mathRenderWorkerProvenanceSchema,
});

export const mathRenderWorkerSceneResultSchema =
  workerSceneResultFieldsSchema
    .extend({ contentHash: hashSchema })
    .strict()
    .superRefine((result, context) => {
      const { contentHash, ...payload } = result;
      if (contentHash !== canonicalHash(payload)) {
        context.addIssue({
          code: "custom",
          path: ["contentHash"],
          message: "Worker scene-result hash does not match its content.",
        });
      }
    });

export type MathRenderWorkerSceneResult = z.infer<
  typeof mathRenderWorkerSceneResultSchema
>;

const workerResultFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_WORKER_RESULT_VERSION),
  status: z.literal("succeeded"),
  exitClass: z.literal("success"),
  jobId: safeIdSchema,
  planHash: hashSchema,
  assignmentId: safeIdSchema,
  requestHash: hashSchema,
  worker: mathRenderWorkerProvenanceSchema,
  shardResult: mathSceneShardResultSchema,
  sceneResultRelativePaths: z
    .array(z.string().min(1).max(512))
    .min(1)
    .max(9),
});

export const mathRenderWorkerResultSchema = workerResultFieldsSchema
  .extend({ contentHash: hashSchema })
  .strict()
  .superRefine((result, context) => {
    const { contentHash, ...payload } = result;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Worker result hash does not match its content.",
      });
    }
    if (
      result.shardResult.requestHash !== result.requestHash ||
      result.shardResult.fragments.length !==
        result.sceneResultRelativePaths.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Worker result does not match its shard result.",
      });
    }
  });

export type MathRenderWorkerResult = z.infer<
  typeof mathRenderWorkerResultSchema
>;

export const mathRenderWorkerLogSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_WORKER_LOG_VERSION),
  event: z.enum(["started", "succeeded", "failed"]),
  jobId: safeIdSchema,
  assignmentId: safeIdSchema,
  requestHash: hashSchema,
  exitClass: mathRenderWorkerExitClassSchema,
  sceneCount: z.number().int().min(1).max(9),
});

export type MathRenderWorkerLog = z.infer<typeof mathRenderWorkerLogSchema>;

export function bindMathRenderWorkerSceneResult(input: {
  readonly request: MathSceneShardRequest;
  readonly fragment: MathFragmentMetadata;
  readonly worker: MathRenderWorkerProvenance;
}): MathRenderWorkerSceneResult {
  const payload = workerSceneResultFieldsSchema.parse({
    artifactVersion: MATH_RENDER_WORKER_SCENE_RESULT_VERSION,
    jobId: input.request.jobId,
    planHash: input.request.planHash,
    assignmentId: input.request.assignmentId,
    requestHash: input.request.requestHash,
    fragment: input.fragment,
    worker: input.worker,
  });
  return mathRenderWorkerSceneResultSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export function bindMathRenderWorkerResult(input: {
  readonly request: MathSceneShardRequest;
  readonly worker: MathRenderWorkerProvenance;
  readonly shardResult: z.input<typeof mathSceneShardResultSchema>;
  readonly sceneResultRelativePaths: readonly string[];
}): MathRenderWorkerResult {
  const payload = workerResultFieldsSchema.parse({
    artifactVersion: MATH_RENDER_WORKER_RESULT_VERSION,
    status: "succeeded",
    exitClass: "success",
    jobId: input.request.jobId,
    planHash: input.request.planHash,
    assignmentId: input.request.assignmentId,
    requestHash: input.request.requestHash,
    worker: input.worker,
    shardResult: input.shardResult,
    sceneResultRelativePaths: input.sceneResultRelativePaths,
  });
  return mathRenderWorkerResultSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export function mathRenderWorkerResultRelativePaths(
  request: MathSceneShardRequest
): {
  readonly log: string;
  readonly shardResult: string;
  readonly scenes: readonly string[];
} {
  const base = `${request.workRelativePath}/worker-results/${request.assignmentId}`;
  return {
    log: `${request.workRelativePath}/worker-logs/${request.assignmentId}.jsonl`,
    shardResult: `${base}/shard.json`,
    scenes: request.scenes.map(
      (scene) => `${base}/${scene.sceneId}.json`
    ),
  };
}

export function resolveMathRenderWorkerResultPaths(
  jobRoot: string,
  request: MathSceneShardRequest
): {
  readonly log: string;
  readonly shardResult: string;
  readonly scenes: readonly string[];
} {
  const relative = mathRenderWorkerResultRelativePaths(request);
  return {
    log: resolveMathJobPath(jobRoot, relative.log),
    shardResult: resolveMathJobPath(jobRoot, relative.shardResult),
    scenes: relative.scenes.map((value) => resolveMathJobPath(jobRoot, value)),
  };
}

export function isPathInside(root: string, candidate: string): boolean {
  const relation = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relation !== "" &&
    !relation.startsWith("..") &&
    !path.isAbsolute(relation)
  );
}
