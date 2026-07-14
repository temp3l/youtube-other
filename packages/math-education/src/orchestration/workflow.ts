import fs from "node:fs/promises";
import path from "node:path";
import { createMathCorrelationId } from "@mediaforge/observability";
import { hashFile, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  isBinaryMathArtifactSchemaVersion,
  mathArtifactSchemaVersionSchema,
  parseMathArtifactPayload,
  type MathArtifactSchemaVersion,
} from "./artifact-schemas.js";

export const MATH_STAGES = [
  "curriculum-import",
  "source-validation",
  "prerequisite-graph",
  "lesson-spec",
  "math-verification",
  "canonical-narration",
  "scene-timing",
  "localization",
  "visual-assets",
  "tts",
  "timing-reflow",
  "render",
  "metadata-playlists",
  "quality-gate",
  "publish",
] as const;
export type MathStage = (typeof MATH_STAGES)[number];
export const stageStatusSchema = z.enum([
  "planned",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "skipped",
  "cached",
  "stale",
]);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const relativeArtifactPathSchema = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    if (
      path.isAbsolute(value) ||
      value.includes("\\") ||
      value
        .split("/")
        .some((part) => part === "" || part === ".." || part === ".")
    )
      ctx.addIssue({
        code: "custom",
        message: "Artifact path must be a contained portable relative path.",
      });
  });

export const mathArtifactLineageSchema = z.strictObject({
  relativePath: relativeArtifactPathSchema,
  schemaVersion: mathArtifactSchemaVersionSchema,
  payloadKind: z.enum(["json", "binary"]).default("json"),
  contentHash: hashSchema,
  byteLength: z.number().int().nonnegative(),
  parentHashes: z.array(hashSchema),
  producedBy: z.enum(MATH_STAGES),
  producer: z.string().min(1),
  producerVersion: z.string().min(1),
  identity: z.strictObject({
    lessonId: z.string().min(1),
    skillId: z.string().min(1),
    language: z.enum(["de", "en", "es", "fr", "pt"]),
    variant: z.enum(["foundation", "standard", "challenge"]),
  }).optional(),
}).superRefine((lineage, context) => {
  const binarySchema = isBinaryMathArtifactSchemaVersion(lineage.schemaVersion);
  if (binarySchema !== (lineage.payloadKind === "binary"))
    context.addIssue({
      code: "custom",
      path: ["payloadKind"],
      message: "Binary payload kind must exactly match the declared binary artifact schema.",
    });
  if (binarySchema && !lineage.identity)
    context.addIssue({
      code: "custom",
      path: ["identity"],
      message: "Workflow-owned binary artifacts require lesson and locale identity.",
    });
});
export type MathArtifactLineage = z.infer<typeof mathArtifactLineageSchema>;

function hashesMatch(
  actual: readonly string[],
  expected: readonly string[]
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((hash, index) => hash === expected[index])
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export const stageRecordSchema = z.strictObject({
  stage: z.enum(MATH_STAGES),
  status: stageStatusSchema,
  correlationId: z.string().min(1).optional(),
  fingerprint: hashSchema,
  parentFingerprints: z.array(hashSchema),
  outputArtifacts: z.array(mathArtifactLineageSchema),
  updatedAt: z.string().datetime(),
  error: z.string().optional(),
}).superRefine((record, context) => {
  for (const [index, output] of record.outputArtifacts.entries()) {
    if (output.producedBy !== record.stage)
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts", index, "producedBy"],
        message: `Stage ${record.stage} cannot own output produced by ${output.producedBy}.`,
      });
    if (!hashesMatch(output.parentHashes, record.parentFingerprints))
      context.addIssue({
        code: "custom",
        path: ["outputArtifacts", index, "parentHashes"],
        message: "Output lineage must exactly match its stage parent fingerprints.",
      });
  }
});
export type MathStageRecord = z.infer<typeof stageRecordSchema>;

const failureSchema = z.strictObject({
  stage: z.enum(MATH_STAGES),
  category: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  message: z.string().min(1),
  retryable: z.boolean(),
  attempts: z.number().int().positive(),
  occurredAt: z.string().datetime(),
});

export const workflowManifestSchema = z.strictObject({
  artifactVersion: z.literal("math-workflow.v2"),
  lessonId: z.string().min(1),
  curriculumReleaseId: z.literal("de-gems-5-10-v1"),
  simulated: z.boolean(),
  paidProviderCalled: z.boolean(),
  stages: z.array(stageRecordSchema).length(MATH_STAGES.length),
  failures: z.array(failureSchema),
}).superRefine((manifest, context) => {
  for (const [index, expectedStage] of MATH_STAGES.entries()) {
    const record = manifest.stages[index];
    if (record?.stage !== expectedStage)
      context.addIssue({
        code: "custom",
        path: ["stages", index, "stage"],
        message: `Workflow stage ${expectedStage} must occur exactly once in canonical order.`,
      });
    if (index === 0 || !record) continue;
    const preceding = manifest.stages[index - 1];
    if (
      !preceding ||
      !hashesMatch(record.parentFingerprints, [preceding.fingerprint])
    )
      context.addIssue({
        code: "custom",
        path: ["stages", index, "parentFingerprints"],
        message: `Workflow stage ${expectedStage} must be bound to the authoritative preceding stage fingerprint.`,
      });
  }
});
export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;

const legacyStageRecordSchema = z.strictObject({
  stage: z.enum(MATH_STAGES),
  status: stageStatusSchema,
  fingerprint: z.string(),
  outputPaths: z.array(z.string()),
  updatedAt: z.string(),
  error: z.string().optional(),
});
const legacyWorkflowManifestSchema = z.strictObject({
  artifactVersion: z.literal("math-workflow.v1"),
  lessonId: z.string(),
  curriculumReleaseId: z.literal("de-gems-5-10-v1"),
  simulated: z.boolean(),
  paidProviderCalled: z.literal(false),
  stages: z.array(legacyStageRecordSchema),
  failures: z.array(z.unknown()),
});

export class MathWorkflowManifestError extends Error {
  constructor(
    message: string,
    readonly quarantinedPath: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "MathWorkflowManifestError";
  }
}

function migrateLegacyManifest(
  raw: z.infer<typeof legacyWorkflowManifestSchema>
): WorkflowManifest {
  const now = new Date().toISOString();
  let precedingFingerprint: string | undefined;
  return workflowManifestSchema.parse({
    artifactVersion: "math-workflow.v2",
    lessonId: raw.lessonId,
    curriculumReleaseId: raw.curriculumReleaseId,
    simulated: raw.simulated,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage, index) => {
      const legacy = raw.stages.find((candidate) => candidate.stage === stage);
      const parentFingerprints =
        index === 0 || !precedingFingerprint ? [] : [precedingFingerprint];
      const fingerprint = canonicalHash({
        stage,
        parentFingerprints,
        legacyFingerprint: legacy?.fingerprint ?? null,
        reusable: false,
      });
      precedingFingerprint = fingerprint;
      const reusable =
        legacy?.status === "succeeded" || legacy?.status === "cached";
      return {
        stage,
        status: reusable ? "stale" : (legacy?.status ?? "planned"),
        correlationId: createMathCorrelationId({
          releaseId: raw.curriculumReleaseId,
          lessonId: raw.lessonId,
          stage,
        }),
        fingerprint,
        parentFingerprints,
        outputArtifacts: [],
        updatedAt: legacy?.updatedAt ?? now,
        ...(reusable
          ? {
              error:
                "Migrated v1 stage lacks output hashes and cannot be reused.",
            }
          : legacy?.error
            ? { error: legacy.error }
            : {}),
      };
    }),
    failures: [],
  });
}

async function quarantine(filePath: string): Promise<string> {
  const target = `${filePath}.corrupt-${Date.now()}`;
  await fs.rename(filePath, target);
  return target;
}

export async function loadWorkflowManifest(
  filePath: string
): Promise<WorkflowManifest | null> {
  let rawText: string;
  try {
    rawText = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
  try {
    const raw = JSON.parse(rawText) as unknown;
    if (
      (raw as { artifactVersion?: unknown })?.artifactVersion ===
      "math-workflow.v1"
    )
      return migrateLegacyManifest(legacyWorkflowManifestSchema.parse(raw));
    return workflowManifestSchema.parse(raw);
  } catch (error) {
    const quarantinedPath = await quarantine(filePath);
    throw new MathWorkflowManifestError(
      `Math workflow manifest was quarantined: ${quarantinedPath}`,
      quarantinedPath,
      { cause: error }
    );
  }
}

async function isContainedRegularFile(
  root: string,
  relativePath: string
): Promise<string | null> {
  const parsed = relativeArtifactPathSchema.safeParse(relativePath);
  if (!parsed.success) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  try {
    const rootReal = await fs.realpath(resolvedRoot);
    const targetStat = await fs.lstat(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) return null;
    const targetReal = await fs.realpath(target);
    if (!targetReal.startsWith(`${rootReal}${path.sep}`)) return null;
    return target;
  } catch {
    return null;
  }
}

export async function outputsAreValid(
  root: string,
  record: MathStageRecord,
  expectedParentHashes: readonly string[] = record.parentFingerprints
): Promise<boolean> {
  if (record.status !== "succeeded" && record.status !== "cached") return false;
  if (record.outputArtifacts.length === 0) return false;
  for (const output of record.outputArtifacts) {
    if (output.schemaVersion === "math-narration.v1") return false;
    if (
      output.producedBy !== record.stage ||
      !hashesMatch(output.parentHashes, expectedParentHashes)
    )
      return false;
    const target = await isContainedRegularFile(root, output.relativePath);
    if (!target || (await hashFile(target)) !== output.contentHash)
      return false;
    const stat = await fs.stat(target).catch(() => null);
    if (!stat || stat.size !== output.byteLength) return false;
    if (output.payloadKind === "binary") continue;
    try {
      parseMathArtifactPayload(
        output.schemaVersion,
        JSON.parse(await fs.readFile(target, "utf8")) as unknown
      );
    } catch {
      return false;
    }
  }
  return true;
}

export async function readAuthoritativeStageArtifact<T>(args: {
  root: string;
  manifest: WorkflowManifest;
  stage: MathStage;
  relativePath: string;
  schemaVersion: MathArtifactSchemaVersion;
  schema: z.ZodType<T>;
}): Promise<T> {
  const parsedManifest = workflowManifestSchema.safeParse(args.manifest);
  if (!parsedManifest.success)
    throw new Error("Authoritative workflow manifest stage chain is invalid.");
  const record = parsedManifest.data.stages.find(
    (candidate) => candidate.stage === args.stage
  );
  if (!record || !(await outputsAreValid(args.root, record)))
    throw new Error(`Authoritative workflow stage ${args.stage} is not reusable.`);
  const matches = record.outputArtifacts.filter(
    (artifact) =>
      artifact.relativePath === args.relativePath &&
      artifact.schemaVersion === args.schemaVersion &&
      artifact.producedBy === args.stage
  );
  if (matches.length !== 1)
    throw new Error(
      `Authoritative workflow does not own exactly one ${args.relativePath} output.`
    );
  const target = await isContainedRegularFile(args.root, args.relativePath);
  if (!target) throw new Error(`Authoritative artifact is unavailable: ${args.relativePath}`);
  return args.schema.parse(JSON.parse(await fs.readFile(target, "utf8")) as unknown);
}

export async function readAuthoritativeBinaryArtifact(args: {
  root: string;
  manifest: WorkflowManifest;
  stage: MathStage;
  relativePath: string;
  schemaVersion:
    | "math-thumbnail-binary.v1"
    | "math-final-media-binary.v1"
    | "math-speech-binary.v1";
  expectedIdentity: NonNullable<MathArtifactLineage["identity"]>;
  producer: string;
  producerVersion: string;
}): Promise<MathArtifactLineage> {
  const parsedManifest = workflowManifestSchema.safeParse(args.manifest);
  if (!parsedManifest.success)
    throw new Error("Authoritative workflow manifest stage chain is invalid.");
  const record = parsedManifest.data.stages.find(
    (candidate) => candidate.stage === args.stage
  );
  if (!record || !(await outputsAreValid(args.root, record)))
    throw new Error(`Authoritative workflow stage ${args.stage} is not reusable.`);
  const matches = record.outputArtifacts.filter(
    (artifact) =>
      artifact.relativePath === args.relativePath &&
      artifact.schemaVersion === args.schemaVersion &&
      artifact.payloadKind === "binary" &&
      artifact.producedBy === args.stage
  );
  if (matches.length !== 1)
    throw new Error(
      `Authoritative workflow does not own exactly one binary ${args.relativePath} output.`
    );
  const lineage = matches[0]!;
  if (
    lineage.producer !== args.producer ||
    lineage.producerVersion !== args.producerVersion ||
    canonicalHash(lineage.identity) !== canonicalHash(args.expectedIdentity)
  )
    throw new Error("Authoritative binary producer or identity mismatch.");
  return lineage;
}

export function stageFingerprint(
  stage: MathStage,
  parents: readonly string[],
  inputs: unknown
): string {
  return canonicalHash({
    stage,
    parents,
    schemaVersion: "math-workflow.v2",
    inputs,
  });
}

export async function createArtifactLineage(args: {
  root: string;
  relativePath: string;
  schemaVersion: MathArtifactSchemaVersion;
  payloadKind?: "json" | "binary";
  parentHashes: readonly string[];
  producedBy: MathStage;
  producer?: string;
  producerVersion?: string;
  identity?: NonNullable<MathArtifactLineage["identity"]>;
}): Promise<MathArtifactLineage> {
  const target = await isContainedRegularFile(args.root, args.relativePath);
  if (!target)
    throw new Error(
      `Artifact is missing, non-regular, or escapes the workspace: ${args.relativePath}`
    );
  const stat = await fs.stat(target);
  return mathArtifactLineageSchema.parse({
    relativePath: args.relativePath,
    schemaVersion: args.schemaVersion,
    payloadKind: args.payloadKind ?? "json",
    contentHash: await hashFile(target),
    byteLength: stat.size,
    parentHashes: args.parentHashes,
    producedBy: args.producedBy,
    producer: args.producer ?? args.producedBy,
    producerVersion: args.producerVersion ?? `${args.producedBy}.v1`,
    ...(args.identity ? { identity: args.identity } : {}),
  });
}

export async function withMathFileLock<T>(
  lockPath: string,
  action: () => Promise<T>
): Promise<T> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(lockPath, "wx");
  } catch (error) {
    if (hasErrorCode(error, "EEXIST"))
      throw new Error(`Math workflow lock is already held: ${lockPath}`);
    throw error;
  }
  try {
    return await action();
  } finally {
    await handle.close();
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

export async function saveWorkflowManifest(
  filePath: string,
  manifest: WorkflowManifest
): Promise<void> {
  await writeJsonAtomic(filePath, workflowManifestSchema.parse(manifest));
}
