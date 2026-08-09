import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36,
  HISTORY_EXPLANATORY_RELATIONS_PLANNER_V36,
  HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36,
  claimIdV36,
  createExplanatoryRelationV36,
  explanatoryRelationArtifactSchemaV36,
  explanatoryRelationJsonSchemaV36,
  explanatoryRelationSchemaV36,
  policyResponseAssertionSemanticsV36,
  relationEvidenceFingerprintV36,
} from "./explanatory-relation-v36.js";
import { explanatoryRelationValidatorV36 } from "./explanatory-relation-validator-v36.js";
import { goldenSemanticFixturesV36 } from "./golden-semantic-fixtures-v36.js";
import {
  constructApprovedCrossClaimProofV36,
  approvedCrossClaimConditionClaimIdV36,
  approvedCrossClaimResponseClaimIdV36,
} from "./cross-claim-proof-fixtures-v36.js";
import { representativeNativeEpisodeFragmentsV36 } from "./native-structured-claim-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";
import {
  assessPolicyResponseCandidateAdmissionV36,
  constructProofBackedPolicyResponseCandidateV36,
} from "./policy-response-admission-v36.js";
import {
  policyResponseModalityDecisionMatrixSchemaV36,
  selectedPolicyResponseModalityOptionV36,
  simulatePolicyResponseModalityContractV36,
} from "./policy-response-modality-contract-v36.js";

async function approvedPrototype() {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes("04-black-death") && !entry.name.endsWith("-v3.4"))!.name;
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  const native = runRepresentativeNativeStructuredClaimExperimentV36([{
    shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
    native: { episodeId, claims: structured.claims, entities: structured.entities },
  }]).runs[0]!.native;
  const atom = (claimId: string) => native.grounding.propositions.find((item) => item.claimId === claimId)!;
  const proposition = (claimId: string) => native.structuredClaims.envelopes.find((item) => item.claimId === claimId)!.propositions[0]!;
  const proof = constructApprovedCrossClaimProofV36({
    conditionAtomic: atom(approvedCrossClaimConditionClaimIdV36),
    conditionStructured: proposition(approvedCrossClaimConditionClaimIdV36),
    responseAtomic: atom(approvedCrossClaimResponseClaimIdV36),
    responseStructured: proposition(approvedCrossClaimResponseClaimIdV36),
  });
  const constructed = constructProofBackedPolicyResponseCandidateV36(proof);
  if (constructed.status !== "constructed") throw new Error(constructed.reason);
  const label = (claimId: string, participantId: string) => {
    const participant = proposition(claimId).roles.find((role) => role.participant.binding.referenceId === participantId)?.participant;
    if (!participant) throw new Error(`Missing approved participant ${participantId}.`);
    return participant.label;
  };
  return {
    candidate: constructed.candidate,
    conditionLabel: label(approvedCrossClaimConditionClaimIdV36, constructed.candidate.condition.participantId),
    responseLabel: label(approvedCrossClaimResponseClaimIdV36, constructed.candidate.response.participantId),
  };
}

const legacyDraft = goldenSemanticFixturesV36
  .flatMap((fixture) => fixture.expectedRelations)
  .find((relation) => relation.kind === "policy-response")!;

describe("V3.6 policy-response modality architecture decision", () => {
  it("validates the decision matrix and selects exactly one option", async () => {
    const matrix = policyResponseModalityDecisionMatrixSchemaV36.parse(JSON.parse(await fs.readFile(
      path.resolve("docs/history/v3.6/policy-response-modality-decision-matrix.json"), "utf8"
    )));
    expect(matrix.options.filter((option) => option.selected).map((option) => option.option)).toEqual([selectedPolicyResponseModalityOptionV36]);
  });

  it("Option A prototype represents named premise modality losslessly", async () => {
    const input = await approvedPrototype();
    const result = simulatePolicyResponseModalityContractV36(input);
    expect(result).toMatchObject({ classification: "ADMISSIBLE_LOSSLESS", schemaValid: true, validatorValid: true, productionAdmissionChanged: false });
    expect(result.relation).toMatchObject({ kind: "policy-response", conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
  });

  it("Option B prototype assessment rejects premature generic surface", async () => {
    const matrix = policyResponseModalityDecisionMatrixSchemaV36.parse(JSON.parse(await fs.readFile(
      path.resolve("docs/history/v3.6/policy-response-modality-decision-matrix.json"), "utf8"
    )));
    const option = matrix.options.find((candidate) => candidate.option === "OPTION_B_GENERIC_DIRECTED_PREMISE_MODALITY")!;
    expect(option.selected).toBe(false);
    expect(option.dimensions.schemaComplexity.assessment).toBe("poor");
    expect(explanatoryRelationJsonSchemaV36.oneOf).toHaveLength(9);
  });

  it("Option C compatibility remains safe but production-blocked", async () => {
    const { candidate } = await approvedPrototype();
    expect(assessPolicyResponseCandidateAdmissionV36(candidate)).toMatchObject({ result: "BLOCKED_MODALITY_LOSS" });
  });
});

describe("selected policy-response modality runtime contract", () => {
  it("reuses the canonical vocabulary and rejects invalid assertion values", () => {
    const relation = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    expect(explanatoryRelationSchemaV36.safeParse(relation).success).toBe(true);
    expect(explanatoryRelationSchemaV36.safeParse({ ...relation, conditionAssertionStatus: "completed" }).success).toBe(false);
  });

  it("interprets missing legacy modality only as asserted/asserted", () => {
    const legacy = createExplanatoryRelationV36(legacyDraft);
    const explicit = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "asserted", responseAssertionStatus: "asserted" });
    expect(policyResponseAssertionSemanticsV36(legacy)).toEqual({ conditionAssertionStatus: "asserted", responseAssertionStatus: "asserted", representation: "legacy-implicit-asserted" });
    expect(policyResponseAssertionSemanticsV36(explicit).representation).toBe("explicit");
    expect(legacy.id).toBe("relation-policy-response-a3292b441cb5334bb64f175c");
    expect(legacy.evidenceFingerprint).toBe("evidence-ba9eecbb817fb7cb225771dc");
    expect(explicit.id).toBe(legacy.id);
    expect(explicit.evidenceFingerprint).toBe(legacy.evidenceFingerprint);
  });

  it("makes non-default premise modality semantic, directed, and side-specific", () => {
    const modal = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    const asserted = createExplanatoryRelationV36(legacyDraft);
    const swappedModality = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "attempted", responseAssertionStatus: "uncertain" });
    if (legacyDraft.kind !== "policy-response") throw new Error("fixture changed");
    const reversed = createExplanatoryRelationV36({ ...legacyDraft, condition: legacyDraft.response, response: legacyDraft.condition, conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    expect(new Set([modal.id, asserted.id, swappedModality.id, reversed.id]).size).toBe(4);
  });

  it("requires exact modality in validator evidence without weakening legacy validation", () => {
    if (legacyDraft.kind !== "policy-response") throw new Error("fixture changed");
    const relation = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    const context = {
      episodeId: relation.episodeId,
      entities: [],
      claims: [{ id: relation.supportClaimIds[0], episodeId: relation.episodeId, normalizedProposition: "prototype", claimKind: "compound", groundedPropositions: [{ kind: "policy-response" as const, condition: relation.condition, conditionAssertionStatus: "uncertain" as const, response: relation.response, responseAssertionStatus: "attempted" as const }] }],
    };
    expect(explanatoryRelationValidatorV36.validate(relation, context)).toEqual({ status: "valid" });
    const wrongSide = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "attempted", responseAssertionStatus: "uncertain" });
    expect(explanatoryRelationValidatorV36.validate(wrongSide, context)).toMatchObject({ status: "invalid", diagnostics: [expect.objectContaining({ code: "RELATION_MODALITY_UNSUPPORTED" })] });
  });

  it("supports V2 and V3 artifact round-trips without permitting V3 fields in V2", () => {
    const legacy = createExplanatoryRelationV36(legacyDraft);
    const modal = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    const artifact = (schemaVersion: string, relation: unknown) => ({ schemaVersion, plannerVersion: HISTORY_EXPLANATORY_RELATIONS_PLANNER_V36, episodeId: legacy.episodeId, relations: [relation] });
    expect(explanatoryRelationArtifactSchemaV36.parse(JSON.parse(JSON.stringify(artifact(HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36, legacy))))).toEqual(artifact(HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36, legacy));
    expect(explanatoryRelationArtifactSchemaV36.safeParse(artifact(HISTORY_EXPLANATORY_RELATIONS_LEGACY_SCHEMA_V36, modal)).success).toBe(false);
    expect(explanatoryRelationArtifactSchemaV36.parse(JSON.parse(JSON.stringify(artifact(HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36, modal))))).toEqual(artifact(HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36, modal));
  });

  it("keeps evidence identity separate from semantic modality", () => {
    const first = createExplanatoryRelationV36({ ...legacyDraft, conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    const secondClaim = claimIdV36("claim-modality-second-support");
    const second = createExplanatoryRelationV36({ ...legacyDraft, supportClaimIds: [legacyDraft.supportClaimIds[0], secondClaim], conditionAssertionStatus: "uncertain", responseAssertionStatus: "attempted" });
    expect(first.id).toBe(second.id);
    expect(first.evidenceFingerprint).not.toBe(second.evidenceFingerprint);
    expect(relationEvidenceFingerprintV36(first.supportClaimIds)).toBe(first.evidenceFingerprint);
  });
});

describe("Phase 2.15 prototype boundary", () => {
  it("does not admit the Black Death relation or alter same-eight counts", async () => {
    const inputs = await Promise.all(representativeNativeEpisodeFragmentsV36.map(async (fragment) => {
      const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
      const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))!.name;
      const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
      const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
      const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
      return { shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] }, native: { episodeId, claims: structured.claims, entities: structured.entities } };
    }));
    const first = runRepresentativeNativeStructuredClaimExperimentV36(inputs);
    const second = runRepresentativeNativeStructuredClaimExperimentV36(inputs);
    expect(first.relationComparison.after).toMatchObject({ candidates: 52, validatedRelations: 30 });
    expect(first.missClassification.atomicGroundingPresentCandidateProjectionGap).toBe(9);
    expect(first.runs.flatMap((run) => run.native.extraction.relations).filter((relation) => relation.kind === "policy-response" && relation.episodeId.includes("black-death"))).toHaveLength(0);
    expect(second.relationComparison).toEqual(first.relationComparison);
    expect(second.missClassification).toEqual(first.missClassification);
  });
});
