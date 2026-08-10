import { describe, expect, it } from "vitest";
import type { PlannedScene, PositioningVisualPlanV2, PositioningVisualTreatment } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { calculateVeronicaSemanticQuality, classifyVeronicaStillStateComplexity, normalizeProviderPromptSentence, normalizeVeronicaViewerVisibleFamilies, projectVeronicaProviderPrompt, reviewVeronicaPreImageTreatment, runVeronicaSemanticRemediation, validateVeronicaProviderReadiness } from "./veronica-pre-image-semantic-gate.js";
import { deriveVeronicaSemanticProposition, providerPromptInternalLanguageReasons } from "./veronica-semantic-quality.js";

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

function plan(scenes: readonly PlannedScene[]): PositioningVisualPlanV2 {
  return {
    contentId: "generic-fixture", plannerVersion: "test-planner", format: "short", aspectRatio: "9:16",
    scenes, assets: [], planHash: "f".repeat(64), semanticPlanCacheKey: "e".repeat(64),
  } as PositioningVisualPlanV2;
}

describe("Veronica pre-image semantic gate", () => {
  it("does not rewrite a zero-blocker plan", () => {
    const clean = plan([scene()]);
    const result = runVeronicaSemanticRemediation({ plan: clean, narrationByScene: ["A buyer chooses a doorway."] });
    expect(result.convergenceStatus).toBe("NO_OP");
    expect(result.rounds).toBe(0);
    expect(result.plan).toBe(clean);
    expect(result.decisions).toEqual([]);
  });

  it("remediates only blocked scenes, reruns the gate, and preserves action ownership", () => {
    const blocked = scene({ visibleThesis: "topic", treatment: treatment({ actionOwnerRole: "expert", action: "the expert opens a doorway while a buyer compares and chooses" }) });
    const passing = scene({ sceneId: "scene-002", treatment: treatment({ sceneId: "scene-002", actionOwnerRole: "buyer", action: "a buyer compares the evidence, recognizes the difference, and chooses the clear route" }), visibleThesis: "Clear evidence lets the buyer recognize the difference and choose the relevant route.", newInformation: "This second scene adds the buyer's final evidence comparison and selection." });
    const original = plan([blocked, passing]);
    const result = runVeronicaSemanticRemediation({ plan: original, narrationByScene: ["The expert makes positioning evidence visible so a buyer can choose.", "The buyer compares the final evidence and chooses."] });
    expect(result.convergenceStatus).toBe("CONVERGED");
    expect(result.reviews.flatMap((review) => review.findings).filter((finding) => finding.severity === "blocker")).toEqual([]);
    expect(result.plan.scenes[1]).toBe(passing);
    expect(result.plan.scenes[0]!.treatment.actionOwnerRole).toBe("expert");
    expect(result.decisions.map((decision) => decision.sceneId)).toEqual(["scene-001"]);
    expect(result.plan.planHash).not.toBe(original.planHash);
  });
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
    expect(fullPrompt).toContain("Visible thesis:");
    expect(fullPrompt).not.toContain("storyboard still as one image");
  });

  it("blocks a missing visible thesis without projecting an empty label or inventing one", () => {
    const missingThesis = scene({ visibleThesis: "" });
    const review = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: missingThesis.sceneId, plannerVersion: "test", narration: "A buyer chooses based on visible expertise.", narrationAnchor: "buyer expertise", visibleThesis: "", newInformation: missingThesis.newInformation, treatment: missingThesis.treatment });
    const prompt = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, missingThesis);
    expect(review.status).toBe("manual-review-required");
    expect(review.driftFlags).toContain("VISIBLE_THESIS_REQUIRED");
    expect(prompt).not.toContain("Visible thesis:");
    expect(prompt).not.toContain("positioning matters");
  });

  it("rejects malformed keyword soup even when it contains narration terms and buyer boilerplate", () => {
    const review = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "hook", plannerVersion: "test", narration: "A third relevant context shows people why positioning matters.", narrationAnchor: "relevant context", visibleThesis: "Because third relevant context show people changes the available evidence, the buyer compares what is visible and recognizes the consequence before choosing.", newInformation: "A distinct context should reveal why participation creates recognition.", treatment: treatment({ environment: "occupation-neutral evidence and comparison setting", action: "the buyer compares what is visible and recognizes the consequence before choosing" }) });
    expect(review.status).toBe("manual-review-required");
    expect(review.driftFlags).toContain("MALFORMED_VISIBLE_THESIS");
  });

  it("derives distinct buyer consequences from narration instead of one comparison fallback", () => {
    const consequences = [
      "Repeated proof helps a buyer remember the expertise.",
      "A clear first screen helps a visitor categorize the offer.",
      "Mixed signals make the customer hesitate.",
      "Matching evidence lets the customer choose the option.",
    ].map((narration) => deriveVeronicaSemanticProposition({ scene: scene(), narration }).buyerConsequenceFamily);
    expect(consequences).toEqual(["REMEMBERS", "CATEGORIZES", "HESITATES", "CHOOSES"]);
  });

  it("detects repeated generic remediation while permitting narration-native motif continuity", () => {
    const genericScenes = Array.from({ length: 4 }, (_, index) => scene({ sceneId: `scene-00${index + 1}`, visibleThesis: `Visible evidence gives buyer ${index + 1} a relevant choice.`, treatment: treatment({ sceneId: `scene-00${index + 1}`, environment: "occupation-neutral evidence and comparison setting", action: "the buyer compares what is visible and recognizes the consequence before choosing" }), semanticProposition: { ...deriveVeronicaSemanticProposition({ scene: scene(), narration: "A clear claim needs concrete proof so the buyer can trust it." }), propositionHash: `${index}`.padStart(64, "a") } }));
    expect(calculateVeronicaSemanticQuality(plan(genericScenes)).status).toBe("FAIL");
    const motifScenes = Array.from({ length: 3 }, (_, index) => scene({ sceneId: `motif-${index}`, narrationAnchor: "A specific niche doorway widens into a larger audience.", semanticProposition: deriveVeronicaSemanticProposition({ scene: scene(), narration: "A specific niche doorway widens into a larger audience and remains a foothold." }) }));
    expect(calculateVeronicaSemanticQuality(plan(motifScenes)).findingCodes).not.toContain("REMEDIATION_TEMPLATE_COLLAPSE");
  });

  it("blocks provider internal-language leakage and semantic/provider contradictions", () => {
    expect(providerPromptInternalLanguageReasons("At causal step 2, show evidence tied to the narrated claim.")).toContain("internal-remediation-language");
    const missing = scene({ visibleThesis: "" });
    const readiness = validateVeronicaProviderReadiness({ ...plan([missing]), assets: [{ assetId: "asset-001", contentId: "generic-fixture", sceneId: missing.sceneId, semanticPurpose: "missing", strategy: "client-decision", prompt: "Text-free 9:16. MISSING — PROVIDER PROJECTION BLOCKED.", textFree: true, textInGeneratedImage: false, nativeAspectRatio: "9:16", ratioAdaptations: [], subjectIdentityId: null, referenceAssetId: null, semanticFingerprint: "a".repeat(64), generatedAssetCacheKey: "b".repeat(64) }] });
    expect(readiness.status).toBe("FAIL");
    expect(readiness.missingThesisCount).toBe(1);
    expect(readiness.blockedProjectionCount).toBeGreaterThan(0);
  });

  it("changes the provider projection hash when the final visible thesis changes", () => {
    const first = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, scene());
    const second = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, scene({ visibleThesis: "A buyer recognizes a different cause and consequence in the final evidence." }));
    expect(stableHash(first)).not.toBe(stableHash(second));
  });

  it("allows profession-specific visuals only when narration centers that profession", () => {
    const generic = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "generic", plannerVersion: "test", narration: "A baker, hotelier, or designer may all need positioning so a customer remembers one expertise.", narrationAnchor: "generic examples", visibleThesis: "A customer remembers one focused expertise rather than a broad professional list.", newInformation: "Adds the customer's memory consequence for a generic positioning claim.", treatment: treatment({ environment: "bakery workshop", action: "a customer remembers the baker's display" }) });
    const specific = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "specific", plannerVersion: "test", narration: "The baker arranges bread so a customer can compare freshness.", narrationAnchor: "the bakery customer decision", visibleThesis: "Clear freshness evidence lets the bakery customer compare and choose the better loaf.", newInformation: "Shows the profession-specific product evidence that drives this purchase.", treatment: treatment({ environment: "bakery workshop", action: "a customer compares loaves and chooses the fresher one" }) });
    expect(generic.driftFlags).toContain("OCCUPATION_PROXY_DRIFT");
    expect(specific.driftFlags).not.toContain("OCCUPATION_PROXY_DRIFT");
  });

  it("treats a repeated causal action as decorative even when camera and environment change", () => {
    const previous = treatment({ environment: "first neutral room", camera: "35mm wide", action: "a buyer recognizes one repeated evidence pattern" });
    const duplicate = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "duplicate", plannerVersion: "test", narration: "The customer remembers the expertise.", narrationAnchor: "memory", visibleThesis: "A buyer recognizes one repeated pattern and remembers the associated expertise.", newInformation: "Claims a new visual location without adding a new causal relationship.", previousTreatment: previous, treatment: treatment({ environment: "different neutral concourse", camera: "85mm close", action: "a buyer recognizes one repeated evidence pattern" }) });
    const distinct = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "distinct", plannerVersion: "test", narration: "The customer remembers the expertise.", narrationAnchor: "memory", visibleThesis: "Repeated encounters teach the buyer which problem belongs with the professional.", newInformation: "Adds learning across repeated exposure rather than repeating a one-time recognition.", previousTreatment: previous, treatment: treatment({ action: "the expert repeats one problem cue while the buyer remembers it across encounters", actionOwnerRole: "expert" }) });
    expect(duplicate.driftFlags).toContain("SEMANTICALLY_DECORATIVE_SCENE");
    expect(distinct.driftFlags).not.toContain("SEMANTICALLY_DECORATIVE_SCENE");
    expect(distinct.treatmentHash).toBeDefined();
  });

  it("requires buyer consequence without changing expert action ownership", () => {
    const expertOwned = treatment({ actionOwnerRole: "expert", action: "the expert repeats one evidence signal while a buyer recognizes the associated problem" });
    const review = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "expert-owned", plannerVersion: "test", narration: "Positioning teaches the customer which expertise to remember.", narrationAnchor: "customer recognition", visibleThesis: "Consistent expert evidence lets the customer recognize and remember the intended problem association.", newInformation: "Adds professional-owned repetition with a separate customer recognition consequence.", treatment: expertOwned });
    const prompt = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, scene({ stateComplexity: "DECISIVE_TRANSITION_MOMENT", treatment: expertOwned }));
    expect(review.driftFlags).not.toContain("BUYER_PERSPECTIVE_REQUIRED");
    expect(prompt).toContain("Primary actor: the recurring professional.");
  });

  it("normalizes generated prompt-boundary punctuation without rewriting ellipses", () => {
    expect(normalizeProviderPromptSentence("same pattern.")).toBe("same pattern.");
    expect(normalizeProviderPromptSentence("same pattern..")).toBe("same pattern.");
    expect(normalizeProviderPromptSentence("really!")).toBe("really!");
    expect(normalizeProviderPromptSentence("question?")).toBe("question?");
    expect(normalizeProviderPromptSentence("wait...")).toBe("wait...");
  });
});
