import { describe, expect, it } from "vitest";
import {
  decideHistoricalPersonLikenessInclusionV35,
  deriveHistoricalPersonLikenessPolicyV35,
  historicalPersonReferenceValidationDiagnosticsV35,
  summarizeHistoricalPersonReferenceReportV35,
} from "./history-person-likeness-v35.js";
import {
  lookupHistoricalPersonReferenceSetByLabelV35,
  lookupHistoricalPersonReferenceSetByIdV35,
} from "./history-person-reference-v35.js";

describe("historical person likeness policy", () => {
  it("requires references for face-centric archival shots of a named leader", () => {
    const policy = deriveHistoricalPersonLikenessPolicyV35({
      modality: "archival image",
      framing: "medium subject hold",
      purpose: "develop archival image on Napoleon Bonaparte",
      subject: "Napoleon Bonaparte",
      personLabel: "Napoleon Bonaparte",
      narrationText: "Napoleon reviewed the exhausted army.",
    });
    expect(policy).toBe("reference-required");
    const decision = decideHistoricalPersonLikenessInclusionV35({
      likenessPolicy: policy,
      referenceSet: lookupHistoricalPersonReferenceSetByLabelV35("Napoleon"),
    });
    expect(decision.attachReferences).toBe(true);
    expect(decision.selectedReferenceAssetIds).toContain(
      "napoleon-bonaparte/canonical-likeness"
    );
  });

  it("does not attach references for map beats mentioning a leader", () => {
    const policy = deriveHistoricalPersonLikenessPolicyV35({
      modality: "map",
      framing: "wide establishing vista",
      purpose: "establish map on Napoleon Bonaparte",
      subject: "Napoleon Bonaparte",
      personLabel: "Napoleon Bonaparte",
      narrationText: "Napoleon advanced toward Moscow.",
    });
    expect(policy).toBe("no-likeness");
    const decision = decideHistoricalPersonLikenessInclusionV35({
      likenessPolicy: policy,
      referenceSet: lookupHistoricalPersonReferenceSetByLabelV35("Napoleon"),
    });
    expect(decision.attachReferences).toBe(false);
    expect(decision.status).toBe("not-required");
  });

  it("falls back gracefully when no curated references exist", () => {
    const decision = decideHistoricalPersonLikenessInclusionV35({
      likenessPolicy: "reference-required",
      referenceSet: {
        canonicalPersonId: "unknown-leader",
        canonicalName: "Unknown Leader",
        aliases: [],
        references: [],
      },
    });
    expect(decision.attachReferences).toBe(false);
    expect(decision.status).toBe("not-available");
  });

  it("reports selected references in approval summaries", () => {
    const lines = summarizeHistoricalPersonReferenceReportV35({
      usages: [
        {
          shotId: "shot-0001-01",
          beatId: "beat-0001",
          entityMentionId: "entity-1",
          canonicalPersonId: "napoleon-bonaparte",
          canonicalName: "Napoleon Bonaparte",
          likenessPolicy: "reference-required",
          selectedReferenceAssetIds: ["napoleon-bonaparte/canonical-likeness"],
          attachmentStatus: "attached",
          reason: "face-relevant-shot-with-curated-references",
        },
      ],
      resolvedPersonCount: 1,
      attachedReferenceCount: 1,
    });
    expect(lines.join("\n")).toContain("napoleon-bonaparte/canonical-likeness");
    expect(lines.join("\n")).toContain("attached");
  });

  it("fires validation only when references exist but were not attached", () => {
    const diagnostics = historicalPersonReferenceValidationDiagnosticsV35({
      usages: [
        {
          shotId: "shot-0002-01",
          beatId: "beat-0002",
          entityMentionId: "entity-2",
          canonicalPersonId: "joseph-stalin",
          canonicalName: "Joseph Stalin",
          likenessPolicy: "reference-required",
          selectedReferenceAssetIds: [],
          attachmentStatus: "policy-blocked",
          reason: "unexpected-miss",
        },
      ],
      resolvedPersonCount: 1,
      attachedReferenceCount: 0,
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("HISTORICAL_PERSON_REFERENCE_MISSING");
    expect(lookupHistoricalPersonReferenceSetByIdV35("joseph-stalin")?.references.length).toBeGreaterThan(
      0
    );
  });
});
