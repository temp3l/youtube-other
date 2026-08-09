import { planIndependentFormatCompositions } from "@mediaforge/rendering/composition-contract.js";
import { planLocaleEdition } from "@mediaforge/story-localization/locale-edition";
import { describe, expect, it } from "vitest";
import {
  planVeronicaRenderDerivative,
  redactVeronicaRenderDerivativeFailure,
} from "./render-derivative.js";
import {
  VERONICA_DEFAULT_LANDSCAPE_PROFILE,
  veronicaRenderManifestSchema,
} from "../contracts/media-plan.v1.js";

const hash = (character: string) => character.repeat(64);

function approvedComposition() {
  return planIndependentFormatCompositions({
    contentProfileId: "strategic-reinvention",
    sceneId: "scene-001",
    narrationRevisionId: "narration-001",
    visualSemanticRevisionId: "visual-001",
    sharedImageIdentity: hash("a"),
    source: { sourceAssetId: "source-001", sourceChecksum: hash("b"), sourceRevisionId: "source-rev-001" },
    effectiveConfiguration: { renderer: "ffmpeg", version: 1 },
    dependencyIdentity: { source: hash("c") },
    approval: { state: "approved", approvalId: "approval-composition" },
    formats: [
      { aspectRatio: "16:9", compositionRevision: "layout-001", sourceTreatment: "reflow", sourceSlideRedesignId: "redesign-landscape", cropLayoutRevision: "crop-001", textLayoutRevision: "text-001", safeAreaRevision: "safe-001", regenerationRationale: "new-composition" },
      { aspectRatio: "9:16", compositionRevision: "layout-002", sourceTreatment: "reflow", sourceSlideRedesignId: "redesign-portrait", cropLayoutRevision: "crop-002", textLayoutRevision: "text-002", safeAreaRevision: "safe-002", regenerationRationale: "new-composition" },
    ],
  })[0]!;
}

function input() {
  const composition = approvedComposition();
  const localeEdition = planLocaleEdition({
    contentProfileId: "veronicabenini",
    episodeId: "episode-001",
    productionRevisionId: "production-001",
    locale: "it",
    canonicalLocale: "it",
    narrationRevisionId: "narration-001",
    narrationFingerprint: hash("d"),
    visuals: [{ artifactId: composition.compositionId, fingerprint: composition.fingerprint, visualSemanticRevisionId: "visual-001", textHandling: "none" }],
    effectiveConfiguration: { locale: "it" },
    dependencyIdentity: { composition: composition.fingerprint },
    approval: { state: "approved", approvalId: "approval-locale" },
    regenerationRationale: "new-locale-edition",
  }).edition;
  const voice = {
    schemaVersion: "creator-supplied-audio-track.v1" as const,
    source: "supplied-human" as const,
    audioPath: "/safe/narration.wav",
    audioFingerprint: hash("e"),
    timingFingerprint: hash("f"),
    captionsPath: "/safe/captions.vtt",
    captionsFingerprint: hash("0"),
    approval: {
      state: "approved" as const,
      approvalIds: ["approval-voice-one", "approval-voice-two"],
      boundRevision: "production-001",
    },
  };
  const renderManifest = veronicaRenderManifestSchema.parse({
    schemaVersion: "veronica-render-manifest.v1",
    aspectRatio: "16:9",
    profile: VERONICA_DEFAULT_LANDSCAPE_PROFILE,
    clips: [{ clipId: "clip-001", placementId: "placement-001", startSeconds: 0, endSeconds: 4, operations: [{ kind: "contain", assetPath: "/safe/frame.png", x: 0, y: 0, width: 1920, height: 1080 }] }],
    narrationAudioPath: voice.audioPath,
    outputPath: "/safe/episode.mp4",
    contentHash: hash("1"),
  });
  return {
    productionRevisionId: "production-001",
    locale: "it",
    composition,
    localeEdition,
    voice,
    renderManifest,
    previewDurationSeconds: 3,
    effectiveConfiguration: { ffmpeg: "deterministic-v1" },
    dependencyIdentity: { composition: composition.fingerprint, locale: localeEdition.fingerprint, voice: voice.audioFingerprint },
    regenerationRationale: "new-render" as const,
  };
}

describe("Veronica render derivative planning", () => {
  it("plans deterministic, non-dispatched render and preview evidence from approved inputs", () => {
    const first = planVeronicaRenderDerivative(input());
    const second = planVeronicaRenderDerivative({ ...input(), previousArtifact: first.artifact });

    expect(first.artifact.contentProfileId).toBe("veronicabenini");
    expect(first.artifact.execution).toEqual({ state: "planned", externalDispatchEnabled: false });
    expect(first.artifact.preview.outputPath).toBe("/safe/episode.preview.mp4");
    expect(first.artifact.commandEvidence).toHaveLength(2);
    expect(second.reused).toBe(true);
    expect(second.artifact.reuseRationale).toBe("content-hash-match");
  });

  it("fails closed for unapproved, incompatible, or mismatched voice render inputs", () => {
    const unapproved = input();
    expect(() => planVeronicaRenderDerivative({ ...unapproved, composition: { ...unapproved.composition, approval: { state: "review" } } })).toThrow("VERONICA_RENDER_APPROVAL_REQUIRED");
    const mismatch = input();
    expect(() => planVeronicaRenderDerivative({ ...mismatch, voice: { ...mismatch.voice, audioPath: "/safe/other.wav" } })).toThrow("VERONICA_RENDER_VOICE_AUDIO_MISMATCH");
    const redacted = redactVeronicaRenderDerivativeFailure(new Error("/private/path leaked"));
    expect(redacted).toMatchObject({ code: "VERONICA_RENDER_INVALID" });
    expect(redacted.message).not.toContain("private");
  });
});
