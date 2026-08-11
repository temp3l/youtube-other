import type {
  CanonicalPublishEpisodeInput,
  PublishEpisodeExecutor,
  TaskExecutionContext,
  TaskExecutionResult,
  TaskImplementation,
} from "@mediaforge/workflow-engine";

export const DARK_TRUTH_CANONICAL_PUBLICATION_ADAPTER_VERSION =
  "darktruth.canonical-publication-adapter.v1" as const;

export interface DarkTruthPublicationContextPort {
  /** Resolves only database-/manifest-authoritative publication bindings. */
  resolve(input: {
    readonly context: TaskExecutionContext;
  }): Promise<CanonicalPublishEpisodeInput>;
}

export interface DarkTruthCanonicalPublicationAdapterOptions {
  readonly context: DarkTruthPublicationContextPort;
  readonly executor: PublishEpisodeExecutor;
}

function assertCanonicalContext(
  context: TaskExecutionContext,
  input: CanonicalPublishEpisodeInput
): void {
  const mismatches: string[] = [];
  if (input.workflowRunId !== context.runId) mismatches.push("workflowRunId");
  if (input.episodeId !== context.unitId) mismatches.push("episodeId");
  if (input.taskId !== "darktruth.publish") mismatches.push("taskId");
  if (input.attemptId !== context.attemptId) mismatches.push("attemptId");
  if (mismatches.length > 0) {
    throw new Error(
      `Canonical Dark Truth publication context mismatch: ${mismatches.join(", ")}.`
    );
  }
}

export function createDarkTruthPublicationTaskImplementation(
  options: DarkTruthCanonicalPublicationAdapterOptions
): TaskImplementation {
  return async (context): Promise<TaskExecutionResult> => {
    if (context.dryRun) {
      throw new Error(
        "darktruth.publish cannot execute through a dry-run task context."
      );
    }
    if (context.control.leaseFence === null) {
      throw new Error(
        "darktruth.publish requires canonical durable task ownership; filesystem-legacy execution is forbidden."
      );
    }
    if (context.control.signal.aborted) {
      throw new Error("darktruth.publish was cancelled before context binding.");
    }
    const input = await options.context.resolve({ context });
    assertCanonicalContext(context, input);
    const result = await options.executor.execute({
      ...input,
      signal: context.control.signal,
    });
    return {
      outputArtifacts: [
        {
          schemaVersion: DARK_TRUTH_CANONICAL_PUBLICATION_ADAPTER_VERSION,
          taskId: "darktruth.publish",
          workflowRunId: input.workflowRunId,
          publicationId: input.publicationId,
          result,
        },
      ],
      warnings:
        result.kind === "reconciliation-required"
          ? ["YouTube publication requires read-only reconciliation."]
          : [],
      telemetry: {
        provider: "youtube",
        revisions: {
          adapter: DARK_TRUTH_CANONICAL_PUBLICATION_ADAPTER_VERSION,
        },
      },
    };
  };
}
