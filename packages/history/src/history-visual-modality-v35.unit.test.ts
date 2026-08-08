import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import {
  assessMapOpportunityV35,
  detectDiagramOpportunityV35,
  scoreDiagramOpportunityV35,
  scoreMapOpportunityV35,
} from "./history-visual-opportunity-v35.js";
import {
  buildHistoryVisualPlanV35,
  buildSegmentationClustersV35,
} from "./visual-planner-v35.js";

const BRONZE_EPISODE =
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse";
const DDAY_EPISODE =
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion";

function materialClaim(id: string, text: string, claimKind: "causal" | "place" | "other" = "other") {
  return {
    id,
    claimKind,
    materiality: "material" as const,
    normalizedProposition: text,
    narrationUnitIds: [id],
    authorityMode: "trusted-script" as const,
    provenanceStatus: "trusted_input" as const,
    independentlyVerified: false,
    temporalQualifierIds: [],
    geographicQualifierIds: [],
    quantitativeQualifierIds: [],
    entityMentionIds: [],
    sourceSpanIds: [],
    uncertainty: [],
    rhetoricalRole: "assertion" as const,
  };
}

function geoEntity(
  id: string,
  claimId: string,
  label: string,
  role: "location" | "origin" | "destination" = "location"
) {
  return {
    id,
    claimId,
    text: label,
    normalizedLabel: label,
    entityType: "place" as const,
    semanticRole: role,
    narrationSpan: { startUtf16: 0, endUtf16Exclusive: label.length },
    confidenceSource: "deterministic" as const,
  };
}

describe("History V3.5 beat segmentation ownership", () => {
  it("keeps segmentation clusters stable when spatial keywords appear in narration", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: BRONZE_EPISODE,
      rawScript:
        "Armies marched across Anatolia while fleets sailed toward Cyprus. The invasion campaign crossed trade routes from Mycenae to the Levant.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: BRONZE_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const clusters = buildSegmentationClustersV35({ narration, structured });
    const plan = buildHistoryVisualPlanV35({
      episodeId: BRONZE_EPISODE,
      title: "Bronze Age Collapse",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    expect(plan.beats.length).toBe(clusters.length);
    expect(clusters.length).toBeLessThanOrEqual(narration.units.length);
  });
});

describe("History V3.5 explanatory map selection", () => {
  it("prefers explanatory route maps over locator-only geography", () => {
    const text =
      "Forces crossed the English Channel from England and landed on the Normandy beaches before advancing inland.";
    const assessment = assessMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text, "place")],
      entities: [
        geoEntity("e1", "claim-1", "England", "origin"),
        geoEntity("e2", "claim-1", "Normandy", "destination"),
      ],
      geographicQualifiers: [
        { id: "g1", claimId: "claim-1", entityMentionId: "e1", role: "origin" },
        { id: "g2", claimId: "claim-1", entityMentionId: "e2", role: "destination" },
      ],
      mapIntents: [
        {
          claimIds: ["claim-1"],
          mapPurpose: "expedition-route",
          movingActorEntityMentionIds: [],
          originPlaceMentionIds: ["e1"],
          destinationPlaceMentionIds: ["e2"],
          waypointPlaceMentionIds: [],
          temporalQualifierIds: [],
          routeType: "maritime",
          uncertainty: [],
        },
      ],
    });
    expect(assessment.tier).toBe("explanatory");
    expect(assessment.score).toBeGreaterThanOrEqual(5);
    expect(scoreMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text, "place")],
      entities: [
        geoEntity("e1", "claim-1", "England", "origin"),
        geoEntity("e2", "claim-1", "Normandy", "destination"),
      ],
      geographicQualifiers: [
        { id: "g1", claimId: "claim-1", entityMentionId: "e1", role: "origin" },
        { id: "g2", claimId: "claim-1", entityMentionId: "e2", role: "destination" },
      ],
      mapIntents: [
        {
          claimIds: ["claim-1"],
          mapPurpose: "expedition-route",
          movingActorEntityMentionIds: [],
          originPlaceMentionIds: ["e1"],
          destinationPlaceMentionIds: ["e2"],
          waypointPlaceMentionIds: [],
          temporalQualifierIds: [],
          routeType: "maritime",
          uncertainty: [],
        },
      ],
    }).eligible).toBe(true);
  });

  it("does not treat incidental Europe references as preferred map opportunities", () => {
    const text = "The campaign changed Europe forever.";
    const assessment = assessMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text)],
      entities: [geoEntity("e1", "claim-1", "Europe")],
      geographicQualifiers: [
        { id: "g1", claimId: "claim-1", entityMentionId: "e1", role: "region" },
      ],
      mapIntents: [],
    });
    expect(assessment.tier).toBe("none");
    expect(scoreMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text)],
      entities: [geoEntity("e1", "claim-1", "Europe")],
      geographicQualifiers: [
        { id: "g1", claimId: "claim-1", entityMentionId: "e1", role: "region" },
      ],
      mapIntents: [],
    }).eligible).toBe(false);
  });

  it("does not treat birthplace geography as a map opportunity", () => {
    const text = "Napoleon was born in Corsica.";
    expect(
      assessMapOpportunityV35({
        claimIds: ["claim-1"],
        clusterText: text,
        claims: [materialClaim("claim-1", text)],
        entities: [geoEntity("e1", "claim-1", "Corsica")],
        geographicQualifiers: [
          { id: "g1", claimId: "claim-1", entityMentionId: "e1", role: "location" },
        ],
        mapIntents: [],
      }).reason
    ).toBe("incidental-biography-geography");
  });
});

describe("History V3.5 diagram modality selection", () => {
  it("scores causal system narration as a diagram opportunity", () => {
    const text =
      "Because plague killed so many workers, labour became scarce and wages rose, which alarmed elites.";
    const scored = scoreDiagramOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text, "causal")],
    });
    expect(scored.eligible).toBe(true);
    expect(scored.score).toBeGreaterThanOrEqual(4);
  });

  it("does not treat a simple factual statement as a diagram opportunity", () => {
    const text = "The treaty was signed in 1215.";
    expect(
      detectDiagramOpportunityV35({
        claimIds: ["claim-1"],
        clusterText: text,
        claims: [materialClaim("claim-1", text)],
      }).eligible
    ).toBe(false);
  });

  it("selects diagrams for causal collapse narration when opportunities compile", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: BRONZE_EPISODE,
      rawScript:
        "Copper from Cyprus and tin from distant regions were combined to make bronze. Drought, migration, trade disruption, and political instability combined to make collapse more likely.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: BRONZE_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: BRONZE_EPISODE,
      title: "Bronze Age Collapse",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    expect(plan.visualOpportunitySummary.eligibleDiagramOpportunities).toBeGreaterThan(0);
    expect(plan.diagramStates.length).toBeGreaterThan(0);
  });
});

describe("History V3.5 planner modality integration", () => {
  it("evaluates multi-location movement windows without changing beat count", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: DDAY_EPISODE,
      rawScript:
        "Ships left England and crossed the English Channel. Infantry landed on the Normandy beaches and then pushed inland toward Caen.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: DDAY_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const clusters = buildSegmentationClustersV35({ narration, structured });
    const plan = buildHistoryVisualPlanV35({
      episodeId: DDAY_EPISODE,
      title: "D-Day",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    expect(plan.beats.length).toBe(clusters.length);
  });
});
