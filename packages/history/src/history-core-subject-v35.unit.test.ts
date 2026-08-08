import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { structureTrustedScriptClaimsV34 } from "./history-claims-v34.js";
import { buildHistoryVisualPlanV35 } from "./visual-planner-v35.js";
import {
  assessCoreSubjectCompletenessV35,
  deriveCoreSubjectsV35,
  isCoreSubjectResolvedV35,
} from "./history-core-subject-v35.js";
import { normalizeEntityCandidateSpanV35 } from "./history-entity-resolution-v35.js";
import { resolveHistoryPlaceV34 } from "./history-geo-v34.js";
import { compileAbstractCausalDiagramV35 } from "./history-diagram-compile-v35.js";
import { buildVisualOpportunitiesV35 } from "./history-visual-opportunity-v35.js";

const CLEOPATRA_EPISODE =
  "history-youtube-history-10-video-story-pack-09-cleopatra-beyond-legend";
const SPARTACUS_EPISODE =
  "history-youtube-history-30-video-story-pack-15-spartacus-slave-army";
const HANNIBAL_EPISODE =
  "history-youtube-history-30-video-story-pack-16-hannibal-at-cannae";
const CAESAR_EPISODE =
  "history-youtube-history-30-video-story-pack-13-caesar-in-gaul";
const MONGOL_EPISODE = "history-youtube-history-10-video-story-pack-06-mongol-war-machine";
const ROME_EPISODE = "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire";
const TITANIC_EPISODE = "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster";

function narrationFor(episodeId: string, rawScript: string) {
  return normalizeHistoryNarrationV33({ episodeId, rawScript });
}

describe("normalizeEntityCandidateSpanV35", () => {
  it.each([
    ["At Adrianople", "Adrianople"],
    ["In Mamluk Egypt", "Mamluk Egypt"],
    ["But Titanic", "Titanic"],
    ["At Pompeii", "Pompeii"],
    ["Perhaps Spartacus", "Spartacus"],
    ["At Cannae", "Cannae"],
    ["As Alexander", "Alexander"],
    ["In East Anglia", "East Anglia"],
  ])("normalizes %s -> %s", (input, expected) => {
    expect(normalizeEntityCandidateSpanV35(input).normalizedText).toBe(expected);
  });

  it("preserves legitimate names that merely resemble discourse prefixes", () => {
    expect(normalizeEntityCandidateSpanV35("Inuit").normalizedText).toBe("Inuit");
    expect(normalizeEntityCandidateSpanV35("Indian Ocean").normalizedText).toBe("Indian Ocean");
    expect(normalizeEntityCandidateSpanV35("Victorian Britain").normalizedText).toBe(
      "Victorian Britain"
    );
  });
});

describe("canonical resolution for reviewed entities", () => {
  it("resolves malformed place prefixes into canonical entities", () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: HANNIBAL_EPISODE,
      narration: narrationFor(
        HANNIBAL_EPISODE,
        "At Cannae, Hannibal Barca surrounded the Roman army. At Lake Trasimene, Fabius Maximus delayed him."
      ),
    });
    expect(structured.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining([
        "Cannae",
        "Hannibal Barca",
        "Lake Trasimene",
        "Fabius Maximus",
      ])
    );
  });

  it("resolves Cleopatra, Spartacus, and Vesuvius/Pompeii labels", () => {
    const cleopatra = structureTrustedScriptClaimsV34({
      episodeId: CLEOPATRA_EPISODE,
      narration: narrationFor(
        CLEOPATRA_EPISODE,
        "Cleopatra ruled Ptolemaic Egypt from Alexandria while negotiating with Mark Antony."
      ),
    });
    expect(cleopatra.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["Cleopatra", "Ptolemaic Egypt", "Alexandria", "Mark Antony"])
    );

    const spartacus = structureTrustedScriptClaimsV34({
      episodeId: SPARTACUS_EPISODE,
      narration: narrationFor(
        SPARTACUS_EPISODE,
        "Spartacus led the revolt while Marcus Licinius Crassus prepared a punitive response."
      ),
    });
    expect(spartacus.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["Spartacus", "Marcus Licinius Crassus"])
    );

    const vesuvius = structureTrustedScriptClaimsV34({
      episodeId: "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day",
      narration: narrationFor(
        "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day",
        "At Pompeii and Stabiae, Mount Vesuvius buried towns within hours."
      ),
    });
    expect(vesuvius.entities.map((entity) => entity.normalizedLabel)).toEqual(
      expect.arrayContaining(["Pompeii", "Stabiae", "Mount Vesuvius"])
    );
  });

  it("keeps plague and terror safety regressions intact", () => {
    const rome = structureTrustedScriptClaimsV34({
      episodeId: ROME_EPISODE,
      narration: narrationFor(
        ROME_EPISODE,
        "When that cycle worked, Rome could recover from invasion, rebellion, plague, and civil war."
      ),
    });
    expect(rome.entities.some((entity) => entity.normalizedLabel === "Black Death")).toBe(false);

    const mongol = structureTrustedScriptClaimsV34({
      episodeId: MONGOL_EPISODE,
      narration: narrationFor(
        MONGOL_EPISODE,
        "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest."
      ),
    });
    expect(mongol.entities.some((entity) => entity.normalizedLabel === "HMS Terror")).toBe(false);
  });
});

describe("core-subject completeness", () => {
  it("blocks when Cleopatra remains unresolved", () => {
    const issues = assessCoreSubjectCompletenessV35({
      coreSubjects: deriveCoreSubjectsV35({
        episodeId: CLEOPATRA_EPISODE,
        title: "Cleopatra Beyond the Legend: Pharaoh, Politician, and Enemy of Rome",
        keywords: ["Cleopatra VII", "Ptolemaic Egypt"],
      }),
      entities: [{ normalizedLabel: "Rome" } as never],
      rejectedEntities: [],
      narrationText: "Cleopatra ruled Egypt and challenged Rome.",
    });
    expect(issues.some((issue) => issue.code === "CORE_ENTITY_UNRESOLVED")).toBe(true);
    expect(issues.some((issue) => issue.affectedIds.includes("Cleopatra"))).toBe(true);
  });

  it("blocks when Spartacus or Hannibal Barca remain unresolved", () => {
    for (const [episodeId, title, subject] of [
      [
        SPARTACUS_EPISODE,
        "Spartacus: How a Slave Army Terrified Rome",
        "Spartacus",
      ],
      [HANNIBAL_EPISODE, "Hannibal at Cannae: Rome’s Worst Day", "Hannibal Barca"],
    ] as const) {
      const issues = assessCoreSubjectCompletenessV35({
        coreSubjects: deriveCoreSubjectsV35({ episodeId, title }),
        entities: [],
        rejectedEntities: [],
        narrationText: `${subject} shaped the campaign described in this episode.`,
      });
      expect(
        issues.some(
          (issue) =>
            issue.code === "CORE_ENTITY_UNRESOLVED" ||
            issue.code === "CORE_ENTITY_CANDIDATE_RECALL_FAILURE"
        )
      ).toBe(true);
      expect(issues.some((issue) => issue.affectedIds.includes(subject))).toBe(true);
    }
  });

  it("passes when core subject resolves even if supporting entities do not", () => {
    expect(
      isCoreSubjectResolvedV35("Cleopatra", ["Cleopatra", "Rome"])
    ).toBe(true);
    const issues = assessCoreSubjectCompletenessV35({
      coreSubjects: deriveCoreSubjectsV35({
        episodeId: CLEOPATRA_EPISODE,
        title: "Cleopatra Beyond the Legend",
      }),
      entities: [{ normalizedLabel: "Cleopatra" } as never],
      rejectedEntities: [{ text: "Octavian", reason: "uncanonical-surface" } as never],
      narrationText: "Cleopatra ruled Egypt while Octavian prepared his response.",
    });
    expect(issues).toEqual([]);
  });
});

describe("candidate recall and planner gates", () => {
  it("requires Caesar to enter entity resolution in Caesar-focused narration", () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: CAESAR_EPISODE,
      narration: narrationFor(
        CAESAR_EPISODE,
        "Caesar crossed into Gaul. Caesar consolidated control while Rome watched closely."
      ),
      knownEntities: ["Julius Caesar", "Gaul", "Rome"],
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "Julius Caesar")).toBe(
      true
    );
    const recallIssues = assessCoreSubjectCompletenessV35({
      coreSubjects: deriveCoreSubjectsV35({
        episodeId: CAESAR_EPISODE,
        title: "Caesar in Gaul",
        keywords: ["Caesar", "Gaul"],
      }),
      entities: structured.entities,
      rejectedEntities: structured.rejectedEntities,
      narrationText: structured.claims.map((claim) => claim.normalizedProposition).join("\n"),
    });
    expect(recallIssues.some((issue) => issue.code === "CORE_ENTITY_CANDIDATE_RECALL_FAILURE")).toBe(
      false
    );
  });

  it("sets content and editorial gates false when core subject is unresolved", () => {
    const plan = buildHistoryVisualPlanV35({
      episodeId: CLEOPATRA_EPISODE,
      title: "Cleopatra Beyond the Legend",
      narration: narrationFor(CLEOPATRA_EPISODE, "Rome remembered the war differently."),
      structuredClaims: structureTrustedScriptClaimsV34({
        episodeId: CLEOPATRA_EPISODE,
        narration: narrationFor(CLEOPATRA_EPISODE, "Rome remembered the war differently."),
      }),
      metadataKeywords: ["Cleopatra VII"],
    });
    expect(plan.diagnostics.some((item) => item.code === "CORE_ENTITY_UNRESOLVED")).toBe(true);
    expect(plan.approval.contentApprovalEligible).toBe(false);
    expect(plan.approval.editoriallyReviewable).toBe(false);
  });
});

describe("structured visuals and modality diagnostics", () => {
  it("compiles a narration-bound abstract causal diagram for Mongol logistics text", () => {
    const compiled = compileAbstractCausalDiagramV35({
      beatNumber: "0006",
      text: "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest.",
      claimIds: ["claim-1"],
      claims: [
        {
          id: "claim-1",
          claimKind: "causal",
          materiality: "material",
          normalizedProposition:
            "Its strength came from combining organization, mobility, intelligence, discipline, engineering, logistics, diplomacy, and terror into a coherent method of conquest.",
          narrationUnitIds: ["unit-1"],
          authorityMode: "trusted-script",
          provenanceStatus: "trusted_input",
          independentlyVerified: false,
          temporalQualifierIds: [],
          geographicQualifierIds: [],
          quantitativeQualifierIds: [],
          entityMentionIds: [],
          sourceSpanIds: [],
          uncertainty: [],
          rhetoricalRole: "assertion",
        },
      ],
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.state.nodes.length).toBeGreaterThanOrEqual(2);
    expect(compiled!.state.edges.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects insufficiently grounded diagram proposals with diagram-specific diagnostics", () => {
    const opportunities = buildVisualOpportunitiesV35({
      beatId: "beat-1",
      clusterText: "A quiet archival image may be enough here.",
      claimIds: ["claim-1"],
      narrationUnitIds: ["unit-1"],
      claims: [
        {
          id: "claim-1",
          claimKind: "other",
          materiality: "non_material",
          normalizedProposition: "A quiet archival image may be enough here.",
          narrationUnitIds: ["unit-1"],
          authorityMode: "trusted-script",
          provenanceStatus: "trusted_input",
          independentlyVerified: false,
          temporalQualifierIds: [],
          geographicQualifierIds: [],
          quantitativeQualifierIds: [],
          entityMentionIds: [],
          sourceSpanIds: [],
          uncertainty: [],
          rhetoricalRole: "assertion",
        },
      ],
      entities: [],
      geographicQualifiers: [],
      mapIntents: [],
      selectedModality: "archival image",
      mapCompiled: false,
      diagramCompiled: false,
      diagramRejectionReason: "no-supported-structured-relationship",
    }).opportunities;
    const diagram = opportunities.find((item) => item.type === "diagram");
    expect(diagram?.rejectionReason).toBe("no-supported-structured-relationship");
    expect(diagram?.rejectionReason).not.toMatch(/Map proposal failed/i);
  });

  it("keeps map and diagram rejection reasons modality-specific", () => {
    const opportunities = buildVisualOpportunitiesV35({
      beatId: "beat-2",
      clusterText: "Movement from Rome to Constantinople remained contested.",
      claimIds: ["claim-2"],
      narrationUnitIds: ["unit-2"],
      claims: [
        {
          id: "claim-2",
          claimKind: "place",
          materiality: "material",
          normalizedProposition: "Movement from Rome to Constantinople remained contested.",
          narrationUnitIds: ["unit-2"],
          authorityMode: "trusted-script",
          provenanceStatus: "trusted_input",
          independentlyVerified: false,
          temporalQualifierIds: [],
          geographicQualifierIds: [],
          quantitativeQualifierIds: [],
          entityMentionIds: [],
          sourceSpanIds: [],
          uncertainty: [],
          rhetoricalRole: "assertion",
        },
      ],
      entities: [
        {
          id: "entity-rome",
          claimId: "claim-2",
          text: "Rome",
          normalizedLabel: "Rome",
          entityType: "place",
          semanticRole: "origin",
          narrationSpan: { startUtf16: 0, endUtf16Exclusive: 4 },
          confidenceSource: "deterministic",
        },
        {
          id: "entity-constantinople",
          claimId: "claim-2",
          text: "Constantinople",
          normalizedLabel: "Constantinople",
          entityType: "place",
          semanticRole: "destination",
          narrationSpan: { startUtf16: 20, endUtf16Exclusive: 34 },
          confidenceSource: "deterministic",
        },
      ],
      geographicQualifiers: [],
      mapIntents: [
        {
          id: "map-intent-1",
          claimIds: ["claim-2"],
          purpose: "movement-route",
          originLabel: "Rome",
          destinationLabel: "Constantinople",
          routeType: "movement",
        },
      ],
      selectedModality: "archival image",
      mapCompiled: false,
      diagramCompiled: false,
      mapRejectionReason: "Map proposal failed place, actor, route, or coordinate validation.",
      diagramRejectionReason: "Diagram lacked narration-bound nodes/edges.",
    }).opportunities;
    const map = opportunities.find((item) => item.type === "map");
    const diagram = opportunities.find((item) => item.type === "diagram");
    expect(map?.rejectionReason).toMatch(/Map proposal failed/i);
    expect(diagram?.rejectionReason).toMatch(/Diagram lacked narration-bound/i);
    expect(map?.rejectionReason).not.toMatch(/Diagram lacked/i);
    expect(diagram?.rejectionReason).not.toMatch(/Map proposal failed/i);
  });

  it("resolves At Pompeii into a canonical place for map compilation", () => {
    const structured = structureTrustedScriptClaimsV34({
      episodeId: "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day",
      narration: narrationFor(
        "history-youtube-history-30-video-story-pack-11-pompeii-the-last-day",
        "At Pompeii, residents had little warning before the eruption."
      ),
    });
    expect(structured.entities.some((entity) => entity.normalizedLabel === "Pompeii")).toBe(true);
    expect(resolveHistoryPlaceV34("Pompeii")).not.toBeNull();
  });

  it("compiles at least one supported diagram in the Titanic episode plan", () => {
    const plan = buildHistoryVisualPlanV35({
      episodeId: TITANIC_EPISODE,
      title: "Titanic: Decisions and Disaster",
      narration: narrationFor(
        TITANIC_EPISODE,
        "After the collision, flooding spread through watertight compartments while officers debated evacuation and lifeboat deployment."
      ),
    });
    expect(plan.diagramStates.some((state) => state.nodes.length >= 2)).toBe(true);
  });
});
