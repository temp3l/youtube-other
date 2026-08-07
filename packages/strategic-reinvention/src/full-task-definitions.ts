import type { ArtifactContract, ArtifactKind, TaskDefinition } from "@mediaforge/domain";

export const STRATEGIC_FULL_TASK_REGISTRY_VERSION =
  "strategic-reinvention.full-task-registry.v1" as const;

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

export const strategicArtifacts = {
  sourceManifest: artifact("source-manifest", "strategic.source-manifest"),
  blueprint: artifact("composition-plan", "strategic.blueprint"),
  adaptation: artifact("provenance-report", "strategic.adaptation"),
  canonicalScript: artifact("narration", "strategic.canonical-script"),
  shortScript: artifact("narration", "strategic.short-script"),
  localizedScripts: artifact("narration", "strategic.localized-scripts"),
  localeMedia: artifact("audio-track-manifest", "strategic.locale-media"),
  supplementalInventory: artifact("source-manifest", "strategic.supplemental-inventory"),
  mediaPlan: artifact("composition-plan", "veronica.media-plan"),
  renderManifest: artifact("render", "veronica.render-manifest"),
  approvalPack: artifact("provenance-report", "veronica.approval-pack"),
  renderEvidence: artifact("render", "strategic.render-evidence"),
  multilingualPackage: artifact("multilingual-package", "strategic.multilingual-package"),
  publishDryRun: artifact("provenance-report", "strategic.publish-dry-run"),
} as const;

type ExecutionKind = TaskDefinition["executionKind"];

export interface StrategicFullTaskDefinition {
  readonly id: `strategic.${string}`;
  readonly name: string;
  readonly description: string;
  readonly owner: string;
  readonly executionKind: ExecutionKind;
  readonly dependencies: readonly `strategic.${string}`[];
  readonly inputs?: readonly ArtifactContract[];
  readonly outputs?: readonly ArtifactContract[];
  readonly approvalGate?: "source" | "canonical-script" | "localization" | "voice" | "metadata" | "render-qa" | "publish";
  readonly highRisk?: boolean;
}

export const STRATEGIC_FULL_TASK_DEFINITIONS = [
  {
    id: "strategic.source-ingest",
    name: "Ingest source manifests",
    description: "Load and fingerprint approved source manifests for the episode blueprint.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: [],
    outputs: [strategicArtifacts.sourceManifest, strategicArtifacts.blueprint],
  },
  {
    id: "strategic.source-policy",
    name: "Evaluate source policy",
    description: "Enforce rights, locale, and sensitivity policy on ingested sources.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.source-ingest"],
    inputs: [strategicArtifacts.sourceManifest, strategicArtifacts.blueprint],
    outputs: [strategicArtifacts.sourceManifest],
  },
  {
    id: "strategic.source-approval",
    name: "Approve sources",
    description: "Manual approval gate for source rights and sensitivity.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.source-policy"],
    inputs: [strategicArtifacts.sourceManifest],
    outputs: [strategicArtifacts.sourceManifest],
    approvalGate: "source",
  },
  {
    id: "strategic.adaptation",
    name: "Create source-led adaptation",
    description: "Generate a candidate canonical script with provenance bindings.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.source-approval"],
    inputs: [strategicArtifacts.sourceManifest, strategicArtifacts.blueprint],
    outputs: [strategicArtifacts.adaptation, strategicArtifacts.canonicalScript],
  },
  {
    id: "strategic.canonical-script-approval",
    name: "Approve canonical script",
    description: "Manual approval gate for the Italian canonical script.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.adaptation"],
    inputs: [strategicArtifacts.canonicalScript, strategicArtifacts.adaptation],
    outputs: [strategicArtifacts.canonicalScript],
    approvalGate: "canonical-script",
  },
  {
    id: "strategic.short-extract",
    name: "Extract Italian Short",
    description: "Derive the Italian Short script from the approved canonical script.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.canonical-script-approval"],
    inputs: [strategicArtifacts.canonicalScript],
    outputs: [strategicArtifacts.shortScript],
  },
  {
    id: "strategic.localization",
    name: "Localize scripts",
    description: "Materialize English and Spanish localization scripts.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.short-extract", "strategic.canonical-script-approval"],
    inputs: [strategicArtifacts.canonicalScript, strategicArtifacts.shortScript],
    outputs: [strategicArtifacts.localizedScripts],
  },
  {
    id: "strategic.localization-approval",
    name: "Approve localizations",
    description: "Manual approval gate for localized scripts.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.localization"],
    inputs: [strategicArtifacts.localizedScripts],
    outputs: [strategicArtifacts.localizedScripts],
    approvalGate: "localization",
  },
  {
    id: "strategic.locale-media",
    name: "Prepare locale media",
    description: "Write supplied-audio, captions, and metadata fixtures for each locale.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.localization-approval", "strategic.canonical-script-approval"],
    inputs: [strategicArtifacts.localizedScripts, strategicArtifacts.canonicalScript],
    outputs: [strategicArtifacts.localeMedia],
  },
  {
    id: "strategic.voice-metadata-approval",
    name: "Approve voice and metadata",
    description: "Manual approval gate for voice, captions, and metadata packages.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.locale-media"],
    inputs: [strategicArtifacts.localeMedia],
    outputs: [strategicArtifacts.localeMedia],
    approvalGate: "voice",
  },
  {
    id: "strategic.supplemental-ingest",
    name: "Ingest supplemental media",
    description: "Validate and inventory creator-supplied supplemental media.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.voice-metadata-approval"],
    inputs: [strategicArtifacts.canonicalScript],
    outputs: [strategicArtifacts.supplementalInventory],
  },
  {
    id: "strategic.supplemental-plan",
    name: "Plan supplemental media",
    description: "Generate a versioned Veronica semantic media plan.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-ingest"],
    inputs: [strategicArtifacts.canonicalScript, strategicArtifacts.supplementalInventory],
    outputs: [strategicArtifacts.mediaPlan],
  },
  {
    id: "strategic.supplemental-prepare",
    name: "Prepare supplemental assets",
    description: "Materialize landscape and portrait prepared assets.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-plan"],
    inputs: [strategicArtifacts.mediaPlan],
    outputs: [strategicArtifacts.renderManifest],
  },
  {
    id: "strategic.supplemental-approval-pack",
    name: "Export supplemental approval pack",
    description: "Emit a redacted approval pack for editorial review.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-prepare"],
    inputs: [strategicArtifacts.mediaPlan, strategicArtifacts.renderManifest],
    outputs: [strategicArtifacts.approvalPack],
  },
  {
    id: "strategic.supplemental-review",
    name: "Approve supplemental media plan",
    description: "Manual approval gate for supplemental media eligibility.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.supplemental-approval-pack"],
    inputs: [strategicArtifacts.approvalPack, strategicArtifacts.mediaPlan],
    outputs: [strategicArtifacts.approvalPack],
    approvalGate: "render-qa",
  },
  {
    id: "strategic.render",
    name: "Compile render evidence",
    description: "Compile landscape and portrait FFmpeg manifests for both aspect ratios.",
    owner: "@mediaforge/veronica-media",
    executionKind: "deterministic",
    dependencies: ["strategic.supplemental-review"],
    inputs: [strategicArtifacts.mediaPlan, strategicArtifacts.renderManifest],
    outputs: [strategicArtifacts.renderEvidence],
  },
  {
    id: "strategic.render-qa",
    name: "Approve render evidence",
    description: "Manual approval gate before publication packaging.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.render"],
    inputs: [strategicArtifacts.renderEvidence],
    outputs: [strategicArtifacts.renderEvidence],
    approvalGate: "render-qa",
  },
  {
    id: "strategic.multilingual-package",
    name: "Build multilingual package",
    description: "Assemble the auditable multilingual publication package.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.render-qa", "strategic.locale-media"],
    inputs: [strategicArtifacts.localeMedia, strategicArtifacts.renderEvidence],
    outputs: [strategicArtifacts.multilingualPackage],
  },
  {
    id: "strategic.publish-dry-run",
    name: "Evaluate publish dry-run",
    description: "Evaluate publication blockers without provider mutations.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "deterministic",
    dependencies: ["strategic.multilingual-package"],
    inputs: [strategicArtifacts.multilingualPackage],
    outputs: [strategicArtifacts.publishDryRun],
  },
  {
    id: "strategic.publish-approval",
    name: "Approve publication",
    description: "Manual high-risk publication approval gate.",
    owner: "@mediaforge/strategic-reinvention",
    executionKind: "manual-approval",
    dependencies: ["strategic.publish-dry-run", "strategic.multilingual-package"],
    inputs: [strategicArtifacts.publishDryRun, strategicArtifacts.multilingualPackage],
    outputs: [strategicArtifacts.publishDryRun],
    approvalGate: "publish",
    highRisk: true,
  },
] as const satisfies readonly StrategicFullTaskDefinition[];

export type StrategicFullTaskId = (typeof STRATEGIC_FULL_TASK_DEFINITIONS)[number]["id"];
