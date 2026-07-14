import { TASK_SCHEMA_VERSION, taskDefinitionSchema } from "@mediaforge/domain";
import { describe, expect, it } from "vitest";

import {
  ProductionTaskCallerAdapter,
  currentProductionCallerInvocation,
} from "./caller-migration.js";
import { createTaskRegistry } from "./task-registry.js";

describe("ProductionTaskCallerAdapter", () => {
  it("runs a compatibility callback under its canonical registered identity", async () => {
    const definition = taskDefinitionSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      id: "darktruth.metadata",
      implementationVersion: "test.v1",
      displayName: "Metadata",
      description: "Test canonical metadata task.",
      applicableProfiles: ["dark-truth"],
      dependencies: [],
      inputs: [],
      outputs: [],
      executionKind: "model-assisted",
      policies: {
        cache: "fingerprint",
        retryLimit: 1,
        timeoutMs: 1_000,
        lockScope: "task",
        approvalRequired: false,
        batchable: true,
        provider: "optional",
        estimatedCostClass: "low",
      },
      cli: { resource: "episode", command: "metadata", examples: [] },
      observability: {
        operationName: "darktruth.metadata",
        redactedFields: [],
      },
    });
    const adapter = new ProductionTaskCallerAdapter(
      createTaskRegistry([
        {
          definition,
          implementation: { owner: "@mediaforge/metadata" },
        },
      ])
    );

    const result = await adapter.invoke(
      {
        caller: "mediaforge metadata youtube",
        taskId: "darktruth.metadata",
        compatibility: "legacy-cli",
        removeWhen: "the public alias is retired",
      },
      () => ({ value: 42, invocation: currentProductionCallerInvocation() })
    );

    expect(result.value).toBe(42);
    expect(result.invocation).toMatchObject({
      caller: "mediaforge metadata youtube",
      taskId: "darktruth.metadata",
      implementationOwner: "@mediaforge/metadata",
      implementationVersion: "test.v1",
    });
    expect(currentProductionCallerInvocation()).toBeUndefined();
  });
});
