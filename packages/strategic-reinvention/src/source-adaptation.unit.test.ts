import { describe, expect, it } from "vitest";
import {
  approvalRecordSchema,
  contentSourceManifestSchema,
  creatorProfileSchema,
  effectiveContentPolicySchema,
  episodeBlueprintSchema,
  genreDefinitionSchema,
} from "@mediaforge/domain";
import {
  applyCanonicalScriptGate,
  createSourceLedAdaptation,
} from "./source-adaptation.js";
import {
  hashCanonicalSourceBytes,
  hashEvidenceSpan,
} from "./provenance-validation.js";

const lineText = "I learned that a clear boundary protects attention.";
const sourceText = `${lineText} ${lineText}`;
const bytes = new TextEncoder().encode(sourceText);
const firstBytes = new TextEncoder().encode(lineText);
const manifest = contentSourceManifestSchema.parse({
  schemaVersion: "1.1",
  sourceId: "source-001",
  title: "Creator note",
  owner: "Creator",
  sourceType: "creator-written-note",
  provenance: { kind: "file", location: "note.md", originalLanguage: "it" },
  accessLevel: "public",
  rights: {
    status: "creator-owned",
    allowedUses: ["adapt"],
    permittedLocales: ["it"],
    commercialUse: true,
  },
  aiTransformations: {
    structure: true,
    summarize: true,
    adapt: true,
    translate: false,
    syntheticVoice: false,
    syntheticLikeness: false,
  },
  sensitivity: {
    classification: "normal",
    tags: ["none"],
    manualReviewRequired: false,
  },
  sourceHash: hashCanonicalSourceBytes(bytes),
  createdAt: "2026-01-01T00:00:00.000Z",
  approvedAt: "2026-01-02T00:00:00.000Z",
  approvedBy: "editor",
});
const blueprint = episodeBlueprintSchema.parse({
  schemaVersion: "1.1",
  episodeId: "episode-001",
  genreId: "strategic-reinvention",
  creatorProfileId: "creator-001",
  canonicalLocale: "it",
  mode: "story-to-strategy",
  sources: ["source-001"],
  contentTier: "public",
  thesis: "Clear boundaries protect attention and make decisions easier.",
  beats: ["hook", "situation", "story", "reframe", "framework", "cta"].map(
    (type, index) => ({
      beatId: `beat-00${index + 1}`,
      type,
      purpose: "Source-led adaptation",
      sourceIds: ["source-001"],
    })
  ),
  cta: { kind: "none", destination: "", campaignId: "" },
  requiredApprovalGates: [
    "source",
    "canonical-script",
    "localization",
    "voice",
    "final-render",
    "publish",
  ],
});
const genre = genreDefinitionSchema.parse({
  schemaVersion: "1.1",
  id: "strategic-reinvention",
  displayName: "Strategic",
  description: "Source led",
  version: "genre-v1",
  canonicalLocale: "it",
  episodeModes: ["story-to-strategy"],
  requiredApprovalGates: [
    "source",
    "canonical-script",
    "localization",
    "voice",
    "final-render",
    "publish",
  ],
  autoPublish: false,
});
const creator = creatorProfileSchema.parse({
  schemaVersion: "1.1",
  id: "creator-001",
  displayName: "Creator",
  genreId: "strategic-reinvention",
  status: "active",
  canonicalLocale: "it",
  supportedLocales: ["it"],
  autoPublish: false,
  syntheticNarrationEnabled: false,
  generatedLikenessEnabled: false,
});
const effectivePolicy = effectiveContentPolicySchema.parse({
  schemaVersion: "1.1",
  genreId: "strategic-reinvention",
  creatorProfileId: "creator-001",
  canonicalLocale: "it",
  supportedLocales: ["it"],
  permittedContentTiers: ["public"],
  requiredApprovalGates: [
    "source",
    "canonical-script",
    "localization",
    "voice",
    "final-render",
    "publish",
  ],
  autoPublish: false,
  syntheticNarrationEnabled: false,
  generatedLikenessEnabled: false,
});
const approval = (input: {
  id: string;
  taskId: string;
  gate: "source" | "canonical-script";
  outputHash: string;
  inputHashes?: string[];
  decision?: "approved" | "rejected" | "revoked";
  actor?: string;
  createdAt?: string;
  highRisk?: boolean;
  supersedesApprovalId?: string;
}) =>
  approvalRecordSchema.parse({
    schemaVersion: "mediaforge.approval.v1",
    id: input.id,
    workflowInstanceId: "workflow-001",
    taskId: input.taskId,
    profileId: "strategic-reinvention",
    unitId: "episode-001",
    locale: "it",
    variant: "full",
    decision: input.decision ?? "approved",
    actor: input.actor ?? "editor-one",
    reason: "Reviewed exact evidence",
    boundRevision: "workflow-v1",
    artifactHashes: [input.outputHash],
    createdAt: input.createdAt ?? "2026-07-01T00:00:00.000Z",
    scope: {
      gate: input.gate,
      locale: "it",
      variant: "full",
      inputArtifactHashes: input.inputHashes ?? [manifest.sourceHash],
      outputArtifactHashes: [input.outputHash],
      highRisk: input.highRisk ?? false,
    },
    ...(input.supersedesApprovalId
      ? { supersedesApprovalId: input.supersedesApprovalId }
      : {}),
  });
const evidenceApproval = approval({
  id: "approval-evidence-001",
  taskId: "strategic.source-evidence",
  gate: "source",
  outputHash: hashEvidenceSpan(firstBytes),
});
const evidenceApprovals = {
  ledger: [evidenceApproval],
  identity: {
    workflowInstanceId: "workflow-001",
    taskId: "strategic.source-evidence",
    unitId: "episode-001",
    profileId: "strategic-reinvention" as const,
    locale: "it" as const,
    variant: "full" as const,
    workflowRevision: "workflow-v1",
  },
  requiredDistinctActors: 1,
};
const base = () => ({
  manifests: [manifest],
  sourceBytes: { "source-001": bytes },
  evidenceSpans: [
    {
      spanId: "span-001",
      sourceId: "source-001",
      byteStart: 0,
      byteEnd: firstBytes.byteLength,
    },
  ],
  evidenceApprovals,
  candidate: {
    revision: "script-v1",
    lines: [
      {
        lineId: "line-001",
        beatId: "beat-001",
        text: lineText,
        evidenceSpanIds: ["span-001"],
        kind: "first-person" as const,
      },
    ],
    unsupportedInferenceIds: [],
    invented: [],
  },
  genre,
  creator,
  blueprint,
  effectivePolicy,
  now: new Date("2026-08-01T00:00:00.000Z"),
});

describe("createSourceLedAdaptation", () => {
  it("binds its stable fingerprint to all production inputs and evidence coordinates", () => {
    const original = createSourceLedAdaptation(base());
    expect(original.approvedForPublication).toBe(false);
    const blueprintMutation = base();
    blueprintMutation.blueprint = {
      ...blueprintMutation.blueprint,
      thesis: "A changed but still sufficiently long blueprint thesis.",
    };
    const creatorMutation = base();
    creatorMutation.creator = {
      ...creatorMutation.creator,
      displayName: "Changed Creator",
    };
    const spanMutation = base();
    spanMutation.evidenceSpans = [
      {
        ...spanMutation.evidenceSpans[0]!,
        spanId: "span-002",
        byteStart: firstBytes.byteLength + 1,
        byteEnd: bytes.byteLength,
      },
    ];
    spanMutation.candidate.lines[0]!.evidenceSpanIds = ["span-002"];
    expect(
      new Set([
        original.candidateCanonicalScript.fingerprint,
        createSourceLedAdaptation(blueprintMutation).candidateCanonicalScript
          .fingerprint,
        createSourceLedAdaptation(creatorMutation).candidateCanonicalScript
          .fingerprint,
        createSourceLedAdaptation(spanMutation).candidateCanonicalScript
          .fingerprint,
      ]).size
    ).toBe(4);
  });

  it.each([
    [
      "fabricated first person",
      (input: ReturnType<typeof base>) => {
        input.candidate.lines[0]!.text = "I invented a new memory.";
      },
      "LINE_NOT_DERIVED_FROM_SOURCE",
    ],
    [
      "fabricated label",
      (input: ReturnType<typeof base>) => {
        input.candidate.lines[0]!.text = `Lesson: ${lineText}`;
        input.candidate.lines[0]!.kind = "adaptation";
      },
      "LINE_NOT_DERIVED_FROM_SOURCE",
    ],
    [
      "mismatched creator identity",
      (input: ReturnType<typeof base>) => {
        input.effectivePolicy = {
          ...input.effectivePolicy,
          creatorProfileId: "creator-999",
        };
      },
      "IDENTITY_MISMATCH",
    ],
    [
      "invented advice",
      (input: ReturnType<typeof base>) => {
        input.candidate.invented = ["advice"];
      },
      "UNSUPPORTED_ADVICE",
    ],
  ])("fails closed for %s", (_name, mutate, reason) => {
    const input = base();
    mutate(input);
    expect(() => createSourceLedAdaptation(input)).toThrow(reason);
  });

  it("uses current exact canonical-script cohorts, workflow revision, rejection and high-risk actor count", () => {
    const candidate = createSourceLedAdaptation(base());
    const hash = candidate.candidateCanonicalScript.fingerprint;
    const first = approval({
      id: "approval-script-001",
      taskId: "strategic.canonical-script",
      gate: "canonical-script",
      outputHash: hash,
      highRisk: true,
    });
    const second = approval({
      id: "approval-script-002",
      taskId: "strategic.canonical-script",
      gate: "canonical-script",
      outputHash: hash,
      highRisk: true,
      actor: "editor-two",
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    const reject = approval({
      id: "approval-script-reject",
      taskId: "strategic.canonical-script",
      gate: "canonical-script",
      outputHash: hash,
      decision: "rejected",
      actor: "editor-three",
      createdAt: "2026-07-03T00:00:00.000Z",
    });
    const expected = {
      workflowInstanceId: "workflow-001",
      taskId: "strategic.canonical-script",
      unitId: "episode-001",
      workflowRevision: "workflow-v1",
      requiredDistinctActors: 1,
    };
    expect(
      applyCanonicalScriptGate({
        candidate,
        approvalLedger: [first],
        now: new Date("2026-08-01T00:00:00.000Z"),
        expected,
      }).canonicalScriptApproved
    ).toBe(false);
    expect(
      applyCanonicalScriptGate({
        candidate,
        approvalLedger: [first, second],
        now: new Date("2026-08-01T00:00:00.000Z"),
        expected,
      }).canonicalScriptApproved
    ).toBe(true);
    expect(
      applyCanonicalScriptGate({
        candidate,
        approvalLedger: [first, second],
        now: new Date("2026-08-01T00:00:00.000Z"),
        expected,
      })
    ).toMatchObject({
      approvedForPublication: false,
      candidateCanonicalScript: { status: "CANONICAL_SCRIPT_APPROVED" },
      remainingApprovalGates: [
        "localization",
        "voice",
        "final-render",
        "publish",
      ],
    });
    expect(
      applyCanonicalScriptGate({
        candidate,
        approvalLedger: [first, second, reject],
        now: new Date("2026-08-01T00:00:00.000Z"),
        expected,
      }).canonicalScriptApproved
    ).toBe(false);
    expect(
      applyCanonicalScriptGate({
        candidate,
        approvalLedger: [first, second],
        now: new Date("2026-08-01T00:00:00.000Z"),
        expected: { ...expected, workflowRevision: "workflow-v2" },
      }).canonicalScriptApproved
    ).toBe(false);
    expect(
      applyCanonicalScriptGate({
        candidate,
        approvalLedger: [{ malformed: true }],
        now: new Date("2026-08-01T00:00:00.000Z"),
        expected,
      }).canonicalScriptApproved
    ).toBe(false);
  });
});
