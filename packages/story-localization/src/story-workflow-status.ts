import {
  type ArtifactLineage,
  type OrchestrationStageType,
  type Retryability,
  type StageId,
  type StageType,
  type WorkflowManifest,
  type WorkflowStageState,
} from "./story-workflow.types.js";
import { compareStageContractFingerprint } from "./story-workflow-invalidation.js";
import type { HorrorAffectPlanArtifactStatus } from "./horror-affect-plan.persistence.js";

export interface StoryWorkflowStatusReport {
  readonly workflowId: string;
  readonly executionId: string;
  readonly episodeId: string;
  readonly result: "planned" | "succeeded" | "partial" | "failed" | "blocked";
  readonly stageCounts: Readonly<Record<string, number>>;
  readonly locales: readonly {
    readonly locale: string;
    readonly planned: number;
    readonly succeeded: number;
    readonly failed: number;
    readonly blocked: number;
  }[];
  readonly failures: readonly {
    readonly stageId: string;
    readonly category: string;
    readonly failureCategory: string;
    readonly retryability: string;
    readonly outcomeKind?: string;
    readonly message: string;
  }[];
  readonly staleStages: readonly {
    readonly stageId: string;
    readonly contractFingerprint?: string;
    readonly currentContractFingerprint?: string;
    readonly reasons: readonly string[];
  }[];
  readonly fallbacks: readonly {
    readonly stageId: string;
    readonly locale: string;
    readonly format?: string;
    readonly provenance: string;
    readonly status: string;
    readonly warningCodes: readonly string[];
  }[];
}

export type StoryProductionEntryStatus =
  | "completed"
  | "ready"
  | "retryable"
  | "blocked"
  | "waiting";

export type StoryProductionCategory =
  | "canonical-english"
  | "localization"
  | "shorts"
  | "scene-plan"
  | "images"
  | "audio"
  | "render";

export interface StoryProductionDependencyStatus {
  readonly stageId: string;
  readonly stageType: StageType;
  readonly locale?: string;
  readonly format?: string;
  readonly status: StoryProductionEntryStatus;
  readonly retryability?: Retryability;
  readonly message?: string;
}

export interface StoryProductionStatusEntry {
  readonly stageId: string;
  readonly stageType: OrchestrationStageType;
  readonly category: StoryProductionCategory;
  readonly episodeId: string;
  readonly locale?: string;
  readonly format?: string;
  readonly status: StoryProductionEntryStatus;
  readonly retryability?: Retryability;
  readonly message?: string;
  readonly blockedBy: readonly StoryProductionDependencyStatus[];
  readonly waitingOn: readonly StoryProductionDependencyStatus[];
  readonly overallScore?: number;
  readonly minimumScore?: number;
  readonly analysisState?: string;
}

export interface StoryProductionCategorySummary {
  readonly category: StoryProductionCategory;
  readonly completed: number;
  readonly ready: number;
  readonly retryable: number;
  readonly blocked: number;
  readonly waiting: number;
}

export interface StoryProductionStatusReport {
  readonly workflowId: string;
  readonly executionId: string;
  readonly episodeId: string;
  readonly summary: Readonly<Record<StoryProductionEntryStatus, number>>;
  readonly categories: readonly StoryProductionCategorySummary[];
  readonly entries: readonly StoryProductionStatusEntry[];
  readonly horrorAffectPlan?: HorrorAffectPlanArtifactStatus;
}

function stageLocale(stage: WorkflowStageState<ArtifactLineage>): string {
  return stage.locale ?? "shared";
}

function isCompletedStage(
  stage: WorkflowStageState<ArtifactLineage>
): boolean {
  return (
    stage.status === "succeeded" ||
    stage.status === "cached" ||
    stage.status === "skipped"
  );
}

function isRetryable(retryability: Retryability | undefined): boolean {
  return (
    retryability === "retryable" || retryability === "retry-after-change"
  );
}

function categoryForStage(
  stage: WorkflowStageState<ArtifactLineage>
): StoryProductionCategory {
  if (
    stage.stageType === "ingest-source" ||
    (stage.format === "full" &&
      stage.locale === "en" &&
      (stage.stageType === "rewrite-full" ||
        stage.stageType === "validate-full" ||
        stage.stageType === "quality-full"))
  ) {
    return "canonical-english";
  }
  if (
    stage.format === "full" &&
    stage.locale !== undefined &&
    stage.locale !== "en" &&
    (stage.stageType === "localize-full" ||
      stage.stageType === "validate-full" ||
      stage.stageType === "quality-full")
  ) {
    return "localization";
  }
  if (
    stage.format === "short" &&
    (stage.stageType === "rewrite-short" ||
      stage.stageType === "validate-short" ||
      stage.stageType === "quality-short")
  ) {
    return "shorts";
  }
  if (stage.stageType === "scene-extraction") {
    return "scene-plan";
  }
  if (
    stage.stageType === "visual-model" ||
    stage.stageType === "image-prompt" ||
    stage.stageType === "image-generation" ||
    stage.stageType === "thumbnail"
  ) {
    return "images";
  }
  if (stage.stageType === "audio" || stage.stageType === "captions") {
    return "audio";
  }
  return "render";
}

export function buildStoryWorkflowStatusReport(
  manifest: WorkflowManifest<ArtifactLineage>,
  options: {
    readonly currentManifest?: WorkflowManifest<ArtifactLineage>;
  } = {}
): StoryWorkflowStatusReport {
  const stageCounts: Record<string, number> = {};
  const localeMap = new Map<string, { planned: number; succeeded: number; failed: number; blocked: number }>();
  const failures: StoryWorkflowStatusReport["failures"][number][] = [];
  const staleStages: StoryWorkflowStatusReport["staleStages"][number][] = [];
  const fallbacks: StoryWorkflowStatusReport["fallbacks"][number][] = [];
  const currentStages = new Map(
    options.currentManifest?.stages.map((stage) => [stage.stageId, stage]) ?? []
  );
  for (const stage of manifest.stages) {
    stageCounts[stage.status] = (stageCounts[stage.status] ?? 0) + 1;
    const locale = stageLocale(stage);
    const current =
      localeMap.get(locale) ?? { planned: 0, succeeded: 0, failed: 0, blocked: 0 };
    if (stage.status === "failed") {
      current.failed += 1;
    } else if (stage.status === "blocked") {
      current.blocked += 1;
    } else if (stage.status === "succeeded" || stage.status === "cached") {
      current.succeeded += 1;
    } else {
      current.planned += 1;
    }
    localeMap.set(locale, current);
    if (stage.latestOutcome && "failure" in stage.latestOutcome) {
      failures.push({
        stageId: stage.stageId,
        category: stage.latestOutcome.failure.category,
        failureCategory:
          stage.latestOutcome.failureCategory ??
          stage.latestOutcome.failure.category,
        retryability:
          stage.latestOutcome.retryability ??
          stage.latestOutcome.failure.retryability,
        ...(stage.latestOutcome.outcomeKind
          ? { outcomeKind: stage.latestOutcome.outcomeKind }
          : {}),
        message: stage.latestOutcome.failure.message,
      });
    }
    const currentStage = currentStages.get(stage.stageId);
    if (currentStage) {
      const reasons = compareStageContractFingerprint(stage, currentStage);
      if (reasons.length > 0) {
        staleStages.push({
          stageId: stage.stageId,
          ...(stage.contractFingerprint
            ? { contractFingerprint: stage.contractFingerprint }
            : {}),
          ...(currentStage.contractFingerprint
            ? { currentContractFingerprint: currentStage.contractFingerprint }
            : {}),
          reasons,
        });
      }
    }
    if (
      stage.latestOutcome &&
      "artifact" in stage.latestOutcome &&
      (stage.latestOutcome.artifact.provenance === "source-fallback" ||
        stage.latestOutcome.artifact.provenance === "localized-fallback")
    ) {
      fallbacks.push({
        stageId: stage.stageId,
        locale: stage.locale ?? "shared",
        ...(stage.format ? { format: stage.format } : {}),
        provenance: stage.latestOutcome.artifact.provenance,
        status: stage.latestOutcome.status,
        warningCodes: stage.latestOutcome.warnings.map((warning) => warning.code),
      });
    }
  }
  const failed = stageCounts["failed"] ?? 0;
  const blocked = stageCounts["blocked"] ?? 0;
  const succeeded = (stageCounts["succeeded"] ?? 0) + (stageCounts["cached"] ?? 0);
  const planned = manifest.stages.length - failed - blocked - succeeded;
  const result =
    failed > 0 && succeeded > 0
      ? "partial"
      : blocked > 0 && succeeded > 0
        ? "partial"
        : failed > 0
          ? "failed"
          : blocked > 0
            ? "blocked"
            : planned === 0
              ? "succeeded"
              : "planned";
  return {
    workflowId: manifest.workflowId,
    executionId: manifest.executionId,
    episodeId: manifest.episodeId,
    result,
    stageCounts,
    locales: [...localeMap.entries()].map(([locale, counts]) => ({
      locale,
      ...counts,
    })),
    failures,
    staleStages,
    fallbacks,
  };
}

export function buildStoryProductionStatusReport(
  manifest: WorkflowManifest<ArtifactLineage>
): StoryProductionStatusReport {
  const stageMap = new Map(manifest.stages.map((stage) => [stage.stageId, stage]));
  const memo = new Map<StageId, StoryProductionStatusEntry>();

  const summarizeDependency = (
    entry: StoryProductionStatusEntry
  ): StoryProductionDependencyStatus => ({
    stageId: entry.stageId,
    stageType: entry.stageType,
    ...(entry.locale ? { locale: entry.locale } : {}),
    ...(entry.format ? { format: entry.format } : {}),
    status: entry.status,
    ...(entry.retryability ? { retryability: entry.retryability } : {}),
    ...(entry.message ? { message: entry.message } : {}),
  });

  const evaluateStage = (stageId: StageId): StoryProductionStatusEntry => {
    const cached = memo.get(stageId);
    if (cached) {
      return cached;
    }
    const stage = stageMap.get(stageId);
    if (!stage) {
      throw new Error(`Workflow stage not found: ${stageId}`);
    }

    const dependencyEntries = stage.dependsOn.map((dependencyId) =>
      evaluateStage(dependencyId)
    );
    const blockedBy = dependencyEntries
      .filter(
        (entry) => entry.status === "blocked" || entry.status === "retryable"
      )
      .map(summarizeDependency);
    const waitingOn = dependencyEntries
      .filter(
        (entry) =>
          entry.status === "waiting" ||
          (entry.status === "ready" && entry.stageType !== "ingest-source")
      )
      .map(summarizeDependency);

    const latestRetryability =
      stage.latestOutcome && "failure" in stage.latestOutcome
        ? (stage.latestOutcome.retryability ??
          stage.latestOutcome.failure.retryability)
        : undefined;
    const latestMessage =
      stage.latestOutcome && "failure" in stage.latestOutcome
        ? stage.latestOutcome.failure.message
        : undefined;

    let status: StoryProductionEntryStatus;
    let message = latestMessage;
    if (isCompletedStage(stage)) {
      status = "completed";
      message = undefined;
    } else if (stage.status === "failed") {
      status = isRetryable(latestRetryability) ? "retryable" : "blocked";
    } else if (stage.status === "blocked" || stage.status === "cancelled") {
      status = "blocked";
    } else if (stage.status === "running") {
      status = "waiting";
    } else if (blockedBy.length > 0) {
      status = "blocked";
      message ??=
        blockedBy.length === 1
          ? `Blocked by ${blockedBy[0]?.stageId}.`
          : `Blocked by ${blockedBy.length} upstream stages.`;
    } else if (waitingOn.length > 0) {
      status = "waiting";
      message ??=
        waitingOn.length === 1
          ? `Waiting on ${waitingOn[0]?.stageId}.`
          : `Waiting on ${waitingOn.length} upstream stages.`;
    } else {
      status = "ready";
    }

    const entry: StoryProductionStatusEntry = {
      stageId: stage.stageId,
      stageType: stage.stageType,
      category: categoryForStage(stage),
      episodeId: manifest.episodeId,
      ...(stage.locale ? { locale: stage.locale } : {}),
      ...(stage.format ? { format: stage.format } : {}),
      status,
      ...(latestRetryability ? { retryability: latestRetryability } : {}),
      ...(message ? { message } : {}),
      blockedBy,
      waitingOn,
    };
    memo.set(stageId, entry);
    return entry;
  };

  const entries = manifest.stages.map((stage) => evaluateStage(stage.stageId));
  const summary: Record<StoryProductionEntryStatus, number> = {
    completed: 0,
    ready: 0,
    retryable: 0,
    blocked: 0,
    waiting: 0,
  };
  for (const entry of entries) {
    summary[entry.status] += 1;
  }
  const categories = (
    [
      "canonical-english",
      "localization",
      "shorts",
      "scene-plan",
      "images",
      "audio",
      "render",
    ] as const
  ).map((category) => {
    const categoryEntries = entries.filter((entry) => entry.category === category);
    return {
      category,
      completed: categoryEntries.filter((entry) => entry.status === "completed")
        .length,
      ready: categoryEntries.filter((entry) => entry.status === "ready").length,
      retryable: categoryEntries.filter((entry) => entry.status === "retryable")
        .length,
      blocked: categoryEntries.filter((entry) => entry.status === "blocked")
        .length,
      waiting: categoryEntries.filter((entry) => entry.status === "waiting")
        .length,
    };
  });

  return {
    workflowId: manifest.workflowId,
    executionId: manifest.executionId,
    episodeId: manifest.episodeId,
    summary,
    categories,
    entries,
  };
}
