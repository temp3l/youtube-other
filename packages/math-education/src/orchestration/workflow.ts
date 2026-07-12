import fs from "node:fs/promises";
import path from "node:path";
import { hashFile, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import { canonicalHash } from "../verification/canonical-json.js";
import {
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
  contentHash: hashSchema,
  parentHashes: z.array(hashSchema),
  producedBy: z.enum(MATH_STAGES),
});
export type MathArtifactLineage = z.infer<typeof mathArtifactLineageSchema>;

export const stageRecordSchema = z.strictObject({
  stage: z.enum(MATH_STAGES),
  status: stageStatusSchema,
  fingerprint: hashSchema,
  parentFingerprints: z.array(hashSchema),
  outputArtifacts: z.array(mathArtifactLineageSchema),
  updatedAt: z.string().datetime(),
  error: z.string().optional(),
});
export type MathStageRecord = z.infer<typeof stageRecordSchema>;

const failureSchema = z.strictObject({
  stage: z.enum(MATH_STAGES),
  category: z.string().min(1),
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
  paidProviderCalled: z.literal(false),
  stages: z.array(stageRecordSchema).length(MATH_STAGES.length),
  failures: z.array(failureSchema),
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
  return workflowManifestSchema.parse({
    artifactVersion: "math-workflow.v2",
    lessonId: raw.lessonId,
    curriculumReleaseId: raw.curriculumReleaseId,
    simulated: raw.simulated,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage) => {
      const legacy = raw.stages.find((candidate) => candidate.stage === stage);
      const fingerprint = legacy?.fingerprint.match(/^[a-f0-9]{64}$/u)
        ? legacy.fingerprint
        : canonicalHash({
            stage,
            legacyFingerprint: legacy?.fingerprint ?? null,
          });
      const reusable =
        legacy?.status === "succeeded" || legacy?.status === "cached";
      return {
        stage,
        status: reusable ? "stale" : (legacy?.status ?? "planned"),
        fingerprint,
        parentFingerprints: [],
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
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
    if (output.parentHashes.join(":") !== expectedParentHashes.join(":"))
      return false;
    const target = await isContainedRegularFile(root, output.relativePath);
    if (!target || (await hashFile(target)) !== output.contentHash)
      return false;
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
  parentHashes: readonly string[];
  producedBy: MathStage;
}): Promise<MathArtifactLineage> {
  const target = await isContainedRegularFile(args.root, args.relativePath);
  if (!target)
    throw new Error(
      `Artifact is missing, non-regular, or escapes the workspace: ${args.relativePath}`
    );
  return mathArtifactLineageSchema.parse({
    relativePath: args.relativePath,
    schemaVersion: args.schemaVersion,
    contentHash: await hashFile(target),
    parentHashes: args.parentHashes,
    producedBy: args.producedBy,
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
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
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
