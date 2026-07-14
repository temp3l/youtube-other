import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  taskDefinitionSchema,
  workflowDefinitionSchema,
  type ArtifactContract,
  type ContentProfileId,
  type TaskDefinition,
} from "@mediaforge/domain";
import { describe, expect, it, vi } from "vitest";

import {
  TaskRegistryError,
  adaptTaskImplementation,
  createTaskRegistry,
  type TaskRegistration,
} from "./task-registry.js";

const documentArtifact: ArtifactContract = {
  kind: "source",
  required: true,
  schemaId: "test.document" as ArtifactContract["schemaId"],
  schemaVersion: "1.0.0",
};

function task(args: {
  id: `${string}.${string}`;
  profile?: ContentProfileId;
  dependencies?: readonly { id: `${string}.${string}`; optional?: boolean }[];
  inputs?: readonly ArtifactContract[];
  outputs?: readonly ArtifactContract[];
  executionKind?: TaskDefinition["executionKind"];
  owner?: `@mediaforge/${string}`;
}): TaskRegistration {
  const executionKind = args.executionKind ?? "deterministic";
  return {
    definition: taskDefinitionSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      id: args.id,
      implementationVersion: "1.0.0",
      displayName: args.id,
      description: `Execute ${args.id}.`,
      applicableProfiles: [args.profile ?? "dark-truth"],
      dependencies: (args.dependencies ?? []).map((dependency) => ({
        taskId: dependency.id,
        optional: dependency.optional ?? false,
      })),
      inputs: args.inputs ?? [],
      outputs: args.outputs ?? [],
      executionKind,
      policies: {
        cache: "fingerprint",
        retryLimit: 0,
        timeoutMs: 1_000,
        lockScope: "task",
        approvalRequired: executionKind === "irreversible",
        batchable: false,
        provider: "none",
        estimatedCostClass: "none",
      },
      cli: { resource: "task", command: args.id, examples: [args.id] },
      observability: { operationName: args.id, redactedFields: [] },
    }),
    implementation: { owner: args.owner ?? "@mediaforge/testing" },
  };
}

const emptyReadiness = {
  completedTaskIds: new Set(),
  availableArtifacts: [],
  approvedTaskIds: new Set(),
} as const;

describe("task registry and DAG", () => {
  it("lists, explains, orders, and dry-run plans registered tasks", () => {
    const registry = createTaskRegistry([
      task({ id: "test.ingest", outputs: [documentArtifact] }),
      task({
        id: "test.transform",
        dependencies: [{ id: "test.ingest" }],
        inputs: [documentArtifact],
        outputs: [documentArtifact],
      }),
      task({
        id: "test.publish",
        dependencies: [{ id: "test.transform" }],
        inputs: [documentArtifact],
        executionKind: "irreversible",
        owner: "@mediaforge/youtube-upload",
      }),
    ]);
    const workflow = workflowDefinitionSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "test.workflow",
      revision: "1.0.0",
      profileId: "dark-truth",
      taskIds: ["test.publish", "test.ingest", "test.transform"],
    });

    expect(registry.list().map((entry) => entry.id)).toEqual([
      "test.ingest",
      "test.publish",
      "test.transform",
    ]);
    expect(registry.explain("test.publish")).toMatchObject({
      implementationOwner: "@mediaforge/youtube-upload",
      requiredDependencies: ["test.transform"],
      transitiveDependencies: ["test.ingest", "test.transform"],
    });
    const plan = registry.plan(workflow, emptyReadiness);
    expect(plan.dryRun).toBe(true);
    expect(plan.tasks.map((entry) => entry.taskId)).toEqual([
      "test.ingest",
      "test.transform",
      "test.publish",
    ]);
    expect(plan.tasks[0]?.readiness.status).toBe("ready");
    expect(plan.tasks[2]?.readiness.status).toBe("blocked");
  });

  it("derives readiness from dependencies, artifacts, custom gates, and approvals", () => {
    const registration = task({
      id: "test.publish",
      inputs: [documentArtifact],
      executionKind: "irreversible",
    });
    const registry = createTaskRegistry([
      {
        ...registration,
        readiness: () => ["Operator policy is not loaded."],
      },
    ]);
    expect(
      registry.readiness("test.publish", {
        profileId: "dark-truth",
        ...emptyReadiness,
      })
    ).toMatchObject({ status: "blocked" });

    const readyRegistry = createTaskRegistry([registration]);
    expect(
      readyRegistry.readiness("test.publish", {
        profileId: "dark-truth",
        completedTaskIds: new Set(),
        availableArtifacts: [documentArtifact],
        approvedTaskIds: new Set(),
      })
    ).toMatchObject({ status: "awaiting-approval" });
    expect(
      readyRegistry.readiness("test.publish", {
        profileId: "dark-truth",
        completedTaskIds: new Set(),
        availableArtifacts: [documentArtifact],
        approvedTaskIds: new Set([registration.definition.id]),
      })
    ).toMatchObject({ status: "ready" });
    expect(
      readyRegistry.readiness("test.publish", {
        profileId: "mathematics-education",
        ...emptyReadiness,
      })
    ).toMatchObject({ status: "not-applicable" });
  });

  it("supports omitted optional edges and orders them when selected", () => {
    const registry = createTaskRegistry([
      task({ id: "test.optional" }),
      task({
        id: "test.main",
        dependencies: [{ id: "test.optional", optional: true }],
      }),
    ]);
    const withoutOptional = workflowDefinitionSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "test.minimal",
      revision: "1.0.0",
      profileId: "dark-truth",
      taskIds: ["test.main"],
    });
    expect(registry.validateWorkflow(withoutOptional)).toEqual(withoutOptional);
    expect(
      registry.plan(withoutOptional, emptyReadiness).tasks[0]?.readiness.status
    ).toBe("ready");

    const withOptional = workflowDefinitionSchema.parse({
      ...withoutOptional,
      id: "test.complete",
      taskIds: ["test.main", "test.optional"],
    });
    expect(
      registry
        .plan(withOptional, emptyReadiness)
        .tasks.map((entry) => entry.taskId)
    ).toEqual(["test.optional", "test.main"]);
  });

  it.each([
    {
      expected: "DUPLICATE_TASK_ID",
      registrations: [task({ id: "test.same" }), task({ id: "test.same" })],
    },
    {
      expected: "MISSING_DEPENDENCY",
      registrations: [
        task({ id: "test.child", dependencies: [{ id: "test.missing" }] }),
      ],
    },
    {
      expected: "DEPENDENCY_CYCLE",
      registrations: [
        task({ id: "test.left", dependencies: [{ id: "test.right" }] }),
        task({ id: "test.right", dependencies: [{ id: "test.left" }] }),
      ],
    },
    {
      expected: "PROFILE_APPLICABILITY_INVALID",
      registrations: [
        task({ id: "test.dark" }),
        task({
          id: "test.math",
          profile: "mathematics-education",
          dependencies: [{ id: "test.dark" }],
        }),
      ],
    },
    {
      expected: "ARTIFACT_CONTRACT_INCOMPATIBLE",
      registrations: [
        task({ id: "test.producer", outputs: [documentArtifact] }),
        task({
          id: "test.consumer",
          dependencies: [{ id: "test.producer" }],
          inputs: [{ ...documentArtifact, schemaVersion: "2.0.0" }],
        }),
      ],
    },
  ])("rejects invalid registry: $expected", ({ registrations, expected }) => {
    expect(() => createTaskRegistry(registrations)).toThrowError(
      expect.objectContaining<Partial<TaskRegistryError>>({ code: expected })
    );
  });

  it("wraps an existing service without moving its behavior", async () => {
    const service = vi.fn((input: { unit: string }) => ({
      artifact: input.unit,
    }));
    const binding = adaptTaskImplementation({
      owner: "@mediaforge/testing",
      service,
      mapInput: (context) => ({ unit: context.unitId }),
      mapResult: (result) => ({
        outputArtifacts: [result.artifact],
        warnings: [],
      }),
    });
    await expect(
      binding.execute?.({
        unitId: "episode-1",
        profileId: "dark-truth",
        locale: "en",
        variant: "full",
        dryRun: true,
      })
    ).resolves.toEqual({ outputArtifacts: ["episode-1"], warnings: [] });
    expect(service).toHaveBeenCalledOnce();
  });
});
