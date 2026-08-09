import { describe, expect, it } from "vitest";

import {
  claimIdV36,
  episodeIdV36,
  type GroundedRelationPropositionV36,
  type RelationSupportClaimV36,
} from "./explanatory-relation-v36.js";
import { goldenSemanticFixturesV36 } from "./golden-semantic-fixtures-v36.js";
import { extractShadowRelationCandidatesV36 } from "./explanatory-relation-shadow-extractor-v36.js";

describe("History V3.6 shadow relation candidate extraction", () => {
  it("projects the golden corpus only from explicit grounded claim propositions", () => {
    for (const fixture of goldenSemanticFixturesV36) {
      const result = extractShadowRelationCandidatesV36({
        episodeId: fixture.claims[0]!.episodeId,
        claims: fixture.claims,
        entities: fixture.entities,
      });
      const expectedIds = [...new Set(fixture.expectedRelations.map((relation) =>
        extractShadowRelationCandidatesV36({
          episodeId: fixture.claims[0]!.episodeId,
          claims: [{ ...fixture.claims[0]!, groundedPropositions: [relation as GroundedRelationPropositionV36] }],
          entities: fixture.entities,
        }).relations[0]?.id
      ))].filter((id): id is string => Boolean(id)).sort();
      expect(result.mode).toBe("v36-shadow");
      expect(result.rejectedCandidates).toEqual([]);
      expect(result.relations.map((relation) => relation.id)).toEqual(expectedIds);
    }
  });

  it("merges evidence windows for the same semantic candidate", () => {
    const fixture = goldenSemanticFixturesV36.find((item) => item.name === "identity: same movement across different evidence windows")!;
    const result = extractShadowRelationCandidatesV36({
      episodeId: fixture.claims[0]!.episodeId,
      claims: fixture.claims,
      entities: fixture.entities,
    });
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]!.supportClaimIds).toEqual([claimIdV36("claim-window-c1"), claimIdV36("claim-window-c2")]);
  });

  it("does not create a relation from claim text without an explicit proposition", () => {
    const claim: RelationSupportClaimV36 = {
      id: claimIdV36("claim-text-only"),
      episodeId: episodeIdV36("shadow-text-only"),
      normalizedProposition: "Drought caused the harvest to fail.",
      claimKind: "compound",
      groundedPropositions: [],
    };
    expect(extractShadowRelationCandidatesV36({
      episodeId: claim.episodeId,
      claims: [claim],
      entities: [],
    }).relations).toEqual([]);
  });

  it("skips foreign claims and reports malformed propositions without failing open", () => {
    const episodeId = episodeIdV36("shadow-target");
    const foreignClaim: RelationSupportClaimV36 = {
      id: claimIdV36("claim-foreign"),
      episodeId: episodeIdV36("shadow-foreign"),
      normalizedProposition: "Foreign claim.",
      claimKind: "compound",
      groundedPropositions: [],
    };
    const malformedClaim: RelationSupportClaimV36 = {
      id: claimIdV36("claim-malformed"),
      episodeId,
      normalizedProposition: "Invalid self movement.",
      claimKind: "compound",
      groundedPropositions: [{
        kind: "movement",
        from: { entityId: "place-a" as never, canonicalLabel: "A" },
        to: { entityId: "place-a" as never, canonicalLabel: "A" },
        via: [],
      }],
    };
    const result = extractShadowRelationCandidatesV36({ episodeId, claims: [foreignClaim, malformedClaim], entities: [] });
    expect(result.relations).toEqual([]);
    expect(result.skippedForeignClaimIds).toEqual([foreignClaim.id]);
    expect(result.rejectedCandidates).toMatchObject([{ claimId: malformedClaim.id }]);
  });

  it("is deterministic across repeated shadow runs", () => {
    const fixture = goldenSemanticFixturesV36[0]!;
    const input = { episodeId: fixture.claims[0]!.episodeId, claims: fixture.claims, entities: fixture.entities };
    expect(extractShadowRelationCandidatesV36(input)).toEqual(extractShadowRelationCandidatesV36(input));
  });
});
