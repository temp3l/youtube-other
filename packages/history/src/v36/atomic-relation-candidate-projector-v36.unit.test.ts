import { describe, expect, it } from "vitest";

import {
  atomicConceptIdV36,
  createAtomicPropositionV36,
  sourceTextHashV36,
  type AtomicAssertionStatusV36,
  type AtomicPropositionV36,
} from "./atomic-claim-grounding-v36.js";
import {
  HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE,
  HISTORY_V36_APPROVED_MODAL_CAUSAL_CANDIDATE_RULE,
  HISTORY_V36_ATOMIC_PROCESS_CANDIDATE_RULE,
  HISTORY_V36_ATOMIC_TEMPORAL_CANDIDATE_RULE,
  HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
  projectAtomicEvidenceSetCandidateV36,
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
const transformsText = "The shock transformed labor value.";
const modalCausalText = "The cause could have an effect.";

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

function transformsAtom(
  claimId = claimIdV36("claim-transforms-control"),
  assertionStatus: AtomicAssertionStatusV36 = "asserted",
  resolvedParticipantIds?: readonly string[]
): AtomicPropositionV36 {
  const cause = concept("the silence left by the dead");
  const effect = concept("labor value");
  return createAtomicPropositionV36({
    episodeId,
    claimId,
    subject: cause,
    predicate: "transforms",
    object: effect,
    assertionStatus,
    sourceSpan: {
      startUtf16: 0,
      endUtf16Exclusive: transformsText.length,
      text: transformsText,
      textHash: sourceTextHashV36(transformsText),
    },
    provenance: {
      sourceKind: "native-structured-proposition",
      groundingRuleId: "explicit-structured-proposition-v1",
      groundingSchemaVersion: "history-atomic-claim-grounding.v2",
      resolvedParticipantIds: resolvedParticipantIds ?? [cause.id, effect.id],
      structuredPropositionId,
    },
  });
}

function approvedModalCausalAtom(
  claimId: ReturnType<typeof claimIdV36>,
  predicate: "causes" | "contributes-to",
  assertionStatus: "uncertain" | "reported"
): AtomicPropositionV36 {
  const cause = concept("modal cause");
  const effect = concept("modal effect");
  return createAtomicPropositionV36({
    episodeId,
    claimId,
    subject: cause,
    predicate,
    object: effect,
    assertionStatus,
    sourceSpan: { startUtf16: 0, endUtf16Exclusive: modalCausalText.length, text: modalCausalText, textHash: sourceTextHashV36(modalCausalText) },
    provenance: { sourceKind: "native-structured-proposition", groundingRuleId: "explicit-structured-proposition-v1", groundingSchemaVersion: "history-atomic-claim-grounding.v2", resolvedParticipantIds: [cause.id, effect.id], structuredPropositionId },
  });
}

const evidenceText = "The record contains evidence item alpha and evidence item beta.";
const evidenceTarget = concept("the historical assertion");

function evidenceAtom(
  memberLabel: string,
  overrides: {
    readonly episodeId?: ReturnType<typeof episodeIdV36>;
    readonly claimId?: ReturnType<typeof claimIdV36>;
    readonly target?: ReturnType<typeof concept>;
    readonly assertionStatus?: AtomicAssertionStatusV36;
    readonly sourceText?: string;
    readonly sourceStart?: number;
    readonly sourceKind?: "native-structured-proposition" | "compatibility-structured-proposition";
    readonly resolvedParticipantIds?: readonly string[];
    readonly qualifiers?: AtomicPropositionV36["qualifiers"];
  } = {}
): AtomicPropositionV36 {
  const member = concept(memberLabel);
  const target = overrides.target ?? evidenceTarget;
  const sourceText = overrides.sourceText ?? evidenceText;
  const sourceStart = overrides.sourceStart ?? 0;
  return createAtomicPropositionV36({
    episodeId: overrides.episodeId ?? episodeId,
    claimId: overrides.claimId ?? claimIdV36("claim-evidence-control"),
    subject: target,
    predicate: "contains-evidence-of",
    object: member,
    ...(overrides.qualifiers ? { qualifiers: overrides.qualifiers } : {}),
    assertionStatus: overrides.assertionStatus ?? "asserted",
    sourceSpan: {
      startUtf16: sourceStart,
      endUtf16Exclusive: sourceStart + sourceText.length,
      text: sourceText,
      textHash: sourceTextHashV36(sourceText),
    },
    provenance: {
      sourceKind: overrides.sourceKind ?? "native-structured-proposition",
      groundingRuleId: "explicit-structured-proposition-v1",
      groundingSchemaVersion: "history-atomic-claim-grounding.v2",
      resolvedParticipantIds: overrides.resolvedParticipantIds ?? [target.id, member.id],
      structuredPropositionId: `structured-proposition-${String(member.id).replace("concept-", "")}`,
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

  it("projects the approved asserted transforms atom directly and preserves causal direction and lineage", () => {
    const atom = transformsAtom();
    const projection = projectAtomicRelationCandidateV36(atom);
    expect(projection).toMatchObject({
      status: "projected",
      candidateSource: "atomic-transforms-causal-projection",
      projectionRuleId: HISTORY_V36_ATOMIC_TRANSFORMS_CAUSAL_CANDIDATE_RULE,
      supportClaimIds: [atom.claimId],
      atomicGroundingIds: [atom.groundingId],
      structuredPropositionIds: [structuredPropositionId],
      assertionStatus: "asserted",
      sourceSpan: atom.sourceSpan,
      semanticParticipantIds: [atom.subject.id, atom.object!.id],
      proposition: {
        kind: "causal",
        cause: { canonicalLabel: atom.subject.label },
        effect: { canonicalLabel: atom.object!.label },
      },
    });
    expect((projection as any).proposition.cause.canonicalLabel).toBe(atom.subject.label);
    expect((projection as any).proposition.effect.canonicalLabel).toBe(atom.object!.label);
  });

  it("fails closed for non-asserted, same-participant, unresolved, and non-transforms atoms", () => {
    for (const status of ["uncertain", "intended", "attempted", "counterfactual", "reported"] as const) {
      expect(projectAtomicRelationCandidateV36(transformsAtom(undefined, status))).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE" }],
      });
    }
    const valid = serialized(transformsAtom());
    expect(projectAtomicRelationCandidateV36({ ...valid, object: valid.subject })).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED" }],
    });
    expect(projectAtomicRelationCandidateV36(transformsAtom(undefined, "asserted", [transformsAtom().subject.id]))).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED" }],
    });
    expect(projectAtomicRelationCandidateV36({ ...valid, predicate: "causes" })).toBeUndefined();
    expect(projectAtomicRelationCandidateV36({
      ...valid,
      provenance: { ...valid.provenance, sourceKind: "compatibility-structured-proposition" },
    })).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_SOURCE_LINEAGE_UNSUPPORTED" }],
    });
  });

  it("admits only the two reviewed modal causal atom contracts without status promotion", () => {
    const uncertain = approvedModalCausalAtom(claimIdV36("claim-d97c2dd1d2ef4a18aeb04406"), "contributes-to", "uncertain");
    const reported = approvedModalCausalAtom(claimIdV36("claim-db26077e95258cfa59dfab83"), "causes", "reported");
    for (const atom of [uncertain, reported]) {
      expect(projectAtomicRelationCandidateV36(atom)).toMatchObject({
        status: "projected",
        candidateSource: "atomic-approved-modal-causal-projection",
        projectionRuleId: HISTORY_V36_APPROVED_MODAL_CAUSAL_CANDIDATE_RULE,
        assertionStatus: atom.assertionStatus,
        proposition: { kind: "causal", causalAssertionStatus: atom.assertionStatus },
      });
    }
    expect(projectAtomicRelationCandidateV36({ ...serialized(uncertain), claimId: "claim-not-reviewed" })).toBeUndefined();
    expect(projectAtomicRelationCandidateV36({ ...serialized(reported), assertionStatus: "asserted" })).toBeUndefined();
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

  it("deduplicates equivalent transforms causal candidates while retaining deterministic evidence", () => {
    const firstAtom = transformsAtom(claimIdV36("claim-transforms-first"));
    const secondAtom = transformsAtom(claimIdV36("claim-transforms-second"));
    const first = projectAtomicRelationCandidateV36(firstAtom);
    const second = projectAtomicRelationCandidateV36(secondAtom);
    expect(first?.status).toBe("projected");
    expect(second?.status).toBe("projected");
    const claims = [firstAtom, secondAtom].map((atom, index) => ({
      id: atom.claimId,
      episodeId,
      normalizedProposition: index ? "Second transformation." : "First transformation.",
      claimKind: "event",
      groundedPropositions: [(index ? second : first)!.status === "projected" ? (index ? second : first)!.proposition : null].filter(Boolean) as any,
    }));
    const forward = extractShadowRelationCandidatesV36({ episodeId, claims, entities: [] });
    const reverse = extractShadowRelationCandidatesV36({ episodeId, claims: [...claims].reverse(), entities: [] });
    expect(forward.relations).toMatchObject([{
      kind: "causal",
      supportClaimIds: ["claim-transforms-first", "claim-transforms-second"],
    }]);
    expect(reverse.relations).toEqual(forward.relations);
  });
});

describe("History V3.6 Phase 2.12 same-claim evidence-set candidate projection", () => {
  it("projects one canonical unordered evidence set with complete deterministic lineage", () => {
    const alpha = evidenceAtom("evidence item alpha");
    const beta = evidenceAtom("evidence item beta");
    const projection = projectAtomicEvidenceSetCandidateV36([beta, alpha]);
    expect(projection).toMatchObject({
      status: "projected",
      candidateSource: "atomic-evidence-set-projection",
      projectionRuleId: HISTORY_V36_ATOMIC_EVIDENCE_SET_CANDIDATE_RULE,
      episodeId,
      supportClaimIds: [alpha.claimId],
      atomicGroundingIds: [alpha.groundingId, beta.groundingId].sort(),
      structuredPropositionIds: [
        alpha.provenance.structuredPropositionId,
        beta.provenance.structuredPropositionId,
      ].sort(),
      assertionStatus: "asserted",
      sourceSpan: alpha.sourceSpan,
      semanticParticipantIds: [evidenceTarget.id, ...[alpha.object!.id, beta.object!.id].sort()],
      proposition: {
        kind: "evidence-set",
        subject: { canonicalLabel: evidenceTarget.label },
      },
    });
    if (projection?.status !== "projected") throw new Error("expected evidence-set projection");
    const relation = createExplanatoryRelationV36({
      episodeId,
      supportClaimIds: [alpha.claimId],
      ...projection.proposition,
    });
    expect(relation.kind).toBe("evidence-set");
    expect(projectAtomicEvidenceSetCandidateV36([alpha, beta])).toEqual(projection);
  });

  it("rejects singleton and duplicate-only member inputs after canonical collapse", () => {
    const alpha = evidenceAtom("evidence item alpha");
    expect(projectAtomicEvidenceSetCandidateV36([alpha])).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_INSUFFICIENT_CARDINALITY" }],
    });
    expect(projectAtomicEvidenceSetCandidateV36([alpha, alpha])).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_INSUFFICIENT_CARDINALITY" }],
    });
  });

  it("rejects mixed claim, episode, exact span, hash, and target boundaries", () => {
    const alpha = evidenceAtom("evidence item alpha");
    const cases = [
      evidenceAtom("evidence item beta", { claimId: claimIdV36("claim-other") }),
      evidenceAtom("evidence item beta", { episodeId: episodeIdV36("episode-other") }),
      evidenceAtom("evidence item beta", { sourceStart: 1 }),
      evidenceAtom("evidence item beta", { sourceText: "The record contains evidence item alpha or evidence item beta. " }),
      evidenceAtom("evidence item beta", { target: concept("a different historical assertion") }),
    ];
    for (const second of cases) {
      expect(projectAtomicEvidenceSetCandidateV36([alpha, second])).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "ATOMIC_CANDIDATE_GROUP_BOUNDARY_MISMATCH" }],
      });
    }
  });

  it("hard-rejects cross-claim composition even in the same episode with the same target", () => {
    const first = evidenceAtom("evidence item alpha", { claimId: claimIdV36("claim-one") });
    const second = evidenceAtom("evidence item beta", { claimId: claimIdV36("claim-two") });
    expect(first.episodeId).toBe(second.episodeId);
    expect(first.subject.id).toBe(second.subject.id);
    expect(projectAtomicEvidenceSetCandidateV36([first, second])).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_GROUP_BOUNDARY_MISMATCH" }],
    });
  });

  it("rejects every non-asserted status and compatibility lineage", () => {
    const alpha = evidenceAtom("evidence item alpha");
    for (const assertionStatus of ["uncertain", "intended", "attempted", "counterfactual", "reported"] as const) {
      expect(projectAtomicEvidenceSetCandidateV36([
        alpha,
        evidenceAtom("evidence item beta", { assertionStatus }),
      ])).toMatchObject({
        status: "rejected",
        diagnostics: [{ code: "ATOMIC_CANDIDATE_ASSERTION_UNREPRESENTABLE" }],
      });
    }
    expect(projectAtomicEvidenceSetCandidateV36([
      alpha,
      evidenceAtom("evidence item beta", { sourceKind: "compatibility-structured-proposition" }),
    ])).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_SOURCE_LINEAGE_UNSUPPORTED" }],
    });
  });

  it("rejects unresolved targets, unresolved members, and target-as-member", () => {
    const alpha = evidenceAtom("evidence item alpha");
    const beta = evidenceAtom("evidence item beta");
    expect(projectAtomicEvidenceSetCandidateV36([
      alpha,
      evidenceAtom("evidence item beta", { resolvedParticipantIds: [beta.object!.id] }),
    ])).toMatchObject({ status: "rejected", diagnostics: [{ code: "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED" }] });
    expect(projectAtomicEvidenceSetCandidateV36([
      alpha,
      evidenceAtom("evidence item beta", { resolvedParticipantIds: [evidenceTarget.id] }),
    ])).toMatchObject({ status: "rejected", diagnostics: [{ code: "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED" }] });
    const targetAsMember = serialized(beta);
    targetAsMember.object = targetAsMember.subject;
    targetAsMember.provenance.resolvedParticipantIds = [targetAsMember.subject.id];
    expect(projectAtomicEvidenceSetCandidateV36([alpha, targetAsMember])).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_PARTICIPANT_UNRESOLVED" }],
    });
  });

  it("never counts synthetic grouping metadata as evidence", () => {
    const alpha = evidenceAtom("evidence item alpha", {
      qualifiers: [{ kind: "grouped-concept", value: "synthetic evidence grouping" }],
    });
    const duplicate = evidenceAtom("evidence item alpha", {
      qualifiers: [{ kind: "grouped-concept", value: "another synthetic label" }],
    });
    expect(projectAtomicEvidenceSetCandidateV36([alpha, duplicate])).toMatchObject({
      status: "rejected",
      diagnostics: [{ code: "ATOMIC_CANDIDATE_INSUFFICIENT_CARDINALITY" }],
    });
  });

  it("preserves Franklin graves as one grouped evidence member", () => {
    const camp = evidenceAtom("remains of the expedition’s winter camp from 1845 to 1846");
    const graves = evidenceAtom("graves of John Torrington, John Hartnell, and William Braine", {
      qualifiers: [
        { kind: "grouped-concept", value: "graves of three sailors" },
        { kind: "nested-entity", value: "John Torrington" },
        { kind: "nested-entity", value: "John Hartnell" },
        { kind: "nested-entity", value: "William Braine" },
      ],
    });
    const projection = projectAtomicEvidenceSetCandidateV36([camp, graves]);
    expect(projection).toMatchObject({ status: "projected", proposition: { kind: "evidence-set" } });
    if (projection?.status !== "projected" || projection.proposition.kind !== "evidence-set") {
      throw new Error("expected grouped Franklin evidence set");
    }
    expect(projection.proposition.evidence.map((member) => member.canonicalLabel)).toContain(
      "graves of John Torrington, John Hartnell, and William Braine"
    );
    expect(projection.proposition.evidence.map((member) => member.canonicalLabel)).not.toEqual(expect.arrayContaining([
      "John Torrington", "John Hartnell", "William Braine",
    ]));
  });

  it("keeps unordered member input deterministic and changes identity only for a different set", () => {
    const alpha = evidenceAtom("evidence item alpha");
    const beta = evidenceAtom("evidence item beta");
    const gamma = evidenceAtom("evidence item gamma");
    const first = projectAtomicEvidenceSetCandidateV36([alpha, beta]);
    const reversed = projectAtomicEvidenceSetCandidateV36([beta, alpha]);
    const changed = projectAtomicEvidenceSetCandidateV36([alpha, gamma]);
    if (first?.status !== "projected" || reversed?.status !== "projected" || changed?.status !== "projected") {
      throw new Error("expected evidence-set projections");
    }
    const relation = (projection: typeof first) => createExplanatoryRelationV36({
      episodeId,
      supportClaimIds: [claimIdV36("claim-evidence-control")],
      ...projection.proposition,
    });
    expect(first).toEqual(reversed);
    expect(relation(first).id).toBe(relation(reversed).id);
    expect(relation(first).id).not.toBe(relation(changed).id);
  });
});
