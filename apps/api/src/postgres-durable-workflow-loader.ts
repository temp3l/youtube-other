import type {
  PersistedDurableWorkflowLoader,
  PersistedDurableWorkflowRun,
} from "@mediaforge/application";
import {
  type PostgresWorkflowRepository,
  type WorkflowExecutionSpecification,
} from "@mediaforge/persistence";
import { z } from "zod";

const opaqueIdSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);

const workflowCommandSchema = z
  .object({
    projectId: opaqueIdSchema,
    episodeId: opaqueIdSchema,
    template: z.literal("episode-production"),
    episodeRevision: z.number().int().nonnegative(),
    locales: z.array(z.string().min(2).max(35)).min(1).max(32),
    variants: z
      .array(z.enum(["full", "short"]))
      .min(1)
      .max(2),
    approvalMode: z.enum(["required", "automatic", "none"]),
    publicationMode: z.enum(["none", "manual", "scheduled"]),
  })
  .strict();

const persistedExecutionSchema = z
  .object({
    input: z
      .object({
        command: z.literal("episode-production"),
        input: workflowCommandSchema,
      })
      .strict(),
    configurationVersion: z.string().min(1).max(160),
    promptVersion: z.string().min(1).max(160),
    providerSelection: z.string().min(1).max(160),
    rendererVersion: z.string().min(1).max(160),
    presetVersion: z.string().min(1).max(160),
    buildVersion: z.string().min(1).max(160).nullable(),
    assetHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).max(10_000),
    taskGraphVersion: z.string().min(1).max(160),
  })
  .strict();

/**
 * Loads only database-owned workflow specifications inside a tenant-scoped
 * transaction. The job payload can identify a run but cannot replace any of
 * its persisted execution inputs.
 */
export class PostgresPersistedDurableWorkflowLoader implements PersistedDurableWorkflowLoader {
  public constructor(
    private readonly repository: Pick<
      PostgresWorkflowRepository,
      "withWorkspaceTransaction"
    >
  ) {}

  public async load(input: {
    readonly workspaceId: string;
    readonly jobId: string;
    readonly workflowRunId: string;
  }): Promise<PersistedDurableWorkflowRun | null> {
    return this.repository.withWorkspaceTransaction(
      input.workspaceId,
      async (transaction) => {
        const run = await transaction.getForJob(
          input.workspaceId,
          input.workflowRunId,
          input.jobId
        );
        if (!run) return null;
        const parsed = persistedExecutionSchema.safeParse(run.execution);
        if (!parsed.success) {
          throw new Error(
            "The persisted workflow execution specification is invalid.",
            { cause: parsed.error }
          );
        }
        const execution = parsed.data satisfies WorkflowExecutionSpecification;
        return {
          workflowRunId: run.runId,
          command: execution.input.command,
          authority: run.authority,
          effectClass:
            execution.input.input.publicationMode === "none"
              ? "reversible"
              : "irreversible",
          execution,
        };
      }
    );
  }
}
