import { describe, expect, it } from "vitest";
import {
  actorDisplayLabelV35,
  claimExpressionIsDerivedFromScopedEvidenceV35,
  resolveMovementActorRefV35,
  validateMovementActorProvenanceV35,
} from "./history-map-actor-v35.js";
import { compileMapStateV35 } from "./history-map-compiler-v35.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapIntentProposalV34,
} from "./history-v34-contracts.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";
const NAPOLEON_EPISODE =
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";

const FRANKLIN_OPENING = `In May 1845, two Royal Navy ships sailed from Britain with 134 officers and crew to search for the Northwest Passage.

HMS Erebus and HMS Terror were strong, experienced polar vessels.`;

const NAPOLEON_NIEMEN =
  "On June 24, 1812, soldiers began crossing the Niemen River into the Russian Empire.";

function makeClaim(input: {
  readonly id: string;
  readonly text: string;
  readonly entityMentionIds?: readonly string[];
  readonly geographicQualifierIds?: readonly string[];
}): HistoryClaimV34 {
  return {
    id: input.id,
    episodeId: "test",
    schemaVersion: "history-claim.v3.4",
    normalizedProposition: input.text,
    verbatimTexts: [input.text],
    narrationUnitIds: ["unit-1"],
    narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: input.text.length }],
    claimKind: "other",
    materiality: "material",
    authorityMode: "trusted-script",
    provenanceStatus: "trusted_input",
    independentlyVerified: false,
    trustAttestationId: "attestation-test",
    entityMentionIds: input.entityMentionIds ?? [],
    geographicQualifierIds: input.geographicQualifierIds ?? [],
    temporalQualifierIds: [],
    quantitativeQualifierIds: [],
    uncertaintyMarkers: [],
  };
}

function makeEntity(input: {
  readonly id: string;
  readonly claimId: string;
  readonly label: string;
  readonly entityType: HistoryEntityMentionV34["entityType"];
  readonly semanticRole?: HistoryEntityMentionV34["semanticRole"];
}): HistoryEntityMentionV34 {
  return {
    id: input.id,
    claimId: input.claimId,
    normalizedLabel: input.label,
    entityType: input.entityType,
    semanticRole: input.semanticRole ?? "other",
    text: input.label,
    confidenceSource: "deterministic",
    narrationSpan: { startUtf16: 0, endUtf16Exclusive: input.label.length },
  };
}

function makeGeo(input: {
  readonly id: string;
  readonly claimId: string;
  readonly entityMentionId: string;
  readonly role: HistoryGeographicQualifierV34["role"];
}): HistoryGeographicQualifierV34 {
  return {
    id: input.id,
    claimId: input.claimId,
    entityMentionId: input.entityMentionId,
    role: input.role,
    text: input.entityMentionId,
  };
}

describe("History V3.5 provenance-bound movement actors", () => {
  it("derives soldiers from Napoleon Niemen crossing claim text", () => {
    const claim = makeClaim({
      id: "claim-niemen",
      text: NAPOLEON_NIEMEN,
      entityMentionIds: ["entity-niemen", "entity-russia"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const niemen = makeEntity({
      id: "entity-niemen",
      claimId: "claim-niemen",
      label: "Niemen River",
      entityType: "water-body",
      semanticRole: "origin",
    });
    const russia = makeEntity({
      id: "entity-russia",
      claimId: "claim-niemen",
      label: "Russian Empire",
      entityType: "state",
      semanticRole: "destination",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-niemen",
        entityMentionId: niemen.id,
        role: "origin",
      }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-niemen",
        entityMentionId: russia.id,
        role: "destination",
      }),
    ];
    const resolution = resolveMovementActorRefV35({
      movementClaim: claim,
      scopeClaimIds: ["claim-niemen"],
      claims: [claim],
      entities: [niemen, russia],
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.actorRef.kind).toBe("claim-expression");
    if (resolution.actorRef.kind !== "claim-expression") return;
    expect(resolution.actorRef.normalizedLabel).toBe("soldiers");
    expect(resolution.actorRef.sourceText).toBe("soldiers");
    expect(
      claimExpressionIsDerivedFromScopedEvidenceV35({
        actorRef: resolution.actorRef,
        scopeClaimIds: ["claim-niemen"],
        claims: [claim],
      })
    ).toBe(true);

    const compiled = compileMapStateV35({
      beatNumber: "0005",
      proposal: {
        claimIds: ["claim-niemen"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [niemen.id],
        destinationPlaceMentionIds: [russia.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      scopeClaimIds: ["claim-niemen"],
      claims: [claim],
      entities: [niemen, russia],
      geographicQualifiers: geo,
      temporalQualifiers: [],
      narrationText: claim.normalizedProposition,
    });
    expect(compiled?.state.routes[0]?.movingActor).toBe("soldiers");
    expect(compiled?.state.routes[0]?.movingActor).not.toBe("narrated expedition");
    expect(compiled?.state.routes[0]?.actorProvenance?.kind).toBe("claim-expression");
  });

  it("rejects synthetic actors when no positive evidence exists", () => {
    const claim = makeClaim({
      id: "claim-generic",
      text: "Alpha and Beta were important places.",
      geographicQualifierIds: ["geo-a", "geo-b"],
    });
    const placeA = makeEntity({
      id: "entity-a",
      claimId: "claim-generic",
      label: "Alpha",
      entityType: "place",
    });
    const placeB = makeEntity({
      id: "entity-b",
      claimId: "claim-generic",
      label: "Beta",
      entityType: "place",
    });
    const resolution = resolveMovementActorRefV35({
      movementClaim: claim,
      scopeClaimIds: ["claim-generic"],
      claims: [claim],
      entities: [placeA, placeB],
    });
    expect(resolution.status).toBe("unresolved");
  });

  it("uses generic actor when ship names exist only outside scope", () => {
    const movementClaim = makeClaim({
      id: "claim-move",
      text: "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
      entityMentionIds: ["entity-britain", "entity-passage"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const identityClaim = makeClaim({
      id: "claim-identity",
      text: "HMS Erebus and HMS Terror were strong, experienced polar vessels.",
      entityMentionIds: ["entity-erebus", "entity-terror"],
    });
    const britain = makeEntity({
      id: "entity-britain",
      claimId: "claim-move",
      label: "Britain",
      entityType: "place",
      semanticRole: "origin",
    });
    const passage = makeEntity({
      id: "entity-passage",
      claimId: "claim-move",
      label: "Northwest Passage",
      entityType: "water-body",
      semanticRole: "destination",
    });
    const erebus = makeEntity({
      id: "entity-erebus",
      claimId: "claim-identity",
      label: "HMS Erebus",
      entityType: "ship",
    });
    const terror = makeEntity({
      id: "entity-terror",
      claimId: "claim-identity",
      label: "HMS Terror",
      entityType: "ship",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-move",
        entityMentionId: britain.id,
        role: "origin",
      }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-move",
        entityMentionId: passage.id,
        role: "destination",
      }),
    ];
    const resolution = resolveMovementActorRefV35({
      movementClaim,
      scopeClaimIds: ["claim-move"],
      claims: [movementClaim, identityClaim],
      entities: [britain, passage, erebus, terror],
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.actorRef.kind).toBe("claim-expression");
    expect(actorDisplayLabelV35(resolution.actorRef, [britain, passage, erebus, terror])).toBe(
      "two Royal Navy ships"
    );

    const compiled = compileMapStateV35({
      beatNumber: "0001",
      proposal: {
        claimIds: ["claim-move"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [britain.id],
        destinationPlaceMentionIds: [passage.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "maritime",
        uncertainty: [],
      },
      scopeClaimIds: ["claim-move"],
      claims: [movementClaim, identityClaim],
      entities: [britain, passage, erebus, terror],
      geographicQualifiers: geo,
      temporalQualifiers: [],
      narrationText: movementClaim.normalizedProposition,
    });
    expect(compiled?.state.routes[0]?.movingActor).toBe("two Royal Navy ships");
    expect(compiled?.state.routes[0]?.actorProvenance?.kind).toBe("claim-expression");
  });

  it("allows named vessels when identity claim is explicitly in segment scope", () => {
    const movementClaim = makeClaim({
      id: "claim-move",
      text: "In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
      entityMentionIds: ["entity-britain", "entity-passage"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const identityClaim = makeClaim({
      id: "claim-identity",
      text: "HMS Erebus and HMS Terror were strong, experienced polar vessels.",
      entityMentionIds: ["entity-erebus", "entity-terror"],
    });
    const britain = makeEntity({
      id: "entity-britain",
      claimId: "claim-move",
      label: "Britain",
      entityType: "place",
      semanticRole: "origin",
    });
    const passage = makeEntity({
      id: "entity-passage",
      claimId: "claim-move",
      label: "Northwest Passage",
      entityType: "water-body",
      semanticRole: "destination",
    });
    const erebus = makeEntity({
      id: "entity-erebus",
      claimId: "claim-identity",
      label: "HMS Erebus",
      entityType: "ship",
    });
    const terror = makeEntity({
      id: "entity-terror",
      claimId: "claim-identity",
      label: "HMS Terror",
      entityType: "ship",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-move",
        entityMentionId: britain.id,
        role: "origin",
      }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-move",
        entityMentionId: passage.id,
        role: "destination",
      }),
    ];
    const resolution = resolveMovementActorRefV35({
      movementClaim,
      scopeClaimIds: ["claim-move", "claim-identity"],
      claims: [movementClaim, identityClaim],
      entities: [britain, passage, erebus, terror],
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.actorRef.kind).toBe("entities");
    expect(actorDisplayLabelV35(resolution.actorRef, [britain, passage, erebus, terror])).toBe(
      "HMS Erebus and HMS Terror"
    );
    expect(
      validateMovementActorProvenanceV35({
        actorRef: resolution.actorRef,
        entities: [britain, passage, erebus, terror],
        scopeClaimIds: ["claim-move", "claim-identity"],
        claims: [movementClaim, identityClaim],
      })
    ).toEqual([]);

    const compiled = compileMapStateV35({
      beatNumber: "0001",
      proposal: {
        claimIds: ["claim-move", "claim-identity"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [britain.id],
        destinationPlaceMentionIds: [passage.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "maritime",
        uncertainty: [],
      },
      scopeClaimIds: ["claim-move", "claim-identity"],
      claims: [movementClaim, identityClaim],
      entities: [britain, passage, erebus, terror],
      geographicQualifiers: geo,
      temporalQualifiers: [],
      narrationText: [
        movementClaim.normalizedProposition,
        identityClaim.normalizedProposition,
      ].join("\n"),
    });
    expect(compiled?.state.routes[0]?.movingActor).toBe("HMS Erebus and HMS Terror");
    expect(compiled?.state.routes[0]?.movingActorEntityMentionIds).toEqual([
      erebus.id,
      terror.id,
    ]);
  });

  it("Franklin episode restricted beat scope never names Erebus or Terror", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_OPENING,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const movementClaim = structured.claims.find((claim) =>
      /two Royal Navy ships sailed from Britain/iu.test(claim.normalizedProposition)
    );
    expect(movementClaim).toBeDefined();
    const compiled = compileMapStateV35({
      beatNumber: "0001",
      proposal: {
        claimIds: [movementClaim!.id],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [],
        destinationPlaceMentionIds: [],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: movementClaim!.temporalQualifierIds,
        routeType: "maritime",
        uncertainty: [],
      },
      scopeClaimIds: [movementClaim!.id],
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: movementClaim!.normalizedProposition,
    });
    expect(compiled?.state.routes[0]?.movingActor).toBe("two Royal Navy ships");
    expect(compiled?.state.routes[0]?.movingActor).not.toContain("Erebus");
    expect(compiled?.state.routes[0]?.actorProvenance).toBeDefined();
  });

  it("Napoleon episode Niemen beat uses soldiers not narrated expedition", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: NAPOLEON_EPISODE,
      rawScript: NAPOLEON_NIEMEN,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: NAPOLEON_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const claim = structured.claims[0];
    expect(claim?.normalizedProposition).toContain("soldiers");
    const compiled = compileMapStateV35({
      beatNumber: "0005",
      proposal: {
        claimIds: [claim!.id],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [],
        destinationPlaceMentionIds: [],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: claim!.temporalQualifierIds,
        routeType: "overland",
        uncertainty: [],
      },
      scopeClaimIds: [claim!.id],
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: claim!.normalizedProposition,
    });
    expect(compiled?.state.routes[0]?.movingActor).toBe("soldiers");
    expect(compiled?.state.routes[0]?.movingActor).not.toBe("narrated expedition");
  });
});
