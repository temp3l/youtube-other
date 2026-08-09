import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createExplanatoryRelationV36,
  claimIdV36,
  episodeIdV36,
  explanatoryRelationIdV36,
  relationContractDocumentV36,
  relationEvidenceFingerprintV36,
  type ExplanatoryRelationV36,
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
        const relation = forbidden.diagnostic === "RELATION_CARDINALITY_INVALID"
          ? {
              ...forbidden.relation,
              id: "invalid-cardinality-relation",
              evidenceFingerprint: relationEvidenceFingerprintV36(forbidden.relation.supportClaimIds),
            } as unknown as ExplanatoryRelationV36
          : createExplanatoryRelationV36(forbidden.relation);
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

  it("keeps semantic identity independent of different valid evidence windows", () => {
    const supportA = claimIdV36("claim-window-a");
    const supportB = claimIdV36("claim-window-b");
    const firstWindow = { id: "window-uuid-a", claimIds: [supportA] };
    const secondWindow = { id: "window-uuid-b", claimIds: [supportA, supportB] };
    const first = createExplanatoryRelationV36({ ...movement, supportClaimIds: [firstWindow.claimIds[0]!] });
    const second = createExplanatoryRelationV36({ ...movement, supportClaimIds: [secondWindow.claimIds[0]!, secondWindow.claimIds[1]!] });
    expect(firstWindow.id).not.toBe(secondWindow.id);
    expect(first.id).toBe(second.id);
    expect(first.evidenceFingerprint).not.toBe(second.evidenceFingerprint);
    expect(explanatoryRelationIdV36(first)).toBe(second.id);
  });

  it("canonicalizes evidence provenance independently from relation semantics", () => {
    const supportA = claimIdV36("claim-evidence-a");
    const supportB = claimIdV36("claim-evidence-b");
    const first = createExplanatoryRelationV36({ ...movement, supportClaimIds: [supportA, supportB] });
    const second = createExplanatoryRelationV36({ ...movement, supportClaimIds: [supportB, supportA] });
    expect(first.id).toBe(second.id);
    expect(first.evidenceFingerprint).toBe(second.evidenceFingerprint);
    expect(first.supportClaimIds).toEqual(second.supportClaimIds);
  });

  it("makes asymmetric direction part of semantic identity", () => {
    const forward = createExplanatoryRelationV36(causal);
    const reverse = createExplanatoryRelationV36({
      ...causal,
      cause: causal.effect,
      effect: causal.cause,
    });
    expect(forward.id).not.toBe(reverse.id);
  });

  it("makes process and temporal ordering part of semantic identity", () => {
    const process = goldenSemanticFixturesV36.find((fixture) => fixture.name === "process: production chain")!.expectedRelations[0]!;
    const orderedProcess = createExplanatoryRelationV36(process);
    const reorderedProcess = createExplanatoryRelationV36({ ...process, steps: [process.steps[0], process.steps[2]!, process.steps[1]] });
    const orderedTemporal = createExplanatoryRelationV36(temporal);
    const reorderedTemporal = createExplanatoryRelationV36({ ...temporal, steps: [temporal.steps[1], temporal.steps[0]] });
    expect(orderedProcess.id).not.toBe(reorderedProcess.id);
    expect(orderedTemporal.id).not.toBe(reorderedTemporal.id);
  });

  it("treats evidence-set members as an unordered semantic set", () => {
    const evidenceSet = goldenSemanticFixturesV36.find((fixture) => fixture.name === "evidence set: document collection")!.expectedRelations[0]!;
    if (evidenceSet.kind !== "evidence-set") throw new Error("fixture contract changed");
    const first = createExplanatoryRelationV36(evidenceSet);
    const second = createExplanatoryRelationV36({ ...evidenceSet, evidence: [evidenceSet.evidence[2]!, evidenceSet.evidence[0], evidenceSet.evidence[1]] });
    expect(first.id).toBe(second.id);
  });

  it("documents dependency as dependency -> dependent", () => {
    const dependency = goldenSemanticFixturesV36.find((fixture) => fixture.name === "dependency: archive requires tax revenue")!.expectedRelations[0]!;
    if (dependency.kind !== "dependency") throw new Error("fixture contract changed");
    const forward = createExplanatoryRelationV36(dependency);
    const reverse = createExplanatoryRelationV36({ ...dependency, dependency: dependency.dependent, dependent: dependency.dependency });
    expect(forward.id).not.toBe(reverse.id);
  });

  it("collapses independently constructed normalized semantic duplicates", () => {
    const first = createExplanatoryRelationV36(movement);
    const second = createExplanatoryRelationV36({
      ...movement,
      from: { ...movement.from, canonicalLabel: ` ${movement.from.canonicalLabel.toUpperCase()} ` },
      to: { ...movement.to, canonicalLabel: ` ${movement.to.canonicalLabel.toUpperCase()} ` },
    });
    expect(first.id).toBe(second.id);
  });

  it("rejects invalid cardinality before producing a semantic ID", () => {
    expect(() => createExplanatoryRelationV36({
      ...movement,
      from: movement.to,
    })).toThrow("Movement requires distinct from and to places.");
  });

  it("keeps identity and evidence fingerprints deterministic across reconstruction", () => {
    const first = createExplanatoryRelationV36(movement);
    const second = createExplanatoryRelationV36(JSON.parse(JSON.stringify(movement)) as ExplanatoryRelationDraftV36);
    expect(first.id).toBe(second.id);
    expect(first.evidenceFingerprint).toBe(second.evidenceFingerprint);
  });

  it("exports field-level relation contracts from the runtime contract source", () => {
    expect(relationContractDocumentV36.schemaVersion).toBe("history-explanatory-relations.v2");
    expect(Object.keys(relationContractDocumentV36.relationKinds)).toHaveLength(9);
    expect(relationContractDocumentV36.identity.semanticRelationId.excludes).toContain("supportClaimIds");
    expect(relationContractDocumentV36.relationKinds.dependency.direction).toBe(
      "dependency -> dependent; dependent depends on dependency"
    );
    expect(relationContractDocumentV36.relationKinds["evidence-set"].ordering).toContain("unordered");
  });

  it("uses an explicit, versioned provenance contract without the ambiguous alias", async () => {
    const provenancePath = fileURLToPath(new URL("../../../../docs/history/v3.6/provenance-schema.json", import.meta.url));
    const schema = JSON.parse(await readFile(provenancePath, "utf8")) as {
      schemaVersion: string;
      required: readonly string[];
      properties: Record<string, unknown>;
    };
    expect(schema.schemaVersion).toBe("history-v3.6-relation-ir-review-provenance.v2");
    expect(schema.required).toEqual(expect.arrayContaining([
      "v36ImplementationCommitSha",
      "frozenV35ProductionCommitSha",
      "acceptedV35SemanticBaselineCommitSha",
    ]));
    expect(schema.properties).not.toHaveProperty("semanticBaselineCommitSha");
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
