import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  taskDefinitionSchema,
  taskIdSchema,
  workflowDefinitionSchema,
  type ArtifactContract,
  type ArtifactKind,
  type TaskDefinition,
  type WorkflowDefinition,
} from "@mediaforge/domain";
import {
  createTaskRegistry,
  type TaskImplementation,
  type TaskRegistration,
  type TaskRegistry,
} from "@mediaforge/workflow-engine";

export const STRATEGIC_TASK_REGISTRY_VERSION =
  "strategic-reinvention.task-registry.v1" as const;

type ExecutionKind = TaskDefinition["executionKind"];

const artifact = (
  kind: ArtifactKind,
  schemaId: `${string}.${string}`,
  required = true,
): ArtifactContract => ({
  kind,
  required,
  schemaId: schemaId as ArtifactContract["schemaId"],
  schemaVersion: "1.0.0",
});

const narration = artifact("narration", "strategic.narration");
const supplementalInventory = artifact("source-manifest", "strategic.supplemental-inventory");
const mediaPlan = artifact("composition-plan", "veronica.media-plan");
const approvalPack = artifact("provenance-report", "veronica.approval-pack");
const renderManifest = artifact("render", "veronica.render-manifest");

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

const definitions = [
  {
    id: "strategic.supplemental-ingest",
    name: "Ingest supplemental media",
    description: "Validate and inventory creator-supplied supplemental media.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: [],
    inputs: [narration],
    outputs: [supplementalInventory],
  },
  {
    id: "strategic.supplemental-plan",
    name: "Plan supplemental media",
    description: "Generate a versioned Veronica semantic media plan.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-ingest"],
    inputs: [narration, supplementalInventory],
    outputs: [mediaPlan],
  },
  {
    id: "strategic.supplemental-prepare",
    name: "Prepare supplemental assets",
    description: "Materialize landscape and portrait prepared assets.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-plan"],
    inputs: [mediaPlan],
    outputs: [renderManifest],
  },
  {
    id: "strategic.supplemental-approval-pack",
    name: "Export supplemental approval pack",
    description: "Emit a redacted approval pack for editorial review.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-prepare"],
    inputs: [mediaPlan, renderManifest],
    outputs: [approvalPack],
  },
  {
    id: "strategic.supplemental-review",
    name: "Approve supplemental media plan",
    description: "Manual approval gate for supplemental media eligibility.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.supplemental-approval-pack"],
    inputs: [approvalPack, mediaPlan],
    outputs: [approvalPack],
  },
] as const;

function registration(
  definition: (typeof definitions)[number],
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
                gate: "render-qa",
                highRisk: false,
                requiredDistinctActors: 1,
              },
            }
          : {}),
      },
      cli: {
        resource: "episode",
        command: definition.id,
        examples: [`mediaforge veronica-media pilot --episode-id <id>`],
      },
      observability: {
        operationName: definition.id,
        redactedFields: ["narration", "sourceBytes"],
      },
    }),
    implementation: {
      owner: definition.owner,
      ...(execute ? { execute } : {}),
    },
  };
}

export const STRATEGIC_SUPPLEMENTAL_TASK_IDS = definitions.map((definition) =>
  taskIdSchema.parse(definition.id),
);

export function createStrategicSupplementalTaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): readonly TaskRegistration[] {
  return definitions.map((definition) => registration(definition, implementations));
}

export const strategicSupplementalWorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "strategic-reinvention.supplemental-media",
    revision: STRATEGIC_TASK_REGISTRY_VERSION,
    profileId: "strategic-reinvention",
    taskIds: STRATEGIC_SUPPLEMENTAL_TASK_IDS,
  });

export function createStrategicSupplementalTaskRegistry(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
): TaskRegistry {
  const registry = createTaskRegistry(
    createStrategicSupplementalTaskRegistrations(implementations),
  );
  registry.validateWorkflow(strategicSupplementalWorkflowDefinition);
  return registry;
}
