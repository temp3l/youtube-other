import { planIndependentFormatCompositions } from "@mediaforge/rendering/composition-contract.js";
import { planLocaleEdition } from "@mediaforge/story-localization/locale-edition";
import { describe, expect, it } from "vitest";
import { planVeronicaRenderDerivative } from "../rendering/render-derivative.js";
import { VERONICA_DEFAULT_LANDSCAPE_PROFILE, veronicaRenderManifestSchema } from "../contracts/media-plan.v1.js";
import { planVeronicaDeliveryBundle } from "./delivery-bundle.js";

const hash = (character: string) => character.repeat(64);

function input() {
  const composition = planIndependentFormatCompositions({
    contentProfileId: "veronicabenini",
    sceneId: "scene-001",
    narrationRevisionId: "narration-001",
    visualSemanticRevisionId: "visual-001",
    sharedImageIdentity: hash("a"),
    source: { sourceAssetId: "source-001", sourceChecksum: hash("b"), sourceRevisionId: "source-rev-001" },
    effectiveConfiguration: { renderer: "ffmpeg" }, dependencyIdentity: { source: hash("c") },
    approval: { state: "approved", approvalId: "approval-composition" },
    formats: [
      { aspectRatio: "16:9", compositionRevision: "layout-landscape", sourceTreatment: "reflow", sourceSlideRedesignId: "redesign-landscape", cropLayoutRevision: "crop-landscape", textLayoutRevision: "text-landscape", safeAreaRevision: "safe-landscape", regenerationRationale: "new-composition" },
      { aspectRatio: "9:16", compositionRevision: "layout-portrait", sourceTreatment: "reflow", sourceSlideRedesignId: "redesign-portrait", cropLayoutRevision: "crop-portrait", textLayoutRevision: "text-portrait", safeAreaRevision: "safe-portrait", regenerationRationale: "new-composition" },
    ],
  })[0]!;
  const localeEdition = planLocaleEdition({
    contentProfileId: "veronicabenini", episodeId: "episode-001", productionRevisionId: "production-001", locale: "it", canonicalLocale: "it",
    narrationRevisionId: "narration-001", narrationFingerprint: hash("d"),
    visuals: [{ artifactId: composition.compositionId, fingerprint: composition.fingerprint, visualSemanticRevisionId: "visual-001", textHandling: "none" }],
    effectiveConfiguration: { locale: "it" }, dependencyIdentity: { composition: composition.fingerprint },
    approval: { state: "approved", approvalId: "approval-locale" }, regenerationRationale: "new-locale-edition",
  }).edition;
  const voice = { schemaVersion: "creator-supplied-audio-track.v1" as const, source: "supplied-human" as const, audioPath: "/locales/it/full/audio/narration.wav", audioFingerprint: hash("e"), timingFingerprint: hash("f"), captionsPath: "/locales/it/full/captions/narration.vtt", captionsFingerprint: hash("0"), approval: { state: "approved" as const, approvalIds: ["approval-voice", "approval-timing"], boundRevision: "production-001" } };
  const renderDerivative = planVeronicaRenderDerivative({
    productionRevisionId: "production-001", locale: "it", composition, localeEdition, voice,
    renderManifest: veronicaRenderManifestSchema.parse({ schemaVersion: "veronica-render-manifest.v1", aspectRatio: "16:9", profile: VERONICA_DEFAULT_LANDSCAPE_PROFILE, clips: [{ clipId: "clip-001", placementId: "placement-001", startSeconds: 0, endSeconds: 4, operations: [{ kind: "contain", assetPath: "/assets/frame.png", x: 0, y: 0, width: 1920, height: 1080 }] }], narrationAudioPath: voice.audioPath, outputPath: "/locales/it/full/renders/youtube/final.mp4", contentHash: hash("1") }),
    previewDurationSeconds: 3, effectiveConfiguration: { renderer: "ffmpeg" }, dependencyIdentity: { composition: composition.fingerprint, locale: localeEdition.fingerprint, voice: voice.audioFingerprint }, regenerationRationale: "new-render",
  }).artifact;
  return { episodeId: "episode-001", productionRevisionId: "production-001", locale: "it", metadata: { title: "Titolo", description: "Descrizione locale", tags: ["storia"], chapters: [{ startSeconds: 0, title: "Inizio" }] }, effectiveConfiguration: { delivery: "v1" }, dependencyIdentity: { render: renderDerivative.fingerprint, locale: localeEdition.fingerprint }, regenerationRationale: "new-delivery-bundle" as const, localeEdition, renderDerivative, deliveryApproval: { state: "approved" as const, approvalIds: ["approval-delivery-one", "approval-delivery-two"], boundRevision: "production-001" } };
}

describe("Veronica delivery bundle", () => {
  it("adapts approved render and locale evidence into a safe canonical bundle", () => {
    const first = planVeronicaDeliveryBundle(input());
    const second = planVeronicaDeliveryBundle({ ...input(), previousBundle: first.bundle });
    expect(first.bundle.contentProfileId).toBe("veronicabenini");
    expect(first.bundle.files.captions?.relativePath).toBe("locales/it/full/captions/narration.vtt");
    expect(first.bundle.visualsInvalidated).toBe(false);
    expect(second.reused).toBe(true);
  });

  it("fails closed when a render belongs to another revision", () => {
    const candidate = input();
    expect(() => planVeronicaDeliveryBundle({ ...candidate, productionRevisionId: "production-002" })).toThrow("VERONICA_DELIVERY_REVISION_MISMATCH");
    expect(() => planVeronicaDeliveryBundle({ ...candidate, deliveryApproval: { ...candidate.deliveryApproval, boundRevision: "production-002" } })).toThrow("VERONICA_DELIVERY_APPROVAL_REQUIRED");
  });
});
