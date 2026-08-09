import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HISTORY_ATOMIC_GROUNDING_SCHEMA_V36, sourceTextHashV36 } from "./atomic-claim-grounding-v36.js";
import { representativeNativeEpisodeFragmentsV36 } from "./native-structured-claim-fixtures-v36.js";
import { HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36 } from "./native-structured-claim-generator-v36.js";
import { runRepresentativeNativeStructuredClaimExperimentV36 } from "./native-structured-claim-experiment-v36.js";
import {
  buildNativeStructureGapEnrichmentReviewV36,
  phase211BaselineGapsV36,
  phase211FrozenSevenV36,
} from "./native-structure-gap-enrichment-v36.js";
import { HISTORY_STRUCTURED_CLAIM_SCHEMA_V36 } from "./structured-claim-v36.js";

async function loadRepresentative(fragment: string) {
  const entries = await fs.readdir(path.resolve("episodes"), { withFileTypes: true });
  const episodeId = entries.find((entry) => entry.isDirectory() && entry.name.includes(fragment) && !entry.name.endsWith("-v3.4"))?.name;
  if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
  const root = path.resolve("episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "plan.json"), "utf8"));
  return {
    title: String(plan.title ?? episodeId),
    source: {
      shadow: { episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [] },
      native: { episodeId, claims: structured.claims, entities: structured.entities },
    },
  };
}

const loaded = await Promise.all(representativeNativeEpisodeFragmentsV36.map(loadRepresentative));
const sources = loaded.map((item) => item.source);
const experiment = runRepresentativeNativeStructuredClaimExperimentV36(sources);
const titles = new Map(loaded.map((item) => [item.source.shadow.episodeId, item.title]));
const review = buildNativeStructureGapEnrichmentReviewV36({ runs: experiment.runs, episodeTitles: titles });

describe("History V3.6 Phase 2.11 native structure gap enrichment", () => {

  it("reconciles exactly the persisted four gaps and assigns exactly one post-enrichment outcome", () => {
    expect(phase211BaselineGapsV36).toHaveLength(4);
    expect(review.cases.map((item) => item.gapId)).toEqual([
      "candidate-gap-claim-256740d7c97e87c2fd1ff4cd",
      "candidate-gap-claim-318504248e85a04faa5519d6",
      "candidate-gap-claim-6102997fabdd9aa3492eccb4",
      "candidate-gap-claim-a6f0630762f216aee3e63456",
    ]);
    expect(review.outcomeCounts).toEqual({
      DIRECT_PROJECTION_READY: 2,
      STILL_NEEDS_NATIVE_STRUCTURE: 2,
      PARTICIPANT_RESOLUTION_REQUIRED: 0,
      ASSERTION_OR_MODALITY_BLOCK: 0,
      CROSS_CLAIM_PROOF_REQUIRED: 0,
      TAXONOMY_CHANGE_REQUIRED: 0,
      INTENTIONALLY_NON_RELATIONAL: 0,
    });
  });

  it("emits source-explicit Bronze Age evidence members and preserves them directly in atomic grounding", () => {
    const item = review.cases.find((candidate) => candidate.claimId === "claim-256740d7c97e87c2fd1ff4cd")!;
    expect(item.missingCategories).toEqual(["MISSING_GROUPING_STRUCTURE"]);
    expect(item.after.structuredPropositions.map((proposition) => proposition.object?.label)).toEqual([
      "ships", "warriors", "families", "battle scenes",
    ]);
    expect(item.after.atomicGrounding.map((atom) => atom.object?.label).sort()).toEqual([
      "battle scenes", "families", "ships", "warriors",
    ]);
    expect(item.after.atomicGrounding.every((atom) => atom.predicate === "contains-evidence-of" && atom.assertionStatus === "asserted")).toBe(true);
  });

  it("adds only the missing Franklin camp participant and preserves the grouped graves", () => {
    const item = review.cases.find((candidate) => candidate.claimId === "claim-318504248e85a04faa5519d6")!;
    expect(item.missingCategories).toEqual(["MISSING_PARTICIPANT"]);
    expect(item.after.structuredPropositions.map((proposition) => proposition.object?.label)).toEqual([
      "remains of the expedition’s winter camp from 1845 to 1846",
      "graves of John Torrington, John Hartnell, and William Braine",
    ]);
    const graves = item.after.structuredPropositions.find((proposition) => proposition.object?.label.startsWith("graves of"))!;
    expect(graves.qualifiers.filter((qualifier) => qualifier.kind === "nested-entity").map((qualifier) => qualifier.value)).toEqual([
      "John Torrington", "John Hartnell", "William Braine",
    ]);
    expect(item.after.atomicGrounding).toHaveLength(2);
  });

  it("leaves both origin-only movement claims unchanged and never converts objective or intent into destination", () => {
    const franklin = review.cases.find((item) => item.claimId === "claim-6102997fabdd9aa3492eccb4")!;
    const armada = review.cases.find((item) => item.claimId === "claim-a6f0630762f216aee3e63456")!;
    expect(franklin.postEnrichmentClassification).toBe("STILL_NEEDS_NATIVE_STRUCTURE");
    expect(franklin.after.atomicGrounding).toEqual(expect.arrayContaining([
      expect.objectContaining({ predicate: "moves-from", object: expect.objectContaining({ label: "Britain" }), assertionStatus: "asserted" }),
      expect.objectContaining({ predicate: "search-object", object: expect.objectContaining({ label: "Northwest Passage" }), assertionStatus: "intended" }),
    ]));
    expect(franklin.after.structuredPropositions.some((proposition) => proposition.roles.some((role) => role.role === "destination"))).toBe(false);
    expect(armada.after.atomicGrounding).toEqual([
      expect.objectContaining({ predicate: "moves-from", object: expect.objectContaining({ label: "Lisbon" }), assertionStatus: "asserted" }),
    ]);
    expect(armada.after.structuredPropositions.some((proposition) => proposition.roles.some((role) => role.role === "destination"))).toBe(false);
  });

  it("keeps direct structured-to-atomic semantics, exact source spans, hashes, bindings, and native provenance", () => {
    for (const item of review.cases) {
      for (const proposition of item.after.structuredPropositions) {
        expect(proposition.sourceSpan.startUtf16).toBeGreaterThanOrEqual(0);
        expect(proposition.sourceSpan.endUtf16Exclusive).toBeGreaterThan(proposition.sourceSpan.startUtf16);
        expect(proposition.sourceSpan.textHash).toBe(sourceTextHashV36(proposition.sourceSpan.text));
        expect(proposition.sourceSpan).toEqual(item.sourceSpan);
        expect(proposition.provenance.generationMethod).toBe("native-structured-claim-generation");
        expect(proposition.provenance.generatorVersion).toBe(HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36);
        expect(proposition.provenance.participantBindingReferences.length).toBeGreaterThan(0);
        const atom = item.after.atomicGrounding.find((candidate) =>
          candidate.provenance.structuredPropositionId === proposition.propositionId
        )!;
        expect(atom).toMatchObject({
          subject: { id: proposition.subject.id, label: proposition.subject.label, kind: proposition.subject.kind },
          predicate: proposition.predicate,
          assertionStatus: proposition.assertionStatus,
          sourceSpan: proposition.sourceSpan,
          provenance: { sourceKind: "native-structured-proposition" },
        });
        expect(atom.object ?? null).toEqual(proposition.object
          ? { id: proposition.object.id, label: proposition.object.label, kind: proposition.object.kind }
          : null);
      }
    }
  });

  it("retains the exact two Phase 2.11 readiness records as Phase 2.12 projection authority", () => {
    expect(review.readiness).toHaveLength(2);
    expect(review.readiness.every((item) =>
      item.proposedFutureProjectorRuleName === "atomic-contains-evidence-of-evidence-set-candidate.v1"
    )).toBe(true);
    expect(experiment.runs.flatMap((run) => run.native.candidates).filter((candidate) =>
      candidate.projectionRuleId === "atomic-contains-evidence-of-evidence-set-candidate.v1"
    )).toHaveLength(2);
    expect(experiment.relationComparison.after).toMatchObject({
      candidates: 52,
      validatedRelations: 30,
      evidenceSetRelations: experiment.relationComparison.before.evidenceSetRelations + 2,
    });
    expect(experiment.missClassification.atomicGroundingPresentCandidateProjectionGap).toBe(9);
  });

  it("validates exactly the Bronze Age and Franklin same-claim evidence sets with complete lineage", () => {
    const expected = new Map([
      ["claim-256740d7c97e87c2fd1ff4cd", {
        gapId: "candidate-gap-claim-256740d7c97e87c2fd1ff4cd",
        target: "Reliefs at Medinet Habu",
        members: ["battle scenes", "families", "ships", "warriors"],
      }],
      ["claim-318504248e85a04faa5519d6", {
        gapId: "candidate-gap-claim-318504248e85a04faa5519d6",
        target: "search findings",
        members: [
          "graves of John Torrington, John Hartnell, and William Braine",
          "remains of the expedition’s winter camp from 1845 to 1846",
        ],
      }],
    ]);
    const candidates = experiment.runs.flatMap((run) => run.native.candidates.map((candidate) => ({ run, candidate })))
      .filter(({ candidate }) => candidate.source === "atomic-evidence-set-projection");
    expect(candidates).toHaveLength(2);
    for (const { run, candidate } of candidates) {
      const control = expected.get(candidate.claimId)!;
      const readiness = review.cases.find((item) => item.gapId === control.gapId)!;
      const atoms = run.native.grounding.propositions.filter((atom) =>
        candidate.atomicGroundingIds?.includes(atom.groundingId));
      const relation = run.native.extraction.relations.find((item) => item.id === candidate.semanticRelationId);
      expect(candidate).toMatchObject({
        status: "valid",
        supportClaimIds: [candidate.claimId],
        projectionRuleId: "atomic-contains-evidence-of-evidence-set-candidate.v1",
        assertionStatus: "asserted",
        atomicSourceSpans: atoms.map((atom) => atom.sourceSpan),
      });
      expect(candidate.atomicGroundingIds).toEqual(atoms.map((atom) => atom.groundingId).sort());
      expect(candidate.structuredPropositionIds).toEqual(atoms.map((atom) => atom.provenance.structuredPropositionId).sort());
      expect(atoms.every((atom) => atom.claimId === candidate.claimId && atom.sourceSpan.textHash === readiness.sourceSpan.textHash)).toBe(true);
      expect(relation).toMatchObject({
        kind: "evidence-set",
        subject: { canonicalLabel: control.target },
        evidence: expect.arrayContaining(control.members.map((canonicalLabel) => ({ canonicalLabel }))),
      });
      if (!relation || relation.kind !== "evidence-set") throw new Error("expected accepted evidence-set relation");
      expect(relation.evidence.map((member) => member.canonicalLabel).sort()).toEqual(control.members);
    }
  });

  it("freezes the other seven gaps and preserves all same-eight hard controls", () => {
    expect(review.frozenSeven).toEqual(Object.entries(phase211FrozenSevenV36).map(([gapId, classification]) => ({ gapId, classification })).sort((left, right) => left.gapId.localeCompare(right.gapId)));
    expect(experiment.nativeStructuredClaimCount).toBe(21);
    expect(experiment.nativeStructuredPropositionCount).toBe(26);
    expect(experiment.groundingComparison.after.atomicPropositions).toBe(45);
    expect(Object.values(experiment.invariants).every((count) => count === 0)).toBe(true);
    expect(experiment.verdict).toBe("PASS");
    expect(HISTORY_STRUCTURED_CLAIM_SCHEMA_V36).toBe("history-structured-claim.v2");
    expect(HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36).toBe("history-native-structured-claim-generator.v2");
    expect(HISTORY_ATOMIC_GROUNDING_SCHEMA_V36).toBe("history-atomic-claim-grounding.v2");
  });

  it("is deterministic across the exact same-eight input", () => {
    const repeated = runRepresentativeNativeStructuredClaimExperimentV36(sources);
    const second = buildNativeStructureGapEnrichmentReviewV36({ runs: repeated.runs, episodeTitles: titles });
    expect(second.deterministicHash).toBe(review.deterministicHash);
    expect(second.cases).toEqual(review.cases);
  });
});
