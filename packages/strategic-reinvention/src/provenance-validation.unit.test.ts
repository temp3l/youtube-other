import { describe, expect, it } from "vitest";
import {
  approvalRecordSchema,
  contentSourceManifestSchema,
  episodeBlueprintSchema,
} from "@mediaforge/domain";
import {
  hashCanonicalSourceBytes,
  hashEvidenceSpan,
  validateAdaptationProvenance,
} from "./provenance-validation.js";

const text = "Evidence with a quoted claim.";
const bytes = new TextEncoder().encode(text);
const manifest = contentSourceManifestSchema.parse({
  schemaVersion: "1.1",
  sourceId: "source-001",
  title: "Source",
  owner: "Creator",
  sourceType: "creator-written-note",
  provenance: { kind: "file", location: "note", originalLanguage: "it" },
  accessLevel: "public",
  rights: {
    status: "creator-owned",
    allowedUses: ["adapt", "short-quote"],
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
  approvedAt: "2026-01-01T01:00:00.000Z",
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
  thesis: "A sufficiently detailed source-led thesis.",
  beats: ["hook", "situation", "story", "reframe", "framework", "cta"].map(
    (type, index) => ({
      beatId: `beat-00${index + 1}`,
      type,
      purpose: "purpose",
      sourceIds: ["source-001"],
    })
  ),
  cta: { kind: "none", destination: "", campaignId: "" },
  requiredApprovalGates: ["source", "canonical-script"],
});
const span = {
  spanId: "span-001",
  sourceId: "source-001",
  byteStart: 0,
  byteEnd: bytes.byteLength,
};
const record = (input: {
  id: string;
  outputHash?: string;
  decision?: "approved" | "rejected" | "revoked";
  actor?: string;
  highRisk?: boolean;
  supersedesApprovalId?: string;
  workflowRevision?: string;
  createdAt?: string;
}) =>
  approvalRecordSchema.parse({
    schemaVersion: "mediaforge.approval.v1",
    id: input.id,
    workflowInstanceId: "workflow-001",
    taskId: "strategic.source-evidence",
    profileId: "strategic-reinvention",
    unitId: "episode-001",
    locale: "it",
    variant: "full",
    decision: input.decision ?? "approved",
    actor: input.actor ?? "rights-one",
    reason: "Exact span evidence reviewed",
    boundRevision: input.workflowRevision ?? "workflow-v1",
    artifactHashes: [input.outputHash ?? hashEvidenceSpan(bytes)],
    createdAt: input.createdAt ?? "2026-07-01T00:00:00.000Z",
    scope: {
      gate: "source",
      locale: "it",
      variant: "full",
      inputArtifactHashes: [manifest.sourceHash],
      outputArtifactHashes: [input.outputHash ?? hashEvidenceSpan(bytes)],
      highRisk: input.highRisk ?? false,
    },
    ...(input.supersedesApprovalId
      ? { supersedesApprovalId: input.supersedesApprovalId }
      : {}),
  });
const approved = record({ id: "approval-evidence-001" });
const context = (ledger: readonly unknown[] = [approved]) => ({
  ledger,
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
});
const validate = (
  overrides: Partial<Parameters<typeof validateAdaptationProvenance>[0]> = {}
) =>
  validateAdaptationProvenance({
    manifests: [manifest],
    sourceBytes: { "source-001": bytes },
    blueprint,
    evidenceSpans: [span],
    evidenceApprovals: context(),
    now: new Date("2026-08-01T00:00:00.000Z"),
    candidate: {
      revision: "script-v1",
      lines: [
        {
          lineId: "line-001",
          beatId: "beat-001",
          text,
          evidenceSpanIds: ["span-001"],
          kind: "quote",
        },
      ],
      unsupportedInferenceIds: [],
      invented: [],
    },
    ...overrides,
  });

describe("validateAdaptationProvenance", () => {
  it("makes quotes, first-person, and claims valid only with current exact evidence cohorts", () => {
    expect(validate().issues).toEqual([]);
    const claimCandidate = {
      revision: "script-v1",
      lines: [
        {
          lineId: "line-001",
          beatId: "beat-001",
          text,
          evidenceSpanIds: ["span-001"],
          kind: "claim" as const,
          claimId: "claim-001",
        },
      ],
      unsupportedInferenceIds: [],
      invented: [],
    };
    expect(validate({ candidate: claimCandidate }).claims).toEqual([
      {
        claimId: "claim-001",
        lineId: "line-001",
        evidenceSpanIds: ["span-001"],
        certain: true,
      },
    ]);
    const rejected = record({
      id: "approval-evidence-reject",
      decision: "rejected",
      actor: "rights-two",
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    const invalid = validate({
      candidate: claimCandidate,
      evidenceApprovals: context([approved, rejected]),
    });
    expect(invalid.issues.map((item) => item.code)).toContain(
      "CLAIM_UNCERTAIN"
    );
    expect(invalid.claims).toEqual([]);
    const revoked = record({
      id: "approval-evidence-revoke",
      decision: "revoked",
      actor: "rights-two",
      supersedesApprovalId: approved.id,
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    expect(
      validate({ evidenceApprovals: context([approved, revoked]) }).issues.map(
        (item) => item.code
      )
    ).toContain("QUOTE_NOT_APPROVED");
  });

  it("enforces high-risk distinct actors and exact workflow revision", () => {
    const first = record({ id: "approval-risk-001", highRisk: true });
    const second = record({
      id: "approval-risk-002",
      highRisk: true,
      actor: "rights-two",
      createdAt: "2026-07-02T00:00:00.000Z",
    });
    expect(
      validate({ evidenceApprovals: context([first]) }).issues.map(
        (item) => item.code
      )
    ).toContain("QUOTE_NOT_APPROVED");
    expect(
      validate({ evidenceApprovals: context([first, second]) }).issues
    ).toEqual([]);
    expect(
      validate({
        evidenceApprovals: {
          ...context([first, second]),
          identity: { ...context().identity, workflowRevision: "workflow-v2" },
        },
      }).issues.map((item) => item.code)
    ).toContain("QUOTE_NOT_APPROVED");
  });

  it("runtime-rejects malformed, duplicate, overlapping, split-word, and repeated spans", () => {
    expect(
      validate({ evidenceSpans: [{ ...span, byteStart: -1 }] }).issues.map(
        (item) => item.code
      )
    ).toContain("EVIDENCE_SPAN_INVALID");
    expect(
      validate({
        evidenceSpans: [span, { ...span, spanId: "span-002", byteStart: 9 }],
      }).issues.map((item) => item.code)
    ).toContain("EVIDENCE_SPAN_INVALID");
    expect(
      validate({
        evidenceSpans: [{ ...span, byteStart: 1, byteEnd: 8 }],
      }).issues.map((item) => item.code)
    ).toContain("EVIDENCE_SPAN_INVALID");
    expect(
      validate({ evidenceSpans: [span, { ...span }] }).issues.map(
        (item) => item.code
      )
    ).toContain("EVIDENCE_SPAN_INVALID");
    expect(() =>
      validate({
        candidate: {
          revision: "script-v1",
          lines: [
            {
              lineId: "line-001",
              beatId: "beat-001",
              text: `${text} ${text}`,
              evidenceSpanIds: ["span-001", "span-001"],
              kind: "adaptation",
            },
          ],
          unsupportedInferenceIds: [],
          invented: [],
        },
      })
    ).toThrow();
  });

  it("allows whole-span reordering across lines but rejects multi-span recombination", () => {
    const spans = [
      {
        spanId: "span-evidence",
        sourceId: "source-001",
        byteStart: 0,
        byteEnd: 8,
      },
      {
        spanId: "span-quoted",
        sourceId: "source-001",
        byteStart: 16,
        byteEnd: 22,
      },
    ];
    const reorderedLines = validate({
      evidenceSpans: spans,
      evidenceApprovals: context([]),
      candidate: {
        revision: "script-v1",
        lines: [
          {
            lineId: "line-001",
            beatId: "beat-001",
            text: "quoted",
            evidenceSpanIds: ["span-quoted"],
            kind: "adaptation",
          },
          {
            lineId: "line-002",
            beatId: "beat-002",
            text: "Evidence",
            evidenceSpanIds: ["span-evidence"],
            kind: "adaptation",
          },
        ],
        unsupportedInferenceIds: [],
        invented: [],
      },
    });
    expect(reorderedLines.issues).toEqual([]);
    expect(() =>
      validate({
        candidate: {
          revision: "script-v1",
          lines: [
            {
              lineId: "line-001",
              beatId: "beat-001",
              text: "Evidence quoted",
              evidenceSpanIds: ["span-evidence", "span-quoted"],
              kind: "adaptation",
            },
          ],
          unsupportedInferenceIds: [],
          invented: [],
        },
        evidenceSpans: spans,
      })
    ).toThrow();
  });

  it("rejects a negation or modality change inside a source line", () => {
    const negated = "I do not recommend";
    const negatedBytes = new TextEncoder().encode(negated);
    const report = validate({
      manifests: [
        { ...manifest, sourceHash: hashCanonicalSourceBytes(negatedBytes) },
      ],
      sourceBytes: { "source-001": negatedBytes },
      evidenceSpans: [
        {
          spanId: "span-negated",
          sourceId: "source-001",
          byteStart: 0,
          byteEnd: negatedBytes.byteLength,
        },
      ],
      evidenceApprovals: context([]),
      candidate: {
        revision: "script-v1",
        lines: [
          {
            lineId: "line-001",
            beatId: "beat-001",
            text: "I do recommend",
            evidenceSpanIds: ["span-negated"],
            kind: "adaptation",
          },
        ],
        unsupportedInferenceIds: [],
        invented: [],
      },
    });
    expect(report.issues.map((item) => item.code)).toContain(
      "LINE_NOT_DERIVED_FROM_SOURCE"
    );
  });
});
