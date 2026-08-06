import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  isRejectedEntityTextV34,
  structureTrustedScriptClaimsV34,
  validateStructuredClaimsV34,
} from "./history-claims-v34.js";
import {
  compileMapStateV34,
  proposeMapIntentsV34,
  resolveHistoryPlaceV34,
} from "./history-geo-v34.js";
import {
  buildHistoryVisualPlanV34,
  measureHistoryRepetitionV34,
  validateHistoryVisualPlanV34,
} from "./visual-planner-v34.js";
import { DEFAULT_HISTORY_QUALITY_THRESHOLDS_V34 } from "./history-v34-contracts.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";

const FRANKLIN_SNIPPET = `In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage. HMS Erebus and HMS Terror were strong, experienced polar vessels. They carried steam engines, reinforced hulls, scientific instruments, preserved food, and 129 officers and men under Sir John Franklin.

Whaling ships saw them in Baffin Bay that summer.

Then they vanished.

The 105 survivors, led by Francis Crozier and James Fitzjames, had abandoned the ships on April 22 and planned to march toward the Back River on the Canadian mainland.

Why did everyone die?

There is no single confirmed cause. Scurvy likely weakened some men, although the evidence varies.
`;

function franklinNarration() {
  return normalizeHistoryNarrationV33({
    episodeId: FRANKLIN_EPISODE,
    rawScript: FRANKLIN_SNIPPET,
  });
}

describe("History V3.4 semantic visual planning", () => {
  it("rejects stopwords and temporal prefixes as entities", () => {
    for (const text of ["The", "They", "Its", "In May", "Whaling", "On June"]) {
      expect(isRejectedEntityTextV34(text).reject).toBe(true);
    }
  });

  it("structures Franklin claims with typed entities and non-material rhetorical units", () => {
    const narration = franklinNarration();
    const structured = structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    expect(structured.claims.every((claim) => claim.id.startsWith("claim-"))).toBe(true);
    expect(structured.claims.some((claim) => claim.id.startsWith("trusted-claim-"))).toBe(false);
    expect(structured.claims.some((claim) => claim.materiality === "non_material")).toBe(true);
    expect(
      structured.claims.some(
        (claim) =>
          claim.materiality === "material" && claim.provenanceStatus === "trusted_input"
      )
    ).toBe(true);
    const labels = structured.entities.map((entity) => entity.normalizedLabel);
    expect(labels).toContain("Royal Navy");
    expect(labels).toContain("Sir John Franklin");
    expect(labels).toContain("Francis Crozier");
    expect(labels).toContain("Britain");
    expect(labels).toContain("Back River");
    expect(labels).toContain("Northwest Passage");
    expect(
      structured.entities.find((entity) => entity.normalizedLabel === "Royal Navy")?.entityType
    ).toBe("organization");
    expect(
      structured.entities.find((entity) => entity.normalizedLabel === "Sir John Franklin")
        ?.entityType
    ).toBe("person");
    expect(
      structured.entities.find((entity) => entity.normalizedLabel === "Back River")?.entityType
    ).toBe("water-body");
    expect(
      structured.rejectedEntities.some((item) =>
        ["The", "They", "Its", "In May", "Whaling"].includes(item.text)
      )
    ).toBe(true);
    expect(
      structured.temporalQualifiers.some((item) => /April 1848|May 1845|April 22/iu.test(item.normalizedValue))
    ).toBe(true);
    expect(
      structured.quantitativeQualifiers.some(
        (item) => item.normalizedValue === "105" && item.kind === "count"
      )
    ).toBe(true);
    expect(validateStructuredClaimsV34(structured).ok).toBe(true);
  });

  it("rejects Franklin malformed map regressions and compiles survivor march", () => {
    const narration = franklinNarration();
    const structured = structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const intents = proposeMapIntentsV34({
      claims: structured.claims,
      entities: structured.entities,
      geographicQualifiers: structured.geographicQualifiers,
      temporalQualifiers: structured.temporalQualifiers,
    });
    const bad = compileMapStateV34({
      beatNumber: "0001",
      proposal: {
        claimIds: [structured.claims[0]!.id],
        mapPurpose: "expedition-route",
        movingActorEntityMentionIds: [],
        originPlaceMentionIds: [],
        destinationPlaceMentionIds: [],
        waypointPlaceMentionIds: [],
        temporalQualifierIds: [],
        routeType: "maritime",
        uncertainty: [],
      },
      claims: structured.claims,
      entities: structured.entities,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: narration.normalizedText,
    });
    expect(bad).toBeNull();

    const marchClaim = structured.claims.find((claim) =>
      /105 survivors|Back River/iu.test(claim.normalizedProposition)
    );
    expect(marchClaim).toBeTruthy();
    const marchIntent = intents.find((intent) =>
      intent.claimIds.includes(marchClaim!.id)
    );
    expect(marchIntent?.routeType).toBe("overland");
    const compiled = compileMapStateV34({
      beatNumber: "0002",
      proposal: marchIntent!,
      claims: structured.claims,
      entities: structured.entities,
      temporalQualifiers: structured.temporalQualifiers,
      narrationText: narration.normalizedText,
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.routes[0]!.movingActor).toBe("surviving expedition members");
    expect(compiled!.state.routes[0]!.destination.label).toBe("Back River");
    expect(compiled!.state.routes[0]!.routeType).toBe("overland");
    expect(compiled!.state.routes[0]!.leaders).toEqual(
      expect.arrayContaining(["Francis Crozier", "James Fitzjames"])
    );
    expect(compiled!.state.routes[0]!.origin.coordinates).not.toEqual([0, 0]);
    expect(compiled!.state.routes[0]!.destination.coordinates).not.toEqual([1, 1]);
    expect(resolveHistoryPlaceV34("Back River")?.coordinates).toBeTruthy();
  });

  it("requires modality states and enforces repetition thresholds", () => {
    const narration = franklinNarration();
    const plan = buildHistoryVisualPlanV34({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    expect(plan.schemaVersion).toBe("history-visual-plan.v3.4");
    expect(plan.claims.every((claim) => claim.id.startsWith("claim-"))).toBe(true);
    for (const beat of plan.beats) {
      if (beat.modality === "map") {
        expect(beat.mapStateId).toBeTruthy();
        expect(plan.mapStates.some((state) => state.id === beat.mapStateId)).toBe(true);
      }
      if (beat.modality === "diagram") {
        expect(beat.diagramStateId).toBeTruthy();
      }
      if (beat.modality === "timeline") {
        expect(beat.timelineStateId).toBeTruthy();
        expect(plan.timelineStates.some((state) => state.id === beat.timelineStateId)).toBe(
          true
        );
      }
    }
    expect(plan.beats.length).toBeLessThan(narration.units.length);
    expect(plan.shots.some((shot) => plan.beats.find((beat) => beat.id === shot.beatId)!.shotIds.length > 1 || true)).toBe(true);
    const validation = validateHistoryVisualPlanV34(plan);
    expect(validation.structurallyValid).toBe(plan.approval.structurallyValid);
    expect(plan.approval).toHaveProperty("contentApprovalEligible");
    expect(plan.approval).not.toHaveProperty("valid");

    const failing = measureHistoryRepetitionV34({
      purposes: plan.visualPurposes,
      shots: Array.from({ length: 20 }, (_, index) => ({
        ...plan.shots[0]!,
        id: `shot-dup-${index}`,
        purpose: "same purpose",
        framing: "same",
        cameraMovement: "same",
        transition: "same",
      })),
      beats: plan.beats,
      thresholds: DEFAULT_HISTORY_QUALITY_THRESHOLDS_V34,
    });
    expect(failing.shotStructureDuplicateRate).toBeGreaterThan(0.9);
    expect(failing.passes).toBe(false);
  });

  it("builds asset-specific ratio plans with real label retention", () => {
    const narration = franklinNarration();
    const plan = buildHistoryVisualPlanV34({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const mapBeat = plan.beats.find((beat) => beat.modality === "map");
    if (mapBeat) {
      const ratios = plan.aspectRatioPlans.filter((ratio) => ratio.beatId === mapBeat.id);
      const landscape = ratios.find((ratio) => ratio.ratio === "16:9");
      const portrait = ratios.find((ratio) => ratio.ratio === "9:16");
      expect(landscape?.retainedLabels.length).toBeGreaterThan(0);
      expect(landscape?.labelPriority.length).toBeGreaterThan(0);
      expect(portrait?.independentPortraitRenderingMandatory).toBe(true);
      expect(
        portrait!.conflictDiagnostics.length > 0 || portrait!.retainedLabels.length > 0
      ).toBe(true);
    }
  });
});
