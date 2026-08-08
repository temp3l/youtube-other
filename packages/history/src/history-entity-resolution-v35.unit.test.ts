import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  isCredibleGeographicCandidateV35,
  lookupCanonicalEntitySeedV34,
  structureTrustedScriptClaimsV34,
} from "./history-claims-v34.js";
import { assessVisualSemanticCoverageV35 } from "./history-visual-semantics-v35.js";
import { buildHistoryVisualPlanV35 } from "./visual-planner-v35.js";
import {
  adjudicateEntityResolutionV35,
  classifyEntityCandidateV35,
  isEligibleGeographicResolutionCandidateV35,
  isEntityTypeCompatibleWithSurfaceV35,
  isHistoricalEventTerrorContextV35,
  isSafeCanonicalEntityAliasMatchV35,
  normalizeEntityCandidateSpanV35,
  resolveCanonicalEntityV35,
} from "./history-entity-resolution-v35.js";
import {
  validatePlanStateEvidenceClosureV35,
  validateStateBoundShotEvidenceClosureV35,
} from "./history-state-evidence-closure-v35.js";

const MONGOL_EPISODE = "history-youtube-history-10-video-story-pack-06-mongol-war-machine";
const ROME_EPISODE = "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire";
const TITANIC_EPISODE = "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster";
const PEARL_HARBOR_EPISODE =
  "history-youtube-history-30-video-story-pack-33-pearl-harbor-road-to-war";
const RAPA_NUI_EPISODE =
  "history-youtube-history-30-video-story-pack-40-rapa-nui-collapse-myth";
const REIGN_OF_TERROR_EPISODE =
  "history-youtube-history-30-video-story-pack-37-french-revolution-reign-of-terror";

function narrationFor(episodeId: string, rawScript: string) {
  return normalizeHistoryNarrationV33({ episodeId, rawScript });
}

describe("History V3.5 entity resolution hardening", () => {
  it.each([
    ["At Adrianople", "Adrianople"],
    ["In Mamluk Egypt", "Mamluk Egypt"],
    ["But Titanic", "Titanic"],
    ["At Pompeii", "Pompeii"],
    ["Near Dyrrhachium", "Dyrrhachium"],
    ["Under Sneferu", "Sneferu"],
    ["After Egypt", "Egypt"],
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

  it('does not resolve lowercase pronoun "us" to United States', () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: ROME_EPISODE,
      narration: narrationFor(
        ROME_EPISODE,
        "Roman writers warned us against trusting unreliable allies during civil war."
      ),
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "United States")).toBe(
      false
    );
  });

  it('resolves explicit "US" geopolitical abbreviation to United States', () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: ROME_EPISODE,
      narration: narrationFor(ROME_EPISODE, "US policy shifted after the crisis ended."),
    });
    expect(structured.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["United States"])
    );
  });

  it('does not resolve "America" subspan inside "Central America" to United States', () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: ROME_EPISODE,
      narration: narrationFor(
        ROME_EPISODE,
        "Trade routes linked Rome to Central America through intermediaries."
      ),
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "United States")).toBe(
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

describe("History V3.5 entity resolution architecture", () => {
  it("resolves Pearl Harbor to canonical place", () => {
    const seed = lookupCanonicalEntitySeedV34("Pearl Harbor");
    const resolution = resolveCanonicalEntityV35({
      surface: "Pearl Harbor",
      unitText: "Japanese aircraft attacked Pearl Harbor in Hawaii.",
      episodeId: PEARL_HARBOR_EPISODE,
      seed,
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status === "resolved") {
      expect(resolution.canonicalLabel).toBe("Pearl Harbor");
    }
    const structured = structureTrustedScriptClaimsV34({
      episodeId: PEARL_HARBOR_EPISODE,
      narration: narrationFor(
        PEARL_HARBOR_EPISODE,
        "At 7:48 on the morning of December 7, 1941, Japanese aircraft began attacking the United States naval base at Pearl Harbor in Hawaii."
      ),
    });
    expect(structured.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["Pearl Harbor"])
    );
    expect(structured.rejectedEntities.some((item) => item.text === "Pearl Harbor")).toBe(false);
  });

  it("links Rapa Nui and Easter Island to the same canonical island entity", () => {
    const rapaSeed = lookupCanonicalEntitySeedV34("Rapa Nui");
    const easterSeed = lookupCanonicalEntitySeedV34("Easter Island");
    expect(rapaSeed?.label).toBe("Rapa Nui");
    expect(easterSeed?.label).toBe("Rapa Nui");
    const structured = structureTrustedScriptClaimsV34({
      episodeId: RAPA_NUI_EPISODE,
      narration: narrationFor(
        RAPA_NUI_EPISODE,
        "Rapa Nui is one of the most isolated inhabited islands on Earth."
      ),
    });
    expect(structured.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["Rapa Nui"])
    );
  });

  it.each([
    "Golden Horn",
    "Lake Texcoco",
    "North Africa",
    "Asia Minor",
    "Mexico City",
    "Angkor Wat",
    "English Channel",
    "Chesapeake Bay",
    "Hatteras Island",
  ])("treats %s as a geographic-eligible candidate", (surface) => {
    expect(
      isEligibleGeographicResolutionCandidateV35({
        text: surface,
        seed: lookupCanonicalEntitySeedV34(surface),
      })
    ).toBe(true);
    expect(classifyEntityCandidateV35({ surface, seed: lookupCanonicalEntitySeedV34(surface) }).kind).toBe(
      "place"
    );
  });

  it.each([
    "Marie Antoinette",
    "National Convention",
    "German Sixth Army",
    "Manhattan Project",
    "First Triumvirate",
    "Georges Danton",
  ])("excludes %s from geographic coverage denominator", (surface) => {
    expect(isCredibleGeographicCandidateV35({ text: surface })).toBe(false);
    expect(
      classifyEntityCandidateV35({ surface, seed: lookupCanonicalEntitySeedV34(surface) })
        .geographicRelevance
    ).toBe(false);
  });

  it('does not resolve "The Reign of Terror" to HMS Terror', () => {
    const unitText = "His fall ended the most intense phase of the Reign of Terror.";
    expect(isHistoricalEventTerrorContextV35(unitText)).toBe(true);
    const structured = structureTrustedScriptClaimsV34({
      episodeId: REIGN_OF_TERROR_EPISODE,
      narration: narrationFor(REIGN_OF_TERROR_EPISODE, unitText),
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "HMS Terror")).toBe(
      false
    );
    expect(
      isSafeCanonicalEntityAliasMatchV35({
        surface: "Terror",
        aliasKey: "terror",
        seed: { label: "HMS Terror", entityType: "ship" },
        unitText,
        episodeId: REIGN_OF_TERROR_EPISODE,
      })
    ).toBe(false);
  });

  it("marks ambiguous input as ambiguous and unknown input as unresolved", () => {
    expect(
      resolveCanonicalEntityV35({
        surface: "Unknown Place Name",
        unitText: "They marched toward Unknown Place Name.",
        episodeId: ROME_EPISODE,
        seed: null,
      }).status
    ).toBe("unresolved");
    expect(
      adjudicateEntityResolutionV35({
        surface: "Dyrrhachium",
        surroundingContext: "Caesar crossed toward Dyrrhachium.",
        expectedKinds: ["place"],
        candidateEntityIds: ["Adrianople", "Dyrrhachium"],
      }).status
    ).toBe("ambiguous");
  });

  it("uses not-applicable geographic coverage when no eligible geographic candidates exist", () => {
    const coverage = assessVisualSemanticCoverageV35({
      entities: [
        { normalizedLabel: "Marie Antoinette", entityType: "person" },
        { normalizedLabel: "National Convention", entityType: "organization" },
      ],
      rejectedEntities: [
        { text: "Marie Antoinette", reason: "uncanonical-surface" },
        { text: "National Convention", reason: "uncanonical-surface" },
        { text: "German Sixth Army", reason: "uncanonical-surface" },
      ],
      beats: [{ id: "beat-1", modality: "map" }],
      mapStates: [{}],
      diagramStates: [],
      visualOpportunitySummary: { eligibleMapOpportunities: 2, eligibleDiagramOpportunities: 0 },
    });
    expect(coverage.some((item) => item.code === "ENTITY_RESOLUTION_COVERAGE_LOW")).toBe(false);
  });

  it("keeps geographic candidate invariant kind=place", () => {
    const coverage = assessVisualSemanticCoverageV35({
      entities: [
        { normalizedLabel: "North Africa", entityType: "region" },
        { normalizedLabel: "Golden Horn", entityType: "water-body" },
      ],
      rejectedEntities: [{ text: "Asia Minor", reason: "uncanonical-surface" }],
      beats: [{ id: "beat-1", modality: "map" }],
      mapStates: [],
      diagramStates: [],
      visualOpportunitySummary: { eligibleMapOpportunities: 0, eligibleDiagramOpportunities: 0 },
    });
    const kinds = coverage.flatMap((item) =>
      Array.isArray(item.payload.geographicCandidateKinds) ? item.payload.geographicCandidateKinds : []
    );
    expect(kinds.every((kind) => kind === "place")).toBe(true);
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
