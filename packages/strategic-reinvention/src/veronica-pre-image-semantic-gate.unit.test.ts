import { describe, expect, it } from "vitest";
import type { PlannedScene, PositioningVisualTreatment } from "./positioning-visual-contracts.js";
import { classifyVeronicaStillStateComplexity, normalizeProviderPromptSentence, normalizeVeronicaViewerVisibleFamilies, projectVeronicaProviderPrompt, reviewVeronicaPreImageTreatment } from "./veronica-pre-image-semantic-gate.js";

function treatment(overrides: Partial<PositioningVisualTreatment> = {}): PositioningVisualTreatment {
  const base = { treatmentId: "treatment", sceneId: "scene", progressionStage: "PROOF" as const, narrativeBeat: "buyer recognition", communicationIntent: "make-proof-visible" as const, strategy: "client-decision" as const, subjectRequirement: "occupation-neutral expert and buyer", environment: "public threshold", composition: "buyer crosses a clear doorway", camera: "40mm buyer-height", lighting: "daylight", action: "a buyer hesitates, then crosses the doorway", props: ["open doorway", "visible space beyond"], motionOpportunities: ["establishing-crop", "reveal"] as const, diagram: null, grammar: { strategy: "client-decision" as const, subjectArchetype: "buyer", environment: "public threshold", composition: "buyer crosses a clear doorway", camera: "40mm", props: ["open doorway"], topology: "none" as const, semanticTokens: ["niche"], continuityIdentityId: null }, viewerVisibleFingerprint: { strategyFamily: "client-decision" as const, subjectArchetype: "buyer", environmentArchetype: "threshold", compositionArchetype: "crossing", cameraArchetype: "40mm", lightingArchetype: "daylight", actionArchetype: "crosses", dominantObjectArchetype: "doorway", motionArchetype: "reveal" }, treatmentHash: "a".repeat(64) };
  return { ...base, ...overrides };
}

function scene(overrides: Partial<PlannedScene> = {}): PlannedScene {
  return {
    sceneId: "scene-001", progressionStage: "PROOF", narrationAnchor: "A buyer chooses a doorway.", startMs: 0, durationMs: 5_000,
    treatment: treatment(), assetId: "asset-001", eventIds: ["event-001"], overlayKey: "scene-001", visibleThesis: "A buyer commits through a clear doorway into visible access.", newInformation: "A distinct buyer decision makes the access consequence visible.", narrativeFunction: "demonstrate" as PlannedScene["narrativeFunction"], visualFamily: "human-decision", ...overrides,
  };
}

describe("Veronica pre-image semantic gate", () => {
  it("prefers a narration-native doorway relationship over abstract props", () => {
    const review = reviewVeronicaPreImageTreatment({ contentId: "L02-S02", sceneId: "scene-003", plannerVersion: "test", narration: "The niche is a doorway, not a wall.", narrationAnchor: "doorway", visibleThesis: "A buyer crosses a clear doorway into a larger accessible space.", newInformation: "Shows access rather than confinement through a concrete buyer decision.", treatment: treatment({ strategy: "abstract-conceptual", environment: "architectural light laboratory", composition: "prism and translucent planes", action: "light changes", props: ["prism", "shadow grid"] }) });
    expect(review.status).toBe("manual-review-required");
    expect(review.driftFlags).toContain("ABSTRACT_PROP_DRIFT");
    expect(review.driftFlags).toContain("NARRATION_RELATIONSHIP_MISMATCH");
  });

  it("passes occupation-neutral buyer action with a visible doorway thesis", () => {
    const review = reviewVeronicaPreImageTreatment({ contentId: "L02-S02", sceneId: "scene-003", plannerVersion: "test", narration: "The niche is a doorway, not a wall.", narrationAnchor: "doorway", visibleThesis: "A buyer crosses a clear doorway into a larger accessible space.", newInformation: "Shows access rather than confinement through a concrete buyer decision.", treatment: treatment() });
    expect(review.status).toBe("pass");
    expect(review.approvedForProviderRequest).toBe(false);
  });

  it("scores a direct doorway scene above an interpretation-heavy multi-output scene", () => {
    const direct = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "direct", plannerVersion: "test", narration: "A buyer crosses the clear doorway.", narrationAnchor: "doorway", visibleThesis: "A buyer crosses one clear doorway into a visible larger space.", newInformation: "Makes the buyer's access decision concrete and immediately readable.", treatment: treatment() });
    const indirect = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "indirect", plannerVersion: "test", narration: "Examples, content, and offers become coherent.", narrationAnchor: "evidence", visibleThesis: "One repeated evidence pattern connects concrete examples, content, and an offer.", newInformation: "Adds coherent evidence pattern recognition for the buyer.", treatment: treatment({ action: "a buyer scans several linked evidence outputs and recognizes a repeated pattern", composition: "several concrete evidence outputs around one repeated signal", props: ["evidence outputs", "repeated pattern"] }) });
    expect(direct.instantReadScore).toBeGreaterThan(indirect.instantReadScore);
    expect(new Set([direct.instantReadScore, indirect.instantReadScore])).toHaveLength(2);
  });

  it("classifies widening access as a decisive transition instead of an impossible sequential still", () => {
    expect(classifyVeronicaStillStateComplexity("Adjacent buyers arrive and the doorway widens.", treatment({ action: "adjacent buyers arrive at the actively widening doorway", composition: "buyers at an opening threshold" }))).toBe("DECISIVE_TRANSITION_MOMENT");
  });

  it("normalizes threshold variants while separating their interactions", () => {
    const decision = normalizeVeronicaViewerVisibleFamilies(scene({ treatment: treatment({ environment: "doorway decision space", camera: "32mm threshold three-quarter", action: "a buyer commits through the threshold" }) }), "doorway / threshold / widening access");
    const referral = normalizeVeronicaViewerVisibleFamilies(scene({ sceneId: "scene-002", treatment: treatment({ environment: "street-facing threshold", camera: "32mm doorway transition perspective", action: "one buyer introduces another buyer" }) }), "doorway / threshold / widening access");
    expect(decision.environmentFamily).toBe("threshold-environment");
    expect(referral.environmentFamily).toBe("threshold-environment");
    expect(decision.cameraFamily).toBe(referral.cameraFamily);
    expect(decision.interactionFamily).not.toBe(referral.interactionFamily);
  });

  it("projects a decisive transition as one instant without storyboard wording", () => {
    const prompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16" }, scene({ stateComplexity: "DECISIVE_TRANSITION_MOMENT", treatment: treatment({ actionOwnerRole: "expert", action: "buyers cross first, adjacent buyers gather, and the doorway widens after demand appears", props: ["established doorway", "adjacent buyers"], composition: "original buyers visible beyond an opening threshold" }) }));
    expect(prompt).toContain("Capture the instant");
    expect(prompt).toContain("Current action: the recurring professional actively opens the established threshold wider");
    expect(prompt).not.toMatch(/\b(?:first.*then|later|eventually|after.*then)\b/iu);
  });

  it("keeps a decisive comparison simultaneous rather than treating adjacent evidence as widening", () => {
    const prompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16" }, scene({ stateComplexity: "DECISIVE_TRANSITION_MOMENT", treatment: treatment({ strategy: "comparison-composition", action: "a buyer overlooks an all-at-once signal field while adjacent associations appear", composition: "split sequence with a clear route", props: ["scattered signals", "single clear route"] }) }));
    expect(prompt).toContain("simultaneous split comparison");
    expect(prompt).toContain("left: many unrelated signals");
    expect(prompt).not.toContain("actively opens the established threshold wider");
  });

  it("preserves explicit expert and buyer action owners independently of buyer perspective", () => {
    const expertPrompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16" }, scene({ stateComplexity: "DECISIVE_TRANSITION_MOMENT", treatment: treatment({ actionOwnerRole: "expert", action: "an expert chooses a narrower doorway while buyers are visible beyond it" }) }));
    const buyerPrompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16" }, scene({ sceneId: "scene-003", stateComplexity: "DECISIVE_TRANSITION_MOMENT", treatment: treatment({ actionOwnerRole: "buyer", action: "a buyer crosses the clear doorway" }) }));
    expect(expertPrompt).toContain("Primary actor: the recurring professional.");
    expect(expertPrompt).not.toContain("Primary actor: the buyer.");
    expect(buyerPrompt).toContain("Primary actor: the buyer.");
  });

  it("fails closed for an ambiguous decisive action owner", () => {
    expect(() => projectVeronicaProviderPrompt({ aspectRatio: "9:16" }, scene({ stateComplexity: "DECISIVE_TRANSITION_MOMENT", treatment: treatment({ action: "the threshold changes visibly" }) }))).toThrow("SEMANTIC_ACTOR_ROLE_MISMATCH");
  });

  it("keeps full-form multi-state semantics as a sequence requirement, not a Short still", () => {
    const multiState = scene({ stateComplexity: "MULTI_STATE_REQUIRED", treatment: treatment({ action: "a buyer first compares evidence and later changes their selection" }) });
    const shortPrompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16", format: "short" }, multiState);
    const fullPrompt = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, multiState);
    expect(shortPrompt).toContain("MANUAL REVIEW REQUIRED");
    expect(fullPrompt).toContain("MULTI-ASSET SEQUENCE REQUIRED");
    expect(fullPrompt).toContain("16:9 Veronica long-form editorial sequence");
  });

  it("normalizes generated prompt-boundary punctuation without rewriting ellipses", () => {
    expect(normalizeProviderPromptSentence("same pattern.")).toBe("same pattern.");
    expect(normalizeProviderPromptSentence("same pattern..")).toBe("same pattern.");
    expect(normalizeProviderPromptSentence("really!")).toBe("really!");
    expect(normalizeProviderPromptSentence("question?")).toBe("question?");
    expect(normalizeProviderPromptSentence("wait...")).toBe("wait...");
  });
});
