import { describe, expect, it } from "vitest";
import type { HistoryBeatV35 } from "./history-v35-contracts.js";
import type { HistoryShotV34 } from "./history-v34-contracts.js";
import {
  computeDiagramRenderSignatureV35,
  evaluateShotEffectiveChangeV35,
  measureEffectiveVisualChangeV35,
} from "./history-effective-change-v35.js";
import {
  buildVisualTreatmentSignatureV35,
  measureNearbyTreatmentRepetitionV35,
  measureTreatmentWindowConcentrationV35,
  scoreTreatmentNoveltyV35,
  treatmentSignatureKeyV35,
} from "./history-visual-repetition-v35.js";

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

const archivalBeat = (overrides: Partial<HistoryBeatV35> = {}): HistoryBeatV35 =>
  ({
    id: "beat-0001",
    modality: "archival image",
    ...overrides,
  }) as HistoryBeatV35;

describe("History V3.5 effective visual change", () => {
  it("A: same still with camera push does not reset the static clock", () => {
    const prior = baseShot();
    const next = baseShot({
      id: "shot-0001-02",
      cameraMovement: "slow push-in on evidence",
      action: "slow push-in on evidence for campaign opening",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(false);
    expect(evaluated.motionOnly).toBe(true);
  });

  it("B: same still with micro-pan does not reset the static clock", () => {
    const prior = baseShot();
    const next = baseShot({
      id: "shot-0001-02",
      cameraMovement: "hold then micro-pan",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(false);
    expect(evaluated.motionOnly).toBe(true);
  });

  it("C: same still with crossfade does not reset the static clock", () => {
    const prior = baseShot();
    const next = baseShot({
      id: "shot-0001-02",
      transition: "crossfade dissolve",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(false);
    expect(evaluated.transitionOnly).toBe(true);
  });

  it("D: generic animated-reveal label without structured state does not reset the static clock", () => {
    const prior = baseShot();
    const next = baseShot({
      id: "shot-0001-02",
      action: "generic animated reveal with opacity transition",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(false);
    expect(evaluated.unstructuredReveal).toBe(true);
  });

  it("E: structured annotation appearance resets the static clock", () => {
    const prior = baseShot();
    const next = baseShot({
      id: "shot-0001-02",
      action: "annotation appearance pointing to campaign artifact",
      midground: "archival image midground claim focus claim-b",
      factualLabels: ["route-marker"],
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(true);
    expect(evaluated.changeKinds).toContain("annotation-state-change");
  });

  it("F: map state change resets the static clock", () => {
    const prior = baseShot({
      beatId: "beat-map-1",
      modalityStateReference: "map-state-locator",
    });
    const next = baseShot({
      id: "shot-map-02",
      beatId: "beat-map-2",
      modalityStateReference: "map-state-progression",
      action: "route progression with annotation appearance",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "map",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(true);
    expect(evaluated.changeKinds).toContain("map-state-change");
  });

  it("G: diagram layer introduction resets the static clock", () => {
    const prior = baseShot({
      beatId: "beat-diagram-1",
      modalityStateReference: "diagram-state-1",
    });
    const next = baseShot({
      id: "shot-diagram-02",
      beatId: "beat-diagram-2",
      modalityStateReference: "diagram-state-2",
      action: "diagram layer introduction for causal mechanism",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "diagram",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(true);
    expect(evaluated.changeKinds).toContain("diagram-state-change");
  });

  it("G: provenance-only diagram state changes do not reset the visual clock", () => {
    const diagramA = {
      id: "diagram-state-0011",
      masterId: "diagram-master-black-death-transmission",
      diagramType: "evidence-set" as const,
      exactQuestion: "What transmission pathways does the narration support?",
      nodes: [
        { id: "n1", label: "Black Sea trade contact", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
        { id: "n2", label: "port arrival at Messina", linkedClaimIds: ["claim-b"], entityMentionIds: [] },
      ],
      edges: [],
      semanticStatus: "valid" as const,
      blockerCodes: [],
      fallbackDecision: null,
    };
    const diagramB = {
      ...diagramA,
      id: "diagram-state-0012",
      nodes: diagramA.nodes.map((node) => ({ ...node, linkedClaimIds: ["claim-c"] })),
    };
    expect(computeDiagramRenderSignatureV35(diagramA)).toBe(
      computeDiagramRenderSignatureV35(diagramB)
    );
    const prior = baseShot({
      beatId: "beat-diagram-1",
      modalityStateReference: diagramA.id,
    });
    const next = baseShot({
      id: "shot-diagram-02",
      beatId: "beat-diagram-2",
      modalityStateReference: diagramB.id,
      action: "diagram layer introduction for causal mechanism",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "diagram",
      priorModality: "diagram",
      diagramState: diagramB,
      priorDiagramState: diagramA,
    });
    expect(evaluated.resetsVisualClock).toBe(false);
    expect(evaluated.changeKinds).not.toContain("diagram-state-change");
  });

  it("H: same visible nodes with different internal edge IDs share render signature", () => {
    const diagramA = {
      id: "diagram-state-0033",
      masterId: "diagram-master-black-death-consequences",
      diagramType: "process" as const,
      exactQuestion: "What social and economic consequences does the narration support?",
      nodes: [
        { id: "n1", label: "population loss", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
        { id: "n2", label: "labour scarcity", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
      ],
      edges: [
        {
          id: "edge-0033-1",
          fromNodeId: "n1",
          toNodeId: "n2",
          relationship: "sequence" as const,
          linkedClaimIds: ["claim-a"],
        },
      ],
      semanticStatus: "valid" as const,
      blockerCodes: [],
      fallbackDecision: null,
    };
    const diagramB = {
      ...diagramA,
      id: "diagram-state-0037",
      edges: [
        {
          id: "edge-0037-1",
          fromNodeId: "n1",
          toNodeId: "n2",
          relationship: "sequence" as const,
          linkedClaimIds: ["claim-b"],
        },
      ],
    };
    expect(computeDiagramRenderSignatureV35(diagramA)).toBe(
      computeDiagramRenderSignatureV35(diagramB)
    );
  });

  it("J: different visible diagram nodes count as effective change", () => {
    const diagramA = {
      id: "diagram-state-0033",
      masterId: "diagram-master-black-death-consequences",
      diagramType: "process" as const,
      exactQuestion: "What social and economic consequences does the narration support?",
      nodes: [
        { id: "n1", label: "population loss", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
        { id: "n2", label: "labour scarcity", linkedClaimIds: ["claim-a"], entityMentionIds: [] },
      ],
      edges: [],
      semanticStatus: "valid" as const,
      blockerCodes: [],
      fallbackDecision: null,
    };
    const diagramB = {
      ...diagramA,
      id: "diagram-state-0037",
      nodes: [
        ...diagramA.nodes,
        { id: "n3", label: "wage pressure", linkedClaimIds: ["claim-b"], entityMentionIds: [] },
      ],
    };
    expect(computeDiagramRenderSignatureV35(diagramA)).not.toBe(
      computeDiagramRenderSignatureV35(diagramB)
    );
    const prior = baseShot({
      beatId: "beat-diagram-1",
      modalityStateReference: diagramA.id,
    });
    const next = baseShot({
      id: "shot-diagram-02",
      beatId: "beat-diagram-2",
      modalityStateReference: diagramB.id,
      action: "diagram progression with causal step highlight",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "diagram",
      priorModality: "diagram",
      diagramState: diagramB,
      priorDiagramState: diagramA,
    });
    expect(evaluated.resetsVisualClock).toBe(true);
    expect(evaluated.changeKinds).toContain("diagram-state-change");
  });

  it("K: asset replacement resets the static clock", () => {
    const prior = baseShot();
    const next = baseShot({
      id: "shot-0001-02",
      modalityStateReference: "asset-2",
      subject: "Moscow",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(true);
    expect(evaluated.changeKinds).toContain("asset-change");
  });

  it("L: tiny crop or zoom alone is not sufficient", () => {
    const prior = baseShot({ framing: "medium subject hold" });
    const next = baseShot({
      id: "shot-0001-02",
      framing: "medium evidentiary hold",
      cameraMovement: "slow push-in on evidence",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(false);
  });

  it("K: meaningful composition replacement may reset the static clock", () => {
    const prior = baseShot({ framing: "wide establishing context" });
    const next = baseShot({
      id: "shot-0001-02",
      framing: "tight evidentiary inset",
      action: "material evidence detail for campaign opening",
    });
    const evaluated = evaluateShotEffectiveChangeV35({
      shot: next,
      priorShot: prior,
      modality: "archival image",
      priorModality: "archival image",
    });
    expect(evaluated.resetsVisualClock).toBe(true);
    expect(evaluated.changeKinds).toContain("composition-replacement");
  });

  it("invariant: camera motion alone is not effective semantic change", () => {
    const metrics = measureEffectiveVisualChangeV35({
      shots: [
        baseShot({ durationMs: 10_000, cameraMovement: "static locked hold" }),
        baseShot({
          id: "shot-0001-02",
          startMs: 10_000,
          endMs: 20_000,
          durationMs: 10_000,
          cameraMovement: "gentle lateral drift",
        }),
      ],
      beats: [archivalBeat()],
    });
    expect(metrics.shotVisualChanges[1]?.resetsVisualClock).toBe(false);
    expect(metrics.audit.motionOnlyEvents).toBeGreaterThan(0);
    expect(metrics.audit.clockResetsMotionOrTransitionOnly).toBeGreaterThan(0);
  });

  it("invariant: transition alone is not effective semantic change", () => {
    const metrics = measureEffectiveVisualChangeV35({
      shots: [
        baseShot({ transition: "hard narration cut" }),
        baseShot({
          id: "shot-0001-02",
          transition: "opacity fade dissolve",
        }),
      ],
      beats: [archivalBeat()],
    });
    expect(metrics.shotVisualChanges[1]?.resetsVisualClock).toBe(false);
    expect(metrics.audit.transitionOnlyEvents).toBeGreaterThan(0);
  });

  it("invariant: unstructured animated reveal is not effective semantic change", () => {
    const metrics = measureEffectiveVisualChangeV35({
      shots: [
        baseShot(),
        baseShot({
          id: "shot-0001-02",
          action: "animated reveal with opacity transition",
        }),
      ],
      beats: [archivalBeat()],
    });
    expect(metrics.shotVisualChanges[1]?.resetsVisualClock).toBe(false);
    expect(metrics.audit.unstructuredRevealEvents).toBeGreaterThan(0);
  });
});

describe("History V3.5 treatment-family repetition", () => {
  const portraitPush = (subject: string) =>
    buildVisualTreatmentSignatureV35({
      shot: baseShot({
        subject,
        framing: "tight evidentiary inset",
        cameraMovement: "slow push-in on evidence",
        action: "portrait evidentiary hold",
      }),
      modality: "archival image",
      progressionRole: "establish",
    });

  it("A: different subjects with the same treatment share a treatment family", () => {
    const napoleon = portraitPush("Napoleon");
    const caesar = portraitPush("Caesar");
    expect(treatmentSignatureKeyV35(napoleon)).toBe(treatmentSignatureKeyV35(caesar));
  });

  it("B: different wording with the same grammar shares a treatment family", () => {
    const left = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        action: "slow evidentiary push on archival portrait",
        framing: "tight evidentiary inset",
        cameraMovement: "slow push-in on evidence",
      }),
      modality: "archival image",
      progressionRole: "establish",
    });
    const right = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        action: "deliberate measured evidentiary push on portrait",
        framing: "tight evidentiary inset",
        cameraMovement: "slow push-in on evidence",
      }),
      modality: "archival image",
      progressionRole: "establish",
    });
    expect(treatmentSignatureKeyV35(left)).toBe(treatmentSignatureKeyV35(right));
  });

  it("C: same subject with different modality yields treatment novelty", () => {
    const portrait = buildVisualTreatmentSignatureV35({
      shot: baseShot({ subject: "Napoleon" }),
      modality: "archival image",
      progressionRole: "establish",
    });
    const document = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        subject: "Napoleon",
        framing: "document desk evidence layout",
        action: "document evidence transition",
      }),
      modality: "document",
      progressionRole: "develop",
    });
    expect(scoreTreatmentNoveltyV35(portrait, document)).toBeGreaterThanOrEqual(3);
  });

  it("D: annotation layer can add semantic novelty while treatment family stays related", () => {
    const base = portraitPush("Franklin expedition");
    const annotated = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        subject: "Franklin expedition",
        framing: "tight evidentiary inset",
        cameraMovement: "slow push-in on evidence",
        action: "annotation appearance on expedition artifact",
      }),
      modality: "archival image",
      progressionRole: "establish",
    });
    expect(scoreTreatmentNoveltyV35(base, annotated)).toBeLessThan(2);
    expect(base.treatmentFamily).toBe(annotated.treatmentFamily);
  });

  it("E: rolling-window concentration is measurable", () => {
    const signatures = Array.from({ length: 6 }, () => portraitPush("Subject A"));
    expect(measureTreatmentWindowConcentrationV35(signatures)).toBeGreaterThanOrEqual(0.75);
    expect(measureNearbyTreatmentRepetitionV35(signatures)).toBe(1);
  });

  it("F: legitimate reuse after several different treatments is allowed", () => {
    const varied = [
      buildVisualTreatmentSignatureV35({
        shot: baseShot({ framing: "wide establishing context" }),
        modality: "archival image",
        progressionRole: "establish",
      }),
      buildVisualTreatmentSignatureV35({
        shot: baseShot({
          framing: "document desk evidence layout",
          action: "document evidence transition",
        }),
        modality: "document",
        progressionRole: "develop",
      }),
      buildVisualTreatmentSignatureV35({
        shot: baseShot({ framing: "split comparison board" }),
        modality: "comparison card",
        progressionRole: "contrast",
      }),
      portraitPush("Napoleon"),
      portraitPush("Caesar"),
    ];
    expect(measureTreatmentWindowConcentrationV35(varied)).toBeLessThan(0.75);
    expect(measureNearbyTreatmentRepetitionV35(varied)).toBeLessThan(1);
  });

  it("G: changing only subject or claim does not make treatment templates unique", () => {
    const claimA = portraitPush("Napoleon");
    const claimB = buildVisualTreatmentSignatureV35({
      shot: baseShot({
        subject: "Moscow",
        linkedClaimIds: ["claim-b"],
        framing: "tight evidentiary inset",
        cameraMovement: "slow push-in on evidence",
        action: "portrait evidentiary hold",
      }),
      modality: "archival image",
      progressionRole: "establish",
    });
    expect(treatmentSignatureKeyV35(claimA)).toBe(treatmentSignatureKeyV35(claimB));
  });
});
