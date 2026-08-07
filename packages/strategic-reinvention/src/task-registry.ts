import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  taskDefinitionSchema,
  taskIdSchema,
  workflowDefinitionSchema,
  type TaskDefinition,
  type WorkflowDefinition,
} from "@mediaforge/domain";
import {
  createTaskRegistry,
  type TaskImplementation,
  type TaskRegistration,
  type TaskRegistry,
} from "@mediaforge/workflow-engine";
import {
  STRATEGIC_FULL_TASK_DEFINITIONS,
  STRATEGIC_FULL_TASK_REGISTRY_VERSION,
  type StrategicFullTaskDefinition,
} from "./full-task-definitions.js";

export const STRATEGIC_TASK_REGISTRY_VERSION = STRATEGIC_FULL_TASK_REGISTRY_VERSION;

type ExecutionKind = TaskDefinition["executionKind"];

function policies(executionKind: ExecutionKind): TaskDefinition["policies"] {
  return {
    cache: executionKind === "manual-approval" ? "disabled" : "fingerprint",
    retryLimit: 0,
    timeoutMs: 900_000,
    lockScope: "unit",
    approvalRequired: executionKind === "manual-approval",
    batchable: false,
    provider: "none",
    estimatedCostClass: "none",
  };
}

function registration(
  definition: StrategicFullTaskDefinition,
  implementations: Readonly<Partial<Record<string, TaskImplementation>>>,
): TaskRegistration {
  const execute = implementations[definition.id];
  return {
    definition: taskDefinitionSchema.parse({
      schemaVersion: TASK_SCHEMA_VERSION,
      id: definition.id,
      implementationVersion: "1.0.0",
      displayName: definition.name,
      description: definition.description,
      applicableProfiles: ["strategic-reinvention"],
      dependencies: definition.dependencies.map((taskId) => ({
        taskId,
        optional: false,
      })),
      inputs: definition.inputs ?? [],
      outputs: definition.outputs ?? [],
      executionKind: definition.executionKind,
      policies: {
        ...policies(definition.executionKind),
        ...(definition.executionKind === "manual-approval"
          ? {
              approval: {
                gate: definition.approvalGate ?? "render-qa",
                highRisk: definition.highRisk ?? false,
                requiredDistinctActors: definition.highRisk ? 2 : 1,
              },
            }
          : {}),
      },
      cli: {
        resource: "episode",
        command: definition.id,
        examples: [`mediaforge workflow strategic-episode run --episode <id>`],
      },
      observability: {
        operationName: definition.id,
        redactedFields: ["narration", "sourceBytes"],
      },
    }),
    implementation: {
      owner: definition.owner as `@mediaforge/${string}`,
      ...(execute ? { execute } : {}),
    },
  };
}

export const STRATEGIC_FULL_TASK_IDS = STRATEGIC_FULL_TASK_DEFINITIONS.map((definition) =>
  taskIdSchema.parse(definition.id),
);

export const STRATEGIC_SUPPLEMENTAL_TASK_IDS = STRATEGIC_FULL_TASK_IDS.filter((taskId) =>
  taskId.startsWith("strategic.supplemental-"),
);

export function createStrategicFullTaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): readonly TaskRegistration[] {
  return STRATEGIC_FULL_TASK_DEFINITIONS.map((definition) =>
    registration(definition, implementations),
  );
}

export function createStrategicSupplementalTaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): readonly TaskRegistration[] {
  return STRATEGIC_FULL_TASK_DEFINITIONS.filter((definition) =>
    definition.id.startsWith("strategic.supplemental-"),
  ).map((definition) => registration(definition, implementations));
}

export const strategicFullWorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "strategic-reinvention.episode",
    revision: STRATEGIC_TASK_REGISTRY_VERSION,
    profileId: "strategic-reinvention",
    taskIds: STRATEGIC_FULL_TASK_IDS,
  });

export const strategicSupplementalWorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "strategic-reinvention.supplemental-media",
    revision: STRATEGIC_TASK_REGISTRY_VERSION,
    profileId: "strategic-reinvention",
    taskIds: STRATEGIC_SUPPLEMENTAL_TASK_IDS,
  });

export function createStrategicFullTaskRegistry(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): TaskRegistry {
  const registry = createTaskRegistry(createStrategicFullTaskRegistrations(implementations));
  registry.validateWorkflow(strategicFullWorkflowDefinition);
  return registry;
}

export function createStrategicSupplementalTaskRegistry(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): TaskRegistry {
  const registry = createTaskRegistry(createStrategicSupplementalTaskRegistrations(implementations));
  registry.validateWorkflow(strategicSupplementalWorkflowDefinition);
  return registry;
}
