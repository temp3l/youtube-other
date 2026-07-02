import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, hashText, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  workflowManifestSchema,
  type stageOutcomeSchema,
} from "./story-workflow.schemas.js";
import {
  stageFailureSchemaVersion,
  type ArtifactLineage,
  type ExecutionId,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type WorkflowId,
  type WorkflowManifest,
  workflowSchemaVersion,
} from "./story-workflow.types.js";
import { withFileLock } from "./story-localization-batch-storage.js";

export type StoryWorkflowManifest = WorkflowManifest<ArtifactLineage>;
export type StoryWorkflowOutcome = z.infer<typeof stageOutcomeSchema>;
type ErrnoLike = Error & { code?: string };

export class StoryWorkflowStoreError extends Error {
  readonly failure: StageFailure;

  constructor(message: string, failure: StageFailure, options?: ErrorOptions) {
    super(message, options);
    this.name = "StoryWorkflowStoreError";
    this.failure = failure;
  }
}

export interface StoryWorkflowStorePaths {
  readonly rootDir: string;
  readonly workflowsDir: string;
  readonly locksDir: string;
  readonly quarantineDir: string;
}

export function resolveStoryWorkflowStorePaths(args: {
  readonly episodesRoot: string;
  readonly episodeId: string;
}): StoryWorkflowStorePaths {
  const rootDir = path.join(
    args.episodesRoot,
    args.episodeId,
    "state",
    "story-workflow"
  );
  return {
    rootDir,
    workflowsDir: path.join(rootDir, "workflows"),
    locksDir: path.join(rootDir, "locks"),
    quarantineDir: path.join(rootDir, "quarantine"),
  };
}

export function resolveStoryWorkflowManifestPath(args: {
  readonly episodesRoot: string;
  readonly episodeId: string;
  readonly workflowId: WorkflowId | string;
}): string {
  return path.join(
    resolveStoryWorkflowStorePaths(args).workflowsDir,
    `${args.workflowId}.json`
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildPersistenceFailure(
  category: StageFailure["category"],
  message: string
): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category,
    retryability: "manual-review",
    message,
    occurredAt: nowIso(),
  };
}

function normalizeStoreError(error: unknown): StoryWorkflowStoreError {
  if (error instanceof StoryWorkflowStoreError) {
    return error;
  }
  const message =
    error instanceof Error ? error.message : `Workflow persistence failed: ${String(error)}`;
  return new StoryWorkflowStoreError(
    message,
    buildPersistenceFailure("persistence-failed", message),
    error instanceof Error ? { cause: error } : undefined
  );
}

async function ensureLayout(paths: StoryWorkflowStorePaths): Promise<void> {
  await Promise.all([
    ensureDir(paths.workflowsDir),
    ensureDir(paths.locksDir),
    ensureDir(paths.quarantineDir),
  ]);
}

async function quarantineManifest(args: {
  readonly manifestPath: string;
  readonly quarantineDir: string;
}): Promise<string> {
  await ensureDir(args.quarantineDir);
  const basename = path.basename(args.manifestPath);
  const suffix = hashText(`${basename}:${Date.now()}`).slice(0, 8);
  const target = path.join(args.quarantineDir, `${basename}.${suffix}.corrupt`);
  await fs.rename(args.manifestPath, target);
  return target;
}

export class StoryWorkflowManifestStore {
  readonly paths: StoryWorkflowStorePaths;

  constructor(
    readonly episodesRoot: string,
    readonly episodeId: string
  ) {
    this.paths = resolveStoryWorkflowStorePaths({ episodesRoot, episodeId });
  }

  manifestPath(workflowId: WorkflowId | string): string {
    return path.join(this.paths.workflowsDir, `${workflowId}.json`);
  }

  async create(manifest: StoryWorkflowManifest): Promise<StoryWorkflowManifest> {
    return this.save(manifest);
  }

  async load(workflowId: WorkflowId | string): Promise<StoryWorkflowManifest | null> {
    await ensureLayout(this.paths);
    const manifestPath = this.manifestPath(workflowId);
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, "utf8");
    } catch (error) {
      if ((error as ErrnoLike).code === "ENOENT") {
        return null;
      }
      throw normalizeStoreError(error);
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "schemaVersion" in parsed &&
        (parsed as { readonly schemaVersion?: unknown }).schemaVersion !==
          workflowSchemaVersion
      ) {
        throw new StoryWorkflowStoreError(
          "Workflow manifest schema version is incompatible.",
          buildPersistenceFailure(
            "manifest-version-incompatible",
            "Workflow manifest schema version is incompatible."
          )
        );
      }
      return workflowManifestSchema.parse(parsed) as StoryWorkflowManifest;
    } catch (error) {
      if (error instanceof StoryWorkflowStoreError) {
        throw error;
      }
      const quarantinedPath = await quarantineManifest({
        manifestPath,
        quarantineDir: this.paths.quarantineDir,
      });
      throw new StoryWorkflowStoreError(
        `Workflow manifest is corrupt and was quarantined at ${quarantinedPath}.`,
        buildPersistenceFailure(
          "cache-corrupt",
          `Workflow manifest is corrupt and was quarantined at ${quarantinedPath}.`
        ),
        error instanceof Error ? { cause: error } : undefined
      );
    }
  }

  async save(manifest: StoryWorkflowManifest): Promise<StoryWorkflowManifest> {
    await ensureLayout(this.paths);
    const parsed = workflowManifestSchema.parse(manifest) as StoryWorkflowManifest;
    try {
      await writeJsonAtomic(this.manifestPath(parsed.workflowId), parsed);
      return parsed;
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  async mutate(
    workflowId: WorkflowId | string,
    update: (manifest: StoryWorkflowManifest) => StoryWorkflowManifest
  ): Promise<StoryWorkflowManifest> {
    await ensureLayout(this.paths);
    const lockPath = path.join(this.paths.locksDir, `${workflowId}.lock`);
    try {
      return await withFileLock(lockPath, async () => {
        const current = await this.load(workflowId);
        if (!current) {
          throw new StoryWorkflowStoreError(
            `Workflow manifest not found: ${workflowId}`,
            buildPersistenceFailure(
              "persistence-failed",
              `Workflow manifest not found: ${workflowId}`
            )
          );
        }
        const next = workflowManifestSchema.parse({
          ...update(current),
          updatedAt: nowIso(),
        }) as StoryWorkflowManifest;
        await writeJsonAtomic(this.manifestPath(workflowId), next);
        return next;
      });
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  async appendOutcome(args: {
    readonly workflowId: WorkflowId | string;
    readonly outcome: StageOutcome<ArtifactLineage>;
  }): Promise<StoryWorkflowManifest> {
    return this.mutate(args.workflowId, (manifest) =>
      appendStageOutcome(manifest, args.outcome)
    );
  }
}

export function appendStageOutcome(
  manifest: StoryWorkflowManifest,
  outcome: StageOutcome<ArtifactLineage>
): StoryWorkflowManifest {
  const updatedStages = manifest.stages.map((stage) =>
    stage.stageId === outcome.stageId
      ? {
          ...stage,
          status: outcome.status,
          latestExecutionId: outcome.executionId as ExecutionId,
          latestCompletedAt: outcome.completedAt,
          latestOutcome: outcome,
        }
      : stage
  );
  const artifact =
    outcome.status === "succeeded" || outcome.status === "cached"
      ? outcome.artifact
      : null;
  return workflowManifestSchema.parse({
    ...manifest,
    updatedAt: outcome.completedAt,
    stages: updatedStages,
    attemptHistory: [...manifest.attemptHistory, outcome],
    artifacts: artifact ? [...manifest.artifacts, artifact] : manifest.artifacts,
  }) as StoryWorkflowManifest;
}

export function getWorkflowStage(
  manifest: StoryWorkflowManifest,
  stageId: StageId | string
): StoryWorkflowManifest["stages"][number] | null {
  return manifest.stages.find((stage) => stage.stageId === stageId) ?? null;
}
