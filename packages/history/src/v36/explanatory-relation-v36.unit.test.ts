import { describe, expect, it } from "vitest";

import {
  createExplanatoryRelationV36,
  claimIdV36,
  episodeIdV36,
  explanatoryRelationIdV36,
  type ExplanatoryRelationDraftV36,
} from "./explanatory-relation-v36.js";
import { goldenSemanticFixturesV36, goldenFixtureSummaryV36 } from "./golden-semantic-fixtures-v36.js";
import { explanatoryRelationValidatorV36, validateExplanatoryRelationsV36 } from "./explanatory-relation-validator-v36.js";

describe("History V3.6 golden explanatory relation corpus", () => {
  it("contains the compact reviewed fixture inventory", () => {
    expect(goldenFixtureSummaryV36.fixtureCount).toBeGreaterThanOrEqual(30);
    expect(goldenFixtureSummaryV36.fixtureCount).toBeLessThanOrEqual(50);
    expect(goldenSemanticFixturesV36).toHaveLength(goldenFixtureSummaryV36.fixtureCount);
  });

  for (const fixture of goldenSemanticFixturesV36) {
    it(fixture.name, () => {
      const context = { episodeId: fixture.claims[0]!.episodeId, claims: fixture.claims, entities: fixture.entities };
      for (const draft of fixture.expectedRelations) {
        const relation = createExplanatoryRelationV36(draft);
        const result = explanatoryRelationValidatorV36.validate(relation, context);
        expect(result).toEqual({ status: "valid" });
      }
      for (const forbidden of fixture.forbiddenRelations) {
        const relation = createExplanatoryRelationV36(forbidden.relation);
        const result = explanatoryRelationValidatorV36.validate(relation, context);
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") expect(result.diagnostics.map((item) => item.code)).toContain(forbidden.diagnostic);
      }
    });
  }
});

describe("History V3.6 invariant and determinism contracts", () => {
  const movement = goldenSemanticFixturesV36[0]!.expectedRelations[0]!;
  const causal = goldenSemanticFixturesV36.find((fixture) => fixture.name === "causal: drought to harvest failure")!.expectedRelations[0]!;
  const temporal = goldenSemanticFixturesV36.find((fixture) => fixture.name === "temporal: three days later")!.expectedRelations[0]!;

  it("derives identical semantic IDs despite support-window ordering", () => {
    const supportA = claimIdV36("claim-window-a");
    const supportB = claimIdV36("claim-window-b");
    const first = createExplanatoryRelationV36({ ...movement, supportClaimIds: [supportA, supportB] });
    const second = createExplanatoryRelationV36({ ...movement, supportClaimIds: [supportB, supportA] });
    expect(first.id).toBe(second.id);
    expect(explanatoryRelationIdV36(first)).toBe(second.id);
  });

  it("rejects cross-episode support and duplicate semantic identities", () => {
    const fixture = goldenSemanticFixturesV36[0]!;
    const relation = createExplanatoryRelationV36(movement);
    const crossEpisode = { ...fixture.claims[0]!, episodeId: episodeIdV36("another-episode") };
    expect(explanatoryRelationValidatorV36.validate(relation, { episodeId: fixture.claims[0]!.episodeId, claims: [crossEpisode], entities: fixture.entities }).status).toBe("invalid");
    expect(validateExplanatoryRelationsV36({ relations: [relation, relation], context: { episodeId: fixture.claims[0]!.episodeId, claims: fixture.claims, entities: fixture.entities } })[1]).toMatchObject({ status: "invalid" });
  });

  it("keeps causal and temporal semantics non-interchangeable", () => {
    const fixture = goldenSemanticFixturesV36.find((item) => item.name === "temporal: three days later")!;
    const incorrectDraft: ExplanatoryRelationDraftV36 = { kind: "causal", episodeId: temporal.episodeId, supportClaimIds: temporal.supportClaimIds, cause: temporal.steps[0], effect: temporal.steps[1] };
    const incorrect = createExplanatoryRelationV36(incorrectDraft);
    const result = explanatoryRelationValidatorV36.validate(incorrect, { episodeId: fixture.claims[0]!.episodeId, claims: fixture.claims, entities: fixture.entities });
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.diagnostics.map((item) => item.code)).toContain("RELATION_TYPE_MISMATCH");
  });
});
