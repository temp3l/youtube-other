import { describe, expect, it } from "vitest";
import type { HistoryBeatV35 } from "./history-v35-contracts.js";
import type { HistoryShotV34 } from "./history-v34-contracts.js";
import { refineVisualTreatmentPlanV35 } from "./history-visual-treatment-refine-v35.js";

const baseShot = (overrides: Partial<HistoryShotV34> = {}): HistoryShotV34 => ({
  id: "shot-0001-01",
  beatId: "beat-0001",
  purpose: "establish diagram on population loss",
  durationMs: 6_000,
  startMs: 0,
  endMs: 6_000,
  framing: "medium subject hold",
  cameraMovement: "static locked hold",
  subject: "population loss",
  action: "diagram layer introduction for population loss",
  foreground: "diagram/establish foreground: population loss",
  midground: "diagram midground claim focus claim-a",
  background: "diagram background establish layer for beat 0001",
  factualLabels: [],
  permittedMotion: ["establish-safe editorial motion"],
  prohibitedAdditions: [],
  transition: "hard narration cut",
  linkedClaimIds: ["claim-a"],
  modalityStateReference: "diagram-state-0033",
  adaptation16x9: "Landscape establish layout.",
  adaptation9x16: "portrait-safe crop",
  reconstructionPolicy: "archival-or-artwork",
  ...overrides,
});

const diagramBeat = (overrides: Partial<HistoryBeatV35> = {}): HistoryBeatV35 =>
  ({
    id: "beat-0001",
    modality: "diagram",
    ...overrides,
  }) as HistoryBeatV35;

describe("History V3.5 visual treatment refine", () => {
  it("does not treat provenance-only diagram states as ineffective pairs needing upgrade", () => {
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
      nodes: diagramA.nodes.map((node) => ({ ...node, linkedClaimIds: ["claim-b"] })),
    };
    const refined = refineVisualTreatmentPlanV35({
      shots: [
        baseShot({ id: "shot-0001-01", modalityStateReference: diagramA.id }),
        baseShot({
          id: "shot-0001-02",
          beatId: "beat-0002",
          startMs: 6_000,
          endMs: 12_000,
          modalityStateReference: diagramB.id,
          action: "diagram progression with causal step highlight",
        }),
      ],
      beats: [diagramBeat({ id: "beat-0001" }), diagramBeat({ id: "beat-0002" })],
      diagramStates: [diagramA, diagramB],
    });
    expect(refined.shots).toHaveLength(2);
    expect(refined.shots[1]!.action).not.toMatch(/annotation appearance/i);
  });
});
