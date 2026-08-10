import { describe, expect, it } from "vitest";
import {
  SOURCE_SLIDE_REDESIGN_LOCALIZED_OVERLAY_REQUIRED,
  SOURCE_SLIDE_REDESIGN_SOURCE_NOT_DISPLAYABLE,
  planSourceSlideRedesign,
} from "./source-slide-redesign.js";

const digest = "a".repeat(64);
const input = {
  source: {
    assetId: "deck-slide-1",
    checksum: digest,
    revisionId: "source-revision-1",
    immutableOriginal: true as const,
    displayPolicy: "display-allowed" as const,
  },
  aspectRatio: "16:9" as const,
  effectiveConfiguration: { designSystemRevision: "editorial-documentary.v1" },
  dependencyIdentity: { sourceManifest: "b".repeat(64) },
  regenerationReason: "new-derivative" as const,
  textBearing: false,
};

describe("source slide redesign derivatives", () => {
  it("records immutable source lineage and permits language-independent reuse", () => {
    const first = planSourceSlideRedesign(input);
    const second = planSourceSlideRedesign({ ...input, previousDerivative: first.derivative });

    expect(first.derivative).toMatchObject({
      contentProfileId: "veronicabenini",
      sourceChecksum: digest,
      sourceRevisionId: "source-revision-1",
      aspectRatio: "16:9",
      transformationChain: ["redesign", "crop"],
      reuseRationale: "language-independent-visual",
    });
    expect(second.reused).toBe(true);
    expect(second.derivative.reuseRationale).toBe("content-hash-match");
  });

  it("requires a reflowed localized overlay for text-bearing slides", () => {
    expect(() => planSourceSlideRedesign({ ...input, textBearing: true })).toThrow(
      SOURCE_SLIDE_REDESIGN_LOCALIZED_OVERLAY_REQUIRED,
    );
    const localized = planSourceSlideRedesign({
      ...input,
      textBearing: true,
      localizedOverlay: { language: "de", text: "Lokalisierte Überschrift" },
    });
    expect(localized.derivative.localizedOverlay).toEqual({
      language: "de",
      text: "Lokalisierte Überschrift",
      reflowed: true,
    });
  });

  it("fails closed for context-only and forbidden sources", () => {
    expect(() => planSourceSlideRedesign({
      ...input,
      source: { ...input.source, displayPolicy: "context-only" },
    })).toThrow(SOURCE_SLIDE_REDESIGN_SOURCE_NOT_DISPLAYABLE);
  });
});
