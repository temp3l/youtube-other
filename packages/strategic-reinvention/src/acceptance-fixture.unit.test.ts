import { describe, expect, it } from "vitest";

import { createVeronicaAcceptanceEvidence } from "./acceptance-fixture.js";

const hash = "a".repeat(64);
function result(planHash: string) {
  return {
    episodeId: "episode-1",
    supplementalPlanContentHash: planHash,
    completedStages: ["strategic.source-ingest", "strategic.publish-approval"],
  } as never;
}

describe("Veronica acceptance evidence fixture", () => {
  it("binds canonical identity and preserves locale-neutral visuals and approved history", () => {
    const evidence = createVeronicaAcceptanceEvidence({
      first: result(hash),
      resumed: result(hash),
      sourceChanged: result("b".repeat(64)),
      effectiveConfiguration: { policyRevision: "policy-1", providerDispatchEnabled: false },
      sourceProvenanceSha256: "c".repeat(64),
      approvalHistoryHashBefore: "d".repeat(64),
      approvalHistoryHashAfter: "d".repeat(64),
    });

    expect(evidence).toMatchObject({
      contentProfileId: "veronicabenini",
      localizationReuse: {
        sharedVisualHash: hash,
        locales: ["en", "es"],
        invalidatedSharedVisuals: false,
      },
      cacheReuse: { resumedContentHashMatch: true },
      sourceInvalidation: { detected: true },
      approvedHistoryPreserved: true,
      releaseGate: {
        providerDispatchEnabled: false,
        irreversibleWorkEnabled: false,
        failureEvidence: { redacted: true },
      },
    });
    expect(evidence.artifactBindings.filter((binding) => binding.kind === "locale-edition"))
      .toHaveLength(2);
  });

  it("fails closed when approved history changes", () => {
    expect(() => createVeronicaAcceptanceEvidence({
      first: result(hash),
      resumed: result(hash),
      sourceChanged: result("b".repeat(64)),
      effectiveConfiguration: { policyRevision: "policy-1" },
      sourceProvenanceSha256: "c".repeat(64),
      approvalHistoryHashBefore: "d".repeat(64),
      approvalHistoryHashAfter: "e".repeat(64),
    })).toThrow();
  });
});
