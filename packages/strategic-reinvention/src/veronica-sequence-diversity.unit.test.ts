import { describe, expect, it } from "vitest";
import type { PositioningVisualPlanV2, VisualBeatTreatmentV1 } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import {
  analyzeVeronicaSequenceDiversity,
  deriveVeronicaDepictedActionFamily,
  diversifyVeronicaVisualBeatSequence,
} from "./veronica-sequence-diversity.js";

const mechanisms = ["quantity-comparison", "input-output-flow", "retained-remainder"] as const;

function fixture(input: { readonly progressive: boolean }): {
  readonly plan: PositioningVisualPlanV2;
  readonly beats: readonly VisualBeatTreatmentV1[];
} {
  const scenes = Array.from({ length: 5 }, (_, index) => ({
    sceneId: `scene-${index + 1}`,
    startMs: index * 3_000,
    durationMs: 3_000,
    progressionStage: index === 0 ? "HOOK" : "EXPLANATION",
    narrationAnchor: `Supported proposition ${index + 1}.`,
    treatment: { actionOwnerRole: "business-operator" },
    semanticProposition: {
      visualMechanism: input.progressive ? mechanisms[index % mechanisms.length] : "input-output-flow",
      polarity: "NEUTRAL",
      stateRelation: "STABLE",
      actorRole: "business-operator",
    },
  }));
  const beats = scenes.map((scene, index) => {
    const value = {
      version: 1 as const,
      beatId: `beat-${index + 1}`,
      sceneId: scene.sceneId,
      role: index === 0 ? "establish" as const : "progression" as const,
      narrationRef: {
        semanticSceneId: scene.sceneId,
        sentenceIds: [`sentence-${index + 1}`],
        startOffset: index * 20,
        endOffset: index * 20 + 19,
        spanHash: stableHash(`source-proposition-${index + 1}`),
      },
      parentTreatmentHash: stableHash(`parent-${index + 1}`),
      coreMeaning: `Supported proposition ${index + 1}`,
      newInformation: `Distinct supported information ${index + 1}`,
      viewerShouldUnderstand: `Supported consequence ${index + 1}`,
      visualThesis: `Supported proposition ${index + 1} becomes visible.`,
      subject: "neutral evidence objects",
      action: input.progressive
        ? ["isolate one item", "inspect one result", "compare two quantities", "move evidence through a path", "foreground the retained evidence"][index]!
        : "move one amount through the same cost path",
      state: "NEUTRAL; STABLE",
      environment: "one coherent neutral evidence room",
      composition: {
        description: input.progressive
          ? ["one isolated focal item", "vertical evidence flow", "side-by-side comparison", "diagonal process path", "foreground evidence with context receding"][index]!
          : "the same diagonal process path leads to one remainder",
        camera: input.progressive ? `documentary view ${index + 1}` : "overhead evidence view",
        lighting: "consistent editorial daylight",
        subtitleSafeAreaRequired: true as const,
      },
      continuationOfPreviousBeat: index > 0,
      referenceRequirements: [],
      assetDecision: "new-image" as const,
      reuseSourceBeatId: null,
      timingWeight: 1,
      boundaryKind: "semantic-subspan-aligned" as const,
    };
    return { ...value, beatHash: stableHash(value) };
  });
  return {
    plan: { contentId: "synthetic", format: "short", scenes } as unknown as PositioningVisualPlanV2,
    beats,
  };
}

describe("Veronica sequence diversity", () => {
  it("does not let presentation wrappers manufacture depicted-action diversity", () => {
    const repetitive = fixture({ progressive: false });
    const wrappers = [
      "foreground evidence staging makes the distinction visible while",
      "isolated diagnostic inspection frames the action while",
      "a modular system view exposes the relationship while",
      "diagonal process progression makes each step visible while",
      "a depth composition foregrounds the result while",
    ];
    const beats = repetitive.beats.map((beat, index) => {
      const value = {
        ...beat,
        action: `${wrappers[index]} the operator separates one input into outgoing portions and a retained remainder`,
      };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const analysis = analyzeVeronicaSequenceDiversity({ plan: repetitive.plan, beats });
    expect(new Set(analysis.signatures.map((entry) => entry.depictedActionFamily))).toEqual(new Set(["decomposition"]));
    expect(new Set(analysis.signatures.map((entry) => entry.presentationMechanism)).size).toBeGreaterThan(1);
    expect(analysis.findings).toContainEqual(expect.objectContaining({ code: "ACTION_MONOTONY" }));
    expect(analysis.status).toMatch(/BLOCK|REVIEW_REQUIRED/u);
  });

  it("recognizes real action diversity under one coherent presentation style", () => {
    const coherent = fixture({ progressive: true });
    const actions = [
      "the operator selects one item from a larger stream",
      "the operator compares two separate measures side by side",
      "the operator separates one input into outgoing portions and a remainder",
      "the operator increases the flow through the same system",
      "the operator examines one selected result",
    ];
    const beats = coherent.beats.map((beat, index) => {
      const value = { ...beat, action: actions[index]!, environment: "one coherent evidence room", composition: { ...beat.composition, camera: "one consistent documentary view" } };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const analysis = analyzeVeronicaSequenceDiversity({ plan: coherent.plan, beats });
    expect(new Set(analysis.signatures.map((entry) => entry.depictedActionFamily)).size).toBe(5);
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({ code: "ACTION_MONOTONY", severity: "review-required" }));
  });

  it("does not treat two unclassified actions as evidence of an adjacent duplicate", () => {
    const coherent = fixture({ progressive: true });
    const beats = coherent.beats.map((beat, index) => {
      const value = { ...beat, action: `symbolic state ${index + 1} remains visible` };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const analysis = analyzeVeronicaSequenceDiversity({ plan: coherent.plan, beats });

    expect(new Set(analysis.signatures.map((entry) => entry.depictedActionFamily))).toEqual(new Set(["other"]));
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({ code: "ADJACENT_VISUAL_DUPLICATION" }));
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({ code: "LOW_INFORMATION_GAIN" }));
  });

  it("ranks multiple grounded action candidates by sequence outcome instead of global family uniqueness", () => {
    const grounded = fixture({ progressive: true });
    const meanings = [
      "Impressive revenue can still accompany a weak business.",
      "Revenue and margin are not the same measure.",
      "Most of one incoming payment goes back out to produce, ship, support, and sustain the sale.",
      "One sale moves through successive source-supported cost stations.",
      "Inspect the retained result after the transaction completes.",
    ];
    const actions = [
      "the operator compares two separate measures side by side",
      "the operator separates one input into outgoing portions and a remainder",
      "the operator separates one input into outgoing portions and a remainder",
      "the operator moves one sale through successive cost stations",
      "the operator examines one selected result",
    ];
    const beats = grounded.beats.map((beat, index) => {
      const value = {
        ...beat,
        coreMeaning: meanings[index]!,
        newInformation: meanings[index]!,
        viewerShouldUnderstand: meanings[index]!,
        visualThesis: meanings[index]!,
        action: actions[index]!,
      };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const before = analyzeVeronicaSequenceDiversity({ plan: grounded.plan, beats });
    expect(before.findings).toContainEqual(expect.objectContaining({
      code: "ADJACENT_VISUAL_DUPLICATION",
      beatIds: ["beat-2", "beat-3"],
    }));

    const first = diversifyVeronicaVisualBeatSequence({ plan: grounded.plan, beats });
    const second = diversifyVeronicaVisualBeatSequence({ plan: grounded.plan, beats });
    const familyByBeat = new Map(first.analysis.signatures.map((entry) => [entry.beatId, entry.depictedActionFamily]));
    expect(first).toEqual(second);
    expect(familyByBeat.get("beat-2")).not.toBe(familyByBeat.get("beat-3"));
    expect(familyByBeat.get("beat-3")).toBe("transfer");
    expect(first.analysis.findings).not.toContainEqual(expect.objectContaining({
      code: "ADJACENT_VISUAL_DUPLICATION",
      beatIds: ["beat-2", "beat-3"],
    }));
    expect(first.analysis.remediation.passes).toBeLessThanOrEqual(2);
  });

  it("keeps a cost-deduction action distinct from incremental contribution", () => {
    const [beat] = fixture({ progressive: false }).beats;
    expect(deriveVeronicaDepictedActionFamily({
      ...beat!,
      action: "the operator compares the sale before and after its distinct cost stations, leaving a visibly smaller remainder",
    })).toBe("comparison");
    expect(deriveVeronicaDepictedActionFamily({
      ...beat!,
      action: "the operator subtracts production, payment, commission, shipping, support, and refund costs from one sale",
    })).toBe("decomposition");
  });

  it("preserves explicitly locked reviewed beats during sequence refinement", () => {
    const repetitive = fixture({ progressive: false });
    const locked = repetitive.beats[1]!;
    const refined = diversifyVeronicaVisualBeatSequence({
      ...repetitive,
      lockedBeatIds: new Set([locked.beatId]),
    });
    expect(refined.beats[1]).toEqual(locked);
    expect(refined.analysis.remediation.changedBeatIds).not.toContain(locked.beatId);
  });

  it("distinguishes custom reviewed presentation grammar without wrapper keywords", () => {
    const coherent = fixture({ progressive: true });
    const presentations = [
      ["the operator pauses an order at an unopened intake gate", "single-sale intake threshold", "the retained result sits beside an unopened gate"],
      ["the customer hands payment to the operator", "customer payment handoff", "the payment begins a sale-and-fulfillment path"],
      ["the operator compares two values directly beside each other", "open comparison bench", "both values remain at equal visual depth"],
      ["the operator checks baseline and doubled paths at a decision fork", "two-branch counterfactual station", "a decision fork divides baseline and doubled paths"],
      ["the operator faces an accumulating backlog", "workload surface", "one bottleneck holds the growing backlog"],
    ] as const;
    const beats = coherent.beats.map((beat, index) => {
      const [action, environment, description] = presentations[index]!;
      const value = { ...beat, action, environment, composition: { ...beat.composition, description } };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const analysis = analyzeVeronicaSequenceDiversity({ plan: coherent.plan, beats });
    expect(new Set(analysis.signatures.map((entry) => entry.presentationMechanism)).size).toBe(5);
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({
      code: "PRESENTATION_MECHANISM_REPETITION",
      severity: "review-required",
    }));
  });

  it("recognizes adjective-first incoming and retained-value contrasts", () => {
    expect(deriveVeronicaDepictedActionFamily({
      action: "the retained result emerges beside the larger source-supported incoming amount",
    })).toBe("retained-value-reveal");
    const grounded = fixture({ progressive: false });
    const beats = grounded.beats.map((beat, index) => {
      const meaning = index === 0
        ? "Impressive revenue can coexist with a small retained margin."
        : beat.coreMeaning;
      const value = {
        ...beat,
        coreMeaning: meaning,
        newInformation: meaning,
        viewerShouldUnderstand: meaning,
        visualThesis: meaning,
      };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const refined = diversifyVeronicaVisualBeatSequence({ plan: grounded.plan, beats });
    expect(refined.analysis.signatures).toContainEqual(expect.objectContaining({
      beatId: "beat-1",
      depictedActionFamily: "retained-value-reveal",
    }));
  });

  it("distinguishes source-grounded audience actions from incidental pass wording", () => {
    expect(deriveVeronicaDepictedActionFamily({
      action: "people pass the broad display; the intended person stops at one specific situation cue",
    })).toBe("selection");
    expect(deriveVeronicaDepictedActionFamily({
      action: "the professional arranges different customer priorities into distinct groups",
    })).toBe("sorting");
    expect(deriveVeronicaDepictedActionFamily({
      action: "the customer pauses between conflicting signals before deciding whether either applies",
    })).toBe("comparison");
  });

  it("uses grounded audience candidates to repair opening action novelty", () => {
    const grounded = fixture({ progressive: false });
    const meanings = [
      "Different customers have different needs, fears, and priorities.",
      "The customer must decide whether the message applies to them.",
      "Nobody knows which part of your expertise to remember first.",
      "People recognize one cue as relevant to their situation.",
      "Specificity is not a restriction; wider routes remain open.",
    ];
    const beats = grounded.beats.map((beat, index) => {
      const value = {
        ...beat,
        coreMeaning: meanings[index]!,
        newInformation: meanings[index]!,
        viewerShouldUnderstand: meanings[index]!,
        visualThesis: meanings[index]!,
      };
      const { beatHash: _beatHash, ...hashInput } = value;
      return { ...value, beatHash: stableHash(hashInput) };
    });
    const refined = diversifyVeronicaVisualBeatSequence({ plan: grounded.plan, beats });
    expect(new Set(refined.analysis.signatures.slice(0, 3).map((entry) => entry.depictedActionFamily)).size).toBe(3);
    expect(refined.analysis.findings).not.toContainEqual(expect.objectContaining({
      code: "OPENING_ACTION_NOVELTY_LOW",
      severity: "review-required",
    }));
  });

  it("detects and deterministically diversifies material repetition without changing semantic identity", () => {
    const repetitive = fixture({ progressive: false });
    const before = analyzeVeronicaSequenceDiversity(repetitive);
    expect(before.status).toMatch(/BLOCK|REVIEW_REQUIRED/u);
    expect(before.findings.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "ADJACENT_VISUAL_DUPLICATION",
      "ACTION_MONOTONY",
      "COMPOSITION_MONOTONY",
      "MECHANISM_REPETITION",
    ]));

    const first = diversifyVeronicaVisualBeatSequence(repetitive);
    const second = diversifyVeronicaVisualBeatSequence(repetitive);
    expect(first).toEqual(second);
    expect(first.analysis.status).toMatch(/BLOCK|REVIEW_REQUIRED/u);
    expect(first.analysis.remediation.passes).toBeLessThanOrEqual(2);
    expect(first.beats.map((beat) => beat.narrationRef)).toEqual(repetitive.beats.map((beat) => beat.narrationRef));
    expect(first.beats.map((beat) => [beat.coreMeaning, beat.newInformation, beat.viewerShouldUnderstand, beat.state, beat.sceneId]))
      .toEqual(repetitive.beats.map((beat) => [beat.coreMeaning, beat.newInformation, beat.viewerShouldUnderstand, beat.state, beat.sceneId]));
  });

  it("allows a coherent recurring environment when actions, propositions, and compositions progress", () => {
    const coherent = fixture({ progressive: true });
    const analysis = analyzeVeronicaSequenceDiversity(coherent);
    expect(analysis.status).not.toMatch(/BLOCK|REVIEW_REQUIRED/u);
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({ code: "ENVIRONMENT_MONOTONY", severity: "review-required" }));
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({ code: "PRESENTATION_MECHANISM_REPETITION", severity: "review-required" }));
  });

  it("does not demand multiple semantic mechanisms from short beats of one source proposition", () => {
    const base = fixture({ progressive: true });
    const scene = base.plan.scenes[0]!;
    const source = base.beats[0]!.narrationRef;
    const beats = [
      {
        ...base.beats[0]!,
        beatId: "hook-establish",
        narrationRef: source,
        action: "isolated diagnostic inspection frames the operator isolating one real offer from an empty surrounding space",
      },
      {
        ...base.beats[1]!,
        beatId: "hook-progression",
        sceneId: scene.sceneId,
        narrationRef: source,
        action: "a modular system view shows the operator moving the same real offer along a direct path to one customer outcome",
      },
    ].map((beat) => {
      const { beatHash: _beatHash, ...hashInput } = beat;
      return { ...beat, beatHash: stableHash(hashInput) };
    });
    const plan = {
      ...base.plan,
      scenes: [{ ...scene, durationMs: 4_000 }],
    };

    const analysis = analyzeVeronicaSequenceDiversity({ plan, beats });

    expect(analysis.findings).not.toContainEqual(expect.objectContaining({
      code: "OPENING_NOVELTY_LOW",
      severity: "review-required",
    }));
    expect(analysis.findings).not.toContainEqual(expect.objectContaining({
      code: "OPENING_ACTION_NOVELTY_LOW",
      severity: "review-required",
    }));
  });
});
