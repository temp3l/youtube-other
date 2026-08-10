import { describe, expect, it } from "vitest";

import {
  atomicConceptIdV36,
  createAtomicPropositionV36,
  HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
} from "./atomic-claim-grounding-v36.js";
import {
  eventLocationSubjectEligibilityV36,
  eventLocationSubjectTypeV36,
} from "./event-location-eligibility-v36.js";
import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
  explanatoryRelationSchemaV36,
  type ExplanatoryRelationDraftV36,
  type ExplanatoryRelationV36,
} from "./explanatory-relation-v36.js";
import { explanatoryRelationValidatorV36 } from "./explanatory-relation-validator-v36.js";

const episodeId = episodeIdV36("history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion");
const claimId = claimIdV36("claim-7552fcb5134857307769fa18");
const event = { canonicalLabel: "main invasion", eventType: "event" as const };
const location = { entityId: entityIdV36("entity-4361e741ab5cf8f9151d8ca9"), canonicalLabel: "Calais" };
const draft: ExplanatoryRelationDraftV36 = {
  episodeId,
  kind: "event-location",
  event,
  location,
  assertionStatus: "intended",
  supportClaimIds: [claimId],
};

const context = {
  episodeId,
  entities: [{ id: location.entityId, canonicalLabel: "Calais", kind: "place" as const, atomic: true }],
  claims: [{
    id: claimId,
    episodeId,
    normalizedProposition: "Approved D-Day event-location control.",
    claimKind: "event",
    groundedPropositions: [{ kind: "event-location" as const, event, location, assertionStatus: "intended" as const }],
  }],
};

describe("History V3.6 Phase 2.20 event-location contract", () => {
  it("accepts the directed, explicitly intended D-Day semantic shape", () => {
    const relation = createExplanatoryRelationV36(draft);
    expect(explanatoryRelationSchemaV36.safeParse(relation).success).toBe(true);
    expect(explanatoryRelationValidatorV36.validate(relation, context)).toEqual({ status: "valid" });
    expect(relation).toMatchObject({ kind: "event-location", event, location, assertionStatus: "intended" });
  });

  it("makes modality and direction semantic without changing evidence identity", () => {
    const intended = createExplanatoryRelationV36(draft);
    const asserted = createExplanatoryRelationV36({ ...draft, assertionStatus: "asserted" });
    const reversed = createExplanatoryRelationV36({
      ...draft,
      event: { canonicalLabel: "Calais", entityId: location.entityId, eventType: "event" },
      location: { entityId: entityIdV36("entity-main-invasion"), canonicalLabel: "main invasion" },
    });
    expect(intended.id).not.toBe(asserted.id);
    expect(intended.evidenceFingerprint).toBe(asserted.evidenceFingerprint);
    expect(explanatoryRelationValidatorV36.validate(asserted, context)).toMatchObject({
      status: "invalid",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "RELATION_MODALITY_UNSUPPORTED" })]),
    });
    expect(explanatoryRelationValidatorV36.validate(reversed, context).status).toBe("invalid");
  });

  it("fails closed for missing event eligibility, unresolved locations, and wrong kinds", () => {
    const relation = createExplanatoryRelationV36(draft);
    const ineligible = { ...relation, event: { canonicalLabel: "an army" } } as unknown as ExplanatoryRelationV36;
    expect(explanatoryRelationSchemaV36.safeParse(ineligible).success).toBe(false);
    expect(explanatoryRelationValidatorV36.validate(ineligible, context)).toMatchObject({
      status: "invalid",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "RELATION_EVENT_SUBJECT_INELIGIBLE" })]),
    });
    const unresolved = createExplanatoryRelationV36({ ...draft, location: { entityId: entityIdV36("entity-unresolved"), canonicalLabel: "Nowhere" } });
    expect(explanatoryRelationValidatorV36.validate(unresolved, context)).toMatchObject({
      status: "invalid",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "RELATION_PARTICIPANT_UNRESOLVED" })]),
    });
    for (const kind of ["movement", "spatial-comparison", "causal"] as const) {
      const grounded = context.claims[0]!.groundedPropositions[0];
      expect(grounded.kind).not.toBe(kind);
    }
  });

  it("records typed eligibility only for the exact approved native lineage", () => {
    const eligibility = eventLocationSubjectEligibilityV36;
    const atom = createAtomicPropositionV36({
      episodeId,
      claimId,
      subject: { id: atomicConceptIdV36("main invasion"), label: "main invasion", kind: "concept" },
      predicate: "located-in",
      object: { id: entityIdV36("entity-4361e741ab5cf8f9151d8ca9"), label: "Calais", kind: "place" },
      assertionStatus: "intended",
      sourceSpan: {
        startUtf16: 1920,
        endUtf16Exclusive: 2025,
        text: "A vast deception operation attempted to convince Germany that the main invasion would strike near Calais.",
        textHash: eligibility.sourceTextHash,
      },
      provenance: {
        sourceKind: "native-structured-proposition",
        groundingRuleId: "explicit-structured-proposition-v1",
        groundingSchemaVersion: HISTORY_ATOMIC_GROUNDING_SCHEMA_V36,
        resolvedParticipantIds: [atomicConceptIdV36("main invasion"), entityIdV36("entity-4361e741ab5cf8f9151d8ca9")],
        structuredPropositionId: eligibility.structuredPropositionId,
      },
    });
    expect(atom.groundingId).toBe(eligibility.atomicGroundingId);
    expect(eventLocationSubjectTypeV36(atom)).toBe("event");
    expect(eventLocationSubjectTypeV36({ ...atom, claimId: claimIdV36("claim-27a228830af8714543142658") })).toBeUndefined();
  });
});
