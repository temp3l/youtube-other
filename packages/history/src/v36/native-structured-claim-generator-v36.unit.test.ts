import { existsSync, readFileSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { structureTrustedScriptClaimsV34 } from "../history-claims-v34.js";
import { normalizeHistoryNarrationV33 } from "../history-narration-v33.js";
import { atomicGroundingArtifactSchemaV36 } from "./atomic-claim-grounding-v36.js";
import {
  createRepresentativeNativeStructuredSidecarV36,
  representativeNativeEpisodeFragmentsV36,
} from "./native-structured-claim-fixtures-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";
import {
  HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
  createNativeStructuredClaimSidecarV36,
  generateNativeStructuredClaimsV36,
  nativeStructuredClaimCacheFingerprintV36,
  nativeStructuredClaimSidecarSchemaV36,
  persistNativeStructuredClaimSidecarV36,
  structureTrustedScriptClaimsNativeV36,
  type NativeStructuredClaimSourceV36,
} from "./native-structured-claim-generator-v36.js";
import { explanatoryRelationSchemaV36 } from "./explanatory-relation-v36.js";
import type { RepresentativeShadowSourceV36 } from "./representative-shadow-extraction-v36.js";
import { structuredClaimArtifactSchemaV36 } from "./structured-claim-v36.js";

const FRANKLIN = "history-youtube-history-10-video-story-pack-05-franklin-expedition";
const franklinText = "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.";

function boundaryControl() {
  const narration = normalizeHistoryNarrationV33({ episodeId: FRANKLIN, rawScript: franklinText });
  const unitId = narration.units[0]!.id;
  const nativeStructuredProposals = [{
    narrationUnitId: unitId,
    propositions: [
      {
        sourceText: franklinText,
        participants: { ships: { kind: "claim-concept" as const, label: "two Royal Navy ships" }, Britain: { kind: "canonical-entity" as const, canonicalLabel: "Britain" } },
        subject: "ships",
        predicate: "moves-from" as const,
        object: "Britain",
        roles: [{ role: "actor" as const, participant: "ships" }, { role: "origin" as const, participant: "Britain" }],
        assertionStatus: "asserted" as const,
      },
      {
        sourceText: franklinText,
        participants: { ships: { kind: "claim-concept" as const, label: "two Royal Navy ships" }, objective: { kind: "canonical-entity" as const, canonicalLabel: "Northwest Passage" } },
        subject: "ships",
        predicate: "search-object" as const,
        object: "objective",
        roles: [{ role: "actor" as const, participant: "ships" }, { role: "objective" as const, participant: "objective" }],
        assertionStatus: "intended" as const,
      },
    ],
  }];
  return { narration, nativeStructuredProposals };
}

function loadRepresentative(fragment: string): {
  readonly shadow: RepresentativeShadowSourceV36;
  readonly native: NativeStructuredClaimSourceV36;
} {
  const episodeId = readdirSync("episodes").find((candidate) =>
    candidate.includes(fragment) && existsSync(path.join("episodes", candidate, "source", "history-v3.5", "structured-claims.json"))
  );
  if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
  const absoluteStructured = path.resolve("episodes", episodeId, "source", "history-v3.5", "structured-claims.json");
  const structured = JSON.parse(readFileSync(absoluteStructured, "utf8"));
  const root = path.dirname(absoluteStructured);
  const plan = JSON.parse(readFileSync(path.join(root, "plan.json"), "utf8"));
  return {
    shadow: { episodeId: structured.episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
    native: { episodeId: structured.episodeId, claims: structured.claims, entities: structured.entities },
  };
}

describe("History V3.6 native structured claim boundary", () => {
  it("emits the accepted sidecar in the same deterministic boundary without changing V3.5 serialization", () => {
    const control = boundaryControl();
    const frozen = structureTrustedScriptClaimsV34({ episodeId: FRANKLIN, narration: control.narration });
    const result = structureTrustedScriptClaimsNativeV36({
      episodeId: FRANKLIN,
      narration: control.narration,
      nativeStructuredProposals: control.nativeStructuredProposals,
      providerIdentity: null,
      modelIdentity: null,
    });
    expect(JSON.stringify(result.canonicalClaimsV35)).toBe(JSON.stringify(frozen));
    expect(result.structuredV36.structuredClaims.envelopes).toHaveLength(1);
    expect(result.structuredV36.structuredClaims.envelopes[0]!.propositions).toHaveLength(2);
    expect(structuredClaimArtifactSchemaV36.safeParse(result.structuredV36.structuredClaims).success).toBe(true);
    expect(result.structuredV36.cache).toMatchObject({
      generatorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
      providerIdentity: null,
      modelIdentity: null,
    });
    const objective = result.structuredV36.structuredClaims.envelopes[0]!.propositions.find((item) => item.predicate === "search-object")!;
    expect(objective.roles.map((role) => role.role)).toContain("objective");
    expect(objective.roles.map((role) => role.role)).not.toContain("destination");
    expect(objective.assertionStatus).toBe("intended");
    expect(objective.sourceSpan).toMatchObject({ startUtf16: 0, endUtf16Exclusive: franklinText.length, text: franklinText });
  });

  it("fails closed on unresolved participants and non-exact source spans", () => {
    const control = boundaryControl();
    const canonical = structureTrustedScriptClaimsV34({ episodeId: FRANKLIN, narration: control.narration });
    const unitId = canonical.claims[0]!.narrationUnitIds[0]!;
    const unresolved = generateNativeStructuredClaimsV36({
      source: { episodeId: FRANKLIN, claims: canonical.claims, entities: canonical.entities },
      proposals: [{ narrationUnitId: unitId, propositions: [{
        ...control.nativeStructuredProposals[0]!.propositions[0]!,
        participants: { ships: { kind: "claim-concept", label: "ships" }, Britain: { kind: "canonical-entity", canonicalLabel: "Atlantis" } },
      }] }],
    });
    expect(unresolved.envelopes).toHaveLength(0);
    expect(unresolved.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED" })]));
    const invalidSpan = generateNativeStructuredClaimsV36({
      source: { episodeId: FRANKLIN, claims: canonical.claims, entities: canonical.entities },
      proposals: [{ narrationUnitId: unitId, propositions: [{ ...control.nativeStructuredProposals[0]!.propositions[0]!, sourceText: "synthetic coordinates" }] }],
    });
    expect(invalidSpan.envelopes).toHaveLength(0);
    expect(invalidSpan.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "STRUCTURED_CLAIM_SOURCE_SPAN_INVALID" })]));
  });

  it("fingerprints only semantic inputs and persists deterministic cache hits", async () => {
    const control = boundaryControl();
    const canonical = structureTrustedScriptClaimsV34({ episodeId: FRANKLIN, narration: control.narration });
    const input = {
      source: { episodeId: FRANKLIN, claims: canonical.claims, entities: canonical.entities },
      proposals: control.nativeStructuredProposals,
      providerIdentity: null,
      modelIdentity: null,
    };
    const fingerprint = nativeStructuredClaimCacheFingerprintV36(input);
    expect(nativeStructuredClaimCacheFingerprintV36(input)).toBe(fingerprint);
    expect(nativeStructuredClaimCacheFingerprintV36({ ...input, modelIdentity: "offline-model-fixture" })).not.toBe(fingerprint);
    expect(nativeStructuredClaimCacheFingerprintV36({
      ...input,
      source: { ...input.source, claims: input.source.claims.map((claim) => ({ ...claim, normalizedProposition: `${claim.normalizedProposition} changed` })) },
    })).not.toBe(fingerprint);
    expect(nativeStructuredClaimCacheFingerprintV36({
      ...input,
      source: { ...input.source, entities: input.source.entities.map((entity) => ({ ...entity, normalizedLabel: `${entity.normalizedLabel} changed` })) },
    })).not.toBe(fingerprint);
    expect(nativeStructuredClaimCacheFingerprintV36({
      ...input,
      proposals: input.proposals.map((proposal) => ({
        ...proposal,
        propositions: proposal.propositions.map((proposition) => ({ ...proposition, assertionStatus: "attempted" as const })),
      })),
    })).not.toBe(fingerprint);
    expect(nativeStructuredClaimCacheFingerprintV36({ ...input, renderVersion: "unrelated-media-change" } as typeof input)).toBe(fingerprint);

    const temporary = await fs.mkdtemp(path.join(tmpdir(), "history-native-structured-"));
    const file = path.join(temporary, "structured-claims.v36.native.json");
    try {
      const sidecar = createNativeStructuredClaimSidecarV36(input);
      expect(nativeStructuredClaimSidecarSchemaV36.safeParse({ ...sidecar, sidecarVersion: "history-native-structured-claim-sidecar.v1" }).success).toBe(false);
      expect((await persistNativeStructuredClaimSidecarV36({ file, sidecar })).cacheHit).toBe(false);
      expect((await persistNativeStructuredClaimSidecarV36({ file, sidecar })).cacheHit).toBe(true);
      expect(nativeStructuredClaimSidecarSchemaV36.safeParse(JSON.parse(await fs.readFile(file, "utf8"))).success).toBe(true);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });
});

describe("History V3.6 representative native structured fixture experiment", () => {
  const sources = representativeNativeEpisodeFragmentsV36.map(loadRepresentative);
  const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);

  it("reduces insufficient structure across the same eight episodes with every hard invariant at zero", () => {
    expect(experiment.episodeIds).toHaveLength(8);
    expect(experiment.claimsEvaluated).toBe(749);
    expect(experiment.nativeStructuredClaimCount).toBe(21);
    expect(experiment.nativeStructuredPropositionCount).toBe(26);
    expect(experiment.nativeProcessPropositionCount).toBe(2);
    expect(experiment.nativeTemporalPropositionCount).toBe(2);
    expect(experiment.atomicProcessPropositionCount).toBe(2);
    expect(experiment.atomicTemporalPropositionCount).toBe(2);
    expect(experiment.groundingComparison.before.insufficientStructure).toBe(70);
    expect(experiment.groundingComparison.after.insufficientStructure).toBeLessThan(70);
    expect(experiment.groundingComparison.insufficientStructureReduction.absolute).toBeGreaterThan(0);
    expect(experiment.verdict).toBe("PASS");
    expect(Object.values(experiment.invariants)).toEqual(expect.arrayContaining([0]));
    expect(Object.values(experiment.invariants).every((value) => value === 0)).toBe(true);
    expect(experiment.missClassification.unresolvedParticipant).toBe(0);
    expect(experiment.missClassification.nativeStructurePresentAtomicGroundingGap).toBe(0);
    expect(experiment.phase26Comparison).toMatchObject({
      before: { nativeClaims: 17, nativePropositions: 18, insufficientStructure: 61, atomicPropositions: 37, candidates: 45, validatedRelations: 23 },
      after: { nativeClaims: 21, nativePropositions: 26, insufficientStructure: 60, atomicPropositions: 45, candidates: 53, validatedRelations: 31 },
    });
    expect(experiment.phase27Comparison).toMatchObject({
      before: { candidates: 45, validatedRelations: 23, processRelations: 0, temporalSequenceRelations: 0 },
      after: { candidates: 53, validatedRelations: 31, processRelations: 2, temporalSequenceRelations: 2 },
    });
    expect(experiment.missClassification.atomicGroundingPresentCandidateProjectionGap).toBe(8);
    expect(experiment.missClassification.candidateProposedValidatorReject).toBe(0);
    expect(experiment.candidateProjection).toEqual({
      process: { proposed: 2, validatorAccepts: 2, validatorRejects: 0 },
      temporal: { proposed: 2, validatorAccepts: 2, validatorRejects: 0 },
      transforms: { proposed: 1, validatorAccepts: 1, validatorRejects: 0 },
      evidenceSet: { proposed: 2, validatorAccepts: 2, validatorRejects: 0 },
    });
    expect(experiment.relationComparison.after).toMatchObject({ processRelations: 2, temporalSequenceRelations: 2 });
    const blackDeath = experiment.runs.find((run) => run.episodeId.includes("04-black-death"))!;
    expect(blackDeath.native.candidates.find((candidate) => candidate.atomicGroundingIds?.includes("grounding-9b108be90c3ba4812c0c5a57"))).toMatchObject({
      source: "atomic-transforms-causal-projection",
      projectionRuleId: "atomic-transforms-causal-candidate.v1",
      assertionStatus: "asserted",
      semanticParticipantIds: ["concept-b9bb9f54060989981769716c", "concept-e072f8bb28e0ef40dfdbc271"],
      structuredPropositionIds: ["structured-proposition-c94a284dea3fd38027179971"],
      status: "valid",
    });
  });

  it("preserves movement, evidence nesting, assertion scope, and V3.5 false-positive controls", () => {
    const franklin = sources.find((source) => source.shadow.episodeId.includes("franklin-expedition"))!;
    const franklinSidecar = createRepresentativeNativeStructuredSidecarV36(franklin.native);
    const franklinPropositions = franklinSidecar.structuredClaims.envelopes.flatMap((envelope) => envelope.propositions);
    const objective = franklinPropositions.find((proposition) => proposition.predicate === "search-object")!;
    expect(objective.roles.map((role) => role.role)).toContain("objective");
    expect(objective.roles.map((role) => role.role)).not.toContain("destination");
    const graves = franklinPropositions.find((proposition) => proposition.object?.label.includes("John Torrington"))!;
    expect(franklinPropositions.filter((proposition) => proposition.object?.label.includes("John Torrington"))).toHaveLength(1);
    expect(graves.qualifiers?.filter((qualifier) => qualifier.kind === "nested-entity")).toHaveLength(3);
    const franklinEvidence = franklinPropositions.filter((proposition) =>
      proposition.provenance.claimId === "claim-318504248e85a04faa5519d6"
    );
    expect(franklinEvidence.map((proposition) => proposition.object?.label)).toEqual([
      "remains of the expedition’s winter camp from 1845 to 1846",
      "graves of John Torrington, John Hartnell, and William Braine",
    ]);

    const bronze = sources.find((source) => source.shadow.episodeId.includes("bronze-age-collapse"))!;
    const bronzeEvidence = createRepresentativeNativeStructuredSidecarV36(bronze.native).structuredClaims.envelopes
      .find((envelope) => envelope.claimId === "claim-256740d7c97e87c2fd1ff4cd")!.propositions;
    expect(bronzeEvidence.map((proposition) => proposition.object?.label)).toEqual([
      "ships", "warriors", "families", "battle scenes",
    ]);

    const armada = sources.find((source) => source.shadow.episodeId.includes("spanish-armada"))!;
    const armadaPropositions = createRepresentativeNativeStructuredSidecarV36(armada.native).structuredClaims.envelopes.flatMap((envelope) => envelope.propositions);
    expect(armadaPropositions.find((proposition) => proposition.predicate === "moves-from")?.assertionStatus).toBe("asserted");
    expect(armadaPropositions.find((proposition) => proposition.predicate === "moves-through")?.assertionStatus).toBe("intended");

    const ddayRun = experiment.runs.find((run) => run.episodeId.includes("d-day"))!;
    expect(ddayRun.native.extraction.relations.some((relation) => relation.kind === "movement" && JSON.stringify(relation).includes("Pas-de-Calais"))).toBe(false);
    expect(ddayRun.native.extraction.relations.some((relation) => relation.kind === "spatial-comparison" && JSON.stringify(relation).includes("Pas-de-Calais"))).toBe(true);

    const battleRun = experiment.runs.find((run) => run.episodeId.includes("20-1066"))!;
    expect(battleRun.native.extraction.relations.some((relation) => relation.kind === "movement" && relation.to.canonicalLabel === "Pevensey")).toBe(false);
    expect(battleRun.native.extraction.relations.some((relation) => JSON.stringify(relation).includes("King Edward") && JSON.stringify(relation).includes("Europe"))).toBe(false);
    const battleProcess = battleRun.native.grounding.propositions.find((proposition) => proposition.claimId === "claim-6bbe9288262216a338a95084")!;
    expect(battleProcess).toMatchObject({ predicate: "process-sequence", processSteps: [{ stepOrder: 1 }, { stepOrder: 2 }] });
    expect(battleRun.native.candidates.find((candidate) => candidate.claimId === battleProcess.claimId)).toMatchObject({
      source: "atomic-process-projection",
      projectionRuleId: "atomic-process-sequence-candidate.v1",
      atomicGroundingIds: [battleProcess.groundingId],
      structuredPropositionIds: [battleProcess.provenance.structuredPropositionId],
      semanticParticipantIds: battleProcess.processSteps!.map((step) => step.participant.id),
      processGrouping: { treatment: "non-authoritative-grouping-metadata" },
      status: "valid",
    });

    const titanic = sources.find((source) => source.shadow.episodeId.includes("titanic"))!;
    const titanicPropositions = createRepresentativeNativeStructuredSidecarV36(titanic.native).structuredClaims.envelopes.flatMap((envelope) => envelope.propositions);
    expect(titanicPropositions.find((proposition) => proposition.predicate === "causes")?.assertionStatus).toBe("reported");
    expect(titanicPropositions.find((proposition) => proposition.predicate === "precedes")).toMatchObject({
      subject: { label: "the collision" },
      object: { label: "Thomas Andrews inspected the damage" },
    });
    const titanicRun = experiment.runs.find((run) => run.episodeId.includes("titanic"))!;
    const temporalCandidate = titanicRun.native.candidates.find((candidate) => candidate.source === "atomic-temporal-projection")!;
    expect(temporalCandidate).toMatchObject({
      projectionRuleId: "atomic-precedes-temporal-candidate.v1",
      status: "valid",
      assertionStatus: "asserted",
    });
    expect(titanicRun.native.extraction.relations.find((relation) => relation.id === temporalCandidate.semanticRelationId)).toMatchObject({
      kind: "temporal-sequence",
      steps: [{ canonicalLabel: "the collision" }, { canonicalLabel: "Thomas Andrews inspected the damage" }],
    });
  });

  it("keeps every persisted shadow layer schema-valid", () => {
    for (const run of experiment.runs) {
      expect(structuredClaimArtifactSchemaV36.safeParse({
        schemaVersion: run.native.structuredClaims.schemaVersion,
        episodeId: run.episodeId,
        envelopes: run.native.structuredClaims.envelopes,
        diagnostics: run.native.structuredClaims.diagnostics,
      }).success).toBe(true);
      expect(atomicGroundingArtifactSchemaV36.safeParse({ schemaVersion: run.native.grounding.schemaVersion, episodeId: run.episodeId, claims: run.native.grounding.claims }).success).toBe(true);
      expect(run.native.extraction.relations.every((relation) => explanatoryRelationSchemaV36.safeParse(relation).success)).toBe(true);
    }
  });
});
