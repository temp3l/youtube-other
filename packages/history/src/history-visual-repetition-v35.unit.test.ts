import { describe, expect, it } from "vitest";
import { LONG_STATIC_SOFT_WARNING_MS } from "./history-visual-semantics-v34.js";
import { measureEffectiveVisualChangeV35 } from "./history-visual-semantics-v35.js";
import {
  buildVisualSemanticSignatureV35,
  classifyTemplateFamilyV35,
  isMicroMotionCameraV35,
  scoreSemanticNoveltyV35,
  semanticSignatureKeyV35,
  buildEditorialShotSequenceV35,
  refineShotPlanForRepetitionV35,
  canonicalVisualRepetitionSignatureKeyV35,
  canonicalViewerConceptSignatureKeyV35,
  canonicalTemplateRepetitionSignatureKeyV35,
  measureTemplateRepetitionV35,
  measureViewerConceptDuplicationV35,
  normalizePrimarySubjectKeyV35,
} from "./history-visual-repetition-v35.js";
import type { HistoryBeatV35 } from "./history-v35-contracts.js";
import type { HistoryShotV34 } from "./history-v34-contracts.js";

const baseShot = (overrides: Partial<HistoryShotV34> = {}): HistoryShotV34 => ({
  id: "shot-0001-01",
  beatId: "beat-0001",
  purpose: "establish archival image on Napoleon",
  durationMs: 6_000,
  startMs: 0,
  endMs: 6_000,
  framing: "medium subject hold",
  cameraMovement: "static locked hold",
  subject: "Napoleon",
  action: "environmental establishing transition for campaign opening",
  foreground: "archival image/establish foreground: Napoleon",
  midground: "archival image midground claim focus claim-a",
  background: "archival image background establish layer for beat 0001",
  factualLabels: [],
  permittedMotion: ["establish-safe editorial motion"],
  prohibitedAdditions: [],
  transition: "hard narration cut",
  linkedClaimIds: ["claim-a"],
  modalityStateReference: "asset-1",
  adaptation16x9: "Landscape establish layout.",
  adaptation9x16: "portrait-safe crop",
  reconstructionPolicy: "archival-or-artwork",
  ...overrides,
});

describe("History V3.5 visual repetition", () => {
  it("A: same asset and claim with different camera motion is semantic repetition", () => {
    const prior = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Napoleon",
      claimIds: ["claim-a"],
      composition: "Establishing context for Napoleon in Moscow",
      progressionRole: "establish",
      action: "environmental establishing transition",
      modalityStateReference: "asset-1",
    });
    const next = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Napoleon",
      claimIds: ["claim-a"],
      composition: "Establishing context for Napoleon in Moscow",
      progressionRole: "establish",
      action: "environmental establishing transition",
      modalityStateReference: "asset-1",
      informationLayer: prior.informationLayer,
    });
    expect(scoreSemanticNoveltyV35(prior, next).score).toBeLessThan(2);
    expect(semanticSignatureKeyV35(prior)).toBe(semanticSignatureKeyV35(next));
  });

  it("B: same asset with new annotation layer may qualify as meaningful progression", () => {
    const prior = buildVisualSemanticSignatureV35({
      modality: "map",
      subject: "Grande Armée",
      claimIds: ["claim-a"],
      composition: "Geographic orientation centered on Moscow",
      progressionRole: "establish",
      action: "map orientation with label reveal",
      modalityStateReference: "map-state-1",
      informationLayer: "establish:claim-a:map orientation",
    });
    const next = buildVisualSemanticSignatureV35({
      modality: "map",
      subject: "Grande Armée",
      claimIds: ["claim-a"],
      composition: "Route or territorial consequence across Moscow",
      progressionRole: "explain",
      action: "route progression with annotation appearance",
      modalityStateReference: "map-state-1",
      informationLayer: "explain:claim-a:route progression",
    });
    expect(scoreSemanticNoveltyV35(prior, next).score).toBeGreaterThanOrEqual(2);
  });

  it("C: different descriptions in the same template family count as repetition", () => {
    const left = classifyTemplateFamilyV35({
      modality: "archival image",
      composition: "Evidentiary hold on Napoleon in Moscow",
      progressionRole: "establish",
      action: "slow evidentiary push",
    });
    const right = classifyTemplateFamilyV35({
      modality: "archival image",
      composition: "Measured evidentiary push on Napoleon",
      progressionRole: "establish",
      action: "deliberate evidentiary push",
    });
    expect(left).toBe("environment-establish");
    expect(right).toBe("environment-establish");
    expect(left).toBe(right);
  });

  it("D: same subject with different primary evidence is meaningful novelty", () => {
    const prior = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Franklin expedition",
      claimIds: ["claim-a"],
      composition: "Environmental context for Franklin expedition",
      progressionRole: "establish",
      action: "environmental establishing transition",
      modalityStateReference: "asset-1",
    });
    const next = buildVisualSemanticSignatureV35({
      modality: "document",
      subject: "Franklin expedition",
      claimIds: ["claim-b"],
      composition: "Primary-source document focus on Victory Point note",
      progressionRole: "develop",
      action: "document evidence transition",
      modalityStateReference: "document-state-1",
    });
    expect(scoreSemanticNoveltyV35(prior, next).score).toBeGreaterThanOrEqual(4);
  });

  it("E: stage splits without semantic delta are merged", () => {
    const beat: HistoryBeatV35 = {
      id: "beat-0001",
      narrationUnitIds: ["unit-1"],
      narrationSpan: { startUtf16: 0, endUtf16Exclusive: 10 },
      startMs: 0,
      endMs: 16_000,
      linkedClaimIds: ["claim-a"],
      visualPurposeId: "purpose-0001",
      modality: "archival image",
      assetIntentId: "asset-intent-0001",
      mapMasterId: null,
      mapStateId: null,
      diagramMasterId: null,
      diagramStateId: null,
      timelineMasterId: null,
      timelineStateId: null,
      dateCardStateId: null,
      documentStateId: null,
      shotIds: ["shot-0001-01", "shot-0001-02"],
      transition: "hard narration cut",
      continuityNotes: "test",
      uncertaintyTreatment: "test",
      aspectRatioPlanIds: [],
    };
    const shots = [
      baseShot({
        id: "shot-0001-01",
        durationMs: 8_000,
        endMs: 8_000,
        purpose: "evidentiary stage 1/2 on archival image",
        cameraMovement: "slow push-in on evidence",
      }),
      baseShot({
        id: "shot-0001-02",
        startMs: 8_000,
        endMs: 16_000,
        durationMs: 8_000,
        purpose: "evidentiary stage 2/2 on archival image",
        cameraMovement: "gentle lateral drift",
        action: "slow push-in on evidence for campaign opening",
      }),
    ];
    const refined = refineShotPlanForRepetitionV35({
      shots,
      beats: [beat],
      purposes: [
        {
          id: "purpose-0001",
          beatId: "beat-0001",
          narrationSpan: { startUtf16: 0, endUtf16Exclusive: 10 },
          linkedClaimIds: ["claim-a"],
          protectedFactualMeaning: "Napoleon marched",
          recommendedModality: "archival image",
          visualConceptId: "visual-concept-beat-0001",
          visualPurpose: "Establishing context for Napoleon",
          semanticJustification: "test",
          disallowedMisleadingTreatments: [],
          requiredEntityMentionIds: [],
          requiredTemporalQualifierIds: [],
          requiredGeographicQualifierIds: [],
          requiredQuantitativeQualifierIds: [],
          uncertainty: [],
          fallbackDecision: null,
        },
      ],
      concepts: [
        {
          id: "visual-concept-beat-0001",
          beatId: "beat-0001",
          modality: "archival image",
          historicalSubject: "Napoleon",
          approximatePeriod: "1812",
          settingGeography: "Moscow",
          evidenceSourceClass: "period-context",
          intendedComposition: "Establishing context for Napoleon in Moscow",
          protectedFactualRelation: "Napoleon marched",
          uncertaintyLimits: [],
          forbiddenAnachronisms: [],
          fingerprint: "abc",
        },
      ],
    });
    expect(refined.shots.length).toBe(1);
    expect(refined.shots[0]!.durationMs).toBe(16_000);
  });

  it("F: legitimate long emotional holds remain measured as long-static", () => {
    const metrics = measureEffectiveVisualChangeV35({
      shots: [
        baseShot({
          durationMs: LONG_STATIC_SOFT_WARNING_MS + 2_000,
          cameraMovement: "static locked hold",
          action: "emotional contemplative hold for retreat aftermath",
        }),
      ],
      beats: [
        {
          id: "beat-0001",
          modality: "archival image",
        } as HistoryBeatV35,
      ],
    });
    expect(metrics.longStaticRuntimeShare).toBeGreaterThan(0);
  });

  it("G: micro-motion does not automatically defeat static classification", () => {
    const metrics = measureEffectiveVisualChangeV35({
      shots: [
        baseShot({
          durationMs: 10_000,
          cameraMovement: "hold then micro-pan",
          action: "editorial subject transition",
        }),
        baseShot({
          id: "shot-0001-02",
          startMs: 10_000,
          endMs: 20_000,
          durationMs: 10_000,
          cameraMovement: "slow push-in on evidence",
          action: "editorial subject transition",
          modalityStateReference: "asset-1",
        }),
      ],
      beats: [
        {
          id: "beat-0001",
          modality: "archival image",
        } as HistoryBeatV35,
      ],
    });
    expect(isMicroMotionCameraV35("hold then micro-pan")).toBe(true);
    expect(metrics.shotVisualChanges[1]?.resetsVisualClock).toBe(false);
    expect(metrics.longStaticRuntimeShare).toBeGreaterThan(0);
  });

  it("builds editorial shot sequences without stage labels when novelty is insufficient", () => {
    const sequence = buildEditorialShotSequenceV35({
      beatId: "beat-0002",
      beatNumber: "0002",
      beatIndex: 1,
      startMs: 0,
      durationMs: 12_000,
      modality: "archival image",
      text: "Napoleon crossed the Niemen with the Grande Armée.",
      claimIds: ["claim-a"],
      entityLabels: ["Napoleon"],
      places: ["Niemen"],
      modalityStateReference: "asset-2",
      priorSignature: null,
    });
    expect(sequence.shots.every((shot) => !/stage \d+\/\d+/iu.test(shot.purpose))).toBe(true);
  });

  it("H: different subjects with the same template are not viewer duplicates", () => {
    const russia = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Russia",
      claimIds: ["claim-14"],
      composition: "Contrasting perspectives on Russia in Russia",
      progressionRole: "contrast",
      action: "comparison reveal",
      modalityStateReference: "asset-14",
    });
    const moscow = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Moscow",
      claimIds: ["claim-21"],
      composition: "Contrasting perspectives on Moscow in Moscow",
      progressionRole: "contrast",
      action: "comparison reveal",
      modalityStateReference: "asset-21",
    });
    expect(canonicalTemplateRepetitionSignatureKeyV35(russia)).toBe(
      canonicalTemplateRepetitionSignatureKeyV35(moscow)
    );
    expect(
      canonicalViewerConceptSignatureKeyV35({
        signature: russia,
        subject: "Russia",
        setting: "Russia",
      })
    ).not.toBe(
      canonicalViewerConceptSignatureKeyV35({
        signature: moscow,
        subject: "Moscow",
        setting: "Moscow",
      })
    );
  });

  it("I: same subject, setting, and composition counts as viewer duplicate", () => {
    const left = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Napoleon Bonaparte",
      claimIds: ["claim-a"],
      composition: "Establishing context for Napoleon in Moscow",
      progressionRole: "establish",
      action: "environmental establishing transition",
      modalityStateReference: "asset-1",
    });
    const right = buildVisualSemanticSignatureV35({
      modality: "archival image",
      subject: "Napoleon Bonaparte",
      claimIds: ["claim-b"],
      composition: "Establishing context for Napoleon in Moscow",
      progressionRole: "establish",
      action: "environmental establishing transition",
      modalityStateReference: "asset-2",
      informationLayer: left.informationLayer,
    });
    expect(
      canonicalViewerConceptSignatureKeyV35({
        signature: left,
        subject: "Napoleon Bonaparte",
        setting: "Moscow",
      })
    ).toBe(
      canonicalViewerConceptSignatureKeyV35({
        signature: right,
        subject: "Napoleon Bonaparte",
        setting: "Moscow",
      })
    );
  });

  it("J: template repetition does not automatically mirror viewer concept repetition", () => {
    const signatures = [
      buildVisualSemanticSignatureV35({
        modality: "archival image",
        subject: "Napoleon",
        claimIds: ["claim-a"],
        composition: "Establishing context for Napoleon",
        progressionRole: "establish",
        action: "environmental establishing transition",
        modalityStateReference: "asset-1",
      }),
      buildVisualSemanticSignatureV35({
        modality: "archival image",
        subject: "Caesar",
        claimIds: ["claim-b"],
        composition: "Establishing context for Caesar",
        progressionRole: "establish",
        action: "environmental establishing transition",
        modalityStateReference: "asset-2",
      }),
    ];
    expect(measureTemplateRepetitionV35(signatures)).toBeGreaterThan(0);
    expect(
      measureViewerConceptDuplicationV35(
        signatures.map((signature, index) => ({
          signature,
          subject: index === 0 ? "Napoleon" : "Caesar",
          setting: null,
        }))
      )
    ).toBe(0);
  });

  it("K: subject identity is retained in normalized subject keys", () => {
    expect(normalizePrimarySubjectKeyV35({ subject: "Napoleon Bonaparte" }).key).toContain(
      "napoleon"
    );
    expect(normalizePrimarySubjectKeyV35({ subject: "retreating soldiers" }).key).toContain(
      "soldiers"
    );
  });
});
