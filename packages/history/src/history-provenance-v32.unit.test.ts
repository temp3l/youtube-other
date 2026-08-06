import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveHistoryClaimProvenanceV32 } from "./history-provenance-v32.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const source = { id: "s", title: "Source", sourceType: "reference" as const, urlOrIdentifier: "https://example.test" };
const evidence = { id: "e", sourceId: "s", locator: { kind: "page" as const, value: "12" }, passageSha256: hash("passage") };
const input = (links: readonly object[], extra: object = {}) => ({ claimId: "c", material: true, concerns: ["factual" as const], narrationSha256: hash("n"), planHash: hash("p"), sources: [source], evidence: [evidence], links, ...extra });

describe("History V3.2 provenance", () => {
  it("does not let candidate links or model metadata support a material claim", () => {
    expect(deriveHistoryClaimProvenanceV32(input([{ id: "l", claimId: "c", sourceId: "s", evidencePassageId: "e", state: "candidate", support: "direct", assistant: { model: "model", runId: "run" } }])).status).toBe("candidate");
  });
  it("requires a human record for verified support and detects contradiction", () => {
    const verified = { id: "l", claimId: "c", sourceId: "s", evidencePassageId: "e", state: "verified" as const, support: "direct" as const, verification: { reviewerId: "r", reviewedAt: "2026-08-06T00:00:00.000Z" } };
    expect(deriveHistoryClaimProvenanceV32(input([verified])).status).toBe("supported");
    expect(deriveHistoryClaimProvenanceV32(input([{ ...verified, support: "contradicting" }])).status).toBe("disputed");
    expect(() => deriveHistoryClaimProvenanceV32(input([{ ...verified, verification: undefined }]))).toThrow("human");
  });
  it("rejects dangling evidence and stale overrides", () => {
    expect(() => deriveHistoryClaimProvenanceV32(input([{ id: "l", claimId: "c", sourceId: "missing", evidencePassageId: "e", state: "candidate", support: "direct" }]))).toThrow("dangling");
    expect(() => deriveHistoryClaimProvenanceV32(input([], { override: { reviewerId: "r", reviewedAt: "2026-08-06T00:00:00.000Z", reason: "reason", decision: "accept", priorStatus: "unresolved", narrationSha256: hash("other"), planHash: hash("p") } }))).toThrow("stale");
  });
});
