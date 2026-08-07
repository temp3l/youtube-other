import { describe, expect, it } from "vitest";
import {
  buildReviewableGeoFactsV35,
  validateGeoFactReferentialIntegrityV35,
} from "./history-geo-facts-export-v35.js";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";

function minimalPlan(
  mapStates: HistoryVisualPlanV35["mapStates"]
): HistoryVisualPlanV35 {
  return {
    episodeId: "test",
    title: "Test",
    schemaVersion: "history-visual-plan.v3.5",
    plannerVersion: "history-visual-planner.v3.5.0",
    planHash: "plan-hash",
    trustSnapshotHash: "trust-hash",
    sourceAuthorityMode: "trusted-script",
    durationPolicy: "long-form",
    narration: {
      episodeId: "test",
      schemaVersion: "history-narration.v3.3",
      normalizedText: "Test",
      normalizedTextSha256: "sha",
      units: [],
    },
    claims: [
      {
        id: "claim-1",
        episodeId: "test",
        schemaVersion: "history-claim.v3.4",
        normalizedProposition: "From Moscow to Smolensk.",
        verbatimTexts: ["From Moscow to Smolensk."],
        narrationUnitIds: ["unit-1"],
        narrationSpans: [{ startUtf16: 0, endUtf16Exclusive: 22 }],
        claimKind: "other",
        materiality: "material",
        authorityMode: "trusted-script",
        provenanceStatus: "trusted_input",
        independentlyVerified: false,
        trustAttestationId: "attestation-test",
        entityMentionIds: ["entity-moscow", "entity-smolensk"],
        geographicQualifierIds: ["geo-origin", "geo-destination"],
        temporalQualifierIds: [],
        quantitativeQualifierIds: [],
        uncertaintyMarkers: [],
      },
    ],
    entities: [
      {
        id: "entity-moscow",
        claimId: "claim-1",
        normalizedLabel: "Moscow",
        entityType: "place",
        semanticRole: "location",
        text: "Moscow",
        confidenceSource: "deterministic",
        narrationSpan: { startUtf16: 5, endUtf16Exclusive: 10 },
      },
      {
        id: "entity-smolensk",
        claimId: "claim-1",
        normalizedLabel: "Smolensk",
        entityType: "place",
        semanticRole: "location",
        text: "Smolensk",
        confidenceSource: "deterministic",
        narrationSpan: { startUtf16: 14, endUtf16Exclusive: 22 },
      },
    ],
    rejectedEntities: [],
    temporalQualifiers: [],
    geographicQualifiers: [
      {
        id: "geo-origin",
        claimId: "claim-1",
        entityMentionId: "entity-moscow",
        role: "origin",
        text: "Moscow",
      },
      {
        id: "geo-destination",
        claimId: "claim-1",
        entityMentionId: "entity-smolensk",
        role: "destination",
        text: "Smolensk",
      },
    ],
    quantitativeQualifiers: [],
    visualConcepts: [],
    visualPurposes: [],
    beats: [],
    shots: [],
    assetIntents: [],
    mediaDecisions: [],
    mapMasters: [],
    mapStates,
    diagramMasters: [],
    diagramStates: [],
    timelineMasters: [],
    timelineStates: [],
    timelineEvents: [],
    dateCardStates: [],
    documentStates: [],
    aspectRatioPlans: [],
    visualOpportunities: [],
    visualOpportunitySummary: {
      eligibleMapOpportunities: 0,
      selectedMapOpportunities: 0,
      eligibleDiagramOpportunities: 0,
      selectedDiagramOpportunities: 0,
    },
    timing: { totalDurationMs: 1000, measured: false },
    qualityMetrics: {
      thresholds: {
        editorialRepetitionMaxRatio: 0.2,
        longStaticRuntimeMaxRatio: 0.35,
        templatedArchivalPurposeMaxCount: 0,
      },
      measured: {},
    },
    diagnostics: [],
    approval: {
      structurallyValid: true,
      editoriallyReviewable: true,
      contentApprovalEligible: true,
      productionApprovalEligible: false,
      structural: { state: "pass", blockerCodes: [] },
      editorial: { state: "pass", blockerCodes: [] },
      content: { state: "pass", blockerCodes: [] },
      production: { state: "blocked", blockerCodes: ["TIMING_MEASUREMENT_REQUIRED"] },
    },
    trustApproval: {
      productionHistoricalApprovalEligible: false,
      trustedScriptAccepted: true,
    },
  };
}

describe("History V3.5 geo-fact export", () => {
  it("exports referenced geo facts and validates referential integrity", () => {
    const geoFactId = "geo-fact-movement-claim-1-collective-entity-moscow-entity-smolensk";
    const plan = minimalPlan([
      {
        id: "map-state-0001",
        masterId: "map-master-0001",
        purpose: "movement",
        mapPurpose: "journey",
        baseGeography: "Moscow, Smolensk",
        timePeriod: "as narrated",
        affectedArea: "Moscow, Smolensk",
        labels: [],
        routes: [],
        uncertainty: "",
        semanticStatus: "valid",
        blockerCodes: [],
        compilerResolution: {
          requestedMapType: "movement",
          resolvedMapType: "movement",
          scopeClaimIds: ["claim-1"],
          geoFactIds: [geoFactId],
          routeGeometrySemantics: "schematic-progression",
        },
      },
    ]);
    const exported = buildReviewableGeoFactsV35(plan);
    expect(exported.some((fact) => fact.id === geoFactId)).toBe(true);
    expect(
      validateGeoFactReferentialIntegrityV35({ plan, exportedGeoFacts: exported })
    ).toEqual([]);
  });
});
