import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeFilename,
  ingestSupplementalMediaAsset,
  ingestSupplementalMediaBatch,
} from "./secure-ingest.js";
import { createFixturePdf, createFixturePng, createFixturePptx, createFixtureSvg } from "../fixtures/pilot.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("veronica secure ingestion", () => {
  it("accepts mixed supplemental media with signature validation", () => {
    const png = ingestSupplementalMediaAsset({
      assetId: "png-1",
      filename: "chart.png",
      bytes: createFixturePng("chart"),
      declaredMimeType: "image/png",
    });
    const pdf = ingestSupplementalMediaAsset({
      assetId: "pdf-1",
      filename: "handout.pdf",
      bytes: createFixturePdf(2),
      declaredMimeType: "application/pdf",
    });
    expect(png.mediaKind).toBe("png");
    expect(pdf.extractedCandidates).toHaveLength(2);
  });

  it("rejects unsafe filenames and active SVG content", () => {
    expect(() => assertSafeFilename("..")).toThrow(/Unsafe filename/i);
    expect(() =>
      ingestSupplementalMediaAsset({
        assetId: "bad",
        filename: "..",
        bytes: createFixturePng("x"),
      }),
    ).toThrow(/Unsafe filename/i);
    const malicious = Buffer.from(
      '<svg><script>alert(1)</script><text>hi</text></svg>',
      "utf8",
    );
    expect(() =>
      ingestSupplementalMediaAsset({
        assetId: "svg-bad",
        filename: "bad.svg",
        bytes: malicious,
      }),
    ).toThrow(/active content/i);
  });

  it("extracts slide candidates from pptx archives", () => {
    const asset = ingestSupplementalMediaAsset({
      assetId: "deck",
      filename: "deck.pptx",
      bytes: createFixturePptx(4),
      declaredMimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    expect(asset.mediaKind).toBe("pptx");
    expect(asset.extractedCandidates.length).toBeGreaterThanOrEqual(4);
  });

  it("sanitizes safe svg fixtures", () => {
    const asset = ingestSupplementalMediaAsset({
      assetId: "diagram",
      filename: "diagram.svg",
      bytes: createFixtureSvg("Reinvention path"),
    });
    expect(asset.mediaKind).toBe("svg");
    expect(asset.extractedCandidates[0]?.textPreview).toContain("Reinvention");
  });

  it("deduplicates matching immutable originals and isolates malformed inputs", () => {
    const png = createFixturePng("shared");
    const result = ingestSupplementalMediaBatch([
      { assetId: "first", filename: "first.png", bytes: png, sourceKind: "screenshot" },
      { assetId: "duplicate", filename: "duplicate.png", bytes: png },
      { assetId: "bad", filename: "bad.bin", bytes: Buffer.from("not-media") },
    ]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({ immutableOriginal: true, sourceKind: "screenshot" });
    expect(result.reusedAssetIds).toEqual({ duplicate: "first" });
    expect(result.failures).toEqual([{ assetId: "bad", code: "UNSUPPORTED_MEDIA", message: "Unsupported media: bad.bin" }]);
  });
});
