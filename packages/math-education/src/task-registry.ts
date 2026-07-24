import {
  TASK_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  taskDefinitionSchema,
  taskIdSchema,
  workflowDefinitionSchema,
  type ArtifactContract,
  type ArtifactKind,
  type TaskDefinition,
  type TaskId,
  type WorkflowDefinition,
} from "@mediaforge/domain";
import {
  createTaskRegistry,
  type TaskImplementation,
  type TaskRegistration,
  type TaskRegistry,
} from "@mediaforge/workflow-engine";
import { MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION } from "./localization/localization.js";

export const MATH_TASK_REGISTRY_VERSION = "math.task-registry.v3" as const;

type ExecutionKind = TaskDefinition["executionKind"];
type Owner = `@mediaforge/${string}`;

const artifact = (
  kind: ArtifactKind,
  schemaId: `${string}.${string}`,
  required = true
): ArtifactContract => ({
  kind,
  required,
  schemaId: schemaId as ArtifactContract["schemaId"],
  schemaVersion: "1.0.0",
});

const curriculum = artifact("curriculum", "math.curriculum-release");
const prerequisiteGraph = artifact("curriculum", "math.prerequisite-graph");
const lessonSpecification = artifact(
  "lesson-specification",
  "math.lesson-specification"
);
const verification = artifact("math-verification", "math.verification");
const narration = artifact("narration", "math.narration");
const scenePlan = artifact("scene-plan", "math.scene-timing");
const localizedNarration = artifact("narration", "math.localized-narration");
const visualStyle = artifact(
  "educational-visual-style",
  "math.educational-visual-style"
);
const visualAssets = artifact("image", "math.educational-visual-assets");
const timedNarration = artifact("narration", "math.timed-narration");
const render = artifact("render", "math.render");
const metadata = artifact("metadata", "math.metadata");
const quality = artifact("quality-assessment", "math.quality-assessment");
const publishReport = artifact("publish-report", "math.publish-report");

function policies(executionKind: ExecutionKind): TaskDefinition["policies"] {
  const provider =
    executionKind === "provider-dependent"
      ? "required"
      : executionKind === "model-assisted"
        ? "optional"
        : "none";
  return {
    cache:
      executionKind === "manual-approval" || executionKind === "irreversible"
        ? "disabled"
        : "fingerprint",
    retryLimit: provider === "none" ? 0 : 3,
    timeoutMs: provider === "none" ? 60_000 : 900_000,
    lockScope: executionKind === "manual-approval" ? "unit" : "task",
    approvalRequired:
      executionKind === "manual-approval" || executionKind === "irreversible",
    batchable:
      executionKind === "model-assisted" ||
      executionKind === "provider-dependent",
    provider,
    estimatedCostClass:
      executionKind === "provider-dependent"
        ? "medium"
        : executionKind === "model-assisted"
          ? "low"
          : "none",
  };
}

interface DefinitionInput {
  readonly id: `math.${string}`;
  readonly name: string;
  readonly description: string;
  readonly owner: Owner;
  readonly executionKind: ExecutionKind;
  readonly implementationVersion?: string;
  readonly dependencies?: readonly `math.${string}`[];
  readonly inputs?: readonly ArtifactContract[];
  readonly outputs?: readonly ArtifactContract[];
}

export interface MathProfileReadinessEvidence {
  readonly profileReady: boolean;
  readonly profileReasons: readonly string[];
  readonly curriculumReady: boolean;
  readonly curriculumReasons: readonly string[];
  readonly visualStyleReady: boolean;
  readonly visualStyleReasons: readonly string[];
  readonly deterministicVerificationSupported: boolean;
  readonly verificationReasons: readonly string[];
  readonly providerTasksAuthorized: boolean;
  readonly providerReasons: readonly string[];
}

const profileEnforcedTasks = new Set([
  "math.lesson-spec",
  "math.math-verification",
  "math.canonical-narration",
  "math.scene-timing",
  "math.localization",
  "math.visual-style",
  "math.visual-assets",
  "math.tts",
  "math.timing-reflow",
  "math.render",
  "math.quality-gate",
  "math.metadata-playlists",
  "math.publish-dry-run",
  "math.publish-approval",
  "math.publish",
]);
const curriculumEnforcedTasks = new Set([
  "math.prerequisite-graph",
  ...profileEnforcedTasks,
]);
const visualStyleEnforcedTasks = new Set([
  "math.visual-assets",
  "math.render",
  "math.quality-gate",
  "math.metadata-playlists",
  "math.publish-dry-run",
  "math.publish-approval",
  "math.publish",
]);
const verificationEnforcedTasks = new Set([
  "math.math-verification",
  "math.canonical-narration",
  "math.scene-timing",
  "math.localization",
  "math.visual-assets",
  "math.tts",
  "math.timing-reflow",
  "math.render",
  "math.quality-gate",
  "math.metadata-playlists",
  "math.publish-dry-run",
  "math.publish-approval",
  "math.publish",
]);
const providerEnforcedTasks = new Set(["math.tts"]);

function registration(
  input: DefinitionInput,
  implementations: Readonly<Partial<Record<string, TaskImplementation>>>,
  profileEvidence?: MathProfileReadinessEvidence
): TaskRegistration {
  const definition = taskDefinitionSchema.parse({
    schemaVersion: TASK_SCHEMA_VERSION,
    id: input.id,
    implementationVersion:
      input.implementationVersion ?? MATH_TASK_REGISTRY_VERSION,
    displayName: input.name,
    description: input.description,
    applicableProfiles: ["mathematics-education"],
    dependencies: (input.dependencies ?? []).map((taskId) => ({
      taskId,
      optional: false,
    })),
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    executionKind: input.executionKind,
    policies: policies(input.executionKind),
    cli: {
      resource: "lesson",
      command: input.id.slice("math.".length),
      examples: [`mediaforge lesson run --task ${input.id}`],
    },
    observability: {
      operationName: input.id,
      redactedFields: ["providerRequest", "credentials"],
    },
  });
  const execute = implementations[input.id];
  return {
    definition,
    implementation: {
      owner: input.owner,
      ...(execute ? { execute } : {}),
    },
    ...(profileEvidence &&
    (profileEnforcedTasks.has(input.id) ||
      curriculumEnforcedTasks.has(input.id) ||
      visualStyleEnforcedTasks.has(input.id) ||
      verificationEnforcedTasks.has(input.id))
      ? {
          readiness: () => [
            ...(profileEnforcedTasks.has(input.id) &&
            !profileEvidence.profileReady
              ? profileEvidence.profileReasons
              : []),
            ...(curriculumEnforcedTasks.has(input.id) &&
            !profileEvidence.curriculumReady
              ? profileEvidence.curriculumReasons
              : []),
            ...(visualStyleEnforcedTasks.has(input.id) &&
            !profileEvidence.visualStyleReady
              ? profileEvidence.visualStyleReasons
              : []),
            ...(verificationEnforcedTasks.has(input.id) &&
            !profileEvidence.deterministicVerificationSupported
              ? profileEvidence.verificationReasons
              : []),
            ...(providerEnforcedTasks.has(input.id) &&
            !profileEvidence.providerTasksAuthorized
              ? profileEvidence.providerReasons
              : []),
          ],
        }
      : {}),
  };
}

const definitions: readonly DefinitionInput[] = [
  {
    id: "math.curriculum-import",
    name: "Import curriculum",
    description:
      "Select, extract, and normalize a versioned curriculum source.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    inputs: [],
    outputs: [curriculum],
  },
  {
    id: "math.source-validation",
    name: "Validate curriculum source",
    description:
      "Validate provenance and reviewed curriculum release evidence.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.curriculum-import"],
    inputs: [curriculum],
    outputs: [curriculum],
  },
  {
    id: "math.prerequisite-graph",
    name: "Build prerequisite graph",
    description: "Select the objective and validate its prerequisite chain.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.source-validation"],
    inputs: [curriculum],
    outputs: [prerequisiteGraph],
  },
  {
    id: "math.lesson-spec",
    name: "Build lesson specification",
    description:
      "Build the objective, misconception, pedagogy, and variant contract.",
    owner: "@mediaforge/math-education",
    executionKind: "model-assisted",
    dependencies: ["math.prerequisite-graph"],
    inputs: [prerequisiteGraph],
    outputs: [lessonSpecification],
  },
  {
    id: "math.math-verification",
    name: "Verify mathematics",
    description:
      "Verify examples, worked solutions, facts, and answer keys deterministically.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.lesson-spec"],
    inputs: [lessonSpecification],
    outputs: [verification],
  },
  {
    id: "math.canonical-narration",
    name: "Build canonical explanation",
    description:
      "Build the canonical explanation and narration from verified facts.",
    owner: "@mediaforge/math-education",
    executionKind: "model-assisted",
    implementationVersion: MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION,
    dependencies: ["math.math-verification"],
    inputs: [verification],
    outputs: [narration],
  },
  {
    id: "math.scene-timing",
    name: "Plan storyboard and timing",
    description:
      "Create the storyboard, visual specification, and narration timing.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.canonical-narration"],
    inputs: [narration],
    outputs: [scenePlan],
  },
  {
    id: "math.localization",
    name: "Localize lesson",
    description:
      "Localize narration and visible labels while preserving verified facts.",
    owner: "@mediaforge/math-education",
    executionKind: "model-assisted",
    implementationVersion: MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION,
    dependencies: ["math.scene-timing"],
    outputs: [localizedNarration],
  },
  {
    id: "math.visual-style",
    name: "Validate educational visual style",
    description:
      "Validate the revision-bound visual, typography, locale-label, and accessibility policy.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.lesson-spec"],
    inputs: [lessonSpecification],
    outputs: [visualStyle],
  },
  {
    id: "math.visual-assets",
    name: "Render educational visuals",
    description: "Render fact-bound deterministic educational visual assets.",
    owner: "@mediaforge/math-rendering",
    executionKind: "deterministic",
    dependencies: [
      "math.localization",
      "math.math-verification",
      "math.visual-style",
    ],
    inputs: [verification, visualStyle],
    outputs: [visualAssets],
  },
  {
    id: "math.tts",
    name: "Generate lesson audio",
    description: "Generate accessible lesson narration audio.",
    owner: "@mediaforge/speech",
    executionKind: "provider-dependent",
    dependencies: ["math.localization"],
    inputs: [localizedNarration],
    outputs: [narration],
  },
  {
    id: "math.timing-reflow",
    name: "Reflow lesson timing",
    description:
      "Reflow scenes and captions against measured narration timing.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.tts", "math.scene-timing"],
    inputs: [narration, scenePlan],
    outputs: [timedNarration],
  },
  {
    id: "math.render",
    name: "Render lesson",
    description:
      "Render the lesson variant with synchronized educational visuals.",
    owner: "@mediaforge/educational-renderer",
    executionKind: "deterministic",
    dependencies: ["math.visual-assets", "math.timing-reflow"],
    inputs: [visualAssets, visualStyle, timedNarration],
    outputs: [render],
  },
  {
    id: "math.quality-gate",
    name: "Validate lesson quality",
    description:
      "Validate correctness, pedagogy, accessibility, and audiovisual quality.",
    owner: "@mediaforge/math-education",
    executionKind: "deterministic",
    dependencies: ["math.render", "math.math-verification"],
    inputs: [render, verification, visualStyle],
    outputs: [quality],
  },
  {
    id: "math.metadata-playlists",
    name: "Generate lesson metadata",
    description: "Generate lesson metadata and playlist placement evidence.",
    owner: "@mediaforge/metadata",
    executionKind: "deterministic",
    dependencies: ["math.quality-gate", "math.lesson-spec"],
    inputs: [render, lessonSpecification, quality],
    outputs: [metadata],
  },
  {
    id: "math.publish-dry-run",
    name: "Plan lesson publishing",
    description: "Produce side-effect-free publishing evidence.",
    owner: "@mediaforge/youtube-upload",
    executionKind: "deterministic",
    dependencies: ["math.metadata-playlists"],
    inputs: [quality, metadata, render],
    outputs: [publishReport],
  },
  {
    id: "math.publish-approval",
    name: "Approve lesson publishing",
    description:
      "Approve the exact lesson artifacts, channel, metadata, and dry-run evidence.",
    owner: "@mediaforge/math-education",
    executionKind: "manual-approval",
    dependencies: ["math.publish-dry-run"],
  },
  {
    id: "math.publish",
    name: "Publish lesson",
    description: "Perform the irreversible approved lesson publication.",
    owner: "@mediaforge/youtube-upload",
    executionKind: "irreversible",
    dependencies: ["math.publish-approval"],
    inputs: [publishReport],
    outputs: [publishReport],
  },
] as const;

export const MATH_TASK_IDS = definitions.map((definition) =>
  taskIdSchema.parse(definition.id)
) satisfies readonly TaskId[];

export function createMathTaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
  profileEvidence?: MathProfileReadinessEvidence
): readonly TaskRegistration[] {
  const knownTaskIds = new Set(definitions.map((definition) => definition.id));
  const unknownBindings = Object.keys(implementations).filter(
    (taskId) => !knownTaskIds.has(taskId as never)
  );
  if (unknownBindings.length > 0) {
    throw new Error(
      `Unknown mathematics task implementation bindings: ${unknownBindings.join(", ")}`
    );
  }
  return definitions.map((definition) =>
    registration(definition, implementations, profileEvidence)
  );
}

export const mathWorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "math.production",
    revision: MATH_TASK_REGISTRY_VERSION,
    profileId: "mathematics-education",
    taskIds: MATH_TASK_IDS,
  });

export function createMathTaskRegistry(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
  profileEvidence?: MathProfileReadinessEvidence
): TaskRegistry {
  const registry = createTaskRegistry(
    createMathTaskRegistrations(implementations, profileEvidence)
  );
  registry.validateWorkflow(mathWorkflowDefinition);
  return registry;
}
