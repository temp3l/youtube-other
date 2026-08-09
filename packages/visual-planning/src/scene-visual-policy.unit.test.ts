import { describe, expect, it } from "vitest";
import { sceneVisualPolicyConfigurationHash, selectSceneVisualMedia } from "./scene-visual-policy.js";

const hash = "a".repeat(64);

describe("scene visual media policy", () => {
  it("deterministically selects only display-allowed source media", () => {
    const input = {
      contentProfileId: "veronicabenini" as const,
      narrationRevisionId: "revision-001",
      effectiveConfigurationHash: sceneVisualPolicyConfigurationHash({
        narrationRevisionId: "revision-001",
        sources: [{ sourceAssetId: "allowed", checksum: hash, displayPolicy: "display-allowed" }],
      }),
      dependencyIdentity: { allowed: hash, forbidden: "b".repeat(64) },
      scenes: [{ sceneId: "scene-001", narrationLineId: "line-001" }],
      sources: [
        { sourceAssetId: "forbidden", checksum: "b".repeat(64), displayPolicy: "forbidden-display" as const, candidates: [{ candidateId: "candidate-forbidden", provenanceId: "prov-forbidden" }] },
        { sourceAssetId: "allowed", checksum: hash, displayPolicy: "display-allowed" as const, candidates: [{ candidateId: "candidate-allowed", provenanceId: "prov-allowed" }] },
      ],
    };
    const first = selectSceneVisualMedia(input);
    const second = selectSceneVisualMedia({ ...input, sources: [...input.sources].reverse() });
    expect(first).toEqual(second);
    expect(first.selections[0]).toMatchObject({ sourceAssetId: "allowed", rationale: "display-allowed-source" });
    expect(first.review).toEqual({ allowed: true, reasonCodes: [] });
  });

  it("fails closed when all media is context-only or forbidden", () => {
    const result = selectSceneVisualMedia({
      contentProfileId: "veronicabenini",
      narrationRevisionId: "revision-001",
      effectiveConfigurationHash: hash,
      dependencyIdentity: { context: hash },
      scenes: [{ sceneId: "scene-001", narrationLineId: "line-001" }],
      sources: [{ sourceAssetId: "context", checksum: hash, displayPolicy: "context-only", candidates: [{ candidateId: "candidate-context", provenanceId: "prov-context" }] }],
    });
    expect(result.selections[0]?.rationale).toBe("no-display-allowed-source");
    expect(result.review).toEqual({ allowed: false, reasonCodes: ["NO_DISPLAY_ALLOWED_SOURCE"] });
  });
});
