import { describe, expect, it } from "vitest";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  inferHistoricalEntitySeedFromSurfaceV34,
  isCredibleGeographicCandidateV35,
  isRejectedEntityTextV34,
  shouldSurfaceEntityCandidateV35,
  structureTrustedScriptClaimsV34,
  validateStructuredClaimsV34,
} from "./history-claims-v34.js";
import {
  applyPlanApprovalPrerequisitesV35,
  buildHistoryVisualPlanV35,
  measureHistoryRepetitionV35,
  validateHistoryVisualPlanV35,
} from "./visual-planner-v35.js";
import {
  reserveDiagramBeatIndexesV35,
  scoreDiagramOpportunityV35,
} from "./history-visual-opportunity-v35.js";
import { enrichCorpusTestSummaryV35 } from "./history-workflow-v35.js";
import { DEFAULT_HISTORY_QUALITY_THRESHOLDS_V35 } from "./history-v35-contracts.js";
import { assessVisualSemanticCoverageV35 } from "./history-visual-semantics-v35.js";
import { resolveHistoryPlaceV34 } from "./history-geo-v34.js";
import {
  buildVisualSemanticSignatureV35,
  buildVisualTreatmentSignatureV35,
  canonicalViewerConceptSignatureKeyV35,
  normalizeTreatmentActionFamilyV35,
  treatmentSignatureKeyV35,
} from "./history-visual-repetition-v35.js";
import type { HistoryShotV34 } from "./history-v34-contracts.js";
import {
  deriveVisualSubjectV35,
  isSentenceLikeVisualSubjectV35,
} from "./history-visual-subject-v35.js";

const FRANKLIN_EPISODE =
  "history-youtube-history-10-video-story-pack-05-franklin-expedition";
const BRONZE_EPISODE =
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse";

const FRANKLIN_SNIPPET = `In May 1845, two Royal Navy ships sailed from Britain to search for the Northwest Passage. HMS Erebus and HMS Terror were strong, experienced polar vessels. They carried steam engines, reinforced hulls, scientific instruments, preserved food, and 129 officers and men under Sir John Franklin.

Whaling ships saw them in Baffin Bay that summer.

Then they vanished.

The ships were trapped in the ice off King William Island.

The 105 survivors, led by Francis Crozier and James Fitzjames, had abandoned the ships on April 22 and planned to march toward the Back River on the Canadian mainland.`;

const BRONZE_SNIPPET = `Copper from Cyprus and tin from distant regions were combined to make bronze.

Palace bureaucracies recorded deliveries and obligations in remarkable detail.

Egypt faced the Sea Peoples. Hittite territories around Hattusa collapsed. Trade routes across the Eastern Mediterranean and the Aegean linked Mycenae, Pylos, Cyprus, Anatolia, and the Levant.

Ramesses III recorded the battle at Medinet Habu. Merneptah left an inscription mentioning conflict.`;

const baseShot = (overrides: Partial<HistoryShotV34> = {}): HistoryShotV34 => ({
  id: "shot-0001-01",
  beatId: "beat-0001",
  purpose: "develop archival image on artifact",
  durationMs: 6_000,
  startMs: 0,
  endMs: 6_000,
  framing: "tight evidentiary inset",
  cameraMovement: "static locked hold",
  subject: "Roman coin",
  action: "artifact detail evidence transition for Roman coin",
  foreground: "archival image/develop foreground: Roman coin",
  midground: "archival image midground claim focus claim-a",
  background: "archival image background develop layer for beat 0001",
  factualLabels: [],
  permittedMotion: ["develop-safe editorial motion"],
  prohibitedAdditions: [],
  transition: "opacity crossfade",
  linkedClaimIds: ["claim-a"],
  modalityStateReference: "asset-1",
  adaptation16x9: "Landscape develop layout.",
  adaptation9x16: "portrait-safe crop",
  reconstructionPolicy: "archival-or-artwork",
  ...overrides,
});

describe("History V3.5 unit semantics", () => {
  it("rejects discourse openers and accepts inferred historical entities", () => {
    for (const text of ["Before", "Another", "Some", "When", "Others", "The", "They"]) {
      expect(isRejectedEntityTextV34(text).reject).toBe(true);
    }
    for (const [surface, unit] of [
      ["Egypt", "Egypt faced invasion from the Sea Peoples."],
      ["Hittite Empire", "The Hittite Empire controlled Anatolia."],
      ["Hattusa", "Hittite territories around Hattusa collapsed."],
      ["Cyprus", "Copper from Cyprus supplied bronze production."],
      ["Anatolia", "Anatolia linked multiple palace centers."],
      ["Levant", "Trade crossed the Levant and the Aegean."],
      ["Mycenae", "Mycenae maintained palace archives."],
      ["Pylos", "Pylos preserved administrative tablets."],
      ["Aegean", "Routes crossed the Aegean."],
      ["Medinet Habu", "Ramesses III recorded the battle at Medinet Habu."],
      ["Ramesses III", "Ramesses III recorded the battle at Medinet Habu."],
      ["Merneptah", "Merneptah left an inscription mentioning conflict."],
      ["Sea Peoples", "Egypt faced the Sea Peoples."],
    ] as const) {
      const seed = inferHistoricalEntitySeedFromSurfaceV34(surface, unit);
      expect(seed, surface).not.toBeNull();
      expect(seed!.label.length).toBeGreaterThan(1);
    }
  });

  it("structures Bronze Age claims with canonical entities only and rejects uncanonical surfaces", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: BRONZE_EPISODE,
      rawScript: BRONZE_SNIPPET,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: BRONZE_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const labels = structured.entities.map((entity) => entity.normalizedLabel);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Egypt",
        "Hittite Empire",
        "Hattusa",
        "Cyprus",
        "Anatolia",
        "Aegean",
        "Mycenae",
        "Pylos",
        "Mediterranean",
      ])
    );
    expect(structured.geographicQualifiers.length).toBeGreaterThan(0);
    expect(
      structured.rejectedEntities.some((item) => item.text === "Egypt")
    ).toBe(false);
    expect(validateStructuredClaimsV34(structured).ok).toBe(true);
  });

  it("derives concise visual subjects instead of full propositions", () => {
    const subject = deriveVisualSubjectV35({
      claimText:
        "Copper from Cyprus and tin from distant regions were combined to make bronze.",
      claimId: "claim-1",
      entityLabels: ["Cyprus"],
      claimKind: "compound",
    });
    expect(subject.provenance).toBe("entity");
    expect(isSentenceLikeVisualSubjectV35(subject.label)).toBe(false);

    const bureaucracy = deriveVisualSubjectV35({
      claimText:
        "Palace bureaucracies recorded deliveries and obligations in remarkable detail.",
      claimId: "claim-2",
      entityLabels: [],
      claimKind: "other",
    });
    expect(bureaucracy.label.toLowerCase()).toContain("administration");
    expect(isSentenceLikeVisualSubjectV35(bureaucracy.label)).toBe(false);
  });

  it("keeps treatment-family fingerprints independent from subject wording", () => {
    const roman = buildVisualTreatmentSignatureV35({
      shot: baseShot({ subject: "Roman coin", action: "artifact detail evidence transition for Roman coin" }),
      modality: "archival image",
      progressionRole: "develop",
    });
    const hittite = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        subject: "Hittite tablet",
        action: "artifact detail evidence transition for Hittite tablet",
      }),
      modality: "archival image",
      progressionRole: "develop",
    });
    expect(treatmentSignatureKeyV35(roman)).toBe(treatmentSignatureKeyV35(hittite));
    expect(normalizeTreatmentActionFamilyV35(roman.actionFamily)).toBe("artifact-detail");
  });

  it("builds Franklin plans with visual opportunities and validates repetition thresholds", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: FRANKLIN_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
      structuredClaims: structured,
    });
    expect(plan.visualOpportunitySummary.eligibleMapOpportunities).toBeGreaterThanOrEqual(0);
    expect(validateHistoryVisualPlanV35(plan).structurallyValid).toBe(plan.approval.structurallyValid);
    const failing = measureHistoryRepetitionV35({
      purposes: plan.visualPurposes,
      concepts: plan.visualConcepts,
      shots: Array.from({ length: 20 }, (_, index) => ({
        ...plan.shots[0]!,
        id: `shot-dup-${index}`,
        purpose: "same purpose",
        framing: "same",
        cameraMovement: "same",
        transition: "same",
      })),
      beats: plan.beats,
      thresholds: DEFAULT_HISTORY_QUALITY_THRESHOLDS_V35,
    });
    expect(failing.passes).toBe(false);
  });

  it("discards obvious non-geographic title-case surfaces before rejection accounting", () => {
    for (const text of ["Archaeology", "Climate", "Fear", "Modern", "And"]) {
      expect(
        shouldSurfaceEntityCandidateV35({
          text,
          unitText: `${text} shaped later interpretations of the collapse.`,
          seed: null,
        })
      ).toBe(false);
      expect(isCredibleGeographicCandidateV35({ text, unitText: `${text} shaped later interpretations.` })).toBe(
        false
      );
    }
    expect(
      shouldSurfaceEntityCandidateV35({
        text: "France",
        unitText: "They marched from France toward the frontier.",
        seed: null,
      })
    ).toBe(true);
    const narration = normalizeHistoryNarrationV33({
      episodeId: BRONZE_EPISODE,
      rawScript:
        "Climate shifted across the region. Archaeology reveals palace economies. Cyprus supplied copper.",
    });
    const structured = structureTrustedScriptClaimsV34({
      episodeId: BRONZE_EPISODE,
      narration,
      authorityMode: "trusted-script",
    });
    expect(structured.rejectedEntities.some((item) => item.text === "Climate")).toBe(false);
    expect(structured.rejectedEntities.some((item) => item.text === "Archaeology")).toBe(false);
    expect(structured.entities.some((item) => item.normalizedLabel === "Cyprus")).toBe(true);
  });

  it("classifies geographic candidates without polluting coverage with generic nouns", () => {
    for (const text of ["Archaeology", "Climate", "Fear", "Modern", "And"]) {
      expect(isCredibleGeographicCandidateV35({ text })).toBe(false);
    }
    expect(isCredibleGeographicCandidateV35({ text: "Austria" })).toBe(true);
    expect(isCredibleGeographicCandidateV35({ text: "France" })).toBe(true);
    const coverage = assessVisualSemanticCoverageV35({
      entities: [
        { normalizedLabel: "Cyprus", entityType: "place" },
        { normalizedLabel: "Egypt", entityType: "place" },
      ],
      rejectedEntities: [
        { text: "Archaeology", reason: "uncanonical-surface" },
        { text: "Climate", reason: "ordinary-noun-concept" },
        { text: "Carthage", reason: "uncanonical-surface" },
        { text: "Gaul", reason: "uncanonical-surface" },
        { text: "Danube", reason: "uncanonical-surface" },
        { text: "Friedland", reason: "uncanonical-surface" },
        { text: "Maloyaroslavets", reason: "uncanonical-surface" },
      ],
      beats: [{ id: "beat-0001", modality: "map" }],
      mapStates: [{}],
      diagramStates: [],
      visualOpportunitySummary: {
        eligibleMapOpportunities: 1,
        eligibleDiagramOpportunities: 0,
      },
    });
    expect(coverage.some((item) => item.code === "ENTITY_RESOLUTION_COVERAGE_LOW")).toBe(true);
    expect(
      coverage.find((item) => item.code === "ENTITY_RESOLUTION_COVERAGE_LOW")?.affectedIds
    ).toEqual(expect.arrayContaining(["Carthage", "Gaul", "Danube"]));
    expect(
      coverage.find((item) => item.code === "ENTITY_RESOLUTION_COVERAGE_LOW")?.payload
        .nonGeographicRejectedSurfaces
    ).toBe(2);
  });

  it("does not infer geographic place entities from narration subspans", () => {
    const romeEpisode = "history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire";
    const romanEmpire = structureTrustedScriptClaimsV34({
      episodeId: romeEpisode,
      narration: normalizeHistoryNarrationV33({
        episodeId: romeEpisode,
        rawScript:
          "The Western Roman Empire fractured while Huns pressed the Danube frontier and Spain fell to new rulers.",
      }),
    });
    expect(romanEmpire.entities.map((entity) => entity.normalizedLabel)).not.toEqual(
      expect.arrayContaining(["Roman", "Huns", "West", "East"])
    );
    expect(resolveHistoryPlaceV34("Spain")?.label).toBe("Spain");

    const pearlHarborEpisode =
      "history-youtube-history-30-video-story-pack-33-pearl-harbor-road-to-war";
    const americanFleet = structureTrustedScriptClaimsV34({
      episodeId: pearlHarborEpisode,
      narration: normalizeHistoryNarrationV33({
        episodeId: pearlHarborEpisode,
        rawScript: "American carriers remained at sea while diplomats negotiated in Washington.",
      }),
    });
    expect(americanFleet.entities.some((entity) => entity.normalizedLabel === "American")).toBe(
      false
    );

    const bronzeEpisode = "history-youtube-history-10-video-story-pack-01-bronze-age-collapse";
    const linearB = structureTrustedScriptClaimsV34({
      episodeId: bronzeEpisode,
      narration: normalizeHistoryNarrationV33({
        episodeId: bronzeEpisode,
        rawScript: "Linear B archives fell silent across palace centers in Greece.",
      }),
    });
    expect(linearB.entities.some((entity) => entity.normalizedLabel === "Linear")).toBe(false);
    expect(resolveHistoryPlaceV34("Greece")?.label).toBe("Greece");
  });

  it("reserves high-confidence Bronze Age diagram opportunities", () => {
    const clusters = [
      {
        claimIds: ["claim-1"],
        text: "Copper from Cyprus and tin from distant regions were combined to make bronze.",
      },
      {
        claimIds: ["claim-2"],
        text: "Trade routes across the Eastern Mediterranean linked Mycenae, Pylos, Cyprus, Anatolia, and the Levant.",
      },
      {
        claimIds: ["claim-3"],
        text: "Drought, migration, trade disruption, and political instability combined to make collapse more likely.",
      },
    ];
    const claims = clusters.map((cluster, index) => ({
      id: cluster.claimIds[0]!,
      claimKind: index === 2 ? ("causal" as const) : ("compound" as const),
      materiality: "material" as const,
      normalizedProposition: cluster.text,
      narrationUnitIds: [`unit-${index + 1}`],
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
    }));
    const reserved = reserveDiagramBeatIndexesV35({
      clusters,
      claims,
      entities: [],
      maxDiagrams: 2,
    });
    expect(reserved.size).toBeGreaterThan(0);
    expect(
      scoreDiagramOpportunityV35({
        claimIds: ["claim-3"],
        clusterText: clusters[2]!.text,
        claims,
      }).score
    ).toBeGreaterThanOrEqual(4);
  });

  it("builds Bronze Age plans with selected diagrams when causal opportunities exist", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: BRONZE_EPISODE,
      rawScript: `${BRONZE_SNIPPET}

Drought, migration, trade disruption, and political instability combined to make collapse more likely.`,
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
    expect(plan.visualOpportunitySummary.selectedDiagramOpportunities).toBeGreaterThan(0);
    expect(plan.diagramStates.length).toBeGreaterThan(0);
  });

  it("blocks structural approval when focused validation prerequisites fail", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const blocked = applyPlanApprovalPrerequisitesV35(plan, [
      {
        code: "FOCUSED_TEST_FAILURE",
        gate: "structural",
        message: "Required focused validation failed (1): exit 66",
      },
    ]);
    expect(blocked.approval.structurallyValid).toBe(false);
    expect(blocked.approval.structural.state).toBe("blocked");
    expect(blocked.approval.structural.blockerCodes).toContain("FOCUSED_TEST_FAILURE");
    expect(blocked.approval.productionApprovalEligible).toBe(false);
  });

  it("does not block editorial approval on template-family reuse when viewer concepts differ", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    expect(plan.qualityMetrics.viewerConceptRepetitionRate).toBeLessThanOrEqual(
      plan.qualityMetrics.thresholds.maxViewerConceptDuplicateRate
    );
    expect(plan.qualityMetrics.templateRepetitionRate).toBeGreaterThan(
      plan.qualityMetrics.thresholds.maxSemanticConceptDuplicateRate
    );
    expect(plan.qualityMetrics.repetitionPolicy.viewerConcept.blocking).toBe(true);
    expect(plan.qualityMetrics.repetitionPolicy.template.blocking).toBe(false);
    expect(plan.qualityMetrics.passes).toBe(true);
    expect(
      plan.diagnostics.some((item) => item.code === "EDITORIAL_REPETITION_THRESHOLD")
    ).toBe(false);
    expect(
      plan.diagnostics.some((item) => item.code === "EDITORIAL_TEMPLATE_REPETITION_WARNING")
    ).toBe(true);
  });

  it("blocks editorial approval on genuine viewer-concept repetition", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const basePlan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const anchorShot = basePlan.shots[0]!;
    const anchorBeat = basePlan.beats.find((beat) => beat.id === anchorShot.beatId)!;
    const anchorConcept = basePlan.visualConcepts.find(
      (concept) => concept.beatId === anchorShot.beatId
    )!;
    const duplicatedShots = Array.from({ length: 12 }, (_, index) => ({
      ...anchorShot,
      id: `shot-repeat-${index}`,
      beatId: `beat-repeat-${index}`,
      purpose: anchorShot.purpose,
      subject: anchorShot.subject,
      framing: anchorShot.framing,
      action: anchorShot.action,
      cameraMovement: anchorShot.cameraMovement,
      transition: anchorShot.transition,
      modalityStateReference: `asset-repeat-${index}`,
    }));
    const duplicatedBeats = duplicatedShots.map((shot, index) => ({
      ...anchorBeat,
      id: shot.beatId,
      shotIds: [shot.id],
      startMs: index * 5_000,
      endMs: (index + 1) * 5_000,
    }));
  const metrics = measureHistoryRepetitionV35({
      purposes: basePlan.visualPurposes,
      concepts: duplicatedBeats.map((beat) => ({
        ...anchorConcept,
        beatId: beat.id,
      })),
      shots: duplicatedShots,
      beats: duplicatedBeats,
      diagramStates: basePlan.diagramStates,
      thresholds: DEFAULT_HISTORY_QUALITY_THRESHOLDS_V35,
    });
    expect(metrics.viewerConceptRepetitionRate).toBeGreaterThan(
      metrics.thresholds.maxViewerConceptDuplicateRate
    );
    expect(metrics.passes).toBe(false);
    expect(metrics.repetitionPolicy.viewerConcept.passes).toBe(false);
  });

  it("trusted-script plans do not require human historical attestation", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
      trustAttestation: null,
    });
    expect(plan.trustApproval.attestationActor).toBeNull();
    expect(plan.trustApproval.attestationTimestamp).toBeNull();
    expect(plan.trustApproval.attestationBound).toBe(false);
    expect(plan.trustApproval.humanHistoricalAttestationRequired).toBe(false);
    expect(plan.trustApproval.productionHistoricalApprovalEligible).toBe(true);
    expect(
      plan.diagnostics.some((item) => item.code === "HISTORICAL_APPROVAL_REQUIRED")
    ).toBe(false);
    expect(
      plan.approval.production.blockerCodes.includes("HISTORICAL_APPROVAL_REQUIRED")
    ).toBe(false);
  });

  it("still blocks production when configured factual validation prerequisites fail", () => {
    const narration = normalizeHistoryNarrationV33({
      episodeId: FRANKLIN_EPISODE,
      rawScript: FRANKLIN_SNIPPET,
    });
    const plan = buildHistoryVisualPlanV35({
      episodeId: FRANKLIN_EPISODE,
      title: "Franklin Expedition",
      narration,
      authorityMode: "trusted-script",
    });
    const blocked = applyPlanApprovalPrerequisitesV35(plan, [
      {
        code: "FOCUSED_TEST_FAILURE",
        gate: "structural",
        message: "Required focused validation failed.",
      },
    ]);
    expect(blocked.approval.productionApprovalEligible).toBe(false);
    expect(blocked.approval.production.blockerCodes).toContain("FOCUSED_TEST_FAILURE");
  });

  it("records corpus validation failures without poisoning episode structural approval", () => {
    const enriched = enrichCorpusTestSummaryV35({
      status: "failed",
      commands: [{ command: "pnpm test:focused -- corpus", ok: false, exitCode: 1 }],
    });
    expect(enriched.corpusAcceptanceBlocked).toBe(true);
    expect(enriched.episodeStructuralPoisoning).toBe(false);
    expect(enriched.corpusBlockerCodes).toEqual(["FOCUSED_CORPUS_VALIDATION_FAILED"]);
  });
});
