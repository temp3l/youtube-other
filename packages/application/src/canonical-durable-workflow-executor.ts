import { z } from "zod";

import type {
  CanonicalDurableWorkflowExecutor,
  PersistedDurableWorkflowRun,
} from "./durable-workflow-job-handler.js";

const canonicalCommandSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u);

const persistedExecutionCommandSchema = z
  .object({
    input: z
      .object({ command: canonicalCommandSchema })
      .passthrough(),
  })
  .passthrough();

export interface CanonicalDurableWorkflowCommandBinding {
  /** Exact persisted command identity owned by this binding. */
  readonly command: string;
  readonly execute: CanonicalDurableWorkflowExecutor["execute"];
}

/**
 * Database-authoritative command dispatcher for durable workflow jobs.
 * Bindings are fixed during process composition; a persisted run can select
 * only its exact canonical command and cannot influence dispatch otherwise.
 */
export class CanonicalDurableWorkflowCommandExecutor
  implements CanonicalDurableWorkflowExecutor
{
  private readonly bindings: ReadonlyMap<
    string,
    CanonicalDurableWorkflowCommandBinding
  >;

  public constructor(
    bindings: readonly CanonicalDurableWorkflowCommandBinding[]
  ) {
    const registered = new Map<string, CanonicalDurableWorkflowCommandBinding>();
    for (const binding of bindings) {
      const command = canonicalCommandSchema.parse(binding.command);
      if (registered.has(command)) {
        throw new Error(
          `Duplicate canonical durable workflow command binding: ${command}.`
        );
      }
      registered.set(command, binding);
    }
    this.bindings = registered;
  }

  public async execute(
    input: Parameters<CanonicalDurableWorkflowExecutor["execute"]>[0]
  ): Promise<void> {
    const command = canonicalCommandSchema.parse(input.run.command);
    const execution = persistedExecutionCommandSchema.safeParse(
      input.run.execution
    );
    if (!execution.success || execution.data.input.command !== command) {
      throw new Error(
        "Persisted workflow execution command does not match its durable run."
      );
    }
    const binding = this.bindings.get(command);
    if (!binding) {
      throw new Error(
        `Unsupported canonical durable workflow command: ${command}.`
      );
    }
    await binding.execute(input);
  }
}

/** Creates the concrete durable executor used by production composition. */
export function createCanonicalDurableWorkflowCommandExecutor(
  bindings: readonly CanonicalDurableWorkflowCommandBinding[]
): CanonicalDurableWorkflowExecutor {
  return new CanonicalDurableWorkflowCommandExecutor(bindings);
}

export type { PersistedDurableWorkflowRun };
