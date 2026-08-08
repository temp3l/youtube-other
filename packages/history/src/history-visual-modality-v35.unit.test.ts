import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import { buildHistoryVisualPlanV35 } from "./visual-planner-v35.js";
import {
  detectDiagramOpportunityV35,
  detectMapOpportunityV35,
  scoreDiagramOpportunityV35,
  scoreMapOpportunityV35,
} from "./history-visual-opportunity-v35.js";

const DDAY_EPISODE =
  "history-youtube-history-30-video-story-pack-32-d-day-allied-invasion-of-normandy";
const BLACK_DEATH_EPISODE =
  "history-youtube-history-10-video-story-pack-02-black-death";
const BRONZE_EPISODE =
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse";

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

describe("History V3.5 map modality selection", () => {
  it("scores invasion and landing narration as strong map opportunities", () => {
    const text =
      "Allied forces crossed the English Channel and landed on the Normandy beaches before advancing inland.";
    const scored = scoreMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text, "place")],
      entities: [
        {
          id: "entity-normandy",
          claimId: "claim-1",
          text: "Normandy",
          normalizedLabel: "Normandy",
          entityType: "region",
          semanticRole: "destination",
          narrationSpan: { startUtf16: 0, endUtf16Exclusive: 8 },
          confidenceSource: "deterministic",
        },
      ],
      geographicQualifiers: [
        {
          id: "geo-1",
          claimId: "claim-1",
          entityMentionId: "entity-normandy",
          role: "destination",
        },
      ],
      mapIntents: [],
    });
    expect(scored.eligible).toBe(true);
    expect(scored.score).toBeGreaterThanOrEqual(4);
  });

  it("does not treat incidental birthplace geography as a map opportunity", () => {
    const text = "Napoleon was born in Corsica.";
    const scored = scoreMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text)],
      entities: [
        {
          id: "entity-corsica",
          claimId: "claim-1",
          text: "Corsica",
          normalizedLabel: "Corsica",
          entityType: "place",
          semanticRole: "location",
          narrationSpan: { startUtf16: 0, endUtf16Exclusive: 7 },
          confidenceSource: "deterministic-inferred",
        },
      ],
      geographicQualifiers: [
        {
          id: "geo-1",
          claimId: "claim-1",
          entityMentionId: "entity-corsica",
          role: "location",
        },
      ],
      mapIntents: [],
    });
    expect(scored.eligible).toBe(false);
    expect(detectMapOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text)],
      entities: [
        {
          id: "entity-corsica",
          claimId: "claim-1",
          text: "Corsica",
          normalizedLabel: "Corsica",
          entityType: "place",
          semanticRole: "location",
          narrationSpan: { startUtf16: 0, endUtf16Exclusive: 7 },
          confidenceSource: "deterministic-inferred",
        },
      ],
      geographicQualifiers: [
        {
          id: "geo-1",
          claimId: "claim-1",
          entityMentionId: "entity-corsica",
          role: "location",
        },
      ],
      mapIntents: [],
    }).reason).toBe("incidental-biography-geography");
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
    expect(scored.score).toBeGreaterThanOrEqual(3);
    expect(
      detectDiagramOpportunityV35({
        claimIds: ["claim-1"],
        clusterText: text,
        claims: [materialClaim("claim-1", text, "causal")],
      }).eligible
    ).toBe(true);
  });

  it("does not treat a simple factual statement as a diagram opportunity", () => {
    const text = "The treaty was signed in 1215.";
    const scored = scoreDiagramOpportunityV35({
      claimIds: ["claim-1"],
      clusterText: text,
      claims: [materialClaim("claim-1", text)],
    });
    expect(scored.eligible).toBe(false);
    expect(scored.score).toBe(0);
  });
});

describe("History V3.5 planner modality integration", () => {
  it("selects maps for multi-stage movement narration when geography is present", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: DDAY_EPISODE,
      rawScript:
        "Allied planners prepared five landing sectors along the Normandy coast. Ships crossed the English Channel before dawn. Infantry landed on the beaches and then pushed inland toward Caen.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: DDAY_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: DDAY_EPISODE,
      title: "D-Day",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    expect(plan.mapStates.length).toBeGreaterThan(0);
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
