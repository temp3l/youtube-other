import {
  type ArtifactLineage,
  type WorkflowManifest,
  type WorkflowStageState,
} from "./story-workflow.types.js";

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
    readonly message: string;
  }[];
}

function stageLocale(stage: WorkflowStageState<ArtifactLineage>): string {
  return stage.locale ?? "shared";
}

export function buildStoryWorkflowStatusReport(
  manifest: WorkflowManifest<ArtifactLineage>
): StoryWorkflowStatusReport {
  const stageCounts: Record<string, number> = {};
  const localeMap = new Map<string, { planned: number; succeeded: number; failed: number; blocked: number }>();
  const failures: StoryWorkflowStatusReport["failures"][number][] = [];
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
        message: stage.latestOutcome.failure.message,
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
  };
}
