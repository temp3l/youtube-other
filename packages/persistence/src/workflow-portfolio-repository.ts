import type { WorkflowExecutionSpecification } from "./relational-workflow-state.js";
import type {
  WorkflowPortfolioJobStatus,
  WorkflowPortfolioSource,
} from "@mediaforge/domain";
import { WORKFLOW_PORTFOLIO_JOB_STATUSES } from "@mediaforge/domain";

function isPortfolioJobStatus(
  value: string | null
): value is WorkflowPortfolioJobStatus {
  return (
    value !== null &&
    (WORKFLOW_PORTFOLIO_JOB_STATUSES as readonly string[]).includes(value)
  );
}

export function readWorkflowAdmissionContext(
  execution: WorkflowExecutionSpecification
): {
  readonly episodeRevision?: number;
  readonly locale?: string;
} {
  const input = execution.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const value = input as Record<string, unknown>;
  const episodeRevisionValue = value["episodeRevision"];
  const episodeRevision =
    typeof episodeRevisionValue === "number" &&
    Number.isInteger(episodeRevisionValue)
      ? episodeRevisionValue
      : undefined;
  const localesValue = value["locales"];
  const locales = Array.isArray(localesValue) ? localesValue : undefined;
  const rawLocale = typeof locales?.[0] === "string" ? locales[0] : undefined;
  const locale =
    rawLocale === undefined
      ? undefined
      : rawLocale.split("-", 1)[0]?.toLowerCase();
  return {
    ...(episodeRevision !== undefined ? { episodeRevision } : {}),
    ...(locale !== undefined ? { locale } : {}),
  };
}

export function mapWorkflowPortfolioRow(input: {
  readonly workspace_id: string;
  readonly project_id: string;
  readonly episode_id: string;
  readonly run_id: string;
  readonly revision: string | number;
  readonly status: WorkflowPortfolioSource["runStatus"];
  readonly profile: string;
  readonly execution_spec: WorkflowExecutionSpecification;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly job_id: string | null;
  readonly job_revision: string | number | null;
  readonly job_status: string | null;
  readonly job_attempt_count: string | number | null;
  readonly step_id: string | null;
  readonly step_status: string | null;
}): WorkflowPortfolioSource {
  const admission = readWorkflowAdmissionContext(input.execution_spec);
  return {
    workspaceId: input.workspace_id,
    projectId: input.project_id,
    episodeId: input.episode_id,
    runId: input.run_id,
    runRevision: Number(input.revision),
    runStatus: input.status,
    profileId: input.profile,
    ...admission,
    ...(input.job_id ? { latestJobId: input.job_id } : {}),
    ...(input.job_revision !== null
      ? { latestJobRevision: Number(input.job_revision) }
      : {}),
    ...(isPortfolioJobStatus(input.job_status)
      ? { latestJobStatus: input.job_status }
      : {}),
    ...(input.job_attempt_count !== null
      ? { latestJobAttempts: Number(input.job_attempt_count) }
      : {}),
    ...(input.step_id ? { latestStageId: input.step_id } : {}),
    ...(input.step_status ? { latestStageStatus: input.step_status } : {}),
    preservedArtifactHashes: [...input.execution_spec.assetHashes],
    createdAt: new Date(input.created_at).toISOString(),
    updatedAt: new Date(input.updated_at).toISOString(),
    correlationId: input.run_id,
  };
}
