import {
  normalizeWorkflowError,
  type TaskExecutionControl,
} from "@mediaforge/workflow-engine";
import { z } from "zod";

import type {
  DurableJobHandler,
  DurableJobHandlerResult,
} from "./durable-job-worker.js";

const opaqueIdSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);

const executePayloadSchema = z
  .object({
    workflowRunId: opaqueIdSchema,
    jobId: opaqueIdSchema,
    command: z.string().min(1).max(200),
  })
  .strict();

const resumePayloadSchema = z
  .object({ workflowRunId: opaqueIdSchema })
  .strict();

export interface PersistedDurableWorkflowRun {
  readonly workflowRunId: string;
  readonly authority: "filesystem-legacy" | "database-v1";
  /** Irreversible effects require their dedicated intent/effect journal. */
  readonly effectClass: "reversible" | "irreversible";
  /** Authoritative persisted execution document; never sourced from job args. */
  readonly execution: unknown;
}

export interface PersistedDurableWorkflowLoader {
  load(input: {
    readonly workspaceId: string;
    readonly workflowRunId: string;
  }): Promise<PersistedDurableWorkflowRun | null>;
}

export interface CanonicalDurableWorkflowExecutor {
  execute(input: {
    readonly mode: "execute" | "resume";
    readonly jobId: string;
    readonly run: PersistedDurableWorkflowRun;
    readonly control: TaskExecutionControl;
  }): Promise<void>;
}

function terminal(error: string): DurableJobHandlerResult {
  return { kind: "terminal_failure", error };
}

/**
 * Strict bridge from durable control-plane jobs to canonical workflow code.
 * Job payloads select only a persisted run; they can never supply media paths,
 * provider arguments, or an alternate execution document.
 */
export class DurableWorkflowJobHandler implements DurableJobHandler {
  public constructor(
    private readonly loader: PersistedDurableWorkflowLoader,
    private readonly executor: CanonicalDurableWorkflowExecutor
  ) {}

  public async execute(
    job: Parameters<DurableJobHandler["execute"]>[0],
    context: Parameters<DurableJobHandler["execute"]>[1]
  ): Promise<DurableJobHandlerResult> {
    let workflowRunId: string;
    let mode: "execute" | "resume";
    if (job.jobType === "workflow.execute") {
      const parsed = executePayloadSchema.safeParse(job.payload);
      if (!parsed.success || parsed.data.jobId !== job.jobId) {
        return terminal("Malformed workflow.execute durable job payload.");
      }
      workflowRunId = parsed.data.workflowRunId;
      mode = "execute";
    } else if (job.jobType === "workflow.resume") {
      const parsed = resumePayloadSchema.safeParse(job.payload);
      if (!parsed.success) {
        return terminal("Malformed workflow.resume durable job payload.");
      }
      workflowRunId = parsed.data.workflowRunId;
      mode = "resume";
    } else {
      return terminal(`Unsupported durable job type: ${job.jobType}.`);
    }

    try {
      const run = await this.loader.load({
        workspaceId: job.workspaceId,
        workflowRunId,
      });
      if (!run || run.workflowRunId !== workflowRunId) {
        return terminal(
          "The durable job's persisted workflow run was not found."
        );
      }
      if (run.authority !== "database-v1") {
        return terminal(
          "Durable workflow jobs require database-v1 execution authority."
        );
      }
      if (run.effectClass === "irreversible") {
        return terminal(
          "Irreversible publication requires the dedicated intent and reconciliation handler."
        );
      }
      await this.executor.execute({
        mode,
        jobId: job.jobId,
        run,
        control: {
          signal: context.signal,
          deadlineAt: context.deadlineAt,
          leaseFence: context.leaseFence,
          dispatchAttempt: context.attempt,
        },
      });
      return { kind: "succeeded" };
    } catch (error) {
      const normalized = normalizeWorkflowError(error);
      return {
        kind: normalized.retryable ? "retryable_failure" : "terminal_failure",
        error: normalized.message,
      };
    }
  }
}
