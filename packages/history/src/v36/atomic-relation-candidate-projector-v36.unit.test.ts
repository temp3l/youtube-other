import { describe, expect, it } from "vitest";

import {
  atomicConceptIdV36,
  createAtomicPropositionV36,
  sourceTextHashV36,
  type AtomicAssertionStatusV36,
  type AtomicPropositionV36,
} from "./atomic-claim-grounding-v36.js";
import {
  HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE,
  HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE,
  projectAtomicRelationCandidateV36,
} from "./atomic-relation-candidate-projector-v36.js";
import {
  claimIdV36,
  createExplanatoryRelationV36,
  episodeIdV36,
  type ExplanatoryRelationDraftV36,
} from "./explanatory-relation-v36.js";
import { extractShadowRelationCandidatesV36 } from "./explanatory-relation-shadow-extractor-v36.js";

const episodeId = episodeIdV36("phase-28-projection-control");
const structuredPropositionId = "structured-proposition-1234567890abcdef12345678";
const processText = "Wintering was followed by sailing south.";
const temporalText = "The collision happened before the inspection.";

const concept = (label: string) => ({
  id: atomicConceptIdV36(label),
  label,
  kind: "concept" as const,
});

function processAtom(
  claimId = claimIdV36("claim-process-control"),
  assertionStatus: AtomicAssertionStatusV36 = "asserted"
): AtomicPropositionV36 {
  const grouping = concept("synthetic expedition progression");
  const wintering = concept("wintering there");
  const sailing = concept("sailing south");
  return createAtomicPropositionV36({
    episodeId,
    claimId,
    subject: grouping,
    predicate: "process-sequence",
    processSteps: [
      { participant: wintering, stepOrder: 1 },
      { participant: sailing, stepOrder: 2 },
    ],
    assertionStatus,
    sourceSpan: {
      startUtf16: 0,
      endUtf16Exclusive: processText.length,
      text: processText,
      textHash: sourceTextHashV36(processText),
    },
    provenance: {
      sourceKind: "native-structured-proposition",
      groundingRuleId: "explicit-structured-proposition-v1",
      groundingSchemaVersion: "history-atomic-claim-grounding.v2",
      resolvedParticipantIds: [grouping.id, wintering.id, sailing.id],
      structuredPropositionId,
    },
  });
}

function temporalAtom(
  claimId = claimIdV36("claim-temporal-control"),
  assertionStatus: AtomicAssertionStatusV36 = "asserted"
): AtomicPropositionV36 {
  const collision = concept("the collision");
  const inspection = concept("the inspection");
  return createAtomicPropositionV36({
    episodeId,
    claimId,
    subject: collision,
    predicate: "precedes",
    object: inspection,
    assertionStatus,
    sourceSpan: {
      startUtf16: 0,
      endUtf16Exclusive: temporalText.length,
      text: temporalText,
      textHash: sourceTextHashV36(temporalText),
    },
    provenance: {
      sourceKind: "native-structured-proposition",
      groundingRuleId: "explicit-structured-proposition-v1",
      groundingSchemaVersion: "history-atomic-claim-grounding.v2",
      resolvedParticipantIds: [collision.id, inspection.id],
      structuredPropositionId,
    },
  });
}

const serialized = (value: unknown): any => JSON.parse(JSON.stringify(value));

describe("History V3.6 Phase 2.8 atomic relation candidate projection", () => {
  it("projects only ordered process steps and keeps the container non-authoritative", () => {
    const atom = processAtom();
    const projection = projectAtomicRelationCandidateV36(atom);
    expect(projection).toMatchObject({
      status: "projected",
      candidateSource: "atomic-process-projection",
      projectionRuleId: HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE,
      supportClaimIds: [atom.claimId],
      atomicGroundingIds: [atom.groundingId],
      structuredPropositionIds: [structuredPropositionId],
      semanticParticipantIds: atom.processSteps!.map((step) => step.participant.id),
      proposition: {
        kind: "process",
        steps: [{ canonicalLabel: "wintering there" }, { canonicalLabel: "sailing south" }],
      },
      processGrouping: {
        participantId: atom.subject.id,
        treatment: "non-authoritative-grouping-metadata",
      },
    });
    expect(JSON.stringify(projection)).not.toContain('"kind":"causal"');
    expect((projection as any).proposition.steps).not.toContainEqual(expect.objectContaining({ canonicalLabel: atom.subject.label }));
  });

  it("projects precedes only as the same ordered temporal sequence", () => {
    const atom = temporalAtom();
    const projection = projectAtomicRelationCandidateV36(atom);
    expect(projection).toMatchObject({
      status: "projected",
      candidateSource: "atomic-temporal-projection",
      projectionRuleId: HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE,
      assertionStatus: "asserted",
      semanticParticipantIds: [atom.subject.id, atom.object!.id],
      proposition: {
        kind: "temporal-sequence",
        steps: [{ canonicalLabel: atom.subject.label }, { canonicalLabel: atom.object!.label }],
      },
    });
    expect(JSON.stringify(projection)).not.toContain('"kind":"causal"');
  });

  it("fails closed for invalid, unordered, grouping-only, or non-asserted process atoms", () => {
    const valid = serialized(processAtom());
    const single = { ...valid, processSteps: valid.processSteps.slice(0, 1) };
    const duplicateOrder = serialized(valid);
    duplicateOrder.processSteps[1].stepOrder = 1;
    const nonContiguous = serialized(valid);
    nonContiguous.processSteps[1].stepOrder = 3;
    const unorderedListOnly = { ...valid };
    delete unorderedListOnly.processSteps;
    const groupingOnly = { ...valid, processSteps: [] };
    for (const invalid of [single, duplicateOrder, nonContiguous, unorderedListOnly, groupingOnly]) {
      expect(projectAtomicRelationCandidateV36(invalid)).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "ATOMIC_CANDIDATE_STRUCTURE_INVALID" }],
      });
    }
    for (const status of ["intended", "attempted", "uncertain"] as const) {
      expect(projectAtomicRelationCandidateV36(processAtom(undefined, status))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE" }],
      });
    }
  });

  it("fails closed for invalid direction or modality and never uses prose/array order as chronology", () => {
    const valid = serialized(temporalAtom());
    expect(projectAtomicRelationCandidateV36({ ...valid, object: valid.subject })).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_STRUCTURE_INVALID" }],
    });
    const missingDirection = { ...valid };
    delete missingDirection.object;
    expect(projectAtomicRelationCandidateV36(missingDirection)).toMatchObject({ status: "rejected" });
    expect(projectAtomicRelationCandidateV36(temporalAtom(undefined, "uncertain"))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE" }],
    });
    expect(projectAtomicRelationCandidateV36({ ...valid, predicate: "causes" })).toBeUndefined();
    expect([
      projectAtomicRelationCandidateV36({ ...valid, predicate: "located-in" }),
      projectAtomicRelationCandidateV36({ ...valid, predicate: "depends-on" }),
    ]).toEqual([undefined, undefined]);
  });

  it("keeps process and temporal order identity-bearing", () => {
    const process = projectAtomicRelationCandidateV36(processAtom());
    const temporal = projectAtomicRelationCandidateV36(temporalAtom());
    expect(process?.status).toBe("projected");
    expect(temporal?.status).toBe("projected");
    const processDraft = {
      ...(process as any).proposition,
      episodeId,
      supportClaimIds: [claimIdV36("claim-process-control")],
    } as ExplanatoryRelationDraftV36;
    const temporalDraft = {
      ...(temporal as any).proposition,
      episodeId,
      supportClaimIds: [claimIdV36("claim-temporal-control")],
    } as ExplanatoryRelationDraftV36;
    const orderedProcess = createExplanatoryRelationV36(processDraft);
    const reversedProcess = createExplanatoryRelationV36({ ...processDraft, steps: [...(processDraft as any).steps].reverse() } as ExplanatoryRelationDraftV36);
    const orderedTemporal = createExplanatoryRelationV36(temporalDraft);
    const reversedTemporal = createExplanatoryRelationV36({ ...temporalDraft, steps: [...(temporalDraft as any).steps].reverse() } as ExplanatoryRelationDraftV36);
    expect(reversedProcess.id).not.toBe(orderedProcess.id);
    expect(reversedTemporal.id).not.toBe(orderedTemporal.id);
  });

  it("deduplicates equivalent projected semantics and merges evidence deterministically", () => {
    const firstAtom = processAtom(claimIdV36("claim-process-first"));
    const secondAtom = processAtom(claimIdV36("claim-process-second"));
    const first = projectAtomicRelationCandidateV36(firstAtom);
    const second = projectAtomicRelationCandidateV36(secondAtom);
    expect(first?.status).toBe("projected");
    expect(second?.status).toBe("projected");
    const claims = [firstAtom, secondAtom].map((atom, index) => ({
      id: atom.claimId,
      episodeId,
      normalizedProposition: index ? "Second support." : "First support.",
      claimKind: "event",
      groundedPropositions: [(index ? second : first)!.status === "projected" ? (index ? second : first)!.proposition : null].filter(Boolean) as any,
    }));
    const forward = extractShadowRelationCandidatesV36({ episodeId, claims, entities: [] });
    const reverse = extractShadowRelationCandidatesV36({ episodeId, claims: [...claims].reverse(), entities: [] });
    expect(forward.relations).toHaveLength(1);
    expect(forward.relations[0]).toMatchObject({
      kind: "process",
      supportClaimIds: ["claim-process-first", "claim-process-second"],
    });
    expect(reverse.relations).toEqual(forward.relations);
    expect(forward.rejectedCandidates).toEqual([]);
  });
});
