import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  taskDefinitionSchema,
  workflowDefinitionSchema,
  type TaskDefinition,
} from "@mediaforge/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowInterruptedError } from "./index.js";
import {
  createTaskRegistry,
  type TaskImplementation,
} from "./task-registry.js";
import { WorkflowOperator } from "./workflow-operator.js";

function definition(
  id: `test.${string}`,
  dependencies: readonly `test.${string}`[] = [],
  cache: "disabled" | "fingerprint" = "disabled"
): TaskDefinition {
  return taskDefinitionSchema.parse({
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    implementationVersion: "test.v1",
    displayName: id,
    description: `Execute ${id}.`,
    applicableProfiles: ["dark-truth"],
    dependencies: dependencies.map((taskId) => ({ taskId, optional: false })),
    inputs: [],
    outputs: [],
    executionKind: "deterministic",
    policies: {
      cache,
      retryLimit: 1,
      timeoutMs: 1000,
      lockScope: "task",
      approvalRequired: false,
      batchable: false,
      provider: "none",
      estimatedCostClass: "none",
    },
    cli: {
      resource: "task",
      command: id,
      examples: [`mediaforge task run --task ${id}`],
    },
    observability: {
      operationName: id,
      redactedFields: [],
    },
  });
}

async function fixture(
  implementations?: {
    readonly prepare?: TaskImplementation;
    readonly finish?: TaskImplementation;
  },
  options: {
    readonly cache?: "disabled" | "fingerprint";
    readonly includeIndependent?: boolean;
    readonly fingerprintMaterial?: Readonly<
      Record<string, { readonly configuration: unknown }>
    >;
  } = {}
) {
  const unitRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "workflow-operator-")
  );
  const prepare = definition("test.prepare", [], options.cache);
  const finish = definition("test.finish", ["test.prepare"], options.cache);
  const registrations = [
    {
      definition: prepare,
      implementation: {
        owner: "@mediaforge/testing",
        execute:
          implementations?.prepare ??
          (() => ({ outputArtifacts: [], warnings: [] })),
      },
    },
    {
      definition: finish,
      implementation: {
        owner: "@mediaforge/testing",
        execute:
          implementations?.finish ??
          (() => ({ outputArtifacts: [], warnings: [] })),
      },
    },
    ...(options.includeIndependent
      ? [
          {
            definition: definition("test.independent", [], options.cache),
            implementation: {
              owner: "@mediaforge/testing" as const,
              execute: () => ({ outputArtifacts: [], warnings: [] }),
            },
          },
        ]
      : []),
  ];
  const registry = createTaskRegistry(registrations);
  const workflow = workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "test.workflow",
    revision: "test.v1",
    profileId: "dark-truth",
    taskIds: registrations.map((registration) => registration.definition.id),
  });
  let id = 0;
  const operator = new WorkflowOperator({
    unitRoot,
    workflow,
    registry,
    identity: {
      instanceId: "test-instance",
      unitId: "test-unit",
      locale: "en",
      variant: "full",
    },
    idFactory: () => `id${++id}`,
    fingerprintMaterial: options.fingerprintMaterial,
  });
  return { operator, unitRoot, registry, workflow };
}

describe("WorkflowOperator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("plans without writes and runs exactly one ready task by default", async () => {
    const { operator, unitRoot } = await fixture();

    expect((await operator.plan()).tasks.map((task) => task.taskId)).toEqual([
      "test.prepare",
      "test.finish",
    ]);
    expect((await operator.runNext({ dryRun: true }))[0]?.taskId).toBe(
      "test.prepare"
    );
    await expect(fs.stat(path.join(unitRoot, "state"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const first = await operator.runNext();
    expect(first).toHaveLength(1);
    expect(first[0]?.taskId).toBe("test.prepare");
    expect((await operator.status()).nextTaskId).toBe("test.finish");

    const second = await operator.runNext();
    expect(second).toHaveLength(1);
    expect((await operator.status()).complete).toBe(true);
  });

  it("records interruption and resumes the interrupted task", async () => {
    let interrupted = false;
    const prepare = vi.fn(() => {
      if (!interrupted) {
        interrupted = true;
        throw new WorkflowInterruptedError("Fixture interruption.");
      }
      return { outputArtifacts: [], warnings: [] };
    });
    const { operator } = await fixture({ prepare });

    await expect(operator.runNext()).rejects.toBeInstanceOf(
      WorkflowInterruptedError
    );
    expect((await operator.status()).tasks[0]?.persistedStatus).toBe(
      "interrupted"
    );

    expect((await operator.resume()).taskId).toBe("test.prepare");
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(await operator.store.listAttempts("test.prepare")).toHaveLength(2);
  });

  it("supports retry, invalidation, override, reconciliation, and state validation", async () => {
    let fail = true;
    const { operator } = await fixture({
      prepare: () => {
        if (fail) {
          fail = false;
          throw new Error("fixture failure");
        }
        return { outputArtifacts: [], warnings: ["retried"] };
      },
    });

    await expect(operator.runNext()).rejects.toThrow("fixture failure");
    expect((await operator.retryFailed()).warnings).toEqual(["retried"]);
    await operator.invalidate("test.prepare", "Fixture invalidation.");
    expect((await operator.runTask("test.prepare")).taskId).toBe(
      "test.prepare"
    );
    expect((await operator.reconcile()).result).toEqual({
      importedSuccessTaskIds: [],
      invalidatedTaskIds: [],
      evidenceOnlyTaskIds: [],
    });
    expect((await operator.validateState()).id).toBe("test-instance");

    const second = await fixture();
    const override = await second.operator.override({
      taskId: "test.prepare",
      actor: "test-operator",
      reason: "Accepted deterministic fixture evidence.",
      scope: "task-success",
      outputManifestIds: [],
    });
    expect(override.scope).toBe("task-success");
    expect((await second.operator.status()).nextTaskId).toBe("test.finish");
  });

  it("reuses only matching successful evidence and records cache decisions", async () => {
    const prepare = vi.fn(() => ({ outputArtifacts: [], warnings: [] }));
    const { operator } = await fixture(
      { prepare },
      {
        cache: "fingerprint",
        fingerprintMaterial: {
          "test.prepare": { configuration: { quality: "standard" } },
        },
      }
    );

    expect((await operator.runTask("test.prepare")).cacheHit).toBe(false);
    const reused = await operator.runTask("test.prepare");

    expect(reused.cacheHit).toBe(true);
    expect(reused.cacheDecision.reason).toBe("validated-attempt");
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(await operator.store.readCacheDecisions()).toHaveLength(2);
  });

  it("makes material changes ready and invalidates only dependent branches", async () => {
    const { operator, registry, workflow, unitRoot } = await fixture(
      undefined,
      {
        cache: "fingerprint",
        includeIndependent: true,
        fingerprintMaterial: {
          "test.prepare": { configuration: { revision: 1 } },
        },
      }
    );
    await operator.runTask("test.prepare");
    await operator.runTask("test.finish");
    await operator.runTask("test.independent");

    const changed = new WorkflowOperator({
      unitRoot,
      workflow,
      registry,
      identity: {
        instanceId: "test-instance",
        unitId: "test-unit",
        locale: "en",
        variant: "full",
      },
      idFactory: () => "changed1",
      fingerprintMaterial: {
        "test.prepare": { configuration: { revision: 2 } },
      },
    });
    expect((await changed.status()).nextTaskId).toBe("test.prepare");
    const invalidated = await changed.invalidate(
      "test.prepare",
      "Configuration revision changed."
    );

    expect(invalidated.invalidatedTaskIds).toEqual([
      "test.prepare",
      "test.finish",
    ]);
    expect(invalidated.preservedTaskIds).toEqual(["test.independent"]);
    expect(
      (await changed.store.readState()).tasks.find(
        (task) => task.taskId === "test.independent"
      )?.status
    ).toBe("succeeded");
  });

  it("exposes registry-derived list, explain, and graph output", async () => {
    const { operator } = await fixture();

    expect(operator.list()).toHaveLength(2);
    expect(operator.explain("test.finish").requiredDependencies).toEqual([
      "test.prepare",
    ]);
    expect(operator.graph().edges).toEqual([
      { from: "test.prepare", to: "test.finish", optional: false },
    ]);
  });
});
