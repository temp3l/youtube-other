import { describe, expect, it, vi } from "vitest";
import type {
  PlannedScene,
  PositioningVisualPlanV2,
  PositioningVisualTreatment,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { rebuildVeronicaFinalTreatmentState } from "./veronica-pre-image-semantic-gate.js";
import {
  InMemoryVeronicaImagePromptCompilationCache,
  DeterministicVeronicaImagePromptCompiler,
  adjudicateVeronicaImagePromptCompilation,
  buildVeronicaImagePromptCompilationInput,
  compileVeronicaImagePrompts,
  validateVeronicaImagePromptCompilation,
  veronicaImagePromptCompilationInputHash,
  type VeronicaImagePromptCompilationInput,
  type VeronicaImagePromptCompilerModel,
  type VeronicaImagePromptCompilerPort,
} from "./veronica-image-prompt-compiler.js";

function treatment(sceneId: string, overrides: Partial<PositioningVisualTreatment> = {}): PositioningVisualTreatment {
  const base: PositioningVisualTreatment = {
    treatmentId: `${sceneId}-treatment`, sceneId, progressionStage: "PROOF",
    narrativeBeat: "buyer cannot distinguish the broad offer", communicationIntent: "show-consequence",
    strategy: "client-decision", subjectRequirement: "an experienced professional and a buyer",
    environment: "stale career-transition workshop", composition: "the buyer compares evidence",
    camera: "documentary medium frame", lighting: "natural daylight",
    action: "the buyer cannot identify a reason to choose the experienced professional",
    actionOwnerRole: "buyer", props: ["several undifferentiated proof objects", "withheld selection gesture"],
    motionOpportunities: ["establishing-crop", "subject-detail"], diagram: null,
    grammar: { strategy: "client-decision", subjectArchetype: "buyer", environment: "neutral comparison", composition: "comparison", camera: "medium", props: ["proof objects"], topology: "none", semanticTokens: ["buyer", "choice"], continuityIdentityId: null },
    viewerVisibleFingerprint: { strategyFamily: "client-decision", subjectArchetype: "buyer", environmentArchetype: "neutral comparison", compositionArchetype: "comparison", cameraArchetype: "medium", lightingArchetype: "daylight", actionArchetype: "withholds choice", dominantObjectArchetype: "proof", motionArchetype: "detail" },
    treatmentHash: "a".repeat(64),
  };
  return { ...base, ...overrides };
}

function scene(sceneId: string, narrationAnchor: string): PlannedScene {
  return {
    sceneId, progressionStage: "PROOF", narrationAnchor, startMs: 0, durationMs: 5_000,
    treatment: treatment(sceneId), assetId: `${sceneId}-base`, eventIds: [], overlayKey: sceneId,
    visibleThesis: "Broad undifferentiated positioning prevents the buyer from identifying a reason to choose an experienced subject.",
    newInformation: "The buyer consequence remains negative despite the subject's experience.",
    narrativeFunction: "demonstrate", visualFamily: "human-decision",
  } as PlannedScene;
}

function canonicalPlan(): PositioningVisualPlanV2 {
  const scenes = [
    scene("generic-a", "An experienced professional can still position herself so broadly that a buyer cannot identify a reason to choose her."),
    scene("generic-b", "The buyer compares commercial proof but cannot inspect a clear differentiating reason."),
  ];
  const input = {
    contentId: "generic-episode", plannerVersion: "test-planner", format: "short", aspectRatio: "9:16",
    scenes, assets: [], planHash: "f".repeat(64), semanticPlanCacheKey: "e".repeat(64),
  } as PositioningVisualPlanV2;
  return rebuildVeronicaFinalTreatmentState({
    plan: input,
    sceneTimings: [
      { id: "generic-a", timing: { startSeconds: 0, endSeconds: 5 } },
      { id: "generic-b", timing: { startSeconds: 5, endSeconds: 10 } },
    ],
    narrationByScene: scenes.map((value) => value.narrationAnchor),
  });
}

const model: VeronicaImagePromptCompilerModel = {
  model: "fixture-compiler",
  reasoningEffort: "low",
  maxOutputTokens: 2_000,
};

function fixtureResult(item: VeronicaImagePromptCompilationInput, inputHash: string) {
  return {
    schemaVersion: "veronica-image-prompt-compilation.v1" as const,
    sceneId: item.sceneId,
    assetId: item.assetId,
    compilationInputHash: inputHash,
    imagePrompt: `Create a ${item.format.aspectRatio} documentary still in an occupation-neutral commercial comparison setting. The ${item.proposition.actionOwnerRole} visibly performs this action: ${item.proposition.action}. The physical staging makes this consequence unmistakable: ${item.proposition.consequence}. Use one dominant subject hierarchy, compatible evidence objects, natural daylight, and a close mobile-readable composition. No readable text, logos, interface copy, watermark, or panel grid.`,
    depictedState: {
      actorRole: item.proposition.actorRole,
      actionOwnerRole: item.proposition.actionOwnerRole,
      action: item.proposition.action,
      consequence: item.proposition.consequence,
      polarity: item.proposition.polarity,
      stateRelation: item.proposition.stateRelation,
    },
    evidenceIncluded: [...item.treatment.requiredEvidence],
    evidenceIntentionallyOmitted: [...item.treatment.forbiddenEvidence],
    compositionSummary: `One dominant ${item.proposition.actionOwnerRole} action in ${item.format.aspectRatio}.`,
  };
}

function compiler() {
  const compileBatch = vi.fn<VeronicaImagePromptCompilerPort["compileBatch"]>(async (input) => ({
    output: {
      results: input.items.map((item, index) => fixtureResult(item, input.inputHashes[index]!)),
    },
    requestId: "fixture-request",
    usage: { inputTokens: 1_000, outputTokens: 500, cachedInputTokens: 100 },
    latencyMs: 25,
    estimatedCostUsd: 0.01,
  }));
  return { port: { compileBatch }, compileBatch };
}

describe("Veronica structured image prompt compilation", () => {
  it("generates complete scene prompts atomically in one batch and reuses unchanged hashes", async () => {
    const plan = canonicalPlan();
    const cache = new InMemoryVeronicaImagePromptCompilationCache();
    const fake = compiler();
    const first = await compileVeronicaImagePrompts({ episodeId: "generic", plan, compiler: fake.port, cache, model, reasonForRegeneration: "initial" });
    expect(fake.compileBatch).toHaveBeenCalledTimes(1);
    expect(fake.compileBatch.mock.calls[0]![0].items).toHaveLength(2);
    expect(first.assets.every((asset) => asset.prompt === asset.promptCompilation?.result.imagePrompt)).toBe(true);
    expect(first.assets.every((asset) => !asset.prompt.includes("stale career-transition workshop"))).toBe(true);
    expect(first.imagePromptCompilation).toMatchObject({ requestCount: 1, cacheHits: 0, cacheMisses: 2, inputTokens: 1_000, outputTokens: 500, cachedInputTokens: 100, estimatedCostUsd: 0.01 });

    const second = await compileVeronicaImagePrompts({ episodeId: "generic", plan, compiler: fake.port, cache, model, reasonForRegeneration: "unchanged" });
    expect(fake.compileBatch).toHaveBeenCalledTimes(1);
    expect(second.imagePromptCompilation).toMatchObject({ requestCount: 0, cacheHits: 2, cacheMisses: 0 });
  });

  it("hashes semantic, format, reference, continuity, constraint, version, and model dependencies", () => {
    const plan = canonicalPlan();
    const scene = plan.scenes[0]!;
    const asset = plan.assets[0]!;
    const base = buildVeronicaImagePromptCompilationInput({ plan, scene, asset });
    const baseHash = veronicaImagePromptCompilationInputHash({ compilationInput: base, model });
    const changedReference = { ...base, referenceAssets: [{ assetId: "approved-ref", kind: "character-reference" as const, identityId: "recurring", fingerprint: "different", required: true }] };
    const changedPolarity = { ...base, proposition: { ...base.proposition, polarity: "POSITIVE_STATE" as const } };
    expect(veronicaImagePromptCompilationInputHash({ compilationInput: changedReference, model })).not.toBe(baseHash);
    expect(veronicaImagePromptCompilationInputHash({ compilationInput: changedPolarity, model })).not.toBe(baseHash);
    expect(veronicaImagePromptCompilationInputHash({ compilationInput: base, model: { ...model, model: "other-model" } })).not.toBe(baseHash);
    expect(base).not.toHaveProperty("imagePrompt");
  });

  it("fails closed on actor, action-owner, polarity, state, evidence, schema, and snapshot contradictions", () => {
    const plan = canonicalPlan();
    const scene = plan.scenes[0]!;
    const asset = plan.assets[0]!;
    const compilationInput = buildVeronicaImagePromptCompilationInput({ plan, scene, asset });
    const inputHash = veronicaImagePromptCompilationInputHash({ compilationInput, model });
    const result = fixtureResult(compilationInput, inputHash);
    expect(validateVeronicaImagePromptCompilation({ compilationInput, inputHash, result })).toEqual([]);
    const opposite = {
      ...result,
      depictedState: {
        ...result.depictedState,
        actorRole: "expert" as const,
        actionOwnerRole: "expert" as const,
        polarity: "POSITIVE_STATE" as const,
        stateRelation: "CONTRAST" as const,
      },
      evidenceIncluded: [],
    };
    const reasons = validateVeronicaImagePromptCompilation({ compilationInput, inputHash, result: opposite });
    expect(reasons).toEqual(expect.arrayContaining([
      "depicted-actor-contradicts-canonical-actor",
      "depicted-action-owner-contradicts-canonical-owner",
      "depicted-polarity-contradicts-canonical-polarity",
      "depicted-state-relation-contradicts-canonical-state",
    ]));
    expect(reasons.some((reason) => reason.startsWith("required-evidence-not-confirmed:"))).toBe(true);
  });

  it("uses format-specific canonical inputs and never admits a legacy provider prompt", () => {
    const plan = canonicalPlan();
    const input = buildVeronicaImagePromptCompilationInput({ plan, scene: plan.scenes[0]!, asset: plan.assets[0]! });
    expect(input.format).toEqual({
      aspectRatio: "9:16",
      contentType: "short",
      subtitleSafeArea: { x: 0.12, y: 0.72, width: 0.76, height: 0.16 },
    });
    expect(input.constraints).toMatchObject({ noReadableText: true, noLogos: true, noReadableUi: true, noInternalLabels: true });
    expect(JSON.stringify(input)).not.toContain(plan.assets[0]!.prompt);
    expect(stableHash(input.provenance)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("materializes the final prompt deterministically without a provider call", async () => {
    const plan = canonicalPlan();
    const cache = new InMemoryVeronicaImagePromptCompilationCache();
    const deterministic = new DeterministicVeronicaImagePromptCompiler();
    const first = await compileVeronicaImagePrompts({
      episodeId: "generic",
      plan,
      compiler: deterministic,
      cache,
      model: { model: "deterministic-template", reasoningEffort: "none" },
      reasonForRegeneration: "initial",
    });
    const second = await compileVeronicaImagePrompts({
      episodeId: "generic",
      plan,
      compiler: deterministic,
      cache,
      model: { model: "deterministic-template", reasoningEffort: "none" },
      reasonForRegeneration: "unchanged",
    });
    expect(first.imagePromptGenerationStrategy).toBe("deterministic-v1");
    expect(first.imagePromptCompilation).toMatchObject({
      requestCount: 1,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
    expect(second.imagePromptCompilation).toMatchObject({ requestCount: 0, cacheHits: 2 });
    expect(second.assets.map((asset) => asset.prompt)).toEqual(first.assets.map((asset) => asset.prompt));
    expect(first.assets[0]?.prompt).toContain("subtitle region");
    expect(first.assets[0]?.prompt).toContain("No readable text");
  });

  it("adjudicates materialized prompt meaning, hierarchy, state, and actor ownership", () => {
    const plan = canonicalPlan();
    const base = buildVeronicaImagePromptCompilationInput({ plan, scene: plan.scenes[0]!, asset: plan.assets[0]! });
    const inputHash = veronicaImagePromptCompilationInputHash({ compilationInput: base, model });
    const result = fixtureResult(base, inputHash);
    const contract = {
      ...base,
      treatment: {
        ...base.treatment,
        composition: "work evidence leads the frame; blank title badge remains peripheral",
        compositionHierarchy: { primary: ["work evidence leads the frame"], secondary: [], peripheral: ["blank title badge remains peripheral"] },
      },
    } satisfies VeronicaImagePromptCompilationInput;
    const hierarchyInversion = adjudicateVeronicaImagePromptCompilation({ compilationInput: contract, result: { ...result, imagePrompt: `${result.imagePrompt} The blank title badge is the central dominant symbol.` } });
    expect(hierarchyInversion.blockers).toContainEqual(expect.objectContaining({ code: "COMPOSITION_HIERARCHY_INVERSION", canonicalField: "treatment.compositionHierarchy.peripheral" }));

    const missingBridge = { ...contract, proposition: { ...contract.proposition, action: "Without that bridge the evolution looks random", cause: "The bridge is absent", consequence: "the change looks random" }, treatment: { ...contract.treatment, essentialRelationships: ["the bridge remains absent and the old and new states stay separated"] } } satisfies VeronicaImagePromptCompilationInput;
    expect(adjudicateVeronicaImagePromptCompilation({ compilationInput: missingBridge, result: { ...result, imagePrompt: `${result.imagePrompt} A completed identity bridge is successfully established between old and new.` } }).blockers).toContainEqual(expect.objectContaining({ code: "ESSENTIAL_RELATIONSHIP_INVERSION" }));

    const observer = { ...contract, treatment: { ...contract.treatment, actors: [{ actorId: "follower", role: "existing-follower" as const, actionOwnership: "primary" as const, identityAuthority: "distinct-scene-actor" as const, visibleAction: "looks confused" }], actionOwnerActorId: "follower" } } satisfies VeronicaImagePromptCompilationInput;
    expect(adjudicateVeronicaImagePromptCompilation({ compilationInput: observer, result: { ...result, imagePrompt: `${result.imagePrompt} Show the protagonist as a loyal follower.` } }).blockers).toContainEqual(expect.objectContaining({ code: "ACTOR_OWNERSHIP_INVERSION" }));

    const confused = { ...observer, proposition: { ...observer.proposition, action: "the loyal follower is confused", cause: "old signals conflict", consequence: "the follower cannot connect the new offer", polarity: "NEGATIVE_STATE" as const } } satisfies VeronicaImagePromptCompilationInput;
    expect(adjudicateVeronicaImagePromptCompilation({ compilationInput: confused, result: { ...result, imagePrompt: "Create a cinematic 9:16 still where the loyal follower reaches clear recognition and confident understanding of the successfully connected offer. No readable text or logos." } }).blockers).toContainEqual(expect.objectContaining({ code: "REQUIRED_STATE_INVERSION" }));

    const paraphrased = { ...result, imagePrompt: "Create a cinematic vertical 9:16 editorial still: a potential client compares several indistinct proof objects and withholds selection because no differentiating reason is visible. Use soft window light, restrained color, shallow depth, and tactile materials. No readable text, logos, interface copy, watermark, or panel grid." };
    expect(adjudicateVeronicaImagePromptCompilation({ compilationInput: base, result: paraphrased }).status).toBe("PASS");
    expect(adjudicateVeronicaImagePromptCompilation({ compilationInput: base, result: { ...result, imagePrompt: `${result.imagePrompt} Add harmless fine film grain and a restrained warm palette.` } }).status).toBe("PASS");
  });
});
