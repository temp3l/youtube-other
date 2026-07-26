import path from "node:path";
import { canonicalHash } from "@mediaforge/math-education/canonical-json.js";
import { z } from "zod";
import {
  mathEncodingProfiles,
  type MathEncodingProfileId,
} from "../profiles/profiles.js";
import { MATH_SEMANTIC_CHALK_VERSION } from "./semantic-chalk.js";
import {
  MATH_MEDIA_QA_VERSION,
  MATH_REMOTION_RUNNER_VERSION,
  MATH_SVG_RENDERER_VERSION,
} from "./renderer-versions.js";

export const MATH_RENDER_PLAN_VERSION = "math-render-plan.v1" as const;
export const MATH_SCENE_SHARD_REQUEST_VERSION =
  "math-scene-shard-request.v1" as const;
export const MATH_SCENE_SHARD_RESULT_VERSION =
  "math-scene-shard-result.v1" as const;
export const MATH_LOCAL_TOOLCHAIN_IMAGE_ID =
  `local:${MATH_REMOTION_RUNNER_VERSION}` as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const safeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);
export const portableRelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .superRefine((value, context) => {
    const segments = value.split("/");
    if (
      path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      value.includes("\\") ||
      value.includes("\0") ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === ".."
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Portable render paths must be contained relative paths.",
      });
    }
  });

const captionSchema = z.strictObject({
  text: z.string().min(1).max(180),
  lines: z.array(z.string().min(1).max(60)).min(1).max(3),
  fontSizePx: z.literal(48),
});

const animationSchema = z.strictObject({
  mode: z.literal("progressive-chalk-reveal"),
  rendererVersion: z.literal(MATH_SEMANTIC_CHALK_VERSION),
  cues: z
    .array(
      z.strictObject({
        factId: z.string().regex(/^[a-z][a-z0-9-]*$/u),
        frame: z.number().int().nonnegative(),
      })
    )
    .default([]),
  activity: z.enum(["standard", "think-pause"]),
});

export const mathRenderToolchainIdentitySchema = z.strictObject({
  workerImageId: z
    .string()
    .regex(/^(?:sha256:[a-f0-9]{64}|local:[a-z0-9][a-z0-9._:-]*)$/u),
  remotionRunnerVersion: z.literal(MATH_REMOTION_RUNNER_VERSION),
  svgRendererVersion: z.literal(MATH_SVG_RENDERER_VERSION),
  semanticChalkVersion: z.literal(MATH_SEMANTIC_CHALK_VERSION),
  mediaQaVersion: z.literal(MATH_MEDIA_QA_VERSION),
});

export const mathFragmentEncodingSchema = z.strictObject({
  profileId: z.enum(["draft", "review", "publish"]),
  width: z.literal(1920),
  height: z.literal(1080),
  fps: z.literal(30),
  encoder: z.literal("libx264"),
  codec: z.literal("h264"),
  crf: z.union([z.literal(18), z.literal(21), z.literal(25)]),
  preset: z.enum(["veryfast", "medium", "slow"]),
  tune: z.literal("stillimage"),
  pixelFormat: z.literal("yuv420p"),
  container: z.literal("mp4"),
  audio: z.literal(false),
});

const sceneFieldsSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  order: z.number().int().min(0).max(8),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  expectedFrameCount: z.number().int().positive(),
  svgRelativePath: portableRelativePathSchema,
  svgHash: hashSchema,
  minimumGlyphPx: z.number().positive(),
  bounds: z.strictObject({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  animation: animationSchema,
  caption: captionSchema.optional(),
  fragmentRelativePath: portableRelativePathSchema,
  encoding: mathFragmentEncodingSchema,
  toolchain: mathRenderToolchainIdentitySchema,
});

export const mathPortableSceneSchema = sceneFieldsSchema
  .extend({ sceneHash: hashSchema })
  .strict()
  .superRefine((scene, context) => {
    const { sceneHash, ...payload } = scene;
    if (scene.endFrame - scene.startFrame !== scene.expectedFrameCount) {
      context.addIssue({
        code: "custom",
        path: ["expectedFrameCount"],
        message: "Scene frame count does not match its exact frame range.",
      });
    }
    if (
      scene.animation.cues.some(
        (cue) => cue.frame >= scene.expectedFrameCount
      ) ||
      new Set(scene.animation.cues.map((cue) => cue.factId)).size !==
        scene.animation.cues.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["animation", "cues"],
        message: "Scene cues must be unique and remain inside the scene.",
      });
    }
    if (sceneHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["sceneHash"],
        message: "Portable scene hash does not match its content.",
      });
    }
  });

const renderPlanFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_PLAN_VERSION),
  jobId: safeIdSchema,
  compositionId: safeIdSchema,
  durationInFrames: z.number().int().min(5_400).max(9_000),
  scenes: z.array(mathPortableSceneSchema).length(9),
});

export const mathRenderPlanSchema = renderPlanFieldsSchema
  .extend({ contentHash: hashSchema })
  .strict()
  .superRefine((plan, context) => {
    let cursor = 0;
    const sceneIds = new Set<string>();
    const fragmentPaths = new Set<string>();
    const encodingHashes = new Set<string>();
    const toolchainHashes = new Set<string>();
    for (const [index, scene] of plan.scenes.entries()) {
      const expectedSceneId = `scene-${String(index + 1).padStart(3, "0")}`;
      if (
        scene.sceneId !== expectedSceneId ||
        scene.order !== index ||
        sceneIds.has(scene.sceneId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "sceneId"],
          message: "Render plan scenes must be unique and canonically ordered.",
        });
      }
      if (scene.startFrame !== cursor) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "startFrame"],
          message: "Render plan frame ranges must have no gaps or overlaps.",
        });
      }
      if (fragmentPaths.has(scene.fragmentRelativePath)) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "fragmentRelativePath"],
          message: "Every scene fragment destination must be unique.",
        });
      }
      sceneIds.add(scene.sceneId);
      fragmentPaths.add(scene.fragmentRelativePath);
      encodingHashes.add(canonicalHash(scene.encoding));
      toolchainHashes.add(canonicalHash(scene.toolchain));
      cursor = scene.endFrame;
    }
    if (cursor !== plan.durationInFrames) {
      context.addIssue({
        code: "custom",
        path: ["durationInFrames"],
        message: "Render plan duration must match the final scene frame.",
      });
    }
    if (encodingHashes.size !== 1 || toolchainHashes.size !== 1) {
      context.addIssue({
        code: "custom",
        path: ["scenes"],
        message: "Render plan scenes must use one encoding and toolchain.",
      });
    }
    const { contentHash, ...payload } = plan;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Render plan hash does not match its content.",
      });
    }
  });

const shardRequestFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_SCENE_SHARD_REQUEST_VERSION),
  jobId: safeIdSchema,
  planHash: hashSchema,
  assignmentId: safeIdSchema,
  workRelativePath: portableRelativePathSchema,
  scenes: z.array(mathPortableSceneSchema).min(1).max(9),
});

export const mathSceneShardRequestSchema = shardRequestFieldsSchema
  .extend({ requestHash: hashSchema })
  .strict()
  .superRefine((request, context) => {
    let priorOrder = -1;
    const ids = new Set<string>();
    for (const [index, scene] of request.scenes.entries()) {
      if (ids.has(scene.sceneId) || scene.order <= priorOrder) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "sceneId"],
          message: "Shard scenes must be unique and retain canonical order.",
        });
      }
      ids.add(scene.sceneId);
      priorOrder = scene.order;
    }
    const { requestHash, ...payload } = request;
    if (requestHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["requestHash"],
        message: "Scene shard request hash does not match its content.",
      });
    }
  });

export const mathFragmentMetadataSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  order: z.number().int().min(0).max(8),
  sceneHash: hashSchema,
  svgHash: hashSchema,
  relativePath: portableRelativePathSchema,
  sha256: hashSchema,
  byteLength: z.number().int().positive(),
  frameCount: z.number().int().positive(),
  width: z.literal(1920),
  height: z.literal(1080),
  fps: z.literal(30),
  pixelFormat: z.literal("yuv420p"),
  codec: z.literal("h264"),
  codecProfile: z.string().min(1),
  timeBase: z.string().regex(/^\d+\/\d+$/u),
  audioStreamCount: z.literal(0),
  encoding: mathFragmentEncodingSchema,
  toolchain: mathRenderToolchainIdentitySchema,
  renderDurationMs: z.number().int().nonnegative(),
  cacheHitCount: z.number().int().nonnegative(),
  cacheMissCount: z.number().int().nonnegative(),
  execution: z
    .strictObject({
      workerId: safeIdSchema,
      predictedCostMs: z.number().nonnegative(),
      actualCostMs: z.number().int().nonnegative(),
      queueWaitMs: z.number().int().nonnegative(),
      peakActiveWork: z.number().int().positive(),
      phases: z.strictObject({
        svgGenerationMs: z.number().int().nonnegative(),
        rasterizationMs: z.number().int().nonnegative(),
        sceneEncodingMs: z.number().int().nonnegative(),
        validationMs: z.number().int().nonnegative(),
      }),
      cache: z.strictObject({
        rasterHits: z.number().int().nonnegative(),
        rasterMisses: z.number().int().nonnegative(),
        videoHits: z.number().int().nonnegative(),
        videoMisses: z.number().int().nonnegative(),
      }),
      scheduling: z
        .strictObject({
          lane: z.enum(["local", "remote"]),
          assignmentId: safeIdSchema,
          predictedStartMs: z.number().nonnegative(),
          predictedFinishMs: z.number().nonnegative(),
          actualStartMs: z.number().int().nonnegative(),
          actualFinishMs: z.number().int().nonnegative(),
          attempts: z.number().int().positive(),
          reassignedFrom: z.enum(["remote"]).optional(),
          transferBytes: z.number().int().nonnegative(),
          fallbackStatus: z.enum(["none", "reassigned-local"]),
          cacheStatus: z.enum(["hit", "miss"]),
        })
        .optional(),
    })
    .optional(),
});

const shardResultFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_SCENE_SHARD_RESULT_VERSION),
  jobId: safeIdSchema,
  planHash: hashSchema,
  assignmentId: safeIdSchema,
  requestHash: hashSchema,
  fragments: z.array(mathFragmentMetadataSchema).min(1).max(9),
});

export const mathSceneShardResultSchema = shardResultFieldsSchema
  .extend({ contentHash: hashSchema })
  .strict()
  .superRefine((result, context) => {
    let priorOrder = -1;
    const ids = new Set<string>();
    for (const [index, fragment] of result.fragments.entries()) {
      if (ids.has(fragment.sceneId) || fragment.order <= priorOrder) {
        context.addIssue({
          code: "custom",
          path: ["fragments", index, "sceneId"],
          message: "Shard fragments must be unique and canonically ordered.",
        });
      }
      ids.add(fragment.sceneId);
      priorOrder = fragment.order;
    }
    const { contentHash, ...payload } = result;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Scene shard result hash does not match its content.",
      });
    }
  });

export type MathRenderToolchainIdentity = z.infer<
  typeof mathRenderToolchainIdentitySchema
>;
export type MathFragmentEncoding = z.infer<typeof mathFragmentEncodingSchema>;
export type MathPortableScene = z.infer<typeof mathPortableSceneSchema>;
export type MathRenderPlan = z.infer<typeof mathRenderPlanSchema>;
export type MathSceneShardRequest = z.infer<typeof mathSceneShardRequestSchema>;
export type MathSceneShardResult = z.infer<typeof mathSceneShardResultSchema>;
export type MathFragmentMetadata = z.infer<typeof mathFragmentMetadataSchema>;

export interface MathSceneShardExecutionContext {
  readonly jobRoot: string;
  readonly signal?: AbortSignal;
}

export interface MathSceneShardExecutor {
  readonly workerImageId?: string;
  execute(
    request: MathSceneShardRequest,
    context: MathSceneShardExecutionContext
  ): Promise<MathSceneShardResult>;
  executeBatch?(
    requests: readonly MathSceneShardRequest[],
    context: MathSceneShardExecutionContext
  ): Promise<readonly MathSceneShardResult[]>;
}

export function createMathRenderToolchainIdentity(
  workerImageId: string = MATH_LOCAL_TOOLCHAIN_IMAGE_ID
): MathRenderToolchainIdentity {
  return mathRenderToolchainIdentitySchema.parse({
    workerImageId,
    remotionRunnerVersion: MATH_REMOTION_RUNNER_VERSION,
    svgRendererVersion: MATH_SVG_RENDERER_VERSION,
    semanticChalkVersion: MATH_SEMANTIC_CHALK_VERSION,
    mediaQaVersion: MATH_MEDIA_QA_VERSION,
  });
}

export function createMathFragmentEncoding(
  profileId: MathEncodingProfileId
): MathFragmentEncoding {
  const profile = mathEncodingProfiles[profileId];
  return mathFragmentEncodingSchema.parse({
    profileId,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    encoder: profile.videoCodec,
    codec: "h264",
    crf: profile.crf,
    preset: profile.preset,
    tune: "stillimage",
    pixelFormat: profile.pixelFormat,
    container: "mp4",
    audio: false,
  });
}

export function bindMathPortableScene(
  input: Omit<z.input<typeof sceneFieldsSchema>, never>
): MathPortableScene {
  const payload = sceneFieldsSchema.parse(input);
  return mathPortableSceneSchema.parse({
    ...payload,
    sceneHash: canonicalHash(payload),
  });
}

export function bindMathRenderPlan(
  input: z.input<typeof renderPlanFieldsSchema>
): MathRenderPlan {
  const payload = renderPlanFieldsSchema.parse(input);
  return mathRenderPlanSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export function bindMathSceneShardRequest(
  input: z.input<typeof shardRequestFieldsSchema>
): MathSceneShardRequest {
  const payload = shardRequestFieldsSchema.parse(input);
  return mathSceneShardRequestSchema.parse({
    ...payload,
    requestHash: canonicalHash(payload),
  });
}

export function bindMathSceneShardResult(
  input: z.input<typeof shardResultFieldsSchema>
): MathSceneShardResult {
  const payload = shardResultFieldsSchema.parse(input);
  return mathSceneShardResultSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export function validateMathSceneShardRoundTrip(
  rawRequest: unknown,
  rawResult: unknown
): {
  request: MathSceneShardRequest;
  result: MathSceneShardResult;
} {
  const request = mathSceneShardRequestSchema.parse(rawRequest);
  const result = mathSceneShardResultSchema.parse(rawResult);
  if (
    result.jobId !== request.jobId ||
    result.planHash !== request.planHash ||
    result.assignmentId !== request.assignmentId ||
    result.requestHash !== request.requestHash ||
    result.fragments.length !== request.scenes.length
  ) {
    throw new Error("Scene shard result identity does not match its request.");
  }
  for (const [index, scene] of request.scenes.entries()) {
    const fragment = result.fragments[index];
    if (
      !fragment ||
      fragment.sceneId !== scene.sceneId ||
      fragment.order !== scene.order ||
      fragment.sceneHash !== scene.sceneHash ||
      fragment.svgHash !== scene.svgHash ||
      fragment.relativePath !== scene.fragmentRelativePath ||
      fragment.frameCount !== scene.expectedFrameCount ||
      canonicalHash(fragment.encoding) !== canonicalHash(scene.encoding) ||
      canonicalHash(fragment.toolchain) !== canonicalHash(scene.toolchain)
    ) {
      throw new Error(
        `Scene fragment output identity is invalid for ${scene.sceneId}.`
      );
    }
  }
  return { request, result };
}

export function resolveMathJobPath(
  jobRoot: string,
  relativePath: string
): string {
  const safeRelativePath = portableRelativePathSchema.parse(relativePath);
  const root = path.resolve(jobRoot);
  if (path.dirname(root) === root) {
    throw new Error("Math render job root cannot be a filesystem root.");
  }
  const resolved = path.resolve(root, safeRelativePath);
  const relation = path.relative(root, resolved);
  if (
    relation === "" ||
    relation.startsWith("..") ||
    path.isAbsolute(relation)
  ) {
    throw new Error("Math render destination escapes its declared job root.");
  }
  return resolved;
}
