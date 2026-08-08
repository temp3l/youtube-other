import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import { buildHistoryVisualPlanV35 } from "./visual-planner-v35.js";
import {
  isEntityTypeCompatibleWithSurfaceV35,
  isSafeCanonicalEntityAliasMatchV35,
  normalizeEntityCandidateSpanV35,
} from "./history-entity-resolution-v35.js";
import {
  validatePlanStateEvidenceClosureV35,
  validateStateBoundShotEvidenceClosureV35,
} from "./history-state-evidence-closure-v35.js";

const MONGOL_EPISODE = "history-youtube-history-10-video-story-pack-06-mongol-war-machine";
const ROME_EPISODE = "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire";
const TITANIC_EPISODE = "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster";

function narrationFor(episodeId: string, rawScript: string) {
  return normalizeHistoryNarrationV33({ episodeId, rawScript });
}

describe("History V3.5 entity resolution hardening", () => {
  it.each([
    ["At Adrianople", "Adrianople"],
    ["In Mamluk Egypt", "Mamluk Egypt"],
    ["But Titanic", "Titanic"],
    ["At Pompeii", "Pompeii"],
    ["Perhaps Spartacus", "Spartacus"],
    ["At Cannae", "Cannae"],
    ["As Alexander", "Alexander"],
    ["In East Anglia", "East Anglia"],
  ])("normalizes candidate span %s -> %s", (input, expected) => {
    expect(normalizeEntityCandidateSpanV35(input).normalizedText).toBe(expected);
  });

  it("preserves legitimate names during candidate normalization", () => {
    expect(normalizeEntityCandidateSpanV35("Inuit").normalizedText).toBe("Inuit");
    expect(normalizeEntityCandidateSpanV35("Victorian Britain").normalizedText).toBe(
      "Victorian Britain"
    );
  });

  it('does not resolve lowercase "terror" to HMS Terror in Mongol context', () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: MONGOL_EPISODE,
      narration: narrationFor(
        MONGOL_EPISODE,
        "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest."
      ),
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "HMS Terror")).toBe(
      false
    );
  });

  it('does not resolve generic "plague" to Black Death in Fall-of-Rome context', () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: ROME_EPISODE,
      narration: narrationFor(
        ROME_EPISODE,
        "When that cycle worked, Rome could recover from invasion, rebellion, plague, and civil war."
      ),
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "Black Death")).toBe(
      false
    );
  });

  it("resolves Genghis Khan and Khwarazmian Empire in Mongol narration", () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: MONGOL_EPISODE,
      narration: narrationFor(
        MONGOL_EPISODE,
        "Temüjin, later known as Genghis Khan, attacked the Khwarazmian Empire across the Middle East."
      ),
    });
    expect(structured.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["Genghis Khan", "Khwarazmian Empire", "Middle East"])
    );
  });

  it("resolves Titanic and Carpathia in Titanic episode context", () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: TITANIC_EPISODE,
      narration: narrationFor(
        TITANIC_EPISODE,
        "RMS Titanic sent distress calls. RMS Carpathia responded immediately."
      ),
    });
    expect(structured.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["RMS Titanic", "RMS Carpathia"])
    );
  });

  it("rejects abstract terror as a vessel type match", () => {
    expect(
      isEntityTypeCompatibleWithSurfaceV35({ surface: "terror", entityType: "ship" })
    ).toBe(false);
    expect(
      isSafeCanonicalEntityAliasMatchV35({
        surface: "terror",
        aliasKey: "terror",
        seed: { label: "HMS Terror", entityType: "ship" },
        unitText: "diplomacy, and terror into a coherent method",
        episodeId: MONGOL_EPISODE,
      })
    ).toBe(false);
  });

  it("does not let Mongol visual planning use HMS Terror as protected subject", () => {
    const plan = buildHistoryVisualPlanV35({
      episodeId: MONGOL_EPISODE,
      title: "Mongol War Machine",
      narration: narrationFor(
        MONGOL_EPISODE,
        "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest."
      ),
    });
    expect(plan.visualConcepts.every((concept) => concept.historicalSubject !== "HMS Terror")).toBe(
      true
    );
    expect(
      plan.visualPurposes.every((purpose) => !purpose.visualPurpose.includes("HMS Terror"))
    ).toBe(true);
  });
});

describe("History V3.5 state evidence closure", () => {
  it("flags unsupported factual claims on a referenced diagram state", () => {
    const failures = validateStateBoundShotEvidenceClosureV35({
      shot: {
        id: "shot-test",
        beatId: "beat-test",
        factualLabels: ["claim-a", "claim-c"],
        modalityStateReference: "diagram-state-test",
      },
      state: {
        id: "diagram-state-test",
        evidenceClaimIds: ["claim-a", "claim-b"],
        nodes: [
          { id: "n1", label: "a", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
          { id: "n2", label: "b", linkedClaimIds: ["claim-b"], entityMentionIds: [] },
        ],
      },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.unsupportedClaimIds).toEqual(["claim-c"]);
  });

  it("accepts shots whose factual claims are fully supported", () => {
    const failures = validatePlanStateEvidenceClosureV35({
      shots: [
        {
          id: "shot-valid",
          beatId: "beat-valid",
          factualLabels: ["claim-a"],
          modalityStateReference: "diagram-state-valid",
        },
        {
          id: "shot-map-valid",
          beatId: "beat-map-valid",
          factualLabels: ["claim-a"],
          modalityStateReference: "map-state-valid",
        },
      ],
      diagramStates: [
        {
          id: "diagram-state-valid",
          evidenceClaimIds: ["claim-a", "claim-b"],
          nodes: [
            { id: "n1", label: "a", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
          ],
        },
      ],
      mapStates: [
        {
          id: "map-state-valid",
          labels: [{ text: "Europe", placeId: "place-1", linkedClaimIds: ["claim-a"] }],
          compilerResolution: { scopeClaimIds: ["claim-a"], geoFactIds: [] },
        },
      ],
    });
    expect(failures).toEqual([]);
  });
});
