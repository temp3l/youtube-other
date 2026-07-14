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

export const DARK_TRUTH_TASK_REGISTRY_VERSION =
  "darktruth.task-registry.v2" as const;

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

const source = artifact("source", "darktruth.source");
const bible = artifact("story-bible", "darktruth.story-bible");
const outline = artifact("story-bible", "darktruth.story-outline");
const fullScript = artifact("full-script", "darktruth.full-script");
const localizedScript = artifact("full-script", "darktruth.localized-script");
const shortScript = artifact("short-script", "darktruth.short-script");
const shotPlan = artifact("shot-plan", "darktruth.shot-plan");
const referenceManifest = artifact(
  "reference-manifest",
  "darktruth.reference-manifest"
);
const image = artifact("image", "darktruth.scene-image");
const thumbnail = artifact("thumbnail", "darktruth.thumbnail");
const narration = artifact("narration", "darktruth.narration");
const captions = artifact("captions", "darktruth.captions");
const render = artifact("render", "darktruth.render");
const metadata = artifact("metadata", "darktruth.metadata");
const publishReport = artifact("publish-report", "darktruth.publish-report");
const quality = (schemaId: `${string}.${string}`) =>
  artifact("quality-assessment", schemaId);

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
    approvalRequired: executionKind === "irreversible",
    batchable:
      executionKind === "model-assisted" ||
      executionKind === "provider-dependent",
    provider,
    estimatedCostClass:
      executionKind === "provider-dependent"
        ? "high"
        : executionKind === "model-assisted"
          ? "medium"
          : "none",
  };
}

interface DefinitionInput {
  readonly id: `darktruth.${string}`;
  readonly name: string;
  readonly description: string;
  readonly owner: Owner;
  readonly executionKind: ExecutionKind;
  readonly dependencies?: readonly (
    | `darktruth.${string}`
    | {
        readonly id: `darktruth.${string}`;
        readonly optional: true;
      }
  )[];
  readonly inputs?: readonly ArtifactContract[];
  readonly outputs?: readonly ArtifactContract[];
}

export interface DarkTruthProfileReadinessEvidence {
  readonly bibleReady: boolean;
  readonly bibleReasons: readonly string[];
  readonly referencesReady: boolean;
  readonly referenceReasons: readonly string[];
}

const bibleEnforcedTasks = new Set([
  "darktruth.story-outline",
  "darktruth.rewrite-full",
  "darktruth.quality-structure",
  "darktruth.quality-horror",
  "darktruth.quality-repetition",
  "darktruth.quality-continuity",
  "darktruth.quality-emotional-cost",
  "darktruth.quality-supernatural-rule",
  "darktruth.quality-opening",
  "darktruth.quality-ending",
  "darktruth.story-approval",
  "darktruth.localize",
  "darktruth.quality-localization",
  "darktruth.shorts-derive",
  "darktruth.quality-shorts",
  "darktruth.shot-plan",
  "darktruth.reference-plan",
]);

const referenceEnforcedTasks = new Set([
  "darktruth.scene-images",
  "darktruth.quality-visual-continuity",
  "darktruth.thumbnail-concept",
  "darktruth.thumbnail-generate",
  "darktruth.thumbnail-validate",
  "darktruth.render",
  "darktruth.quality-audiovisual",
  "darktruth.metadata",
  "darktruth.publish-dry-run",
  "darktruth.publish-approval",
  "darktruth.publish",
]);

function registration(
  input: DefinitionInput,
  implementations: Readonly<Partial<Record<string, TaskImplementation>>>,
  profileEvidence?: DarkTruthProfileReadinessEvidence
): TaskRegistration {
  const definition = taskDefinitionSchema.parse({
    schemaVersion: TASK_SCHEMA_VERSION,
    id: input.id,
    implementationVersion: DARK_TRUTH_TASK_REGISTRY_VERSION,
    displayName: input.name,
    description: input.description,
    applicableProfiles: ["dark-truth"],
    dependencies: (input.dependencies ?? []).map((dependency) =>
      typeof dependency === "string"
        ? { taskId: dependency, optional: false }
        : { taskId: dependency.id, optional: true }
    ),
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    executionKind: input.executionKind,
    policies: policies(input.executionKind),
    cli: {
      resource: "episode",
      command: input.id.slice("darktruth.".length),
      examples: [`mediaforge episode run --task ${input.id}`],
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
    (bibleEnforcedTasks.has(input.id) || referenceEnforcedTasks.has(input.id))
      ? {
          readiness: () => [
            ...(bibleEnforcedTasks.has(input.id) && !profileEvidence.bibleReady
              ? profileEvidence.bibleReasons
              : []),
            ...(referenceEnforcedTasks.has(input.id) &&
            !profileEvidence.referencesReady
              ? profileEvidence.referenceReasons
              : []),
          ],
        }
      : {}),
  };
}

const definitions: readonly DefinitionInput[] = [
  {
    id: "darktruth.concept-select",
    name: "Select concept",
    description: "Select a distinctive premise and production concept.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    inputs: [source],
    outputs: [bible],
  },
  {
    id: "darktruth.episode-bible",
    name: "Build episode bible",
    description: "Create the revision-bound episode bible.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.concept-select"],
    inputs: [bible],
    outputs: [bible],
  },
  {
    id: "darktruth.story-outline",
    name: "Build story outline",
    description: "Create the causal story outline and escalation ladder.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.episode-bible"],
    inputs: [bible],
    outputs: [outline],
  },
  {
    id: "darktruth.rewrite-full",
    name: "Rewrite canonical English story",
    description: "Produce the canonical English full story.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.story-outline"],
    inputs: [outline],
    outputs: [fullScript],
  },
  {
    id: "darktruth.quality-structure",
    name: "Validate story structure",
    description: "Validate structural and causal story requirements.",
    owner: "@mediaforge/story-localization",
    executionKind: "deterministic",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-structure")],
  },
  {
    id: "darktruth.quality-horror",
    name: "Assess horror quality",
    description: "Assess Dark Truth tension and narrative quality.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-horror")],
  },
  {
    id: "darktruth.quality-repetition",
    name: "Check repetition and cliches",
    description: "Reject template repetition and forbidden cliches.",
    owner: "@mediaforge/story-localization",
    executionKind: "deterministic",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-repetition")],
  },
  {
    id: "darktruth.quality-continuity",
    name: "Check bible continuity",
    description: "Validate story facts against the exact bible revision.",
    owner: "@mediaforge/story-localization",
    executionKind: "deterministic",
    dependencies: ["darktruth.rewrite-full", "darktruth.episode-bible"],
    inputs: [fullScript, bible],
    outputs: [quality("darktruth.quality-continuity")],
  },
  {
    id: "darktruth.quality-emotional-cost",
    name: "Check emotional cost",
    description: "Validate the protagonist choice and emotional cost.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-emotional-cost")],
  },
  {
    id: "darktruth.quality-supernatural-rule",
    name: "Check supernatural rule",
    description: "Validate rule clarity and consistent consequences.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-supernatural-rule")],
  },
  {
    id: "darktruth.quality-opening",
    name: "Check opening",
    description: "Validate hook and first-twenty-second visual potential.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-opening")],
  },
  {
    id: "darktruth.quality-ending",
    name: "Check ending",
    description: "Validate the reveal, final image, and final line.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.rewrite-full"],
    inputs: [fullScript],
    outputs: [quality("darktruth.quality-ending")],
  },
  {
    id: "darktruth.story-approval",
    name: "Approve story",
    description:
      "Record attributable approval of the exact story and quality evidence.",
    owner: "@mediaforge/dark-truth",
    executionKind: "manual-approval",
    dependencies: [
      "darktruth.quality-structure",
      "darktruth.quality-horror",
      "darktruth.quality-repetition",
      "darktruth.quality-continuity",
      "darktruth.quality-emotional-cost",
      "darktruth.quality-supernatural-rule",
      "darktruth.quality-opening",
      "darktruth.quality-ending",
    ],
  },
  {
    id: "darktruth.localize",
    name: "Localize story",
    description: "Produce locale-specific full scripts from canonical facts.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: ["darktruth.story-approval"],
    inputs: [fullScript],
    outputs: [localizedScript],
  },
  {
    id: "darktruth.quality-localization",
    name: "Validate localization",
    description:
      "Validate fidelity, language, pronunciation, and retained facts.",
    owner: "@mediaforge/story-localization",
    executionKind: "deterministic",
    dependencies: ["darktruth.localize"],
    inputs: [localizedScript],
    outputs: [quality("darktruth.quality-localization")],
  },
  {
    id: "darktruth.shorts-derive",
    name: "Derive Short",
    description: "Derive a Short without changing canonical facts.",
    owner: "@mediaforge/story-localization",
    executionKind: "model-assisted",
    dependencies: [
      { id: "darktruth.quality-localization", optional: true },
      "darktruth.story-approval",
    ],
    inputs: [fullScript],
    outputs: [shortScript],
  },
  {
    id: "darktruth.quality-shorts",
    name: "Validate Short retention",
    description: "Validate Short structure, factual fidelity, and retention.",
    owner: "@mediaforge/story-localization",
    executionKind: "deterministic",
    dependencies: ["darktruth.shorts-derive"],
    inputs: [shortScript],
    outputs: [quality("darktruth.quality-shorts")],
  },
  {
    id: "darktruth.shot-plan",
    name: "Plan shots",
    description: "Create full and Short shot plans.",
    owner: "@mediaforge/visual-planning",
    executionKind: "deterministic",
    dependencies: [
      "darktruth.story-approval",
      { id: "darktruth.quality-shorts", optional: true },
    ],
    outputs: [shotPlan],
  },
  {
    id: "darktruth.reference-plan",
    name: "Plan references",
    description: "Declare reference coverage from bible and shot requirements.",
    owner: "@mediaforge/visual-planning",
    executionKind: "deterministic",
    dependencies: ["darktruth.shot-plan", "darktruth.episode-bible"],
    inputs: [shotPlan, bible],
    outputs: [referenceManifest],
  },
  {
    id: "darktruth.reference-prepare",
    name: "Prepare references",
    description:
      "Generate or import reference images through the selected strategy.",
    owner: "@mediaforge/image-generation",
    executionKind: "provider-dependent",
    dependencies: ["darktruth.reference-plan"],
    inputs: [referenceManifest],
    outputs: [referenceManifest],
  },
  {
    id: "darktruth.reference-validate",
    name: "Validate references",
    description:
      "Validate reference integrity, coverage, and bible consistency.",
    owner: "@mediaforge/image-generation",
    executionKind: "deterministic",
    dependencies: ["darktruth.reference-prepare"],
    inputs: [referenceManifest],
    outputs: [quality("darktruth.quality-references")],
  },
  {
    id: "darktruth.reference-approval",
    name: "Approve references",
    description: "Approve the exact validated reference set revision.",
    owner: "@mediaforge/dark-truth",
    executionKind: "manual-approval",
    dependencies: ["darktruth.reference-validate"],
  },
  {
    id: "darktruth.scene-images",
    name: "Generate scene images",
    description: "Generate scene images bound to approved references.",
    owner: "@mediaforge/image-generation",
    executionKind: "provider-dependent",
    dependencies: ["darktruth.reference-approval", "darktruth.shot-plan"],
    inputs: [shotPlan, referenceManifest],
    outputs: [image],
  },
  {
    id: "darktruth.quality-visual-continuity",
    name: "Validate visual continuity",
    description: "Validate scene identity and visual continuity.",
    owner: "@mediaforge/visual-planning",
    executionKind: "deterministic",
    dependencies: ["darktruth.scene-images"],
    inputs: [image],
    outputs: [quality("darktruth.quality-visual-continuity")],
  },
  {
    id: "darktruth.thumbnail-concept",
    name: "Plan thumbnail",
    description: "Plan a policy-compliant thumbnail concept.",
    owner: "@mediaforge/visual-planning",
    executionKind: "model-assisted",
    dependencies: ["darktruth.story-approval", "darktruth.reference-approval"],
    outputs: [thumbnail],
  },
  {
    id: "darktruth.thumbnail-generate",
    name: "Generate thumbnail",
    description:
      "Generate the thumbnail from its approved concept and references.",
    owner: "@mediaforge/image-generation",
    executionKind: "provider-dependent",
    dependencies: ["darktruth.thumbnail-concept"],
    inputs: [thumbnail],
    outputs: [thumbnail],
  },
  {
    id: "darktruth.thumbnail-validate",
    name: "Validate thumbnail",
    description: "Validate thumbnail safety, composition, text, and identity.",
    owner: "@mediaforge/image-generation",
    executionKind: "deterministic",
    dependencies: ["darktruth.thumbnail-generate"],
    inputs: [thumbnail],
    outputs: [quality("darktruth.quality-thumbnail")],
  },
  {
    id: "darktruth.narration-instructions",
    name: "Build narration instructions",
    description: "Build locale-aware delivery and pronunciation instructions.",
    owner: "@mediaforge/speech",
    executionKind: "deterministic",
    dependencies: [
      "darktruth.quality-localization",
      { id: "darktruth.quality-shorts", optional: true },
    ],
    outputs: [narration],
  },
  {
    id: "darktruth.audio-generate",
    name: "Generate audio",
    description:
      "Generate narration audio from validated scripts and instructions.",
    owner: "@mediaforge/speech",
    executionKind: "provider-dependent",
    dependencies: ["darktruth.narration-instructions"],
    inputs: [narration],
    outputs: [narration],
  },
  {
    id: "darktruth.audio-validate",
    name: "Validate audio",
    description:
      "Validate narration streams, duration, pronunciation, and continuity.",
    owner: "@mediaforge/speech",
    executionKind: "deterministic",
    dependencies: ["darktruth.audio-generate"],
    inputs: [narration],
    outputs: [quality("darktruth.quality-audio")],
  },
  {
    id: "darktruth.captions",
    name: "Build captions",
    description: "Build synchronized accessible captions.",
    owner: "@mediaforge/alignment",
    executionKind: "deterministic",
    dependencies: ["darktruth.audio-validate"],
    inputs: [narration],
    outputs: [captions],
  },
  {
    id: "darktruth.render",
    name: "Render video",
    description: "Render the selected locale and variant.",
    owner: "@mediaforge/rendering",
    executionKind: "deterministic",
    dependencies: [
      "darktruth.quality-visual-continuity",
      "darktruth.audio-validate",
      "darktruth.captions",
    ],
    inputs: [image, narration, captions],
    outputs: [render],
  },
  {
    id: "darktruth.quality-audiovisual",
    name: "Validate audiovisual output",
    description: "Validate streams, timing, continuity, and policy readiness.",
    owner: "@mediaforge/rendering",
    executionKind: "deterministic",
    dependencies: ["darktruth.render"],
    inputs: [render],
    outputs: [quality("darktruth.quality-audiovisual")],
  },
  {
    id: "darktruth.metadata",
    name: "Generate metadata",
    description:
      "Generate locale and variant metadata from approved artifacts.",
    owner: "@mediaforge/metadata",
    executionKind: "model-assisted",
    dependencies: [
      "darktruth.story-approval",
      "darktruth.quality-audiovisual",
      "darktruth.thumbnail-validate",
    ],
    outputs: [metadata],
  },
  {
    id: "darktruth.publish-dry-run",
    name: "Plan publishing",
    description: "Produce a side-effect-free publish plan.",
    owner: "@mediaforge/youtube-upload",
    executionKind: "deterministic",
    dependencies: [
      "darktruth.metadata",
      "darktruth.quality-audiovisual",
      "darktruth.thumbnail-validate",
    ],
    inputs: [metadata, render, thumbnail],
    outputs: [publishReport],
  },
  {
    id: "darktruth.publish-approval",
    name: "Approve publishing",
    description:
      "Approve the exact channel, artifacts, metadata, and dry-run evidence.",
    owner: "@mediaforge/dark-truth",
    executionKind: "manual-approval",
    dependencies: ["darktruth.publish-dry-run"],
  },
  {
    id: "darktruth.publish",
    name: "Publish episode",
    description: "Perform the irreversible approved publication.",
    owner: "@mediaforge/youtube-upload",
    executionKind: "irreversible",
    dependencies: ["darktruth.publish-approval"],
    inputs: [publishReport],
    outputs: [publishReport],
  },
] as const;

export const DARK_TRUTH_TASK_IDS = definitions.map((definition) =>
  taskIdSchema.parse(definition.id)
) satisfies readonly TaskId[];

export function createDarkTruthTaskRegistrations(
  implementations: Readonly<Partial<Record<string, TaskImplementation>>> = {},
  profileEvidence?: DarkTruthProfileReadinessEvidence
): readonly TaskRegistration[] {
  return definitions.map((definition) =>
    registration(definition, implementations, profileEvidence)
  );
}

export const darkTruthWorkflowDefinition: WorkflowDefinition =
  workflowDefinitionSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "darktruth.production",
    revision: DARK_TRUTH_TASK_REGISTRY_VERSION,
    profileId: "dark-truth",
    taskIds: DARK_TRUTH_TASK_IDS,
  });

export function createDarkTruthTaskRegistry(): TaskRegistry {
  const registry = createTaskRegistry(createDarkTruthTaskRegistrations());
  registry.validateWorkflow(darkTruthWorkflowDefinition);
  return registry;
}
