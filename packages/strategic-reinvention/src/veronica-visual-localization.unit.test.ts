import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import type { PositioningVisualPlanV2 } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { persistVeronicaLocalizedProduction } from "./veronica-localized-production.js";
import { assertVeronicaLocalizedNarrationHasNoNewMaterialProposition } from "./positioning-production-adapter.js";
import {
  buildVeronicaVisualTreatmentsArtifact,
  veronicaVisualBibleV1Schema,
} from "./veronica-visual-artifacts.js";

const hash = (value: unknown) => stableHash(value);

function plan(): PositioningVisualPlanV2 {
  const scenes = [
    {
      sceneId: "bridge",
      progressionStage: "METHOD" as const,
      narrationAnchor: "Existing followers need a bridge from the old identity to the new one.",
      startMs: 0,
      durationMs: 6_000,
      visibleThesis: "OLD IDENTITY → BRIDGE → NEW IDENTITY",
      narrativeFunction: "resolution" as const,
      newInformation: "The bridge makes the evolution legible.",
      visualFamily: "conceptual-editorial" as const,
      overlayKey: "bridge",
      assetId: "bridge-asset",
      eventIds: [],
      treatment: {
        treatmentId: "bridge-treatment",
        sceneId: "bridge",
        progressionStage: "METHOD" as const,
        narrativeBeat: "the audience needs an explicit connection",
        communicationIntent: "explain-process" as const,
        strategy: "symbolic-metaphor" as const,
        subjectRequirement: "the same professional moving from an established identity toward a new one",
        environment: "an elegant physical threshold connecting two coherent professional settings",
        composition: "old identity on the left, a clear connecting threshold, new identity on the right",
        camera: "vertical eye-level editorial frame",
        lighting: "cool-to-warm progression",
        action: "the professional crosses the explicit connection while a follower recognizes the continuity",
        actionOwnerRole: "expert" as const,
        actors: [{ actorId: "veronica", role: "expert" as const, actionOwnership: "primary" as const, identityAuthority: "canonical-protagonist" as const, visibleAction: "crosses the connection" }],
        actionOwnerActorId: "veronica",
        props: ["old professional evidence", "connecting threshold", "new professional evidence"],
        motionOpportunities: [],
        diagram: null,
        grammar: { strategy: "symbolic-metaphor" as const, subjectArchetype: "professional", environment: "threshold", composition: "left-to-right", camera: "eye-level", props: ["threshold"], topology: "none" as const, semanticTokens: ["identity", "bridge"], continuityIdentityId: "veronica-benini" },
        viewerVisibleFingerprint: { strategyFamily: "symbolic-metaphor" as const, subjectArchetype: "professional", environmentArchetype: "threshold", compositionArchetype: "left-to-right", cameraArchetype: "eye-level", lightingArchetype: "cool-to-warm", actionArchetype: "crossing", dominantObjectArchetype: "threshold", motionArchetype: "forward" },
        treatmentHash: hash("bridge-treatment"),
      },
      semanticProposition: {
        schemaVersion: "veronica-semantic-proposition.v3" as const,
        narrationClaim: "The audience needs an explicit connection between the previous identity and the new identity.",
        evidenceSpans: [{ sentenceId: "sentence-001", startOffset: 0, endOffset: 74, text: "Existing followers need a bridge from the old identity to the new one.", spanHash: hash("bridge-span") }] as const,
        polarity: "TRANSITION_NEGATIVE_TO_POSITIVE" as const,
        stateRelation: "SEQUENTIAL_PROGRESSION" as const,
        cause: "the previous and new identities are not yet connected",
        actorRole: "expert" as const,
        actorAction: "explains what changed and what carried over",
        consequence: "followers understand that the new direction is an evolution rather than a random pivot",
        buyerInterpretation: "The new direction is an evolution, not an unrelated pivot.",
        visualMechanism: "identity-bridge" as const,
        evidenceAnchors: ["old identity", "connection", "new identity"],
        buyerConsequenceFamily: "CONNECTS" as const,
        confidence: { proposition: "HIGH" as const, actorOwnership: "HIGH" as const, consequence: "HIGH" as const, visualMechanism: "HIGH" as const },
        propositionHash: hash("bridge-proposition"),
      },
    },
  ];
  return {
    contentId: "L06-S01",
    format: "short",
    aspectRatio: "9:16",
    canonicalSourceHash: hash("master narration"),
    semanticPlanCacheKey: hash("semantic plan"),
    canonicalImagePlanHash: hash("image plan"),
    scenes,
    assets: [{
      assetId: "bridge-asset",
      contentId: "L06-S01",
      sceneId: "bridge",
      semanticPurpose: scenes[0]!.visibleThesis,
      strategy: "symbolic-metaphor",
      prompt: "legacy input is ignored",
      textFree: true,
      textInGeneratedImage: false,
      nativeAspectRatio: "9:16",
      ratioAdaptations: [{ aspectRatio: "9:16", supported: true, cropMode: "native", safeRegions: [{ id: "subtitle", x: 0.12, y: 0.72, width: 0.76, height: 0.16 }], reason: "native" }],
      subjectIdentityId: "veronica-benini",
      canonicalReferenceAssetId: "veronica-benini-v1",
      referenceAssetId: "veronica-benini-v1",
      semanticFingerprint: hash("semantic"),
      generatedAssetCacheKey: hash("image cache"),
    }],
    visualEvents: [],
    visualVocabulary: { materialPalette: ["warm neutral"], environments: ["editorial studio"] },
    visualStoryBible: { fingerprint: hash("story bible"), visualMotifs: ["identity transition"] },
  } as PositioningVisualPlanV2;
}

function wrappers() {
  return scenePlanSchema.parse({
    sourceId: "l06-s01-your-audience-remembers-the-old-you",
    scenes: [{
      id: "scene-001", sequenceNumber: 1,
      canonicalNarration: "Bestehende Follower brauchen eine Brücke von der alten zur neuen Identität.",
      sourceSegmentIds: ["scene-001"], estimatedDurationSeconds: 7,
      timing: { startSeconds: 0, endSeconds: 7 }, visualPurpose: "solution",
      textRequirement: { required: false }, subject: "professional", action: "crosses a connection",
      setting: "threshold", composition: "left-to-right", cameraFraming: "vertical", mood: "clarity",
      continuityReferences: [], onScreenText: "", negativeConstraints: ["no readable text"],
      aspectRatios: ["9:16"], imagePrompt: "deterministic prompt", expectedImageFilenames: ["scene-001-9x16.png"],
      qualityStatus: "semantic-review-required",
    }],
  });
}

function bible(contentId: string) {
  const base = {
    schemaVersion: "veronica-visual-bible.v1" as const, version: 1 as const, contentId,
    characterIdentity: { characterId: "veronica-benini" as const, identityVersion: "v1", authority: "canonical-character-reference-pack" as const, manifestPath: "content-packs/veronica-character-reference-v1/manifest.json", canonicalSource: { path: "source.webp", sha256: hash("source") }, approvedReferences: [{ id: "front", path: "front.png", sha256: hash("front") }], requiredSceneIds: ["bridge"] },
    wardrobe: "episode directed", palette: ["warm neutral"], lighting: "editorial", editorialStyle: "European editorial realism", environmentDefaults: ["studio"], recurringMotifs: ["transition"],
    output: { aspectRatio: "9:16" as const, subtitleSafeArea: { x: 0.12, y: 0.72, width: 0.76, height: 0.16 }, readableGeneratedTextAllowed: false as const, logosAllowed: false as const, watermarksAllowed: false as const },
    continuityPolicy: { canonicalIdentityAlwaysWins: true as const, episodeAnchorMayReplaceIdentity: false as const, maxIdentityReferencesPerGeneration: 2, referencePriority: ["canonical-identity", "episode-anchor", "scene-reference"] as const },
    visualStoryBibleFingerprint: hash("story bible"),
  };
  return veronicaVisualBibleV1Schema.parse({ ...base, artifactHash: hash(base) });
}

describe("Veronica typed visual and localization artifacts", () => {
  it("does not allow a localized narration with added material propositions to inherit canonical imagery", () => {
    expect(() => assertVeronicaLocalizedNarrationHasNoNewMaterialProposition({
      locale: "de",
      masterNarration: "A focused book carries useful expertise. It can be shared.",
      localizedNarration: "Ein fokussiertes Buch transportiert nützliche Expertise. Es kann geteilt werden. Definiere vorher Leser und Problem. Der Verlag kommt später.",
    })).toThrow("VERONICA_LOCALIZED_SEMANTIC_DIVERGENCE_REQUIRES_EXPLICIT_LOCALE_OVERRIDE");
  });

  it("preserves the bridge as a typed semantic metaphor", () => {
    const artifact = buildVeronicaVisualTreatmentsArtifact(plan());
    expect(artifact.treatments[0]).toMatchObject({
      semanticPurpose: "solution",
      visualStrategy: "metaphor",
      visualThesis: "OLD IDENTITY → BRIDGE → NEW IDENTITY",
      viewerShouldUnderstand: "The new direction is an evolution, not an unrelated pivot.",
      emotionalState: "movement from uncertainty toward clarity",
    });
  });

  it("retimes a locale while preserving the canonical image cache identity", async () => {
    const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-localized-"));
    const sourcePlan = plan();
    const treatments = buildVeronicaVisualTreatmentsArtifact(sourcePlan);
    const first = await persistVeronicaLocalizedProduction({
      episodeDir, episodeId: "l06-s01-your-audience-remembers-the-old-you", locale: "de", variant: "short",
      narration: wrappers().scenes[0]!.canonicalNarration, selectedAudioHash: hash("de-audio-v1"), timingHash: hash("de-timing-v1"),
      plan: sourcePlan, scenePlan: wrappers(), visualEvents: [], treatments, bible: bible(sourcePlan.contentId), now: "2026-08-11T00:00:00.000Z",
    });
    const retimed = await persistVeronicaLocalizedProduction({
      episodeDir, episodeId: "l06-s01-your-audience-remembers-the-old-you", locale: "de", variant: "short",
      narration: wrappers().scenes[0]!.canonicalNarration, selectedAudioHash: hash("de-audio-v2"), timingHash: hash("de-timing-v2"),
      plan: sourcePlan, scenePlan: wrappers(), visualEvents: [], treatments, bible: bible(sourcePlan.contentId), now: "2026-08-11T00:00:00.000Z",
    });
    expect(first.artifact.localized.selectedAudioHash).not.toBe(retimed.artifact.localized.selectedAudioHash);
    expect(first.artifact.visualReuse.scenes[0]?.imageCacheKey).toBe(retimed.artifact.visualReuse.scenes[0]?.imageCacheKey);
    expect(retimed.artifact.visualReuse).toMatchObject({ plannedImageCalls: 0, reusedImageCount: 1, localeAloneInvalidatesImages: false });
    const captions = JSON.parse(await fs.readFile(retimed.captionPlanPath, "utf8")) as { segments: { startMs: number; endMs: number }[] };
    expect(captions.segments[0]).toMatchObject({ startMs: 0, endMs: 7_000 });
  });
});
