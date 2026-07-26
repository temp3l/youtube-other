import { canonicalHash } from "@mediaforge/math-education/canonical-json.js";
import { z } from "zod";
import {
  mathFragmentMetadataSchema,
  mathRenderPlanSchema,
  mathSceneShardRequestSchema,
  mathSceneShardResultSchema,
  portableRelativePathSchema,
  validateMathSceneShardRoundTrip,
  type MathFragmentMetadata,
  type MathRenderPlan,
  type MathSceneShardRequest,
  type MathSceneShardResult,
} from "./portable-scene-contract.js";
import {
  MATH_MEDIA_QA_VERSION,
  MATH_REVEAL_CUE_VERSION,
} from "./renderer-versions.js";

export * from "./portable-scene-contract.js";

export const MATH_FINAL_ASSEMBLY_REQUEST_VERSION =
  "math-final-assembly-request.v1" as const;
export const MATH_RENDER_RESULT_VERSION = "math-render-result.v1" as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const safeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);

const shardRoundTripSchema = z.strictObject({
  request: mathSceneShardRequestSchema,
  result: mathSceneShardResultSchema,
});

const finalAssemblyRequestFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_FINAL_ASSEMBLY_REQUEST_VERSION),
  jobId: safeIdSchema,
  plan: mathRenderPlanSchema,
  shards: z.array(shardRoundTripSchema).min(1).max(9),
  narrationRelativePath: portableRelativePathSchema,
  narrationSha256: hashSchema,
  outputRelativePath: portableRelativePathSchema,
  workRelativePath: portableRelativePathSchema,
});

export const mathFinalAssemblyRequestSchema =
  finalAssemblyRequestFieldsSchema
    .extend({ requestHash: hashSchema })
    .strict()
    .superRefine((request, context) => {
      const { requestHash, ...payload } = request;
      if (requestHash !== canonicalHash(payload)) {
        context.addIssue({
          code: "custom",
          path: ["requestHash"],
          message: "Final assembly request hash does not match its content.",
        });
      }
    });

const renderAssignmentSchema = z.strictObject({
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  assignmentId: safeIdSchema,
});

const renderAssemblyMetricsSchema = z.strictObject({
  durationMs: z.number().int().nonnegative(),
  cacheHitCount: z.number().int().nonnegative(),
  cacheMissCount: z.number().int().nonnegative(),
  narrationMuxCount: z.literal(1),
  revealCueVersion: z.literal(MATH_REVEAL_CUE_VERSION),
  mediaQaVersion: z.literal(MATH_MEDIA_QA_VERSION),
});

const renderValidationSchema = z.strictObject({
  valid: z.literal(true),
  sha256: hashSchema,
  byteLength: z.number().int().positive(),
  width: z.literal(1920),
  height: z.literal(1080),
  fps: z.literal(30),
  durationSeconds: z.number().positive(),
  videoCodec: z.literal("h264"),
  audioCodec: z.string().min(1).max(64),
  continuityChecked: z.literal(true),
  corruptionScanPassed: z.literal(true),
});

const renderResultFieldsSchema = z.strictObject({
  artifactVersion: z.literal(MATH_RENDER_RESULT_VERSION),
  jobId: safeIdSchema,
  planHash: hashSchema,
  assemblyRequestHash: hashSchema,
  outputRelativePath: portableRelativePathSchema,
  renderFingerprint: hashSchema,
  scenes: z.array(mathFragmentMetadataSchema).length(9),
  assignments: z.array(renderAssignmentSchema).length(9),
  assembly: renderAssemblyMetricsSchema,
  cacheHitCount: z.number().int().nonnegative(),
  cacheMissCount: z.number().int().nonnegative(),
  validation: renderValidationSchema,
});

export const mathRenderResultSchema = renderResultFieldsSchema
  .extend({ contentHash: hashSchema })
  .strict()
  .superRefine((result, context) => {
    const { contentHash, ...payload } = result;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Math render result hash does not match its content.",
      });
    }
    for (const [index, scene] of result.scenes.entries()) {
      const assignment = result.assignments[index];
      if (
        scene.order !== index ||
        scene.sceneId !==
          `scene-${String(index + 1).padStart(3, "0")}` ||
        assignment?.sceneId !== scene.sceneId
      ) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index],
          message: "Render result scenes must retain canonical assignment order.",
        });
      }
    }
  });

export type MathFinalAssemblyRequest = z.infer<
  typeof mathFinalAssemblyRequestSchema
>;
export type MathRenderResult = z.infer<typeof mathRenderResultSchema>;

export interface MathFinalAssemblyContext {
  readonly jobRoot: string;
}

export interface MathFinalAssembler {
  assemble(
    request: MathFinalAssemblyRequest,
    context: MathFinalAssemblyContext
  ): Promise<MathRenderResult>;
}

function orderedShardRoundTrips(
  shards: readonly {
    readonly request: MathSceneShardRequest;
    readonly result: MathSceneShardResult;
  }[]
): {
  readonly request: MathSceneShardRequest;
  readonly result: MathSceneShardResult;
}[] {
  return shards
    .map(({ request, result }) =>
      validateMathSceneShardRoundTrip(request, result)
    )
    .sort(
      (left, right) =>
        left.request.scenes[0]!.order - right.request.scenes[0]!.order
    );
}

export function bindMathFinalAssemblyRequest(
  input: z.input<typeof finalAssemblyRequestFieldsSchema>
): MathFinalAssemblyRequest {
  const parsed = finalAssemblyRequestFieldsSchema.parse(input);
  const payload = finalAssemblyRequestFieldsSchema.parse({
    ...parsed,
    shards: orderedShardRoundTrips(parsed.shards),
  });
  return validateMathFinalAssemblyRequest({
    ...payload,
    requestHash: canonicalHash(payload),
  });
}

export function validateMathFinalAssemblyRequest(
  rawRequest: unknown
): MathFinalAssemblyRequest {
  const request = mathFinalAssemblyRequestSchema.parse(rawRequest);
  if (
    request.jobId !== request.plan.jobId ||
    request.shards.length === 0
  ) {
    throw new Error("Final assembly request identity is invalid.");
  }
  const fragments: MathFragmentMetadata[] = [];
  const sceneIds = new Set<string>();
  let expectedOrder = 0;
  let compatibility:
    | {
        readonly encoding: string;
        readonly toolchain: string;
        readonly codecProfile: string;
        readonly timeBase: string;
      }
    | undefined;
  for (const shard of request.shards) {
    const validated = validateMathSceneShardRoundTrip(
      shard.request,
      shard.result
    );
    if (
      validated.request.jobId !== request.jobId ||
      validated.request.planHash !== request.plan.contentHash
    ) {
      throw new Error("Final assembly shard identity is invalid.");
    }
    for (const fragment of validated.result.fragments) {
      const scene = request.plan.scenes[expectedOrder];
      if (
        !scene ||
        fragment.order !== expectedOrder ||
        fragment.sceneId !== scene.sceneId ||
        sceneIds.has(fragment.sceneId)
      ) {
        throw new Error(
          "Final assembly fragments are missing, duplicated, or reordered."
        );
      }
      const current = {
        encoding: canonicalHash(fragment.encoding),
        toolchain: canonicalHash(fragment.toolchain),
        codecProfile: fragment.codecProfile,
        timeBase: fragment.timeBase,
      };
      compatibility ??= current;
      if (
        current.encoding !== compatibility.encoding ||
        current.toolchain !== compatibility.toolchain ||
        current.codecProfile !== compatibility.codecProfile ||
        current.timeBase !== compatibility.timeBase ||
        fragment.audioStreamCount !== 0
      ) {
        throw new Error("Final assembly fragments are incompatible.");
      }
      sceneIds.add(fragment.sceneId);
      fragments.push(fragment);
      expectedOrder += 1;
    }
  }
  if (
    expectedOrder !== request.plan.scenes.length ||
    sceneIds.size !== request.plan.scenes.length
  ) {
    throw new Error("Final assembly is missing one or more scene fragments.");
  }
  return request;
}

export function bindMathRenderResult(
  input: z.input<typeof renderResultFieldsSchema>
): MathRenderResult {
  const payload = renderResultFieldsSchema.parse(input);
  return mathRenderResultSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}

export function validateMathRenderRoundTrip(
  rawRequest: unknown,
  rawResult: unknown
): MathRenderResult {
  const request = validateMathFinalAssemblyRequest(rawRequest);
  const result = mathRenderResultSchema.parse(rawResult);
  const expectedFragments = request.shards.flatMap(
    ({ result: shardResult }) => shardResult.fragments
  );
  const expectedAssignments = request.shards.flatMap(({ request: shard }) =>
    shard.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      assignmentId: shard.assignmentId,
    }))
  );
  if (
    result.jobId !== request.jobId ||
    result.planHash !== request.plan.contentHash ||
    result.assemblyRequestHash !== request.requestHash ||
    result.outputRelativePath !== request.outputRelativePath ||
    canonicalHash(result.scenes) !== canonicalHash(expectedFragments) ||
    canonicalHash(result.assignments) !== canonicalHash(expectedAssignments)
  ) {
    throw new Error("Math render result identity does not match assembly.");
  }
  return result;
}
