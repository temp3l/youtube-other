import { describe, expect, it } from "vitest";
import { reviewStrategicItalianPackage, stableJson, strategicItalianQaPolicyHash, strategicItalianSha256 } from "./strategic-italian-qa.js";

describe("strategic Italian package QA", () => {
  it("fails closed when an untrusted workflow route or caption lineage is absent", () => {
    const result = reviewStrategicItalianPackage({
      workflow: { route: "strategic-italian", locale: "it", canonicalFingerprint: "a".repeat(64), italianCanonicalArtifact: {}, approvalLedger: [], workflowEvents: [], workflowInstanceId: "x", canonicalTaskId: "x", localizationTaskId: "x", unitId: "x", workflowRevision: "x", episodeBlueprint: {}, canonicalInputHashes: [] } as never,
      script: "Luca Bianchi presenta Milano.", captionsVtt: "WEBVTT", metadata: {}, policy: { protectedTerms: ["Luca Bianchi"], pronunciationTerms: [], requireItalianCta: true }, now: "2026-08-01T00:00:00.000Z",
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reasonCodes).toContain("ITALIAN_ROUTE_OR_SCRIPT_LINEAGE_REQUIRED");
    expect(result.reasonCodes).toContain("CAPTION_CHILD_FINGERPRINT_MISMATCH");
  });
  it("uses stable lowercase hashes for policy binding", () => {
    expect(strategicItalianSha256("Luca")).toMatch(/^[a-f0-9]{64}$/u);
    expect(strategicItalianQaPolicyHash({ protectedTerms: ["Luca"], pronunciationTerms: [], requireItalianCta: true })).toMatch(/^[a-f0-9]{64}$/u);
    expect(stableJson({ b: 1, a: { y: 2, x: 3 } })).toBe(stableJson({ a: { x: 3, y: 2 }, b: 1 }));
  });
});
