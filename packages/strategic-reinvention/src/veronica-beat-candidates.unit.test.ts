import { describe, expect, it } from "vitest";
import type { PositioningVisualPlanV2, VisualBeatTreatmentV1 } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import {
  generateVeronicaDerivedBeatCandidates,
  selectVeronicaBeatCandidateSequence,
  VERONICA_CANDIDATE_BEAM_WIDTH,
  VERONICA_CANDIDATE_ROLLING_WINDOW,
  VERONICA_MAX_CANDIDATES_PER_BEAT,
} from "./veronica-sequence-diversity.js";

function fixture(): {
  readonly plan: Pick<PositioningVisualPlanV2, "format" | "scenes">;
  readonly beats: readonly VisualBeatTreatmentV1[];
} {
  const narration = "Different customers have different needs and priorities. The customer compares the message with one specific need.";
  const treatmentHash = stableHash("treatment");
  const semanticRevisionHash = stableHash("semantic");
  const scene = {
    sceneId: "hook",
    startMs: 0,
    durationMs: 10_000,
    narrationAnchor: narration,
    treatment: {
      treatmentHash,
      actionOwnerRole: "buyer" as const,
      actors: [{ role: "prospective-buyer" as const }],
    },
    semanticProposition: {
      semanticRevisionHash,
      actorRole: "buyer" as const,
      stateRelation: "CONTRAST" as const,
      visualMechanism: "quantity-comparison" as const,
    },
  };
  const chunks = [
    narration.slice(0, narration.indexOf(".") + 1),
    narration.slice(narration.indexOf(".") + 2),
  ];
  const beats = chunks.map((text, index): VisualBeatTreatmentV1 => {
    const startOffset = narration.indexOf(text);
    const base = {
      version: 1 as const,
      beatId: `hook-B0${index + 1}`,
      sceneId: "hook",
      role: index === 0 ? "establish" as const : "progression" as const,
      narrationRef: {
        semanticSceneId: "hook",
        sentenceIds: [`sentence-00${index + 1}`],
        startOffset,
        endOffset: startOffset + text.length,
        spanHash: stableHash({ text, startOffset }),
      },
      parentTreatmentHash: treatmentHash,
      parentSemanticRevisionHash: semanticRevisionHash,
      coreMeaning: text,
      newInformation: text,
      viewerShouldUnderstand: text,
      visualThesis: text,
      subject: "two source-supported customer needs",
      action: "the customer compares one visible message cue with a specific need",
      state: "CONTRAST; CONTRAST",
      environment: "authorized neutral comparison surface",
      composition: {
        description: "two source-supported cues appear side by side",
        camera: "documentary eye-level view",
        lighting: "editorial daylight",
        subtitleSafeAreaRequired: true as const,
      },
      continuationOfPreviousBeat: index > 0,
      referenceRequirements: [],
      assetDecision: "new-image" as const,
      reuseSourceBeatId: null,
      timingWeight: 1,
      boundaryKind: "semantic-subspan-aligned" as const,
    };
    return { ...base, beatHash: stableHash(base) };
  });
  return { plan: { format: "short", scenes: [scene] } as Pick<PositioningVisualPlanV2, "format" | "scenes">, beats };
}

describe("Veronica derived beat candidates", () => {
  it("generates a bounded stable derived set without changing semantic authority or environment", () => {
    const source = fixture();
    const first = generateVeronicaDerivedBeatCandidates({ plan: source.plan, beat: source.beats[0]! });
    const second = generateVeronicaDerivedBeatCandidates({ plan: source.plan, beat: source.beats[0]! });
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(VERONICA_MAX_CANDIDATES_PER_BEAT);
    expect(new Set(first.map((candidate) => candidate.candidateId)).size).toBe(first.length);
    expect(first.every((candidate) => candidate.semanticParentIdentity === source.beats[0]!.parentSemanticRevisionHash)).toBe(true);
    expect(first.every((candidate) => candidate.beat.environment === source.beats[0]!.environment)).toBe(true);
    expect(first.every((candidate) => candidate.sourceReference.spanHash === source.beats[0]!.narrationRef.spanHash)).toBe(true);
    expect(first.some((candidate) => candidate.visibleInformationDelta.categories.includes("source-span"))).toBe(true);
  });

  it("selects deterministically with the approved beam/window bounds and stable ties", () => {
    const source = fixture();
    const first = selectVeronicaBeatCandidateSequence(source);
    const second = selectVeronicaBeatCandidateSequence(source);
    expect(first).toEqual(second);
    expect(first.diagnostics.beamWidth).toBe(VERONICA_CANDIDATE_BEAM_WIDTH);
    expect(first.diagnostics.rollingWindowBeats).toBe(VERONICA_CANDIDATE_ROLLING_WINDOW);
    expect(first.diagnostics.maximumCandidatesPerBeat).toBe(VERONICA_MAX_CANDIDATES_PER_BEAT);
    expect(first.diagnostics.selectedCandidateIds).toHaveLength(source.beats.length);
    expect(first.diagnostics.selectionHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fails hard gates before novelty and records a truthful no-safe-candidate fallback", () => {
    const source = fixture();
    const unresolvedPlan = {
      ...source.plan,
      scenes: source.plan.scenes.map((scene) => ({
        ...scene,
        semanticProposition: { ...scene.semanticProposition!, visualMechanism: "UNRESOLVED" as const },
      })),
    };
    const selected = selectVeronicaBeatCandidateSequence({ plan: unresolvedPlan, beats: source.beats });
    expect(selected.diagnostics.noSafeCandidateBeatIds).toEqual(source.beats.map((beat) => beat.beatId));
    expect(selected.diagnostics.candidates.filter((candidate) => candidate.selected).every((candidate) => candidate.reason === "NO_SAFE_CANDIDATE_FALLBACK")).toBe(true);
    expect(selected.diagnostics.candidates.every((candidate) => candidate.hardGateFindingCodes.includes("UNRESOLVED_REQUIRED_MECHANISM"))).toBe(true);
  });
});
