import {
  WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
  type WorkflowPortfolioEntry,
  type WorkflowPortfolioFilter,
  type WorkflowPortfolioPage,
  type WorkflowPortfolioSource,
  type WorkflowRecoveryClassification,
  workflowPortfolioEntrySchema,
  workflowPortfolioPageSchema,
  type WorkflowPortfolioJobStatus,
  type WorkflowRunStatus,
  type WorkflowPortfolioRecovery,
} from "./workflow-portfolio-contracts.js";
import type { ContentProfileId } from "./workflow-contracts.js";
import { contentProfileIdSchema, contentLocaleSchema } from "./workflow-contracts.js";

const API_PROFILE_TO_DOMAIN: Readonly<Record<string, ContentProfileId>> = {
  dark_truth: "dark-truth",
  mathematics_education: "mathematics-education",
  strategic_reinvention: "strategic-reinvention",
  history: "history",
};

export function mapProjectProfileToDomain(profile: string): ContentProfileId | null {
  return API_PROFILE_TO_DOMAIN[profile] ?? null;
}

export function classifyWorkflowRecovery(input: {
  readonly runStatus: WorkflowRunStatus;
  readonly jobStatus?: WorkflowPortfolioJobStatus | undefined;
  readonly abandoned?: boolean;
}): WorkflowPortfolioRecovery {
  if (input.abandoned) {
    return {
      classification: "abandoned",
      availableActions: ["view_timeline"],
      message: "This workflow run was abandoned after a non-recoverable failure.",
    };
  }

  if (
    input.runStatus === "running" ||
    input.runStatus === "queued" ||
    input.jobStatus === "running" ||
    input.jobStatus === "cancelling"
  ) {
    return {
      classification: "in_progress",
      availableActions: ["cancel", "view_timeline"],
    };
  }

  if (input.jobStatus === "retry_scheduled") {
    return {
      classification: "retryable",
      availableActions: ["resume", "view_timeline"],
      sanitizedFailureCode: "job_retry_scheduled",
      message: "A retry is scheduled and can be resumed safely.",
    };
  }

  if (input.jobStatus === "dead_lettered") {
    return {
      classification: "non_retryable",
      availableActions: ["abandon", "view_timeline"],
      sanitizedFailureCode: "job_dead_lettered",
      message: "The job exhausted retries and requires operator review or abandonment.",
    };
  }

  if (input.runStatus === "failed" || input.jobStatus === "failed") {
    return {
      classification: "non_retryable",
      availableActions: ["resume", "abandon", "view_timeline"],
      sanitizedFailureCode: "job_failed",
      message: "The workflow failed. Resume only when policy marks the fault retryable.",
    };
  }

  if (input.runStatus === "cancelled" || input.jobStatus === "cancelled") {
    return {
      classification: "retryable",
      availableActions: ["resume", "view_timeline"],
      message: "The workflow was cancelled and may be resumed when policy allows.",
    };
  }

  return {
    classification: "none",
    availableActions: ["view_timeline"],
  };
}

function encodeCursor(updatedAt: string, runId: string): string {
  return `${updatedAt}|${runId}`;
}

function decodeCursor(cursor: string): { readonly updatedAt: string; readonly runId: string } | null {
  const [updatedAt, runId] = cursor.split("|", 2);
  if (!updatedAt || !runId) return null;
  return { updatedAt, runId };
}

export function matchesWorkflowPortfolioFilter(
  source: WorkflowPortfolioSource,
  filter: WorkflowPortfolioFilter
): boolean {
  if (source.workspaceId !== filter.workspaceId) return false;
  if (filter.projectId && source.projectId !== filter.projectId) return false;

  const profileId = mapProjectProfileToDomain(source.profileId);
  if (filter.profileId && profileId !== filter.profileId) return false;
  if (filter.locale && source.locale !== filter.locale) return false;
  if (filter.runStatus && source.runStatus !== filter.runStatus) return false;
  if (filter.jobStatus && source.latestJobStatus !== filter.jobStatus) return false;

  if (filter.updatedAfter && source.updatedAt < filter.updatedAfter) return false;
  if (filter.updatedBefore && source.updatedAt > filter.updatedBefore) return false;

  return true;
}

export function projectWorkflowPortfolioEntry(
  source: WorkflowPortfolioSource
): WorkflowPortfolioEntry | null {
  const profileId = mapProjectProfileToDomain(source.profileId);
  if (!profileId) return null;

  const locale =
    source.locale === undefined
      ? undefined
      : contentLocaleSchema.safeParse(source.locale).success
        ? contentLocaleSchema.parse(source.locale)
        : undefined;

  const blockers: WorkflowPortfolioEntry["blockers"] = [];
  if (source.runStatus === "awaiting_approval") {
    blockers.push({
      code: "approval_required",
      message: "Workflow is waiting for a human approval decision.",
      severity: "blocking",
    });
  }

  return workflowPortfolioEntrySchema.parse({
    schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
    workspaceId: source.workspaceId,
    projectId: source.projectId,
    episodeId: source.episodeId,
    runId: source.runId,
    runRevision: source.runRevision,
    runStatus: source.runStatus,
    profileId,
    ...(locale ? { locale } : {}),
    ...(source.episodeRevision !== undefined
      ? { episodeRevision: source.episodeRevision }
      : {}),
    ...(source.latestJobId ? { latestJobId: source.latestJobId } : {}),
    ...(source.latestJobRevision !== undefined
      ? { latestJobRevision: source.latestJobRevision }
      : {}),
    ...(source.latestJobStatus ? { latestJobStatus: source.latestJobStatus } : {}),
    ...(source.latestJobAttempts !== undefined
      ? { latestJobAttempts: source.latestJobAttempts }
      : {}),
    ...(source.latestStageId ? { latestStageId: source.latestStageId } : {}),
    ...(source.latestStageStatus
      ? { latestStageStatus: source.latestStageStatus }
      : {}),
    preservedArtifactHashes: source.preservedArtifactHashes ?? [],
    blockers,
    recovery: classifyWorkflowRecovery({
      runStatus: source.runStatus,
      ...(source.latestJobStatus ? { jobStatus: source.latestJobStatus } : {}),
    }),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    ...(source.correlationId ? { correlationId: source.correlationId } : {}),
  });
}

export function projectWorkflowPortfolioPage(input: {
  readonly filter: WorkflowPortfolioFilter;
  readonly sources: readonly WorkflowPortfolioSource[];
  readonly projectedAt: string;
}): WorkflowPortfolioPage {
  const cursor = input.filter.cursor
    ? decodeCursor(input.filter.cursor)
    : null;

  const filtered = input.sources
    .filter((source) => matchesWorkflowPortfolioFilter(source, input.filter))
    .filter((source) => {
      if (!cursor) return true;
      return (
        source.updatedAt < cursor.updatedAt ||
        (source.updatedAt === cursor.updatedAt && source.runId > cursor.runId)
      );
    })
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return right.runId.localeCompare(left.runId);
    });

  const limit = input.filter.limit;
  const pageSources = filtered.slice(0, limit);
  const items = pageSources
    .map((source) => projectWorkflowPortfolioEntry(source))
    .filter((entry): entry is WorkflowPortfolioEntry => entry !== null);

  const last = pageSources.at(-1);
  const nextCursor =
    filtered.length > limit && last
      ? encodeCursor(last.updatedAt, last.runId)
      : undefined;

  return workflowPortfolioPageSchema.parse({
    schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
    workspaceId: input.filter.workspaceId,
    items,
    ...(nextCursor ? { nextCursor } : {}),
    projectedAt: input.projectedAt,
  });
}

export function recoveryClassificationForStatus(
  runStatus: WorkflowRunStatus,
  jobStatus?: WorkflowPortfolioJobStatus | undefined
): WorkflowRecoveryClassification {
  return classifyWorkflowRecovery({
    runStatus,
    ...(jobStatus ? { jobStatus } : {}),
  }).classification;
}
