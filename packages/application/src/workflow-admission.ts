import type { ApplicationCommandHandler, ApplicationExecutionContext } from "./contracts.js";
import { ApplicationError } from "./errors.js";
import type { WorkflowAdmissionPort } from "./ports.js";

export interface WorkflowAdmissionCommand {
  readonly template: string;
  readonly episodeRevision: number;
  readonly locales: readonly string[];
  readonly variants: readonly string[];
  readonly approvalMode: "required" | "none";
  readonly publicationMode: "none" | "manual" | "scheduled";
}

export interface WorkflowAdmissionResult {
  readonly workflowRunId: string;
  readonly jobId: string;
  readonly revision: number;
}

/** Shared mutation handler for HTTP, connected CLI, workers, and tests. */
export class WorkflowAdmissionHandler implements ApplicationCommandHandler<WorkflowAdmissionCommand, WorkflowAdmissionResult> {
  public constructor(private readonly admissions: WorkflowAdmissionPort) {}

  public async execute(command: WorkflowAdmissionCommand, execution: ApplicationExecutionContext): Promise<WorkflowAdmissionResult> {
    if (execution.signal.aborted) throw new ApplicationError("upstream_unavailable", "The workflow admission was cancelled.", true);
    if (execution.authorization.decision !== "allowed" || !execution.actor.permissions.includes("workflow:write")) {
      throw new ApplicationError("authorization_denied", "Permission is denied.", false);
    }
    if (!execution.idempotency) throw new ApplicationError("precondition_required", "Workflow admission requires an idempotency key.", false);
    return this.admissions.admit({ execution, command: command.template, input: command });
  }
}
