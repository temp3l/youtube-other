import {
  stageOutcomeSchemaVersion,
  stageFailureSchemaVersion,
  type ArtifactLineage,
  type CacheMetadata,
  type CostMetrics,
  type FailureCategory,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type WorkflowManifest,
  type WorkflowLocale,
} from "./story-workflow.types.js";
import {
  appendStageOutcome,
  type StoryWorkflowManifestStore,
} from "./story-workflow-store.js";

export type LocaleWorkflowStatus = "accepted" | "fallback-accepted" | "blocked";

export interface LocaleFallbackCandidate {
  readonly artifact: ArtifactLineage;
  readonly canonicalFingerprint: string;
  readonly qualityPassed: boolean;
}

export interface LocaleWorkflowInput {
  readonly locale: WorkflowLocale;
  readonly canonicalFingerprint: string;
  readonly generatedArtifact?: ArtifactLineage;
  readonly generationFailure?: StageFailure;
  readonly fallbackCandidates?: readonly LocaleFallbackCandidate[];
}

export interface LocaleWorkflowResult {
  readonly locale: WorkflowLocale;
  readonly status: LocaleWorkflowStatus;
  readonly artifact?: ArtifactLineage;
  readonly fallbackUsed: boolean;
  readonly provenance: "generated" | "localized-fallback" | "none";
  readonly failure?: StageFailure;
}

function workflowFailure(
  category: FailureCategory,
  message: string,
  sourceFailure?: StageFailure
): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category,
    retryability: "retry-after-change",
    message,
    occurredAt: new Date().toISOString(),
    ...(sourceFailure ? { causeStageId: sourceFailure.causeStageId } : {}),
  };
}

export function resolveLocaleWorkflowBranch(
  input: LocaleWorkflowInput
): LocaleWorkflowResult {
  if (input.generatedArtifact) {
    return {
      locale: input.locale,
      status: "accepted",
      artifact: input.generatedArtifact,
      fallbackUsed: false,
      provenance: "generated",
    };
  }

  const fallback = input.fallbackCandidates?.find(
    (candidate) =>
      candidate.canonicalFingerprint === input.canonicalFingerprint &&
      candidate.qualityPassed &&
      candidate.artifact.locale === input.locale
  );
  if (fallback) {
    return {
      locale: input.locale,
      status: "fallback-accepted",
      artifact: {
        ...fallback.artifact,
        provenance: "localized-fallback",
      },
      fallbackUsed: true,
      provenance: "localized-fallback",
      ...(input.generationFailure ? { failure: input.generationFailure } : {}),
    };
  }

  return {
    locale: input.locale,
    status: "blocked",
    fallbackUsed: false,
    provenance: "none",
    failure:
      input.generationFailure ??
      workflowFailure(
        "locale-fallback-rejected",
        `No accepted same-locale fallback was available for ${input.locale}.`
      ),
  };
}

export function localeFailureBlocksOnlyLocale(
  results: readonly LocaleWorkflowResult[],
  locale: WorkflowLocale
): boolean {
  return results
    .filter((result) => result.locale !== locale)
    .every((result) => result.status !== "blocked");
}

export interface LocaleWorkflowStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface LocaleWorkflowStageResult {
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

export async function executeLocaleWorkflowStage(args: {
  readonly context: LocaleWorkflowStageContext;
  readonly result: LocaleWorkflowResult;
}): Promise<LocaleWorkflowStageResult> {
  const stageId =
    args.context.stageId ??
    (`stage:localize-full:${args.result.locale}:full` as StageId);
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
    warnings:
      args.result.status === "fallback-accepted"
        ? [
            {
              code: "locale-fallback-accepted",
              message: `Accepted ${args.result.locale} fallback for localized full branch.`,
              emittedAt: completedAt,
              details: {
                locale: args.result.locale,
              },
            },
          ]
        : [],
    cost: emptyCost(),
    startedAt,
    completedAt,
    observability: {
      attemptNumber: args.context.manifest.attemptHistory.length + 1,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    },
  } as const;
  const outcome: StageOutcome<ArtifactLineage> =
    args.result.artifact &&
    (args.result.status === "accepted" ||
      args.result.status === "fallback-accepted")
      ? {
          ...baseOutcome,
          status: "succeeded",
          artifact: args.result.artifact,
          provenance: args.result.artifact.provenance,
        }
      : {
          ...baseOutcome,
          status: "blocked",
          failure:
            args.result.failure ??
            workflowFailure(
              "locale-fallback-rejected",
              `Localized full branch blocked for ${args.result.locale}.`
            ),
        };
  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}
