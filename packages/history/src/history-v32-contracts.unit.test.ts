import { describe, expect, it } from "vitest";
import {
  historyClaimSourceLinkV32Schema,
  historySourceRegistryEntryV32Schema,
  summarizeHistoryApprovalV32,
} from "./history-v32-contracts.js";

describe("History V3.2 contracts", () => {
  it("keeps reviewability and approval gates independent and deduplicated", () => {
    const summary = summarizeHistoryApprovalV32([
      {
        code: "CLAIM_PROVENANCE_UNRESOLVED",
        severity: "error",
        gate: "content",
        message: "Material claims remain unresolved.",
        remediation: "Verify evidence or record an override.",
        affectedIds: ["claim-1"],
      },
      {
        code: "CLAIM_PROVENANCE_UNRESOLVED",
        severity: "error",
        gate: "content",
        message: "Material claims remain unresolved.",
        remediation: "Verify evidence or record an override.",
        affectedIds: ["claim-2"],
      },
      {
        code: "TIMING_ESTIMATE_PROVISIONAL",
        severity: "error",
        gate: "production",
        message: "Measured audio is absent.",
        remediation: "Attach immutable measured audio.",
        affectedIds: [],
      },
    ]);
    expect(summary.structural.state).toBe("reviewable");
    expect(summary.editorial.state).toBe("reviewable");
    expect(summary.content.state).toBe("blocked");
    expect(summary.production.state).toBe("blocked");
    expect(summary.blockers).toEqual([
      { code: "CLAIM_PROVENANCE_UNRESOLVED", count: 2 },
      { code: "TIMING_ESTIMATE_PROVISIONAL", count: 1 },
    ]);
  });

  it("requires verifiable source identity and human records for verified links", () => {
    expect(
      historySourceRegistryEntryV32Schema.safeParse({
        id: "source-1",
        title: "A source",
        sourceType: "scholarly-secondary",
        urlOrIdentifier: "https://example.test/source",
      }).success
    ).toBe(true);
    expect(
      historyClaimSourceLinkV32Schema.safeParse({
        id: "link-1",
        claimId: "claim-1",
        sourceId: "source-1",
        evidencePassageId: "passage-1",
        state: "verified",
        support: "direct",
      }).success
    ).toBe(true);
  });
});
