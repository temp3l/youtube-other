import { describe, expect, it } from "vitest";
import {
  deriveMapCapabilitiesV35,
  extractGeoFactsV35,
} from "./history-geo-facts-v35.js";
import { compileMapStateV35, validateCompiledMapStateV35 } from "./history-map-compiler-v35.js";
import { proposeMapIntentsV35 } from "./history-geo-v35.js";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import type {
  HistoryClaimV34,
  HistoryEntityMentionV34,
  HistoryGeographicQualifierV34,
  HistoryMapIntentProposalV34,
} from "./history-v34-contracts.js";

const NAPOLEON_EPISODE =
  "history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia";

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

function compileWithProposal(input: {
  readonly beatNumber?: string;
  readonly scopeClaimIds: readonly string[];
  readonly proposal: HistoryMapIntentProposalV34;
  readonly claims: readonly HistoryClaimV34[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly geographicQualifiers: readonly HistoryGeographicQualifierV34[];
}) {
  return compileMapStateV35({
    beatNumber: input.beatNumber ?? "0001",
    proposal: input.proposal,
    scopeClaimIds: input.scopeClaimIds,
    claims: input.claims,
    entities: input.entities,
    geographicQualifiers: input.geographicQualifiers,
    temporalQualifiers: [],
    narrationText: input.claims
      .filter((claim) => input.scopeClaimIds.includes(claim.id))
      .map((claim) => claim.normalizedProposition)
      .join("\n"),
  });
}

describe("History V3.5 evidence-bound map compiler", () => {
  it("A. origin only downgrades movement to locator without route", () => {
    const claim = makeClaim({
      id: "claim-a",
      text: "Napoleon retreated from Moscow.",
      entityMentionIds: ["entity-napoleon", "entity-moscow"],
      geographicQualifierIds: ["geo-origin"],
    });
    const napoleon = makeEntity({
      id: "entity-napoleon",
      claimId: "claim-a",
      label: "Napoleon Bonaparte",
      entityType: "person",
      semanticRole: "leader",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-a",
      label: "Moscow",
      entityType: "place",
      semanticRole: "location",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-a",
        entityMentionId: moscow.id,
        role: "origin",
      }),
    ];
    const geoFacts = extractGeoFactsV35({
      scopeClaimIds: ["claim-a"],
      claims: [claim],
      entities: [napoleon, moscow],
      geographicQualifiers: geo,
      temporalQualifiers: [],
    });
    expect(geoFacts.some((fact) => fact.type === "location")).toBe(true);
    expect(geoFacts.some((fact) => fact.type === "movement")).toBe(false);
    const capabilities = deriveMapCapabilitiesV35({ geoFacts });
    expect(capabilities.movement).toBe(false);
    expect(capabilities.locator).toBe(true);
    const proposal: HistoryMapIntentProposalV34 = {
      claimIds: ["claim-a"],
      mapPurpose: "journey",
      movingActorEntityMentionIds: [napoleon.id],
      originPlaceMentionIds: [moscow.id],
      destinationPlaceMentionIds: [moscow.id],
      waypointPlaceMentionIds: [],
      temporalQualifierIds: [],
      routeType: "overland",
      uncertainty: [],
    };
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-a"],
      proposal,
      claims: [claim],
      entities: [napoleon, moscow],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.routes).toEqual([]);
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("locator");
    expect(compiled?.state.compilerResolution?.downgradeReason).toBe(
      "DESTINATION_NOT_SUPPORTED"
    );
  });

  it("B. origin and destination without movement predicate allows sequence not movement", () => {
    const claim = makeClaim({ id: "claim-b", text: "Moscow and Smolensk were key cities." });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-b",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-b",
      label: "Smolensk",
      entityType: "place",
    });
    const geo = [
      makeGeo({ id: "geo-1", claimId: "claim-b", entityMentionId: moscow.id, role: "location" }),
      makeGeo({ id: "geo-2", claimId: "claim-b", entityMentionId: smolensk.id, role: "location" }),
    ];
    const capabilities = deriveMapCapabilitiesV35({
      geoFacts: extractGeoFactsV35({
        scopeClaimIds: ["claim-b"],
        claims: [claim],
        entities: [moscow, smolensk],
        geographicQualifiers: geo,
        temporalQualifiers: [],
      }),
    });
    expect(capabilities.movement).toBe(false);
    expect(capabilities.sequence).toBe(true);
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-b"],
      proposal: {
        claimIds: ["claim-b"],
        mapPurpose: "area",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [smolensk.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "none",
        uncertainty: [],
      },
      claims: [claim],
      entities: [moscow, smolensk],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.routes).toEqual([]);
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("sequence");
  });

  it("C. supported movement compiles a movement map with route", () => {
    const claim = makeClaim({
      id: "claim-c",
      text: "The Grande Armée marched from Moscow to Smolensk.",
      entityMentionIds: ["entity-army", "entity-moscow", "entity-smolensk"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const army = makeEntity({
      id: "entity-army",
      claimId: "claim-c",
      label: "Grande Armée",
      entityType: "military-unit",
      semanticRole: "actor",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-c",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-c",
      label: "Smolensk",
      entityType: "place",
    });
    const geo = [
      makeGeo({ id: "geo-origin", claimId: "claim-c", entityMentionId: moscow.id, role: "origin" }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-c",
        entityMentionId: smolensk.id,
        role: "destination",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-c"],
      proposal: {
        claimIds: ["claim-c"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [army.id],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [smolensk.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [army, moscow, smolensk],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.routes).toHaveLength(1);
    expect(compiled?.state.routes[0]?.origin.label).toBe("Moscow");
    expect(compiled?.state.routes[0]?.destination.label).toBe("Smolensk");
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("movement");
  });

  it("D. wrong actor downgrades movement map", () => {
    const claim = makeClaim({
      id: "claim-d",
      text: "Napoleon marched from Moscow to Smolensk.",
      entityMentionIds: ["entity-napoleon", "entity-moscow", "entity-smolensk"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const napoleon = makeEntity({
      id: "entity-napoleon",
      claimId: "claim-d",
      label: "Napoleon Bonaparte",
      entityType: "person",
      semanticRole: "leader",
    });
    const army = makeEntity({
      id: "entity-army",
      claimId: "claim-d",
      label: "Grande Armée",
      entityType: "military-unit",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-d",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-d",
      label: "Smolensk",
      entityType: "place",
    });
    const geo = [
      makeGeo({ id: "geo-origin", claimId: "claim-d", entityMentionId: moscow.id, role: "origin" }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-d",
        entityMentionId: smolensk.id,
        role: "destination",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-d"],
      proposal: {
        claimIds: ["claim-d"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [army.id],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [smolensk.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [napoleon, army, moscow, smolensk],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.routes).toHaveLength(1);
    expect(compiled?.state.routes[0]?.movingActor).toBe("Napoleon Bonaparte");
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("movement");
  });

  it("E. episode-context destination cannot leak into beat-scoped compile", () => {
    const retreatClaim = makeClaim({
      id: "claim-retreat",
      text: "By October, Napoleon began the retreat.",
      entityMentionIds: ["entity-napoleon"],
    });
    const berezinaClaim = makeClaim({
      id: "claim-berezina",
      text: "At the Berezina River in late November, Napoleon faced possible encirclement.",
      entityMentionIds: ["entity-berezina"],
    });
    const napoleon = makeEntity({
      id: "entity-napoleon",
      claimId: "claim-retreat",
      label: "Napoleon Bonaparte",
      entityType: "person",
      semanticRole: "leader",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-berezina",
      label: "Moscow",
      entityType: "place",
    });
    const berezina = makeEntity({
      id: "entity-berezina",
      claimId: "claim-berezina",
      label: "Berezina River",
      entityType: "water-body",
    });
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-retreat"],
      proposal: {
        claimIds: ["claim-retreat"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [berezina.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [retreatClaim, berezinaClaim],
      entities: [napoleon, moscow, berezina],
      geographicQualifiers: [],
    });
    expect(compiled).toBeNull();
  });

  it("F. segment aggregation allows sequence across explicit claims", () => {
    const claimMoscow = makeClaim({
      id: "claim-moscow",
      text: "Napoleon left Moscow.",
      entityMentionIds: ["entity-napoleon", "entity-moscow"],
      geographicQualifierIds: ["geo-moscow"],
    });
    const claimSmolensk = makeClaim({
      id: "claim-smolensk",
      text: "The army passed Smolensk.",
      entityMentionIds: ["entity-smolensk"],
      geographicQualifierIds: ["geo-smolensk"],
    });
    const claimBerezina = makeClaim({
      id: "claim-berezina",
      text: "The army reached the Berezina River.",
      entityMentionIds: ["entity-berezina"],
      geographicQualifierIds: ["geo-berezina"],
    });
    const napoleon = makeEntity({
      id: "entity-napoleon",
      claimId: "claim-moscow",
      label: "Napoleon Bonaparte",
      entityType: "person",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-moscow",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-smolensk",
      label: "Smolensk",
      entityType: "place",
    });
    const berezina = makeEntity({
      id: "entity-berezina",
      claimId: "claim-berezina",
      label: "Berezina River",
      entityType: "water-body",
    });
    const geo = [
      makeGeo({ id: "geo-moscow", claimId: "claim-moscow", entityMentionId: moscow.id, role: "location" }),
      makeGeo({
        id: "geo-smolensk",
        claimId: "claim-smolensk",
        entityMentionId: smolensk.id,
        role: "location",
      }),
      makeGeo({
        id: "geo-berezina",
        claimId: "claim-berezina",
        entityMentionId: berezina.id,
        role: "location",
      }),
    ];
    const scopeClaimIds = ["claim-moscow", "claim-smolensk", "claim-berezina"];
    const capabilities = deriveMapCapabilitiesV35({
      geoFacts: extractGeoFactsV35({
        scopeClaimIds,
        claims: [claimMoscow, claimSmolensk, claimBerezina],
        entities: [napoleon, moscow, smolensk, berezina],
        geographicQualifiers: geo,
        temporalQualifiers: [],
      }),
    });
    expect(capabilities.sequence).toBe(true);
    expect(capabilities.movement).toBe(false);
  });

  it("G. unsupported exact geometry uses schematic progression", () => {
    const claim = makeClaim({
      id: "claim-g",
      text: "The Grande Armée marched from Moscow to Smolensk.",
      entityMentionIds: ["entity-army", "entity-moscow", "entity-smolensk"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const army = makeEntity({
      id: "entity-army",
      claimId: "claim-g",
      label: "Grande Armée",
      entityType: "military-unit",
      semanticRole: "actor",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-g",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-g",
      label: "Smolensk",
      entityType: "place",
    });
    const geo = [
      makeGeo({ id: "geo-origin", claimId: "claim-g", entityMentionId: moscow.id, role: "origin" }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-g",
        entityMentionId: smolensk.id,
        role: "destination",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-g"],
      proposal: {
        claimIds: ["claim-g"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [army.id],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [smolensk.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [army, moscow, smolensk],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.compilerResolution?.routeGeometrySemantics).toBe(
      "schematic-progression"
    );
    expect(compiled?.state.routes[0]?.uncertainty).toContain("Schematic progression");
  });

  it("H. same claims and intent produce semantically identical compiled output", () => {
    const claim = makeClaim({
      id: "claim-h",
      text: "The Grande Armée marched from Moscow to Smolensk.",
      entityMentionIds: ["entity-army", "entity-moscow", "entity-smolensk"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const army = makeEntity({
      id: "entity-army",
      claimId: "claim-h",
      label: "Grande Armée",
      entityType: "military-unit",
      semanticRole: "actor",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-h",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-h",
      label: "Smolensk",
      entityType: "place",
    });
    const geo = [
      makeGeo({ id: "geo-origin", claimId: "claim-h", entityMentionId: moscow.id, role: "origin" }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-h",
        entityMentionId: smolensk.id,
        role: "destination",
      }),
    ];
    const proposal: HistoryMapIntentProposalV34 = {
      claimIds: ["claim-h"],
      mapPurpose: "journey",
      movingActorEntityMentionIds: [army.id],
      originPlaceMentionIds: [moscow.id],
      destinationPlaceMentionIds: [smolensk.id],
      waypointPlaceMentionIds: [],
      temporalQualifierIds: [],
      routeType: "overland",
      uncertainty: [],
    };
    const input = {
      scopeClaimIds: ["claim-h"],
      proposal,
      claims: [claim],
      entities: [army, moscow, smolensk],
      geographicQualifiers: geo,
    };
    const first = compileWithProposal(input);
    const second = compileWithProposal(input);
    expect(first?.state.routes).toEqual(second?.state.routes);
    expect(first?.state.compilerResolution).toEqual(second?.state.compilerResolution);
    expect(first?.state.mapPurpose).toEqual(second?.state.mapPurpose);
  });

  it("Napoleon retreat beat never emits Moscow to Berezina route", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: NAPOLEON_EPISODE,
      rawScript:
        "By October, Napoleon began the retreat.\n\nAt the Berezina River in late November, Napoleon faced possible encirclement.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: NAPOLEON_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const retreatClaim = structured.claims.find((claim) =>
      /began the retreat/iu.test(claim.normalizedProposition)
    );
    expect(retreatClaim).toBeDefined();
    const intents = proposeMapIntentsV35({
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
    });
    const retreatRouteIntent = intents.find(
      (intent) =>
        intent.claimIds.includes(retreatClaim!.id) &&
        intent.originPlaceMentionIds[0] !== intent.destinationPlaceMentionIds[0]
    );
    expect(retreatRouteIntent).toBeUndefined();

    const napoleon = structured.entities.find(
      (entity) => entity.claimId === retreatClaim!.id
    );
    const moscow = makeEntity({
      id: "entity-moscow-retreat-test",
      claimId: retreatClaim!.id,
      label: "Moscow",
      entityType: "place",
    });
    const berezina = makeEntity({
      id: "entity-berezina-retreat-test",
      claimId: "claim-berezina-context",
      label: "Berezina River",
      entityType: "water-body",
    });
    const compiled = compileMapStateV35({
      beatNumber: "0035",
      proposal: {
        claimIds: [retreatClaim!.id],
        mapPurpose: "journey",
        movingActorEntityMentionIds: napoleon ? [napoleon.id] : [],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [berezina.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: retreatClaim!.temporalQualifierIds,
        routeType: "overland",
        uncertainty: retreatClaim!.uncertaintyMarkers,
      },
      scopeClaimIds: [retreatClaim!.id],
      claims: structured.claims,
      entities: [...structured.entities, moscow, berezina],
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: retreatClaim!.normalizedProposition,
    });
    const berezinaRoute = compiled?.state.routes.find(
      (route) =>
        route.origin.label === "Moscow" && route.destination.label === "Berezina River"
    );
    expect(berezinaRoute).toBeUndefined();
    expect(
      compiled?.state.routes.some((route) => route.destination.label === "Berezina River")
    ).toBe(false);
  });
});

describe("History V3.5 map compiler invariants", () => {
  it("never records downgrade reasons for same-type resolutions", () => {
    const claim = makeClaim({
      id: "claim-locator",
      text: "Napoleon was in Moscow.",
      entityMentionIds: ["entity-moscow"],
      geographicQualifierIds: ["geo-moscow"],
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-locator",
      label: "Moscow",
      entityType: "place",
    });
    const geo = [
      makeGeo({
        id: "geo-moscow",
        claimId: "claim-locator",
        entityMentionId: moscow.id,
        role: "location",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-locator"],
      proposal: {
        claimIds: ["claim-locator"],
        mapPurpose: "location",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [moscow.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "none",
        uncertainty: [],
      },
      claims: [claim],
      entities: [moscow],
      geographicQualifiers: geo,
    });
    const resolution = compiled?.state.compilerResolution;
    expect(resolution?.requestedMapType).toBe("locator");
    expect(resolution?.resolvedMapType).toBe("locator");
    expect(resolution?.downgradeReason).toBeUndefined();
    expect(validateCompiledMapStateV35(compiled!.state)).not.toContain(
      "MAP_COMPILER_INVALID_DOWNGRADE"
    );
  });

  it("movement unsupported with sequence evidence downgrades to sequence", () => {
    const claim = makeClaim({
      id: "claim-bd",
      text: "Messina in Sicily and the Black Sea were both affected.",
      entityMentionIds: ["entity-messina", "entity-black-sea"],
      geographicQualifierIds: ["geo-messina", "geo-black-sea"],
    });
    const messina = makeEntity({
      id: "entity-messina",
      claimId: "claim-bd",
      label: "Messina",
      entityType: "place",
    });
    const blackSea = makeEntity({
      id: "entity-black-sea",
      claimId: "claim-bd",
      label: "Black Sea",
      entityType: "water-body",
    });
    const geo = [
      makeGeo({
        id: "geo-messina",
        claimId: "claim-bd",
        entityMentionId: messina.id,
        role: "location",
      }),
      makeGeo({
        id: "geo-black-sea",
        claimId: "claim-bd",
        entityMentionId: blackSea.id,
        role: "location",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-bd"],
      proposal: {
        claimIds: ["claim-bd"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [blackSea.id],
        destinationPlaceMentionIds: [messina.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "maritime",
        uncertainty: [],
      },
      claims: [claim],
      entities: [messina, blackSea],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("sequence");
    expect(compiled?.state.compilerResolution?.downgradeReason).toBe("MOVEMENT_NOT_SUPPORTED");
    expect(compiled?.state.routes).toEqual([]);
  });

  it("movement unsupported with only locator evidence downgrades to locator", () => {
    const claim = makeClaim({
      id: "claim-locator-only",
      text: "Napoleon retreated from Moscow.",
      entityMentionIds: ["entity-moscow"],
      geographicQualifierIds: ["geo-origin"],
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-locator-only",
      label: "Moscow",
      entityType: "place",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-locator-only",
        entityMentionId: moscow.id,
        role: "origin",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-locator-only"],
      proposal: {
        claimIds: ["claim-locator-only"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [moscow.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [moscow],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("locator");
    expect(compiled?.state.compilerResolution?.downgradeReason).toBe("DESTINATION_NOT_SUPPORTED");
  });

  it("retreat beat with scoped Moscow retains locator without Berezina route", () => {
    const claim = makeClaim({
      id: "claim-retreat-moscow",
      text: "By October, Napoleon began the retreat from Moscow.",
      entityMentionIds: ["entity-napoleon", "entity-moscow"],
      geographicQualifierIds: ["geo-origin"],
    });
    const napoleon = makeEntity({
      id: "entity-napoleon",
      claimId: "claim-retreat-moscow",
      label: "Napoleon Bonaparte",
      entityType: "person",
      semanticRole: "leader",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-retreat-moscow",
      label: "Moscow",
      entityType: "place",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-retreat-moscow",
        entityMentionId: moscow.id,
        role: "origin",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-retreat-moscow"],
      proposal: {
        claimIds: ["claim-retreat-moscow"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [napoleon.id],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [moscow.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [napoleon, moscow],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("locator");
    expect(compiled?.state.baseGeography).toContain("Moscow");
    expect(compiled?.state.routes).toEqual([]);
    expect(
      compiled?.state.labels.some((label) => label.text === "Berezina River")
    ).toBe(false);
  });

  it("Franklin supported movement still compiles movement map", () => {
    const claim = makeClaim({
      id: "claim-franklin",
      text: "Two Royal Navy ships sailed from Britain to search for the Northwest Passage.",
      entityMentionIds: ["entity-britain", "entity-passage", "entity-ships"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const britain = makeEntity({
      id: "entity-britain",
      claimId: "claim-franklin",
      label: "Britain",
      entityType: "place",
    });
    const passage = makeEntity({
      id: "entity-passage",
      claimId: "claim-franklin",
      label: "Northwest Passage",
      entityType: "water-body",
    });
    const ships = makeEntity({
      id: "entity-ships",
      claimId: "claim-franklin",
      label: "Royal Navy ships",
      entityType: "ship",
      semanticRole: "actor",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-franklin",
        entityMentionId: britain.id,
        role: "origin",
      }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-franklin",
        entityMentionId: passage.id,
        role: "destination",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-franklin"],
      proposal: {
        claimIds: ["claim-franklin"],
        mapPurpose: "area",
        movingActorEntityMentionIds: [ships.id],
        originPlaceMentionIds: [britain.id],
        destinationPlaceMentionIds: [passage.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "maritime",
        uncertainty: [],
      },
      claims: [claim],
      entities: [britain, passage, ships],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.compilerResolution?.resolvedMapType).toBe("movement");
    expect(compiled?.state.compilerResolution?.downgradeReason).toBeUndefined();
    expect(compiled?.state.routes).toHaveLength(1);
    expect(compiled?.state.routes[0]?.origin.label).toBe("Britain");
    expect(compiled?.state.routes[0]?.destination.label).toBe("Northwest Passage");
  });

  it("movement maps always include actor, endpoints, and provenance", () => {
    const claim = makeClaim({
      id: "claim-inv",
      text: "The Grande Armée marched from Moscow to Smolensk.",
      entityMentionIds: ["entity-army", "entity-moscow", "entity-smolensk"],
      geographicQualifierIds: ["geo-origin", "geo-destination"],
    });
    const army = makeEntity({
      id: "entity-army",
      claimId: "claim-inv",
      label: "Grande Armée",
      entityType: "military-unit",
      semanticRole: "actor",
    });
    const moscow = makeEntity({
      id: "entity-moscow",
      claimId: "claim-inv",
      label: "Moscow",
      entityType: "place",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-inv",
      label: "Smolensk",
      entityType: "place",
    });
    const geo = [
      makeGeo({
        id: "geo-origin",
        claimId: "claim-inv",
        entityMentionId: moscow.id,
        role: "origin",
      }),
      makeGeo({
        id: "geo-destination",
        claimId: "claim-inv",
        entityMentionId: smolensk.id,
        role: "destination",
      }),
    ];
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-inv"],
      proposal: {
        claimIds: ["claim-inv"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [army.id],
        originPlaceMentionIds: [moscow.id],
        destinationPlaceMentionIds: [smolensk.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [army, moscow, smolensk],
      geographicQualifiers: geo,
    });
    const route = compiled?.state.routes[0];
    expect(route?.movingActor).toBeTruthy();
    expect(route?.origin.label).toBeTruthy();
    expect(route?.destination.label).toBeTruthy();
    expect(route?.linkedClaimIds.length).toBeGreaterThan(0);
    expect(compiled?.state.compilerResolution?.geoFactIds.length).toBeGreaterThan(0);
  });

  it("Napoleon Smolensk capture does not compile Smolensk to Russia movement route", () => {
    const text =
      "Napoleon captured Smolensk after heavy fighting in August, but the Russian army escaped again.";
    const claim = makeClaim({
      id: "claim-smolensk",
      text,
      entityMentionIds: ["entity-napoleon", "entity-smolensk", "entity-russia"],
      geographicQualifierIds: ["geo-smolensk", "geo-russia"],
    });
    const napoleon = makeEntity({
      id: "entity-napoleon",
      claimId: "claim-smolensk",
      label: "Napoleon Bonaparte",
      entityType: "person",
      semanticRole: "leader",
    });
    const smolensk = makeEntity({
      id: "entity-smolensk",
      claimId: "claim-smolensk",
      label: "Smolensk",
      entityType: "place",
      semanticRole: "location",
    });
    const russia = makeEntity({
      id: "entity-russia",
      claimId: "claim-smolensk",
      label: "Russia",
      entityType: "state",
      semanticRole: "location",
    });
    const geo = [
      makeGeo({
        id: "geo-smolensk",
        claimId: "claim-smolensk",
        entityMentionId: smolensk.id,
        role: "location",
      }),
      makeGeo({
        id: "geo-russia",
        claimId: "claim-smolensk",
        entityMentionId: russia.id,
        role: "location",
      }),
    ];
    const geoFacts = extractGeoFactsV35({
      scopeClaimIds: ["claim-smolensk"],
      claims: [claim],
      entities: [napoleon, smolensk, russia],
      geographicQualifiers: geo,
      temporalQualifiers: [],
    });
    expect(geoFacts.some((fact) => fact.type === "movement")).toBe(false);
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-smolensk"],
      proposal: {
        claimIds: ["claim-smolensk"],
        mapPurpose: "journey",
        movingActorEntityMentionIds: [napoleon.id],
        originPlaceMentionIds: [smolensk.id],
        destinationPlaceMentionIds: [russia.id],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "overland",
        uncertainty: [],
      },
      claims: [claim],
      entities: [napoleon, smolensk, russia],
      geographicQualifiers: geo,
    });
    expect(
      compiled?.state.routes.some(
        (route) => route.origin.label === "Smolensk" && route.destination.label === "Russia"
      )
    ).toBe(false);
  });

  it("Napoleon Niemen crossing does not compile river to Russia centroid movement route", () => {
    const text =
      "On June 24, 1812, soldiers began crossing the Niemen River into the Russian Empire.";
    const claim = makeClaim({
      id: "claim-niemen",
      text,
      entityMentionIds: ["entity-niemen", "entity-russia"],
      geographicQualifierIds: ["geo-niemen", "geo-russia"],
    });
    const niemen = makeEntity({
      id: "entity-niemen",
      claimId: "claim-niemen",
      label: "Niemen River",
      entityType: "water-body",
      semanticRole: "location",
    });
    const russia = makeEntity({
      id: "entity-russia",
      claimId: "claim-niemen",
      label: "Russia",
      entityType: "state",
      semanticRole: "location",
    });
    const geo = [
      makeGeo({
        id: "geo-niemen",
        claimId: "claim-niemen",
        entityMentionId: niemen.id,
        role: "location",
      }),
      makeGeo({
        id: "geo-russia",
        claimId: "claim-niemen",
        entityMentionId: russia.id,
        role: "location",
      }),
    ];
    const geoFacts = extractGeoFactsV35({
      scopeClaimIds: ["claim-niemen"],
      claims: [claim],
      entities: [niemen, russia],
      geographicQualifiers: geo,
      temporalQualifiers: [],
    });
    expect(geoFacts.some((fact) => fact.type === "movement")).toBe(false);
    expect(geoFacts.some((fact) => fact.type === "sequence")).toBe(true);
    const compiled = compileWithProposal({
      scopeClaimIds: ["claim-niemen"],
      proposal: {
        claimIds: ["claim-niemen"],
        mapPurpose: "area",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [niemen.id],
        destinationPlaceMentionIds: [niemen.id],
        waypointPlaceMentionIds: [russia.id],
        temporalQualifierIds: [],
        routeType: "none",
        uncertainty: [],
      },
      claims: [claim],
      entities: [niemen, russia],
      geographicQualifiers: geo,
    });
    expect(compiled?.state.routes.length ?? 0).toBe(0);
  });
});
