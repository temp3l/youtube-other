import { describe, expect, it } from "vitest";
import { rasterizeVeronicaPreparedAssetSynthetic } from "./asset-rasterizer.js";

describe("rasterizeVeronicaPreparedAsset", () => {
  it("produces deterministic non-trivial PNG bytes for pdf and pptx candidates", () => {
    const asset = {
      assetId: "deck",
      originalFilename: "deck.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      mediaKind: "pptx" as const,
      checksum: "a".repeat(64),
      byteLength: 128,
      bytes: new Uint8Array(128),
      extractedCandidates: [
        { candidateId: "deck-slide-1", label: "Slide 1", slideNumber: 1, checksum: "b".repeat(64) },
      ],
    };
    const first = rasterizeVeronicaPreparedAssetSynthetic({
      asset,
      candidateId: "deck-slide-1",
      label: "Slide 1",
      width: 320,
      height: 180,
    });
    const second = rasterizeVeronicaPreparedAssetSynthetic({
      asset,
      candidateId: "deck-slide-1",
      label: "Slide 1",
      width: 320,
      height: 180,
    });
    expect(first.byteLength).toBeGreaterThan(100);
    expect(Buffer.from(first).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(Buffer.from(first)).toEqual(Buffer.from(second));
  });
});
