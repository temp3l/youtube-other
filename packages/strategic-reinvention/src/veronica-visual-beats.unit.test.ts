import { describe, expect, it } from "vitest";
import type { PositioningVisualPlanV2 } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import {
  DeterministicVeronicaImagePromptCompiler,
  buildVeronicaImagePromptCompilationInput,
  veronicaImagePromptCompilationInputHash,
} from "./veronica-image-prompt-compiler.js";
import type { VeronicaVisualBibleV1 } from "./veronica-visual-artifacts.js";
import {
  calculateVeronicaVisualDensityMetrics,
  deriveVeronicaVisualBeatPlan,
  materializeVeronicaVisualBeatPlan,
  type VeronicaVisualBeatOverrideArtifact,
} from "./veronica-visual-beats.js";

const hash = (value: unknown): string => stableHash(value);

function sourcePlan(durationMs = 10_000): PositioningVisualPlanV2 {
  const treatmentHash = hash("parent treatment");
  const propositionHash = hash("parent proposition");
  const scene = {
    sceneId: "hook",
    progressionStage: "HOOK" as const,
    narrationAnchor: "A focused book carries useful expertise directly to a reader without publisher prestige.",
    startMs: 0,
    durationMs,
    treatment: {
      treatmentId: "hook-treatment",
      sceneId: "hook",
      progressionStage: "HOOK" as const,
      narrativeBeat: "authority without publisher prestige",
      communicationIntent: "establish-authority" as const,
      strategy: "social-interaction" as const,
      subjectRequirement: "an expert offering a focused book to a reader",
      environment: "small author-reader table",
      composition: "the handoff leads the vertical frame",
      camera: "vertical documentary close frame",
      lighting: "natural editorial daylight",
      action: "the expert hands the focused book to the reader",
      actionOwnerRole: "expert" as const,
      actors: [{ actorId: "expert", role: "expert" as const, actionOwnership: "primary" as const, identityAuthority: "distinct-scene-actor" as const, visibleAction: "hands the focused book to the reader" }],
      actionOwnerActorId: "expert",
      props: ["focused book", "reader hands"],
      motionOpportunities: ["establishing-crop" as const],
      diagram: null,
      grammar: { strategy: "social-interaction" as const, subjectArchetype: "expert and reader", environment: "shared table", composition: "handoff", camera: "close", props: ["book"], topology: "none" as const, semanticTokens: ["book", "reader"], continuityIdentityId: null },
      viewerVisibleFingerprint: { strategyFamily: "social-interaction" as const, subjectArchetype: "expert and reader", environmentArchetype: "shared table", compositionArchetype: "handoff", cameraArchetype: "close", lightingArchetype: "daylight", actionArchetype: "handoff", dominantObjectArchetype: "book", motionArchetype: "establish" },
      treatmentHash,
    },
    assetId: "hook-base",
    eventIds: [],
    overlayKey: "hook",
    visibleThesis: "A useful focused book transfers authority directly from expert to reader without publisher prestige.",
    newInformation: "The direct authority object does not depend on a publisher.",
    narrativeFunction: "introduce" as const,
    visualFamily: "human-decision" as const,
    semanticProposition: {
      schemaVersion: "veronica-semantic-proposition.v3" as const,
      narrationClaim: "A focused book carries useful expertise directly to a reader without publisher prestige.",
      evidenceSpans: [{ sentenceId: "sentence-001", startOffset: 0, endOffset: 90, text: "A focused book carries useful expertise directly to a reader without publisher prestige.", spanHash: hash("span") }] as const,
      polarity: "NEUTRAL" as const,
      stateRelation: "STABLE" as const,
      cause: "a focused book carries useful expertise directly to a reader",
      actorRole: "expert" as const,
      actorAction: "hands a focused book directly to a reader",
      buyerInterpretation: "Useful knowledge creates the authority signal.",
      consequence: "the reader recognizes useful expertise without publisher prestige",
      visualMechanism: "peer-referral" as const,
      evidenceAnchors: ["focused book", "reader", "no publisher prestige"],
      buyerConsequenceFamily: "RECOGNIZES" as const,
      confidence: { proposition: "HIGH" as const, actorOwnership: "HIGH" as const, consequence: "HIGH" as const, visualMechanism: "HIGH" as const },
      propositionHash,
    },
    materializationRevision: { revisionId: hash("revision"), treatmentHash, propositionHash, projectionPolicyVersion: "test" },
  };
  return {
    contentId: "L05-S01",
    format: "short",
    aspectRatio: "9:16",
    canonicalSourceHash: hash("narration"),
    semanticPlanCacheKey: hash("semantic plan"),
    canonicalImagePlanHash: hash("base image plan"),
    scenes: [scene],
    assets: [{
      assetId: "hook-base", contentId: "L05-S01", sceneId: "hook",
      semanticPurpose: scene.visibleThesis, strategy: "social-interaction", prompt: "legacy prompt",
      textFree: true, textInGeneratedImage: false, nativeAspectRatio: "9:16",
      ratioAdaptations: [{ aspectRatio: "9:16", supported: true, cropMode: "native", safeRegions: [{ id: "subtitle", x: 0.12, y: 0.72, width: 0.76, height: 0.16 }], reason: "native" }],
      subjectIdentityId: null, referenceAssetId: null,
      semanticFingerprint: hash("semantic"), generatedAssetCacheKey: hash("cache"),
    }],
    visualEvents: [],
    continuity: { mode: "ensemble-independent", variationDimensions: ["age", "gender-presentation", "profession", "environment", "framing"], scenesShareIdentity: false },
  } as PositioningVisualPlanV2;
}

function overrides(input: {
  readonly secondAction?: string;
  readonly secondWeight?: number;
  readonly secondDecision?: "new-image" | "reuse-with-crop";
} = {}): VeronicaVisualBeatOverrideArtifact {
  const first = {
    beatId: "hook-B01", role: "establish" as const,
    coreMeaning: "A focused book carries useful expertise directly to a reader.",
    newInformation: "The authority object reaches the reader without publisher prestige.",
    viewerShouldUnderstand: "The expert can transfer authority without publisher prestige.",
    visualThesis: "The expert hands a useful focused book directly to the reader.",
    subject: "an expert offering a focused book to a reader",
    action: "the expert places the focused book into the reader's hands",
    state: "NEUTRAL; direct transfer", environment: "small author-reader table",
    composition: { description: "the handoff leads the vertical frame", camera: "vertical documentary close frame", lighting: "natural editorial daylight", subtitleSafeAreaRequired: true as const },
    continuationOfPreviousBeat: false, assetDecision: "new-image" as const,
    reuseSourceBeatId: null, timingWeight: 0.4, boundaryKind: "narration-aligned" as const,
  };
  const secondDecision = input.secondDecision ?? "new-image";
  return {
    schemaVersion: "veronica-visual-beat-overrides.v1",
    episodeId: "fixture",
    baseCanonicalImagePlanHash: sourcePlan().canonicalImagePlanHash,
    scenes: [{ sceneId: "hook", beats: [first, {
      beatId: "hook-B02", role: "payoff",
      coreMeaning: "The reader recognizes useful expertise inside the focused book.",
      newInformation: "The reader opens the book and discovers a usable framework.",
      viewerShouldUnderstand: "Useful knowledge, not publisher prestige, creates the authority signal.",
      visualThesis: "The reader uses a clear framework from the book and recognizes the expert's usefulness.",
      subject: "the reader using a framework from the focused book",
      action: input.secondAction ?? "the reader opens the focused book and applies one useful framework",
      state: "POSITIVE_STATE; useful authority recognized", environment: "quiet reading ledge with one practical object",
      composition: { description: "the open framework and practical object dominate", camera: "vertical over-shoulder detail", lighting: "clean daylight on paper", subtitleSafeAreaRequired: true },
      continuationOfPreviousBeat: true, assetDecision: secondDecision,
      reuseSourceBeatId: secondDecision === "new-image" ? null : "hook-B01",
      timingWeight: input.secondWeight ?? 0.6, boundaryKind: "editorially-allocated",
    }] }],
  };
}

function bible(): VeronicaVisualBibleV1 {
  return {
    schemaVersion: "veronica-visual-bible.v1", version: 1, contentId: "L05-S01",
    characterIdentity: { characterId: "veronica-benini", identityVersion: "v1", authority: "canonical-character-reference-pack", manifestPath: "manifest.json", canonicalSource: { path: "source.png", sha256: hash("source") }, approvedReferences: [{ id: "front", path: "front.png", sha256: hash("front") }], requiredSceneIds: [] },
    wardrobe: "editorial", palette: ["warm paper"], lighting: "natural", editorialStyle: "European editorial realism", environmentDefaults: ["table"], recurringMotifs: [],
    output: { aspectRatio: "9:16", subtitleSafeArea: { x: 0.12, y: 0.72, width: 0.76, height: 0.16 }, readableGeneratedTextAllowed: false, logosAllowed: false, watermarksAllowed: false },
    continuityPolicy: { canonicalIdentityAlwaysWins: true, episodeAnchorMayReplaceIdentity: false, maxIdentityReferencesPerGeneration: 2, referencePriority: ["canonical-identity", "episode-anchor", "scene-reference"] },
    visualStoryBibleFingerprint: hash("bible"), artifactHash: hash("bible artifact"),
  };
}

describe("Veronica visual beat planning", () => {
  it("adds useful opening beats without changing semantic scene count or forcing an image count", () => {
    const parent = sourcePlan();
    const beatPlan = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: overrides() });
    const materialized = materializeVeronicaVisualBeatPlan({ plan: parent, beatPlan });
    expect(materialized.scenes).toHaveLength(1);
    expect(beatPlan.beats).toHaveLength(2);
    expect(materialized.assets).toHaveLength(2);
    expect(materialized.visualEvents).toHaveLength(2);
    expect(beatPlan.quality).toMatchObject({
      status: "WARN",
      beatsInFirst5Seconds: 2,
      beatsInFirst10Seconds: 2,
      findings: [expect.objectContaining({ code: "OPENING_STATIC_HOLD" })],
    });
  });

  it("rejects a secondary beat that only repeats actor, action, and environment", () => {
    const parent = sourcePlan();
    const artifact = overrides({ secondAction: "the expert places the focused book into the reader's hands" });
    const repeated = {
      ...artifact,
      scenes: [{ ...artifact.scenes[0]!, beats: [artifact.scenes[0]!.beats[0]!, {
        ...artifact.scenes[0]!.beats[1]!,
        newInformation: artifact.scenes[0]!.beats[0]!.newInformation,
        subject: artifact.scenes[0]!.beats[0]!.subject,
        state: artifact.scenes[0]!.beats[0]!.state,
        environment: artifact.scenes[0]!.beats[0]!.environment,
      }] }],
    };
    const beatPlan = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: repeated });
    expect(beatPlan.quality.status).toBe("FAIL");
    expect(beatPlan.quality.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REDUNDANT_SIBLING_BEAT" }),
      expect.objectContaining({ code: "REDUNDANT_PAID_IMAGE_CANDIDATE" }),
    ]));
    expect(() => materializeVeronicaVisualBeatPlan({ plan: parent, beatPlan })).toThrow("VERONICA_VISUAL_BEAT_QUALITY_FAILED");
  });

  it("keeps beat image identity stable across timing/localization changes and invalidates only a changed beat", () => {
    const parent = sourcePlan();
    const baselineBeats = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: overrides() });
    const baseline = materializeVeronicaVisualBeatPlan({ plan: parent, beatPlan: baselineBeats });
    const retimed = materializeVeronicaVisualBeatPlan({ plan: sourcePlan(7_000), beatPlan: baselineBeats });
    expect(retimed.assets.map((asset) => asset.generatedAssetCacheKey)).toEqual(baseline.assets.map((asset) => asset.generatedAssetCacheKey));
    expect(retimed.visualEvents.map((event) => event.durationMs)).not.toEqual(baseline.visualEvents.map((event) => event.durationMs));

    const changedBeats = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: overrides({ secondAction: "the reader opens the focused book and matches its framework to a real decision" }) });
    const changed = materializeVeronicaVisualBeatPlan({ plan: parent, beatPlan: changedBeats });
    expect(changed.assets[0]?.generatedAssetCacheKey).toBe(baseline.assets[0]?.generatedAssetCacheKey);
    expect(changed.assets[1]?.generatedAssetCacheKey).not.toBe(baseline.assets[1]?.generatedAssetCacheKey);
  });

  it("uses crop/motion reuse without creating another paid image asset", () => {
    const parent = sourcePlan();
    const beatPlan = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: overrides({ secondDecision: "reuse-with-crop" }) });
    const materialized = materializeVeronicaVisualBeatPlan({ plan: parent, beatPlan });
    expect(beatPlan.beats).toHaveLength(2);
    expect(materialized.assets).toHaveLength(1);
    expect(materialized.visualEvents.map((event) => event.assetId)).toEqual([materialized.assets[0]!.assetId, materialized.assets[0]!.assetId]);
    expect(materialized.visualEvents[1]).toMatchObject({ kind: "alternate-crop", visualBeatId: "hook-B02" });
    expect(beatPlan.quality.density).toMatchObject({
      visualEventCount: 2,
      uniqueCanonicalAssetCount: 1,
      sameAssetEventCount: 1,
      higherImageDensityThanOnePerScene: false,
    });
  });

  it("does not misreport six assets with twelve events as increased canonical image density", () => {
    const parent = sourcePlan();
    const pair = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: overrides({ secondDecision: "reuse-with-crop" }) }).beats;
    const beats = Array.from({ length: 6 }, (_, sceneIndex) => pair.map((beat, beatIndex) => ({
      ...beat,
      sceneId: `scene-${sceneIndex + 1}`,
      beatId: `scene-${sceneIndex + 1}-B0${beatIndex + 1}`,
      reuseSourceBeatId: beatIndex === 0 ? null : `scene-${sceneIndex + 1}-B01`,
    }))).flat();
    const events = Array.from({ length: 6 }, (_, sceneIndex) => [0, 5_000].map((offset, beatIndex) => ({
      visualBeatId: `scene-${sceneIndex + 1}-B0${beatIndex + 1}`,
      assetId: `scene-${sceneIndex + 1}-base`,
      startMs: sceneIndex * 10_000 + offset,
      durationMs: 5_000,
    }))).flat();
    const metrics = calculateVeronicaVisualDensityMetrics({ semanticSceneCount: 6, beats, events });
    expect(metrics).toMatchObject({
      semanticSceneCount: 6,
      visualBeatCount: 12,
      visualEventCount: 12,
      uniqueCanonicalAssetCount: 6,
      sameAssetEventCount: 6,
      firstNewAssetChangeMs: 10_000,
      higherImageDensityThanOnePerScene: false,
    });
  });

  it("compiles stable beat-scoped prompts while excluding concrete timing from image identity", async () => {
    const parent = sourcePlan();
    const beatPlan = deriveVeronicaVisualBeatPlan({ plan: parent, overrides: overrides() });
    const materialized = materializeVeronicaVisualBeatPlan({ plan: parent, beatPlan });
    const scene = materialized.scenes[0]!;
    const asset = materialized.assets[1]!;
    const input = buildVeronicaImagePromptCompilationInput({ plan: materialized, visualBible: bible(), scene, asset });
    const model = { model: "deterministic-template", reasoningEffort: "none" as const };
    const inputHash = veronicaImagePromptCompilationInputHash({ compilationInput: input, model });
    const result = await new DeterministicVeronicaImagePromptCompiler().compileBatch({ episodeId: "fixture", items: [input], inputHashes: [inputHash], model, instructions: "", instructionVersion: "test", jsonSchema: {} });
    expect(input.visualBeat).toMatchObject({ beatId: "hook-B02", beatHash: beatPlan.beats[1]!.beatHash });
    expect(input.visualBeat).toMatchObject({ newInformation: "The reader opens the book and discovers a usable framework.", assetDecision: "new-image" });
    expect(JSON.stringify(result.output)).toContain("the reader opens the focused book and applies one useful framework");

    const retimed = materializeVeronicaVisualBeatPlan({ plan: sourcePlan(7_000), beatPlan });
    const retimedInput = buildVeronicaImagePromptCompilationInput({ plan: retimed, visualBible: bible(), scene: retimed.scenes[0]!, asset: retimed.assets[1]! });
    expect(veronicaImagePromptCompilationInputHash({ compilationInput: retimedInput, model })).toBe(inputHash);
  });
});
