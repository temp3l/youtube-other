import {
  stageOutcomeSchemaVersion,
  stageFailureSchemaVersion,
  type ArtifactId,
  type ArtifactLineage,
  type ArtifactProvenance,
  type CacheMetadata,
  type CostMetrics,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type StoryFormat,
  type WorkflowManifest,
  type WorkflowLocale,
} from "./story-workflow.types.js";
import {
  appendStageOutcome,
  type StoryWorkflowManifestStore,
} from "./story-workflow-store.js";
import { hashText, normalizeWhitespace } from "@mediaforge/shared";

export interface VisualBranchInput {
  readonly englishFullAccepted: boolean;
  readonly englishQualityPassed: boolean;
  readonly visualPrepSucceeded?: boolean;
  readonly localeFailures?: readonly WorkflowLocale[];
}

export interface VisualBranchResult {
  readonly sharedImagesStatus: "planned" | "ready" | "blocked";
  readonly blockedBy: readonly string[];
  readonly failure?: StageFailure;
}

export function resolveVisualBranch(input: VisualBranchInput): VisualBranchResult {
  const blockedBy = [
    ...(input.englishFullAccepted ? [] : ["english-full"]),
    ...(input.englishQualityPassed ? [] : ["english-quality"]),
    ...(input.visualPrepSucceeded === false ? ["visual-prep"] : []),
  ];
  if (blockedBy.length > 0) {
    return {
      sharedImagesStatus: "blocked",
      blockedBy,
      failure: {
        schemaVersion: stageFailureSchemaVersion,
        category: "dependency-blocked",
        retryability: "retry-after-change",
        message: `Shared image branch blocked by ${blockedBy.join(", ")}.`,
        occurredAt: new Date().toISOString(),
      },
    };
  }
  return {
    sharedImagesStatus: input.visualPrepSucceeded ? "ready" : "planned",
    blockedBy: [],
  };
}

export interface VisualBranchStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface VisualBranchStageResult {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly outcome: StageOutcome<ArtifactLineage>;
}

export interface PersistedScenePlanArtifactInput {
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly path: string;
  readonly fingerprint: string;
  readonly sourceStageId?: StageId;
  readonly parents?: readonly ArtifactId[];
  readonly provenance?: ArtifactProvenance;
}

export interface PersistedImagePromptArtifactInput {
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly path: string;
  readonly fingerprint: string;
  readonly sourceStageId?: StageId;
  readonly parents?: readonly ArtifactId[];
  readonly provenance?: ArtifactProvenance;
}

export interface ImagePromptStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface ImagePromptStageResult {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly outcome: StageOutcome<ArtifactLineage>;
}

function emptyCost(): CostMetrics {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicros: null,
    actualCostMicros: null,
  };
}

function defaultCache(): CacheMetadata {
  return {
    status: "miss",
    invalidationReasons: [],
  };
}

function resolveStage(
  manifest: WorkflowManifest<ArtifactLineage>,
  stageId: StageId
) {
  const stage = manifest.stages.find((entry) => entry.stageId === stageId);
  if (!stage) {
    throw new Error(`Workflow stage not found: ${stageId}`);
  }
  return stage;
}

function buildArtifactId(args: {
  readonly artifactType: string;
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly owner: ArtifactLineage["owner"];
  readonly fingerprint: string;
  readonly path: string;
}): ArtifactId {
  const suffix = hashText(
    JSON.stringify({
      artifactType: args.artifactType,
      episodeId: args.episodeId,
      locale: args.locale,
      format: args.format,
      owner: args.owner,
      fingerprint: args.fingerprint,
      path: args.path,
    })
  ).slice(0, 8);
  return `artifact:${args.episodeId}:${args.locale}:${args.format}:${args.owner}:${suffix}` as ArtifactId;
}

function buildPlanningArtifact(args: {
  readonly artifactType: string;
  readonly owner: ArtifactLineage["owner"];
  readonly schemaVersion: string;
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly path: string;
  readonly fingerprint: string;
  readonly sourceStageId: StageId;
  readonly parents: readonly ArtifactId[];
  readonly provenance: ArtifactProvenance;
}): ArtifactLineage {
  return {
    artifactId: buildArtifactId({
      artifactType: args.artifactType,
      episodeId: args.episodeId,
      locale: args.locale,
      format: args.format,
      owner: args.owner,
      fingerprint: args.fingerprint,
      path: args.path,
    }),
    artifactType: args.artifactType,
    owner: args.owner,
    locale: args.locale,
    format: args.format,
    provenance: args.provenance,
    path: normalizeWhitespace(args.path),
    fingerprint: normalizeWhitespace(args.fingerprint),
    schemaVersion: args.schemaVersion,
    parents: [...args.parents],
    sourceStageId: args.sourceStageId,
  };
}

export function buildScenePlanArtifact(
  input: PersistedScenePlanArtifactInput
): ArtifactLineage {
  return buildPlanningArtifact({
    artifactType: "scene-plan-batch",
    owner: "scene-plan",
    schemaVersion: "scene-plan-batch-v1",
    episodeId: input.episodeId,
    locale: input.locale,
    format: input.format,
    path: input.path,
    fingerprint: input.fingerprint,
    sourceStageId:
      input.sourceStageId ?? (`stage:visual-model:${input.locale}:${input.format}` as StageId),
    parents: [...(input.parents ?? [])],
    provenance: input.provenance ?? "generated",
  });
}

export function buildImagePromptArtifact(
  input: PersistedImagePromptArtifactInput
): ArtifactLineage {
  return buildPlanningArtifact({
    artifactType: "image-prompt-batch",
    owner: "image-plan",
    schemaVersion: "image-prompt-batch-v1",
    episodeId: input.episodeId,
    locale: input.locale,
    format: input.format,
    path: input.path,
    fingerprint: input.fingerprint,
    sourceStageId:
      input.sourceStageId ?? (`stage:image-prompt:${input.locale}:${input.format}` as StageId),
    parents: [...(input.parents ?? [])],
    provenance: input.provenance ?? "generated",
  });
}

export async function executeVisualBranchStage(args: {
  readonly context: VisualBranchStageContext;
  readonly result: VisualBranchResult;
  readonly artifact?: ArtifactLineage;
}): Promise<VisualBranchStageResult> {
  const stageId =
    args.context.stageId ?? ("stage:visual-model:en:full" as StageId);
  const stage = resolveStage(args.context.manifest, stageId);
  if (
    (stage.status === "succeeded" || stage.status === "blocked") &&
    stage.latestOutcome
  ) {
    return {
      manifest: args.context.manifest,
      outcome: stage.latestOutcome,
    };
  }

  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const baseOutcome = {
    schemaVersion: stageOutcomeSchemaVersion,
    stageId: stage.stageId,
    executionId: args.context.manifest.executionId,
    fingerprintInputs: stage.fingerprintInputs,
    cache: stage.cache ?? defaultCache(),
    warnings: [],
    cost: emptyCost(),
    startedAt,
    completedAt,
    observability: {
      attemptNumber: args.context.manifest.attemptHistory.length + 1,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    },
  } as const;
  const missingArtifactFailure: StageFailure = {
    schemaVersion: stageFailureSchemaVersion,
    category: "visual-model-failed",
    retryability: "manual-review",
    message: "Visual branch boundary requires an artifact reference when ready.",
    occurredAt: completedAt,
  };
  const outcome: StageOutcome<ArtifactLineage> =
    args.result.sharedImagesStatus !== "blocked" && args.artifact
      ? {
          ...baseOutcome,
          status: "succeeded",
          artifact: args.artifact,
          provenance: args.artifact.provenance,
        }
      : {
          ...baseOutcome,
          status: "blocked",
          failure:
            args.result.failure ??
            (args.result.sharedImagesStatus === "blocked"
              ? {
                  schemaVersion: stageFailureSchemaVersion,
                  category: "dependency-blocked",
                  retryability: "retry-after-change",
                  message: `Shared image branch blocked by ${args.result.blockedBy.join(", ")}.`,
                  occurredAt: completedAt,
                }
              : missingArtifactFailure),
        };
  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}

export async function executeImagePromptStage(args: {
  readonly context: ImagePromptStageContext;
  readonly artifact?: ArtifactLineage;
}): Promise<ImagePromptStageResult> {
  const stageId =
    args.context.stageId ?? ("stage:image-prompt:en:full" as StageId);
  const stage = resolveStage(args.context.manifest, stageId);
  if (
    (stage.status === "succeeded" || stage.status === "blocked") &&
    stage.latestOutcome
  ) {
    return {
      manifest: args.context.manifest,
      outcome: stage.latestOutcome,
    };
  }

  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const baseOutcome = {
    schemaVersion: stageOutcomeSchemaVersion,
    stageId: stage.stageId,
    executionId: args.context.manifest.executionId,
    fingerprintInputs: stage.fingerprintInputs,
    cache: stage.cache ?? defaultCache(),
    warnings: [],
    cost: emptyCost(),
    startedAt,
    completedAt,
    observability: {
      attemptNumber: args.context.manifest.attemptHistory.length + 1,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    },
  } as const;
  const outcome: StageOutcome<ArtifactLineage> = args.artifact
    ? {
        ...baseOutcome,
        status: "succeeded",
        artifact: args.artifact,
        provenance: args.artifact.provenance,
      }
    : {
        ...baseOutcome,
        status: "blocked",
        failure: {
          schemaVersion: stageFailureSchemaVersion,
          category: "dependency-blocked",
          retryability: "retry-after-change",
          message:
            "Image prompt planning requires a persisted scene-plan or prompt-plan artifact reference.",
          occurredAt: completedAt,
        },
      };
  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}
