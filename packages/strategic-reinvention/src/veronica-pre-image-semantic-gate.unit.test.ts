import { describe, expect, it } from "vitest";
import type { PlannedScene, PositioningVisualPlanV2, PositioningVisualTreatment } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { applyVeronicaSourceGroundedRemediationDirectives, calculateVeronicaSemanticQuality, classifyVeronicaStillStateComplexity, normalizeProviderPromptSentence, normalizeVeronicaViewerVisibleFamilies, projectVeronicaProviderPrompt, rebuildVeronicaFinalTreatmentState, reviewVeronicaPreImageTreatment, runVeronicaSemanticRemediation, validateVeronicaProviderReadiness } from "./veronica-pre-image-semantic-gate.js";
import { assessVeronicaNarrationClaimIntegrity, assessVeronicaPropositionInternalCoherence, assessVeronicaSourceGroundedSemanticConsistency, assessVeronicaTreatmentPropositionCompatibility, classifyVeronicaSemanticPolarity, deriveVeronicaSemanticProposition, providerPromptInternalLanguageReasons, providerPromptLexicalIntegrityReasons, renderVeronicaVisibleThesis, visualTreatmentFromProposition } from "./veronica-semantic-quality.js";

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
  it("rejects concrete positioning semantics leaked into a source-grounded economics treatment", () => {
    const narration = "If sales doubled tomorrow, would the business definitely become healthier?";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const contaminated = treatment({
      environment: "evidence review with an observer and title badge",
      action: "the observer inspects a work example and recognizes the claimed expertise",
      props: ["title badge", "work example", "reasoning artifact"],
    });
    const compatibility = assessVeronicaTreatmentPropositionCompatibility({ treatment: contaminated, proposition, narration });
    expect(proposition.visualMechanism).toBe("scaling-relation");
    expect(compatibility.status).toBe("FAIL");
    expect(compatibility.reasons).toEqual(expect.arrayContaining([
      "unsupported-treatment-entity:expertise-recognition",
      "treatment-family-mismatch:positioning-expertise",
    ]));
  });

  it("assigns a source-grounded marginal-sale payoff to the business operator before the next order", () => {
    const narration = "Before chasing the next order, calculate what one additional sale actually leaves behind.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(proposition.actorRole).toBe("business-operator");
    expect(projected.actionOwnerRole).toBe("business-operator");
    expect(projected.action).toContain("small retained contribution");
    expect(projected.action).toContain("before pursuing the next order");
    expect(projected.composition).toContain("next order remains peripheral");
    expect(projected.composition).toContain("no cost-decomposition workflow");
  });

  it("retains a materially narrated sale subject in a conservative unit-economics treatment", () => {
    const narration = "Take your best-selling product and calculate one sale from start to finish.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(projected.props).toContain("isolated source-supported best-selling product");
    expect(projected.composition).toContain("best-selling product");
    expect(projected.action).toContain("source-supported best-selling product");
  });

  it("projects a hypothetical volume increase as a text-free simultaneous comparison", () => {
    const narration = "If sales doubled tomorrow, would the business definitely become healthier?";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(proposition.visualMechanism).toBe("scaling-relation");
    expect(projected.composition).toContain("doubled order-volume evidence");
    expect(projected.action).toContain("without implying the business is healthier");
    expect(projected.props).toEqual(expect.arrayContaining(["paired retained-remainder containers"]));
  });

  it("isolates retained value from order-count mass without reusing a transaction inspection", () => {
    const narration = "What remains tells you much more than the order count.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(projected.composition).toContain("many order units recede");
    expect(projected.action).toContain("isolates the small retained-value evidence");
    expect(projected.props).toEqual(expect.arrayContaining(["isolated small retained-value evidence"]));
  });

  it("projects workload growth as one operational bottleneck rather than a modular flow", () => {
    const narration = "If double the sales means double the workload and almost no additional margin, growth is amplifying a structural weakness.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(proposition.visualMechanism).toBe("workload-accumulation");
    expect(projected.environment).toContain("accumulating workload backlog");
    expect(projected.composition).toContain("dominant bottleneck");
    expect(projected.composition).not.toMatch(/input.*process.*result/iu);
  });

  it("projects unit-economics understanding before growth as a decision checkpoint", () => {
    const narration = "Before chasing more revenue, understand what happens economically every single time you sell.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(projected.composition).toContain("clear checkpoint");
    expect(projected.composition).toContain("no cost-decomposition workflow");
    expect(projected.action).toContain("before allowing additional orders");
    expect(projected.props).toEqual(expect.arrayContaining(["visible retained contribution"]));
  });

  it("projects healthy scaling with controlled capacity and retained contribution as primary evidence", () => {
    const narration = "It is the one whose economics still work when the volume grows.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene({ narrationAnchor: narration }), narration });
    const projected = visualTreatmentFromProposition({ scene: scene({ narrationAnchor: narration }), proposition, preserveEnvironment: false });
    expect(proposition.visualMechanism).toBe("scaling-relation");
    expect(projected.composition).toContain("larger retained contribution form the primary comparison");
    expect(projected.composition).toContain("without an accumulating backlog");
    expect(projected.action).toContain("controlled capacity");
  });

  it("blocks unsupported threshold environments while preserving supported doorway stories", () => {
    const narration = "Revenue grows while retained margin remains small.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    expect(assessVeronicaTreatmentPropositionCompatibility({ treatment: treatment(), proposition, narration }).reasons).toEqual(expect.arrayContaining([
      "unsupported-doorway-motif",
      "unsupported-treatment-environment:public-threshold",
    ]));
    const supportedNarration = "A specific niche is a doorway, not a wall.";
    const supported = deriveVeronicaSemanticProposition({ scene: scene(), narration: supportedNarration });
    const supportedTreatment = treatment(visualTreatmentFromProposition({ scene: scene(), proposition: supported, preserveEnvironment: false }));
    expect(assessVeronicaTreatmentPropositionCompatibility({ treatment: supportedTreatment, proposition: supported, narration: supportedNarration }).status).toBe("PASS");
  });

  it("resolves contextual and pronoun-dependent theses from bounded source spans", () => {
    const contextual = "Try this instead. Take one sale from customer payment through every variable cost.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration: contextual });
    expect(proposition.narrationClaim).toBe("Take one sale from customer payment through every variable cost.");
    expect(proposition.evidenceSpans).toHaveLength(2);
    expect(proposition.evidenceSpans.map((span) => span.text)).toEqual([
      "Try this instead.",
      "Take one sale from customer payment through every variable cost.",
    ]);
    expect(renderVeronicaVisibleThesis(proposition)).not.toBe("Try this instead.");

    const pronoun = "The retained value barely changes when workload doubles. That is the problem.";
    const pronounProposition = deriveVeronicaSemanticProposition({ scene: scene(), narration: pronoun });
    expect(pronounProposition.narrationClaim).toContain("retained value barely changes");
  });

  it("keeps a standalone thesis stable and blocks an ambiguous contextual fragment", () => {
    const complete = "One additional sale leaves a small retained remainder.";
    const stable = deriveVeronicaSemanticProposition({ scene: scene(), narration: complete });
    expect(stable.narrationClaim).toBe(complete);
    expect(renderVeronicaVisibleThesis(stable)).toBe(complete);

    const ambiguous = deriveVeronicaSemanticProposition({ scene: scene(), narration: "Try this instead." });
    expect(ambiguous.visualMechanism).toBe("UNRESOLVED");
    expect(() => visualTreatmentFromProposition({ scene: scene(), proposition: ambiguous, preserveEnvironment: false })).toThrow("SEMANTIC_REMEDIATION_LOW_CONFIDENCE");
  });

  it("records and replaces a rejected treatment family instead of recycling it", () => {
    const narration = "If double the sales means double the workload and almost no additional margin, growth amplifies structural weakness.";
    const contaminated = scene({
      narrationAnchor: narration,
      treatment: treatment({ environment: "expertise review", action: "an observer inspects a title badge and matching work example", props: ["title badge", "work example"] }),
    });
    const result = runVeronicaSemanticRemediation({ plan: plan([contaminated]), narrationByScene: [narration] });
    expect(result.decisions[0]?.rejectedTreatmentFamilies).toContain("expertise-recognition");
    expect(result.plan.scenes[0]?.semanticProposition?.visualMechanism).toBe("workload-accumulation");
    expect(`${result.plan.scenes[0]?.treatment.environment} ${result.plan.scenes[0]?.treatment.action}`).not.toMatch(/title badge|expertise recognition|work example/iu);
  });

  it("hard-blocks unresolved placeholders before provider projection", () => {
    expect(providerPromptInternalLanguageReasons("Vertical image prompt with TODO placeholder and UNRESOLVED action.")).toContain("unresolved-placeholder");
  });

  it("replaces rejected semantic ownership and propagates the replacement through provider projection", () => {
    const narration = "Doing substantive professional work develops actual expertise. External recognition of that expertise is a separate problem.";
    const stale = scene({
      sceneId: "generic-semantic-repair",
      narrationAnchor: narration,
      treatment: treatment({
        sceneId: "generic-semantic-repair",
        actionOwnerRole: "buyer",
        action: "a buyer inspects proof and decides that the professional is an expert",
        environment: "buyer proof-review wall",
        composition: "title badge beside proof cards",
        props: ["title badge", "proof cards"],
      }),
    });
    const unaffected = scene({
      sceneId: "unaffected-passing-scene",
      narrationAnchor: "A buyer chooses one clear doorway.",
      treatment: treatment({ sceneId: "unaffected-passing-scene" }),
    });
    const timings = [
      { id: stale.sceneId, timing: { startSeconds: 0, endSeconds: 5 } },
      { id: unaffected.sceneId, timing: { startSeconds: 5, endSeconds: 10 } },
    ];
    const narrationByScene = [narration, unaffected.narrationAnchor];
    const canonical = rebuildVeronicaFinalTreatmentState({
      plan: plan([stale, unaffected]),
      sceneTimings: timings,
      narrationByScene,
    });
    const originalTarget = canonical.scenes[0]!;
    const originalUnaffected = canonical.scenes[1]!;
    const directive = {
      schemaVersion: "veronica-source-grounded-remediation-directive.v3" as const,
      repairBoundary: "SEMANTIC_EXTRACTION" as const,
      visualMechanism: "work-expertise-separation" as const,
      actionOwnerRole: "expert" as const,
      sourceSemantics: {
        actorRole: "professional",
        actionOwner: "professional through their work",
        causalDirection: "professional work develops actual expertise; external recognition remains a separate problem",
        polarity: "NEUTRAL",
      },
      requiredVisibleEvidence: [
        "professional performing substantive work",
        "clear distinction between producing expertise and making it perceptible",
      ],
      requiredDomainObjects: [
        "substantive work process",
        "expert work result",
        "separate external observer",
      ],
      forbiddenMisinterpretations: [
        "buyer evaluates proof to establish expertise",
      ],
      reason: "Restore professional-owned work and the separate recognition state.",
    };
    const remediated = applyVeronicaSourceGroundedRemediationDirectives({
      plan: canonical,
      directives: [{ sceneId: stale.sceneId, directive }],
      narrationByScene,
      round: 1,
    });
    const replacement = remediated.scenes[0]!;
    expect(replacement.semanticProposition).toMatchObject({
      actorRole: "expert",
      actorAction: "professional work develops actual expertise",
      cause: "professional work develops actual expertise",
      consequence: "external recognition remains a separate problem",
      stateRelation: "CONTRAST",
      visualMechanism: "work-expertise-separation",
      buyerConsequenceFamily: "NONE",
    });
    expect(replacement.semanticProposition?.buyerInterpretation).toBeUndefined();
    expect(replacement.treatment.actionOwnerRole).toBe("expert");
    expect(replacement.treatment.action).toMatch(/^the professional performs substantive work/iu);
    expect(`${replacement.treatment.environment} ${replacement.treatment.composition} ${replacement.treatment.action} ${replacement.treatment.props.join(" ")}`).not.toMatch(/title badge|buyer inspects proof/iu);
    expect(remediated.scenes[1]).toBe(originalUnaffected);

    const rebuilt = rebuildVeronicaFinalTreatmentState({
      plan: remediated,
      sceneTimings: timings,
      narrationByScene,
    });
    const finalTarget = rebuilt.scenes[0]!;
    const finalAsset = rebuilt.assets.find((asset) => asset.sceneId === stale.sceneId)!;
    const finalUnaffectedAsset = rebuilt.assets.find((asset) => asset.sceneId === unaffected.sceneId)!;
    const originalUnaffectedAsset = canonical.assets.find((asset) => asset.sceneId === unaffected.sceneId)!;
    expect(finalTarget.semanticProposition?.visualMechanism).toBe("work-expertise-separation");
    expect(finalTarget.treatment.actionOwnerRole).toBe("expert");
    expect(finalAsset.prompt).toContain("Primary actor: the recurring professional.");
    expect(finalAsset.prompt).toContain("the professional performs substantive work");
    expect(finalAsset.prompt).not.toMatch(/Primary actor: the buyer|title badge|buyer inspects proof/iu);
    expect(finalTarget.semanticProposition?.propositionHash).not.toBe(originalTarget.semanticProposition?.propositionHash);
    expect(finalTarget.treatment.treatmentHash).not.toBe(originalTarget.treatment.treatmentHash);
    expect(finalAsset.generatedAssetCacheKey).not.toBe(canonical.assets.find((asset) => asset.sceneId === stale.sceneId)?.generatedAssetCacheKey);
    expect(rebuilt.scenes[1]?.semanticProposition?.propositionHash).toBe(originalUnaffected.semanticProposition?.propositionHash);
    expect(rebuilt.scenes[1]?.treatment.treatmentHash).toBe(originalUnaffected.treatment.treatmentHash);
    expect(finalUnaffectedAsset.generatedAssetCacheKey).toBe(originalUnaffectedAsset.generatedAssetCacheKey);
  });

  it("uses the typed mechanism owner when rebuilding a state model", () => {
    const narration = "When a buyer cannot understand a consultant's specialty, there is no reason to choose that consultant for it.";
    const target = scene({
      sceneId: "generic-state-model-repair",
      narrationAnchor: narration,
      treatment: treatment({
        sceneId: "generic-state-model-repair",
        strategy: "abstract-conceptual",
        actionOwnerRole: "expert",
        action: "abstract light resolves into a positive consequence",
        environment: "architectural light laboratory",
        props: ["prism", "shadow grid"],
      }),
    });
    const timings = [{ id: target.sceneId, timing: { startSeconds: 0, endSeconds: 5 } }];
    const canonical = rebuildVeronicaFinalTreatmentState({
      plan: plan([target]),
      sceneTimings: timings,
      narrationByScene: [narration],
    });
    const remediated = applyVeronicaSourceGroundedRemediationDirectives({
      plan: canonical,
      directives: [{
        sceneId: target.sceneId,
        directive: {
          schemaVersion: "veronica-source-grounded-remediation-directive.v3",
          repairBoundary: "STATE_MODEL",
          visualMechanism: "audience-fit-signal",
          actionOwnerRole: "buyer",
          sourceSemantics: {
            actorRole: "consultant",
            actionOwner: "consultant",
            action: "fails to make a particular strength understandable",
            causalDirection: "unclear specialty causes no reason to choose",
            polarity: "NEGATIVE_STATE",
            consequence: "the buyer lacks a selection reason",
          },
          requiredVisibleEvidence: [
            "buyer cannot identify one consultant's specialty",
            "selection remains unresolved",
          ],
          requiredDomainObjects: ["two consultants", "buyer", "specific specialty cue"],
          forbiddenMisinterpretations: ["abstract light resolves the problem"],
          stateModel: {
            relation: "CAUSAL_BEFORE_AFTER",
            failureState: "the specialty is unclear to the buyer",
            outcomeState: "the buyer has no reason to choose that consultant",
          },
          reason: "Restore the unresolved buyer-choice state.",
        },
      }],
      narrationByScene: [narration],
      round: 1,
    });
    const rebuilt = rebuildVeronicaFinalTreatmentState({
      plan: remediated,
      sceneTimings: timings,
      narrationByScene: [narration],
    });
    const replacement = rebuilt.scenes[0]!;
    expect(replacement.semanticProposition?.visualMechanism).toBe("audience-fit-signal");
    expect(replacement.semanticProposition?.actorRole).toBe("buyer");
    expect(replacement.treatment.actionOwnerRole).toBe("buyer");
    expect(replacement.treatment.action).toMatch(/intended person stops/iu);
    expect(`${replacement.treatment.environment} ${replacement.treatment.props.join(" ")}`).not.toMatch(/light laboratory|prism|shadow grid/iu);
  });

  it("re-derives source semantics before accepting a previously clean plan", () => {
    const clean = plan([scene()]);
    const result = runVeronicaSemanticRemediation({ plan: clean, narrationByScene: ["A buyer chooses a doorway."] });
    expect(result.convergenceStatus).toBe("CONVERGED");
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.plan).not.toBe(clean);
    expect(result.decisions).not.toEqual([]);
  });

  it("fails closed when generic remediation cannot reconcile source action ownership", () => {
    const blocked = scene({ visibleThesis: "topic", treatment: treatment({ actionOwnerRole: "expert", action: "the expert opens a doorway while a buyer compares and chooses" }) });
    const passing = scene({ sceneId: "scene-002", treatment: treatment({ sceneId: "scene-002", actionOwnerRole: "buyer", action: "a buyer compares the evidence, recognizes the difference, and chooses the clear route" }), visibleThesis: "Clear evidence lets the buyer recognize the difference and choose the relevant route.", newInformation: "This second scene adds the buyer's final evidence comparison and selection." });
    const original = plan([blocked, passing]);
    const result = runVeronicaSemanticRemediation({ plan: original, narrationByScene: ["The expert makes positioning evidence visible so a buyer can choose.", "The buyer compares the final evidence and chooses."] });
    expect(result.convergenceStatus).toBe("SEMANTIC_REMEDIATION_EXHAUSTED");
    expect(result.remainingFindings).toContainEqual(expect.objectContaining({ code: "NARRATION_RELATIONSHIP_MISMATCH", severity: "blocker" }));
    expect(result.plan.scenes[1]).toBe(passing);
    expect(result.plan.validation.status).toBe("fail");
    expect([...new Set(result.decisions.map((decision) => decision.sceneId))]).toEqual(["scene-001"]);
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

  it("preserves an atomic source transition through final state materialization", () => {
    const narration = "The buyer hesitates, then commits after seeing the proof.";
    const source = scene({
      narrationAnchor: narration,
      treatment: treatment({
        actionOwnerRole: "buyer",
        action: "the buyer hesitates, then commits after seeing the proof",
      }),
    });
    const rebuilt = rebuildVeronicaFinalTreatmentState({
      plan: plan([source]),
      sceneTimings: [{ id: source.sceneId, timing: { startSeconds: 0, endSeconds: 5 } }],
      narrationByScene: [narration],
    });

    expect(rebuilt.scenes[0]?.semanticProposition?.stateRelation).toBe("SEQUENTIAL_PROGRESSION");
    expect(rebuilt.scenes[0]?.stateComplexity).toBe("DECISIVE_TRANSITION_MOMENT");
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
    expect(prompt).toContain("Capture the decisive causal change");
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
    const narration = "The buyer compares conflicting evidence first, but later selects the coherent proof.";
    const multiState = scene({ narrationAnchor: narration, stateComplexity: "MULTI_STATE_REQUIRED", semanticProposition: deriveVeronicaSemanticProposition({ scene: scene(), narration }), treatment: treatment({ action: "a buyer first compares evidence and later changes their selection" }) });
    const shortPrompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16", format: "short" }, multiState);
    const fullPrompt = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, multiState);
    expect(shortPrompt).toContain("Capture the decisive causal change");
    expect(shortPrompt).not.toContain("MANUAL REVIEW REQUIRED");
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

  it("does not require buyer perspective for S01 customer-payment flow with an explicit NONE consequence", () => {
    const narration = "Take one sale from customer payment through every variable cost.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const review = reviewVeronicaPreImageTreatment({
      contentId: "01a-revenue-is-not-a-good-business", sceneId: "S01", plannerVersion: "test",
      narration, narrationAnchor: narration,
      visibleThesis: "One sale passes from customer payment through every variable cost.",
      newInformation: "Shows the full payment-to-cost flow for one sale.",
      treatment: treatment({ actionOwnerRole: "none", action: "a payment moves through visible variable-cost deductions" }),
      proposition,
    });
    expect(proposition.buyerConsequenceFamily).toBe("NONE");
    expect(review.driftFlags).not.toContain("BUYER_PERSPECTIVE_REQUIRED");
  });

  it("still requires buyer perspective for a structured buyer consequence", () => {
    const narration = "A clear first screen helps a visitor categorize the offer.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const review = reviewVeronicaPreImageTreatment({
      contentId: "test", sceneId: "buyer-consequence", plannerVersion: "test",
      narration, narrationAnchor: narration,
      visibleThesis: "A clear first screen lets a visitor categorize the offer.",
      newInformation: "Adds the visitor's categorization consequence at the first screen.",
      treatment: treatment({
        narrativeBeat: "expert interface arrangement",
        subjectRequirement: "an expert and one interface",
        environment: "neutral interface studio",
        composition: "expert beside one clear first screen",
        camera: "eye-level medium shot",
        actionOwnerRole: "expert",
        action: "the expert arranges one clear first screen",
        props: ["interface screen"],
      }),
      proposition,
    });
    expect(proposition.buyerConsequenceFamily).toBe("CATEGORIZES");
    expect(review.driftFlags).toContain("BUYER_PERSPECTIVE_REQUIRED");
  });

  it("normalizes generated prompt-boundary punctuation without rewriting ellipses", () => {
    expect(normalizeProviderPromptSentence("same pattern.")).toBe("same pattern.");
    expect(normalizeProviderPromptSentence("same pattern..")).toBe("same pattern.");
    expect(normalizeProviderPromptSentence("really!")).toBe("really!");
    expect(normalizeProviderPromptSentence("question?")).toBe("question?");
    expect(normalizeProviderPromptSentence("wait...")).toBe("wait...");
  });

  it("extracts a complete narration claim with source offsets instead of word truncation", () => {
    const narration = "The setup is brief. Identity can change in a sentence, but recognition has to be earned through repeated evidence before the market believes the role.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    expect(proposition.narrationClaim).toBe("Identity can change in a sentence, but recognition has to be earned through repeated evidence before the market believes the role.");
    expect(assessVeronicaNarrationClaimIntegrity(proposition.narrationClaim).status).toBe("PASS");
    expect(narration.slice(proposition.evidenceSpans[0].startOffset, proposition.evidenceSpans[0].endOffset)).toBe(proposition.narrationClaim);
  });

  it("rejects obvious incomplete claim endings", () => {
    expect(assessVeronicaNarrationClaimIntegrity("Recognition has to be").status).toBe("FAIL");
    expect(assessVeronicaNarrationClaimIntegrity("Regular participation in two").status).toBe("FAIL");
    expect(assessVeronicaNarrationClaimIntegrity("A teardown that shows what").status).toBe("FAIL");
  });

  it("preserves negative and corrective polarity instead of projecting a positive default", () => {
    const conflict = deriveVeronicaSemanticProposition({ scene: scene(), narration: "The profile, website, and offer present conflicting identities, so the visitor cannot categorize the expertise." });
    expect(conflict.polarity).toBe("NEGATIVE_STATE");
    expect(conflict.buyerConsequenceFamily).toBe("HESITATES");
    expect(visualTreatmentFromProposition({ scene: scene(), proposition: conflict, preserveEnvironment: false }).action).toMatch(/conflicting|without finding/iu);
    expect(classifyVeronicaSemanticPolarity("The signals conflict at first, but after alignment the visitor understands one coherent category.")).toBe("TRANSITION_NEGATIVE_TO_POSITIVE");
  });

  it("keeps a source-grounded economic warning negative and binds its complete causal chain", () => {
    const narration = "You can have impressive revenue and still have a weak business. Because revenue and margin are not the same thing. If one hundred euros comes in and nearly all of it goes back out in sale-related costs, more orders may make the problem bigger.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const projected = visualTreatmentFromProposition({ scene: scene(), proposition, preserveEnvironment: false });
    expect(proposition.polarity).toBe("NEGATIVE_STATE");
    expect(proposition.evidenceSpans).toHaveLength(3);
    expect(proposition.visualMechanism).toBe("retained-remainder");
    expect(projected.action).toMatch(/outgoing cost portions|retained remainder/iu);
    expect(classifyVeronicaSemanticPolarity("More orders may simply make the problem bigger.")).toBe("NEGATIVE_STATE");
  });

  it("projects unit-economics sequencing as a sale flow before growth pursuit", () => {
    const narration = "Before chasing more revenue, understand what happens economically every single time you sell.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const projected = visualTreatmentFromProposition({ scene: scene(), proposition, preserveEnvironment: false });
    expect(proposition.visualMechanism).toBe("input-output-flow");
    expect(projected.action).toMatch(/already-analyzed sale.*decision checkpoint.*before allowing additional orders/iu);
    expect(`${projected.environment} ${projected.composition} ${projected.props.join(" ")}`).toMatch(/cost portions|retained result|additional order/iu);
  });

  it("keeps motion-without-accumulation as a failure state", () => {
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration: "The professional changes theme repeatedly. The result is motion without accumulation." });
    expect(proposition.polarity).toBe("NEGATIVE_STATE");
    expect(proposition.buyerConsequenceFamily).toBe("FAILS_TO_ACCUMULATE");
    expect(proposition.consequence).toMatch(/motion without accumulation/iu);
  });

  it("blocks proposition contradictions and stale treatment environments", () => {
    const negative = deriveVeronicaSemanticProposition({ scene: scene(), narration: "Conflicting website identities make the visitor hesitate because no category is clear." });
    const contradictory = { ...negative, consequence: "the affected professional wins the client because the buyer recognizes a clear fit", buyerConsequenceFamily: "RECOGNIZES" as const, buyerInterpretation: "the visitor recognizes a clear fit" };
    expect(assessVeronicaPropositionInternalCoherence(contradictory).status).toBe("FAIL");
    expect(assessVeronicaTreatmentPropositionCompatibility({ treatment: treatment({ environment: "podcast booth with microphone and backstage camera rig" }), proposition: negative, narration: negative.narrationClaim }).status).toBe("FAIL");
  });

  it("keeps an explicit negative outcome authoritative when the buyer action is positive", () => {
    const base = deriveVeronicaSemanticProposition({ scene: scene(), narration: "The competing professional loses the client because the buyer selects the more memorable option." });
    const actorRelative = {
      ...base,
      polarity: "NEGATIVE_STATE" as const,
      actorRole: "expert" as const,
      buyerConsequenceFamily: "REMEMBERS" as const,
      buyerInterpretation: "the buyer remembers and selects the competing option",
      consequence: "the affected professional loses the client",
    };
    expect(assessVeronicaPropositionInternalCoherence(actorRelative)).toEqual({ status: "PASS", reasons: [] });
    expect(assessVeronicaPropositionInternalCoherence({
      ...actorRelative,
      consequence: "the affected professional succeeds and wins the client",
    }).status).toBe("FAIL");
  });

  it("preserves a negative signal state and atomically replaces incompatible treatment fields", () => {
    const narration = "A broad undifferentiated offer leaves the visitor without a clear category.";
    const target = scene({
      sceneId: "generic-negative-remediation",
      narrationAnchor: narration,
      treatment: treatment({
        sceneId: "generic-negative-remediation",
        strategy: "transformation",
        environment: "career-transition studio",
        action: "the professional places a transferable skill beside a new role marker",
        props: ["prior-work artifact", "transferable-skill evidence", "new-service result"],
      }),
    });
    const canonical = rebuildVeronicaFinalTreatmentState({
      plan: plan([target]),
      sceneTimings: [{ id: target.sceneId, timing: { startSeconds: 0, endSeconds: 5 } }],
      narrationByScene: [narration],
    });
    const remediated = applyVeronicaSourceGroundedRemediationDirectives({
      plan: canonical,
      narrationByScene: [narration],
      round: 1,
      directives: [{
        sceneId: target.sceneId,
        directive: {
          schemaVersion: "veronica-source-grounded-remediation-directive.v3",
          repairBoundary: "STATE_MODEL",
          visualMechanism: "signal-coherence",
          actionOwnerRole: "buyer",
          sourceSemantics: { polarity: "NEGATIVE_STATE", consequence: "the visitor cannot identify a clear category" },
          requiredVisibleEvidence: ["broad undifferentiated offer", "visitor hesitation"],
          requiredDomainObjects: ["offer evidence"],
          forbiddenMisinterpretations: ["successful focused coherence"],
          stateModel: { relation: "STABLE", failureState: "the offer remains broad", outcomeState: "the visitor cannot identify a clear category" },
          reason: "Keep the failed state visible.",
        },
      }],
    });
    const final = rebuildVeronicaFinalTreatmentState({
      plan: remediated,
      sceneTimings: [{ id: target.sceneId, timing: { startSeconds: 0, endSeconds: 5 } }],
      narrationByScene: [narration],
    });
    const repaired = final.scenes[0]!;
    const visual = `${repaired.treatment.environment} ${repaired.treatment.action} ${repaired.treatment.composition} ${repaired.treatment.props.join(" ")}`;
    expect(repaired.semanticProposition?.polarity).toBe("NEGATIVE_STATE");
    expect(classifyVeronicaSemanticPolarity(visual)).not.toBe("POSITIVE_STATE");
    expect(visual).toMatch(/conflicting|undifferentiated|without finding/iu);
    expect(visual).not.toMatch(/career-transition|prior-work|transferable-skill|new-service/iu);
    expect(repaired.treatment.grammar.environment).toBe(repaired.treatment.environment);
    expect(repaired.treatment.viewerVisibleFingerprint.environmentArchetype).toBe(repaired.treatment.environment);
  });

  it("materializes scene and provider projection from one revision and blocks a mixed revision", () => {
    const narration = "A buyer cannot identify a clear fit from conflicting evidence.";
    const rebuilt = rebuildVeronicaFinalTreatmentState({
      plan: plan([scene({ narrationAnchor: narration })]),
      sceneTimings: [{ id: "scene-001", timing: { startSeconds: 0, endSeconds: 5 } }],
      narrationByScene: [narration],
    });
    const finalScene = rebuilt.scenes[0]!;
    const finalAsset = rebuilt.assets[0]!;
    expect(finalAsset.projectionProvenance).toMatchObject({
      sourceTreatmentHash: finalScene.treatment.treatmentHash,
      sourcePropositionHash: finalScene.semanticProposition?.propositionHash,
      materializationRevisionId: finalScene.materializationRevision?.revisionId,
    });
    expect(finalAsset.prompt).toContain(`Subject: ${finalScene.treatment.subjectRequirement}.`);
    expect(finalAsset.prompt).toContain(`Environment: ${finalScene.treatment.environment}.`);
    const mixed = {
      ...rebuilt,
      assets: [{
        ...finalAsset,
        projectionProvenance: {
          ...finalAsset.projectionProvenance!,
          sourceTreatmentHash: "0".repeat(64),
        },
      }],
    } as PositioningVisualPlanV2;
    const readiness = validateVeronicaProviderReadiness(mixed);
    expect(readiness.status).toBe("FAIL");
    expect(readiness.issues.some((issue) => issue.reason.includes("stale-source-treatment-hash"))).toBe(true);
  });

  it("preserves ordinary first/first-time prose and rejects lexical corruption", () => {
    const firstTime = scene({ stateComplexity: "DECISIVE_TRANSITION_MOMENT", visibleThesis: "The first screen gives a first-time visitor one clear category.", treatment: treatment({ action: "a first-time visitor scans the first screen", actionOwnerRole: "buyer" }) });
    const prompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16", format: "short" }, firstTime);
    expect(prompt).toContain("first-time visitor");
    expect(prompt).toContain("first screen");
    expect(prompt).not.toContain("a -time visitor");
    expect(providerPromptLexicalIntegrityReasons("Visible thesis: : a clear offer. a -time visitor.." )).toEqual(expect.arrayContaining(["orphaned-hyphen", "malformed-visible-thesis-colon", "duplicated-punctuation"]));
  });

  it("fails closed when a coherent generic strategy replaces the source proposition", () => {
    const narration = "If your offer is for everyone, your message usually becomes relevant to no one.";
    const grounded = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    expect(grounded.cause).toMatch(/offer is for everyone/iu);
    expect(grounded.consequence).toMatch(/relevant to no one/iu);
    const injected = { ...grounded, cause: "Offer, profile, website, and content repeat one expertise cue", consequence: "separate encounters combine into one credible impression", visualMechanism: "signal-coherence" as const };
    const result = assessVeronicaSourceGroundedSemanticConsistency({ narration, proposition: injected, treatment: treatment({ action: "a visitor follows the same cue across profile, website, offer, and content", props: ["profile", "website", "content"] }), visibleThesis: "Repeated touchpoints create one credible impression." });
    expect(result.status).toBe("FAIL");
    expect(result.reasons).toContain("consequence-lacks-source-anchor");
  });

  it("detects stale action ownership from the final visible action", () => {
    const narration = "A visitor sorts the visible evidence and remembers the recurring association.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const review = reviewVeronicaPreImageTreatment({ contentId: "test", sceneId: "stale-owner", plannerVersion: "test", narration, narrationAnchor: narration, visibleThesis: "A visitor sorts visible evidence and remembers one recurring association.", newInformation: "The visitor-led sorting makes the recognition consequence visible.", proposition, treatment: treatment({ actionOwnerRole: "expert", action: "a visitor sorts the visible evidence and remembers the recurring association" }) });
    expect(review.driftFlags).toContain("NARRATION_RELATIONSHIP_MISMATCH");
  });

  it("keeps provider prose free of internal labels, contradiction, malformed actions, and duplicate multi-state instructions", () => {
    expect(providerPromptInternalLanguageReasons("State condition: weaker condition: mixed signals.")).toContain("internal-remediation-language");
    expect(providerPromptLexicalIntegrityReasons("Current action: the observer inspects proof while independently points.")).toContain("actorless-action-conjunction");
    const interfacePrompt = projectVeronicaProviderPrompt({ aspectRatio: "9:16", format: "short" }, scene({ treatment: treatment({ environment: "website opening-screen review", composition: "visitor beside a mobile page frame", props: ["text-free website opening screen", "mobile page frame"], action: "a visitor scans the opening screen", actionOwnerRole: "buyer" }) }));
    expect(interfacePrompt).toContain("No readable UI copy");
    expect(interfacePrompt).not.toMatch(/No readable text, logos, UI/iu);
    const derivedSequence = deriveVeronicaSemanticProposition({ scene: scene(), narration: "The theme switches first, but a recurring cue later lets recognition accumulate." });
    const sequence = scene({ stateComplexity: "MULTI_STATE_REQUIRED", narrationAnchor: "The theme switches first, but a recurring cue later lets recognition accumulate.", semanticProposition: { ...derivedSequence, stateRelation: "SEQUENTIAL_PROGRESSION", contrast: { relation: "SEQUENTIAL_PROGRESSION", initialState: "the theme switches", failureState: "recognition resets", desiredState: "a recurring cue repeats", consequence: "recognition accumulates" } }, treatment: treatment({ action: "an observer groups the recurring cue after seeing the switching theme", props: ["switching-theme evidence", "recurring cue"] }) });
    const first = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, sequence, { ordinal: 1, total: 2 });
    const second = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, sequence, { ordinal: 2, total: 2 });
    expect(first).toContain("Depict the earlier causal state:");
    expect(second).toContain("Depict the later causal state:");
    expect(first).not.toBe(second);
    expect(first).toContain("Must show: visible evidence of");
    expect(second).toContain("Must show: recurring cue");
    expect(second).not.toContain("Must show: switching-theme evidence");
    expect(first).not.toMatch(/Sequence asset|causal role|State condition|State action|Observer response/iu);
    expect(providerPromptInternalLanguageReasons("Sequence asset 1 of 2. State action: unresolved.")).toContain("internal-projection-language");
  });

  it("fails provider readiness when canonical validation is already failed", () => {
    const readiness = validateVeronicaProviderReadiness({ ...plan([scene()]), validation: { status: "fail", failures: ["canonical-semantic-defect"] } });
    expect(readiness.status).toBe("FAIL");
    expect(readiness.issues.some((issue) => issue.reason.includes("canonical-validation-failed"))).toBe(true);
  });

  it("renders a complete stable proposition once instead of duplicating it", () => {
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration: "Consistent evidence makes the expertise easier to remember." });
    const thesis = renderVeronicaVisibleThesis(proposition);
    expect(thesis).toBe("Consistent evidence makes the expertise easier to remember.");
    expect(thesis).not.toContain(";");
  });

  it("rejects nested transition grammar and duplicate thesis clauses", () => {
    expect(providerPromptLexicalIntegrityReasons("Visible thesis: When If the signal changes, the visitor hesitates.")).toContain("nested-semantic-transition-introducer");
    expect(providerPromptLexicalIntegrityReasons("Visible thesis: One clear cue builds trust; One clear cue builds trust.")).toContain("duplicated-visible-thesis-clause");
  });

  it("preserves closing quotation punctuation inside the selected evidence span", () => {
    const narration = "The first person says, “I help every business.” The second person gives one specific promise.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    expect(proposition.evidenceSpans.every((span) => narration.slice(span.startOffset, span.endOffset) === span.text)).toBe(true);
    expect(proposition.narrationClaim).not.toMatch(/^”/u);
  });

  it("rejects negative narration with a corrected positive treatment and the inverse stale state", () => {
    const negative = deriveVeronicaSemanticProposition({ scene: scene(), narration: "The response appears before the problem, so the customer cannot see why it fits." });
    expect(assessVeronicaTreatmentPropositionCompatibility({ proposition: negative, narration: negative.narrationClaim, treatment: treatment({ action: "the customer aligns the response after the recognized problem and understands the fit", composition: "clear matching evidence" }) }).reasons).toContain("treatment-polarity-mismatch");
    const positive = deriveVeronicaSemanticProposition({ scene: scene(), narration: "The customer now understands how the response follows from the recognized problem." });
    expect(assessVeronicaTreatmentPropositionCompatibility({ proposition: positive, narration: positive.narrationClaim, treatment: treatment({ action: "the customer cannot connect the response to the problem", composition: "conflicting evidence remains unresolved" }) }).reasons).toContain("treatment-polarity-mismatch");
  });

  it("projects conditional alternatives as branches rather than chronology", () => {
    const narration = "If the evidence matches, the buyer continues. If the evidence conflicts, the buyer leaves.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const conditional = scene({ narrationAnchor: narration, semanticProposition: proposition, stateComplexity: "MULTI_STATE_REQUIRED", treatment: treatment({ actionOwnerRole: "buyer", action: "the buyer compares the evidence and chooses one branch" }) });
    const first = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, conditional, { ordinal: 1, total: 2 });
    const second = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, conditional, { ordinal: 2, total: 2 });
    expect(proposition.stateRelation).toBe("CONDITIONAL_ALTERNATIVES");
    expect(`${first} ${second}`).toContain("conditional alternative A");
    expect(`${first} ${second}`).toContain("conditional alternative B");
    expect(`${first} ${second}`).not.toMatch(/earlier|later|unresolved|resolved/iu);
  });

  it("retains temporal grammar for a genuine sequential progression", () => {
    const narration = "The signals scatter first, but later they converge around one recurring cue.";
    const proposition = deriveVeronicaSemanticProposition({ scene: scene(), narration });
    const progression = scene({ narrationAnchor: narration, semanticProposition: proposition, stateComplexity: "MULTI_STATE_REQUIRED" });
    const first = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, progression, { ordinal: 1, total: 2 });
    const second = projectVeronicaProviderPrompt({ aspectRatio: "16:9", format: "long" }, progression, { ordinal: 2, total: 2 });
    expect(proposition.stateRelation).toBe("SEQUENTIAL_PROGRESSION");
    expect(first).toContain("earlier causal state");
    expect(second).toContain("later causal state");
  });

  it("propagates concrete adjacent diversity violations while preserving native motif progression", () => {
    const base = plan([scene({ sceneId: "a" }), scene({ sceneId: "b" })]);
    const diversity = { visualGrammarDuplicateRate: 1, subjectArchetypeDuplicateRate: 1, environmentDuplicateRate: 1, compositionDuplicateRate: 1, cameraDuplicateRate: 1, propDuplicateRate: 1, diagramTopologyDuplicateRate: 0, consecutiveSceneSimilarity: { mean: 1, maximum: 1, violatingPairs: ["a->b"] }, hookVsScene1Similarity: 1, status: "fail" as const, failures: ["consecutive-scene-similarity:a->b"], harmfulRepetitionPairs: ["a->b"] };
    const readiness = validateVeronicaProviderReadiness({ ...base, diversityMetrics: diversity });
    expect(readiness.issues.some((issue) => issue.code === "HARMFUL_REPETITION" && issue.sceneId === "b" && issue.reason.includes("a->b"))).toBe(true);
    const native = calculateVeronicaSemanticQuality(plan([scene({ narrationAnchor: "A doorway opens.", semanticProposition: deriveVeronicaSemanticProposition({ scene: scene(), narration: "A doorway opens into a wider threshold." }) }), scene({ sceneId: "b", narrationAnchor: "The threshold widens.", semanticProposition: deriveVeronicaSemanticProposition({ scene: scene(), narration: "The threshold widens into a foothold." }) })]));
    expect(native.findingCodes).not.toContain("REMEDIATION_TEMPLATE_COLLAPSE");
  });

  it("keeps the canonical expert distinct from followers, observers, and prospective buyers", () => {
    const expert = scene({ sceneId: "expert", narrationAnchor: "The professional builds a new offer while an observer watches.", treatment: treatment({ sceneId: "expert", actionOwnerRole: "expert", action: "the professional arranges the new offer while an observer watches" }) });
    const follower = scene({ sceneId: "follower", narrationAnchor: "A loyal follower is confused by the sudden new offer.", treatment: treatment({ sceneId: "follower", actionOwnerRole: "buyer", action: "the loyal follower looks between disconnected signals and remains confused" }) });
    const both = scene({ sceneId: "both", narrationAnchor: "The professional shows the bridge while an observer traces the carried-over skill.", treatment: treatment({ sceneId: "both", actionOwnerRole: "expert", action: "the professional shows the bridge while an observer traces the evidence" }) });
    const source = {
      ...plan([expert, follower, both]),
      continuity: { mode: "persistent-protagonist" as const, identityId: "canonical-expert", identityFingerprint: "1".repeat(64), appearance: { ageBand: "adult", genderPresentation: "woman", hair: "dark", wardrobeAnchor: "neutral jacket" }, referencePolicy: "reuse-only-for-linked-scenes" as const, linkedSceneIds: ["expert", "both"] },
    } as PositioningVisualPlanV2;
    const rebuilt = rebuildVeronicaFinalTreatmentState({ plan: source, sceneTimings: [
      { id: "expert", timing: { startSeconds: 0, endSeconds: 8 } },
      { id: "follower", timing: { startSeconds: 8, endSeconds: 16 } },
      { id: "both", timing: { startSeconds: 16, endSeconds: 24 } },
    ], narrationByScene: [expert.narrationAnchor, follower.narrationAnchor, both.narrationAnchor] });
    expect(rebuilt.scenes[0]?.treatment.actors).toEqual(expect.arrayContaining([expect.objectContaining({ role: "expert", identityAuthority: "canonical-protagonist", actionOwnership: "primary" }), expect.objectContaining({ role: "observer", identityAuthority: "distinct-scene-actor" })]));
    expect(rebuilt.scenes[1]?.treatment.actors).toEqual([expect.objectContaining({ role: "existing-follower", identityAuthority: "distinct-scene-actor", actionOwnership: "primary" })]);
    expect(rebuilt.assets[0]).toMatchObject({ subjectIdentityId: "canonical-expert", canonicalReferenceAssetId: "canonical-expert-approved-reference", referenceAssetId: "canonical-expert-approved-reference" });
    expect(rebuilt.assets[1]).toMatchObject({ subjectIdentityId: null, canonicalReferenceAssetId: null, referenceAssetId: null, continuityReferenceAssetIds: [] });
    expect(rebuilt.assets[2]).toMatchObject({ subjectIdentityId: "canonical-expert", canonicalReferenceAssetId: "canonical-expert-approved-reference", referenceAssetId: "canonical-expert-approved-reference" });

    const contradictory = { ...rebuilt, scenes: rebuilt.scenes.map((entry, index) => index === 1 ? { ...entry, treatment: { ...entry.treatment, actors: [{ ...entry.treatment.actors![0]!, identityAuthority: "canonical-protagonist" as const }] } } : entry) } as PositioningVisualPlanV2;
    expect(validateVeronicaProviderReadiness(contradictory).issues).toContainEqual(expect.objectContaining({ sceneId: "follower", code: "PROVIDER_PROMPT_SEMANTIC_BLOCKER", reason: "actor-ownership-contract-invalid-or-contradictory" }));
  });

  it("plans deterministic semantic reframes without increasing generated-asset count", () => {
    const longScene = scene({ sceneId: "long-short-scene", durationMs: 16_000, narrationAnchor: "An observer compares old signals with new proof and notices the evidence gap.", treatment: treatment({ sceneId: "long-short-scene", actionOwnerRole: "buyer", action: "an observer compares old signals with new proof", composition: "old evidence at left; new proof at right; the title cue remains peripheral", props: ["old evidence", "new proof", "peripheral title cue"] }) });
    const input = { plan: plan([longScene]), sceneTimings: [{ id: longScene.sceneId, timing: { startSeconds: 0, endSeconds: 16 } }], narrationByScene: [longScene.narrationAnchor] };
    const first = rebuildVeronicaFinalTreatmentState(input);
    const second = rebuildVeronicaFinalTreatmentState(input);
    expect(first.assets).toHaveLength(1);
    expect(first.visualEvents.length).toBeGreaterThan(1);
    expect(first.visualEvents.map((event) => event.kind)).toEqual(expect.arrayContaining(["establishing-crop", "prop-detail"]));
    expect(first.visualEvents.every((event) => event.startMs >= 0 && event.startMs + event.durationMs <= 16_000)).toBe(true);
    expect(first.visualEvents.every((event) => event.safeRegionIds.includes("subtitle") && Boolean(event.semanticFocus))).toBe(true);
    expect(second.visualEvents).toEqual(first.visualEvents);
  });
});
