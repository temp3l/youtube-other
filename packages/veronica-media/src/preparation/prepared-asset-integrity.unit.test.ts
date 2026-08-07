import { describe, expect, it } from "vitest";
import { rasterizeVeronicaPreparedAssetSynthetic } from "./asset-rasterizer.js";
import { readPngDimensions, sha256Bytes } from "./png-metadata.js";
import {
  PREPARED_ASSET_CHECKSUM_MISMATCH,
  verifyPreparedAssetBytes,
} from "./prepared-asset-integrity.js";

describe("prepared asset integrity", () => {
  it("matches metadata checksum to output bytes", () => {
    const bytes = rasterizeVeronicaPreparedAssetSynthetic({
      asset: {
        assetId: "deck",
        originalFilename: "deck.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        mediaKind: "pptx",
        checksum: "a".repeat(64),
        byteLength: 128,
        bytes: new Uint8Array(128),
        extractedCandidates: [],
      },
      candidateId: "prep-test",
      label: "prep-test",
      width: 1920,
      height: 1080,
    });
    const prepared = {
      preparedAssetId: "prep-test",
      aspectRatio: "16:9" as const,
      checksum: sha256Bytes(bytes),
      relativePath: "prepared/landscape/prep-test.png",
      width: 1920,
      height: 1080,
      provenanceId: "prov-test",
    };
    expect(verifyPreparedAssetBytes(prepared, bytes).valid).toBe(true);
    const tampered = Uint8Array.from(bytes);
    tampered[100] = (tampered[100] ?? 0) ^ 0xff;
    const failed = verifyPreparedAssetBytes(prepared, tampered);
    expect(failed.valid).toBe(false);
    expect(failed.issues).toContain(PREPARED_ASSET_CHECKSUM_MISMATCH);
  });

  it("declares dimensions that match actual PNG output", () => {
    const bytes = rasterizeVeronicaPreparedAssetSynthetic({
      asset: {
        assetId: "deck",
        originalFilename: "deck.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        mediaKind: "pptx",
        checksum: "a".repeat(64),
        byteLength: 128,
        bytes: new Uint8Array(128),
        extractedCandidates: [],
      },
      candidateId: "prep-portrait",
      label: "prep-portrait",
      width: 1080,
      height: 1920,
    });
    const dimensions = readPngDimensions(bytes);
    expect(dimensions).toEqual({ width: 1080, height: 1920 });
  });
});
