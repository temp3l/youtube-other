import { describe, expect, it } from "vitest";

import {
  atomicGroundingArtifactSchemaV36,
  atomicPropositionSchemaV36,
} from "./atomic-claim-grounding-v36.js";
import {
  groundAtomicClaimsV36,
  type AtomicGroundingSourceV36,
} from "./atomic-claim-grounder-v36.js";
import { createNativeStructuredClaimEnvelopeV36 } from "./structured-claim-enricher-v36.js";
import {
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  createStructuredPropositionV36,
  structuredClaimArtifactSchemaV36,
  structuredPropositionSchemaV36,
  structuredSourceTextHashV36,
  type StructuredAssertionStatusV36,
  type StructuredParticipantV36,
  type StructuredPropositionV36,
} from "./structured-claim-v36.js";

const episodeId = "episode-process-temporal-control";
const processClaimId = "claim-process-control";
const temporalClaimId = "claim-temporal-control";
const processText = "First the intake opened, then the chamber vented.";
const temporalText = "The collision happened before the inspection.";

function participant(id: string, label: string): StructuredParticipantV36 {
  return {
    id,
    label,
    kind: "concept",
    binding: { kind: "claim-concept", referenceId: id },
  };
}

const process = participant("concept-process", "test procedure");
const intake = participant("concept-intake", "the intake opened");
const venting = participant("concept-venting", "the chamber vented");
const collision = participant("concept-collision", "the collision");
const inspection = participant("concept-inspection", "the inspection");

function provenance() {
  return {
    structuredSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    episodeId: episodeId as never,
    claimId: processClaimId as never,
    generationMethod: "native-structured-claim-generation" as const,
    generatorVersion: "history-native-structured-claim-generator.v2",
    participantBindingReferences: [process.id, intake.id, venting.id],
  };
}

function processProposition(assertionStatus: StructuredAssertionStatusV36 = "asserted"): StructuredPropositionV36 {
  return createStructuredPropositionV36({
    subject: process,
    predicate: "process-sequence",
    roles: [
      { role: "process", participant: process },
      { role: "step", participant: intake },
      { role: "step", participant: venting },
    ],
    processSteps: [
      { participant: intake, stepOrder: 1 },
      { participant: venting, stepOrder: 2 },
    ],
    assertionStatus,
    sourceSpan: {
      startUtf16: 0,
      endUtf16Exclusive: processText.length,
      text: processText,
      textHash: structuredSourceTextHashV36(processText),
    },
    provenance: provenance(),
  });
}

function temporalProposition(assertionStatus: StructuredAssertionStatusV36 = "asserted"): StructuredPropositionV36 {
  return createStructuredPropositionV36({
    subject: collision,
    predicate: "precedes",
    object: inspection,
    roles: [
      { role: "before", participant: collision },
      { role: "after", participant: inspection },
    ],
    assertionStatus,
    qualifiers: [{ kind: "time-anchor", value: "before" }],
    sourceSpan: {
      startUtf16: processText.length + 1,
      endUtf16Exclusive: processText.length + 1 + temporalText.length,
      text: temporalText,
      textHash: structuredSourceTextHashV36(temporalText),
    },
    provenance: {
      ...provenance(),
      claimId: temporalClaimId as never,
      participantBindingReferences: [collision.id, inspection.id],
    },
  });
}

function serialized(proposition: StructuredPropositionV36): any {
  return JSON.parse(JSON.stringify(proposition));
}

describe("History V3.6 native process structured schema", () => {
  it("accepts a valid ordered process and rejects single, duplicate, invalid, or unknown process structure", () => {
    const valid = processProposition();
    expect(structuredPropositionSchemaV36.safeParse(valid).success).toBe(true);

    const single = serialized(valid);
    single.roles = single.roles.filter((role: any) => role.participant.id !== venting.id);
    single.processSteps = single.processSteps.slice(0, 1);
    expect(structuredPropositionSchemaV36.safeParse(single).success).toBe(false);

    const duplicateOrder = serialized(valid);
    duplicateOrder.processSteps[1].stepOrder = 1;
    expect(structuredPropositionSchemaV36.safeParse(duplicateOrder).success).toBe(false);

    const invalidOrder = serialized(valid);
    invalidOrder.processSteps[1].stepOrder = 3;
    expect(structuredPropositionSchemaV36.safeParse(invalidOrder).success).toBe(false);

    const unknownRole = serialized(valid);
    unknownRole.roles[1].role = "phase-ish";
    expect(structuredPropositionSchemaV36.safeParse(unknownRole).success).toBe(false);
  });

  it("rejects missing provenance span, invalid participants, and unknown assertion status", () => {
    const valid = processProposition();
    const missingSpan = serialized(valid);
    delete missingSpan.sourceSpan;
    expect(structuredPropositionSchemaV36.safeParse(missingSpan).success).toBe(false);

    const invalidParticipant = serialized(valid);
    delete invalidParticipant.processSteps[0].participant.binding.referenceId;
    expect(structuredPropositionSchemaV36.safeParse(invalidParticipant).success).toBe(false);

    const unknownAssertion = serialized(valid);
    unknownAssertion.assertionStatus = "completed";
    expect(structuredPropositionSchemaV36.safeParse(unknownAssertion).success).toBe(false);
  });
});

describe("History V3.6 native temporal structured schema", () => {
  it("accepts claim-local before/after direction and rejects invalid temporal representations", () => {
    const valid = temporalProposition();
    expect(structuredPropositionSchemaV36.safeParse(valid).success).toBe(true);

    const sameEvent = serialized(valid);
    sameEvent.object = sameEvent.subject;
    sameEvent.roles[1].participant = sameEvent.subject;
    expect(structuredPropositionSchemaV36.safeParse(sameEvent).success).toBe(false);

    const missingEvent = serialized(valid);
    delete missingEvent.object;
    expect(structuredPropositionSchemaV36.safeParse(missingEvent).success).toBe(false);

    const unknownPredicate = serialized(valid);
    unknownPredicate.predicate = "happens-sometime";
    expect(structuredPropositionSchemaV36.safeParse(unknownPredicate).success).toBe(false);

    const reversedRoles = serialized(valid);
    reversedRoles.roles.reverse();
    reversedRoles.roles[0].role = "before";
    reversedRoles.roles[1].role = "after";
    expect(structuredPropositionSchemaV36.safeParse(reversedRoles).success).toBe(false);

    const processOrderOnTemporal = serialized(valid);
    processOrderOnTemporal.processSteps = [{ participant: collision, stepOrder: 1 }, { participant: inspection, stepOrder: 2 }];
    expect(structuredPropositionSchemaV36.safeParse(processOrderOnTemporal).success).toBe(false);
  });
});

describe("History V3.6 process/temporal identity and atomic projection", () => {
  it("makes semantic step order and temporal direction identity-bearing while canonicalizing array order", () => {
    const validProcess = processProposition();
    const arrayReordered = createStructuredPropositionV36({
      ...validProcess,
      propositionId: undefined,
      processSteps: [...validProcess.processSteps!].reverse(),
    } as never);
    expect(arrayReordered.propositionId).toBe(validProcess.propositionId);

    const semanticOrderChanged = createStructuredPropositionV36({
      ...validProcess,
      propositionId: undefined,
      processSteps: validProcess.processSteps!.map((step) => ({ ...step, stepOrder: step.stepOrder === 1 ? 2 : 1 })),
    } as never);
    expect(semanticOrderChanged.propositionId).not.toBe(validProcess.propositionId);

    const validTemporal = temporalProposition();
    const reversedTemporal = createStructuredPropositionV36({
      ...validTemporal,
      propositionId: undefined,
      subject: validTemporal.object!,
      object: validTemporal.subject,
      roles: [
        { role: "before", participant: validTemporal.object! },
        { role: "after", participant: validTemporal.subject },
      ],
    } as never);
    expect(reversedTemporal.propositionId).not.toBe(validTemporal.propositionId);
    expect(processProposition("intended").propositionId).not.toBe(validProcess.propositionId);
    const differentClaimAuthority = createStructuredPropositionV36({
      ...validProcess,
      propositionId: undefined,
      provenance: { ...validProcess.provenance, claimId: "claim-different-authority" as never },
    } as never);
    expect(differentClaimAuthority.propositionId).not.toBe(validProcess.propositionId);
  });

  it("projects process and temporal semantics directly with order, direction, modality, and lineage intact", () => {
    const nativeProcess = processProposition("intended");
    const nativeTemporal = temporalProposition("attempted");
    const processEnvelope = createNativeStructuredClaimEnvelopeV36({
      episodeId,
      claimId: processClaimId,
      canonicalClaimSchemaVersion: "history-claim.v3.4",
      propositions: [nativeProcess],
    });
    const temporalEnvelope = createNativeStructuredClaimEnvelopeV36({
      episodeId,
      claimId: temporalClaimId,
      canonicalClaimSchemaVersion: "history-claim.v3.4",
      propositions: [nativeTemporal],
    });
    const source: AtomicGroundingSourceV36 = {
      episodeId,
      claims: [
        {
          id: processClaimId,
          episodeId,
          normalizedProposition: processText,
          claimKind: "event",
          entityMentionIds: [],
          narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: processText.length }],
        },
        {
          id: temporalClaimId,
          episodeId,
          normalizedProposition: temporalText,
          claimKind: "event",
          entityMentionIds: [],
          narrationSpans: [{ startUtf16: processText.length + 1, endUtf16Exclusive: processText.length + 1 + temporalText.length }],
        },
      ],
      entities: [],
      structuredClaimEnvelopes: [processEnvelope, temporalEnvelope],
    };
    const result = groundAtomicClaimsV36(source);
    const atomicProcess = result.propositions.find((proposition) => proposition.predicate === "process-sequence")!;
    const atomicTemporal = result.propositions.find((proposition) => proposition.predicate === "precedes")!;

    expect(atomicProcess.processSteps?.map((step) => [step.participant.id, step.stepOrder])).toEqual([
      [intake.id, 1],
      [venting.id, 2],
    ]);
    expect(atomicProcess).toMatchObject({
      assertionStatus: "intended",
      sourceSpan: nativeProcess.sourceSpan,
      provenance: { structuredPropositionId: nativeProcess.propositionId, sourceKind: "native-structured-proposition" },
    });
    expect(atomicTemporal).toMatchObject({
      subject: { id: collision.id },
      object: { id: inspection.id },
      assertionStatus: "attempted",
      sourceSpan: nativeTemporal.sourceSpan,
      qualifiers: [{ kind: "time-anchor", value: "before" }],
      provenance: { structuredPropositionId: nativeTemporal.propositionId },
    });
    expect(atomicGroundingArtifactSchemaV36.safeParse({ schemaVersion: result.schemaVersion, episodeId, claims: result.claims }).success).toBe(true);
  });

  it("rejects invalid atomic process/temporal shapes and never infers them from prose", () => {
    const nativeProcess = processProposition();
    const envelope = createNativeStructuredClaimEnvelopeV36({
      episodeId,
      claimId: processClaimId,
      canonicalClaimSchemaVersion: "history-claim.v3.4",
      propositions: [nativeProcess],
    });
    const projected = groundAtomicClaimsV36({
      episodeId,
      claims: [{ id: processClaimId, episodeId, normalizedProposition: processText, claimKind: "event", entityMentionIds: [], narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: processText.length }] }],
      entities: [],
      structuredClaimEnvelopes: [envelope],
    }).propositions[0]!;
    const singleStep = JSON.parse(JSON.stringify(projected));
    singleStep.processSteps = singleStep.processSteps.slice(0, 1);
    expect(atomicPropositionSchemaV36.safeParse(singleStep).success).toBe(false);
    const selfTemporal = { ...JSON.parse(JSON.stringify(projected)), predicate: "precedes", object: projected.subject, processSteps: undefined };
    expect(atomicPropositionSchemaV36.safeParse(selfTemporal).success).toBe(false);

    const proseOnly = groundAtomicClaimsV36({
      episodeId,
      claims: [{ id: processClaimId, episodeId, normalizedProposition: processText, claimKind: "event", entityMentionIds: [], narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: processText.length }] }],
      entities: [],
    });
    expect(proseOnly.propositions.some((proposition) => proposition.predicate === "process-sequence" || proposition.predicate === "precedes")).toBe(false);
  });

  it("keeps the full artifact backward compatible with pre-process proposition families", () => {
    const processEnvelope = createNativeStructuredClaimEnvelopeV36({
      episodeId,
      claimId: processClaimId,
      canonicalClaimSchemaVersion: "history-claim.v3.4",
      propositions: [processProposition()],
    });
    expect(structuredClaimArtifactSchemaV36.safeParse({
      schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
      episodeId,
      envelopes: [processEnvelope],
      diagnostics: [],
    }).success).toBe(true);
  });
});
