import { describe, expect, it } from "vitest";
import { createFixturePdf, createFixturePptx } from "../fixtures/pilot.js";
import {
  detectExternalRasterTools,
  rasterizeVeronicaPreparedAsset,
} from "./external-rasterizer.js";

describe("external rasterizer", () => {
  it("uses source bytes for raster images and external tools when available for documents", async () => {
    const png = await rasterizeVeronicaPreparedAsset({
      asset: {
        assetId: "chart",
        originalFilename: "chart.png",
        mimeType: "image/png",
        mediaKind: "png",
        checksum: "a".repeat(64),
        byteLength: 4,
        bytes: new Uint8Array([1, 2, 3, 4]),
        extractedCandidates: [],
      },
      candidateId: "chart-primary",
      label: "chart",
    });
    expect(png.method).toBe("source-bytes");
    expect(png.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));

    const tools = detectExternalRasterTools();
    const pdf = await rasterizeVeronicaPreparedAsset({
      asset: {
        assetId: "handout",
        originalFilename: "handout.pdf",
        mimeType: "application/pdf",
        mediaKind: "pdf",
        checksum: "b".repeat(64),
        byteLength: 0,
        bytes: createFixturePdf(1),
        extractedCandidates: [],
      },
      candidateId: "handout-page-1",
      label: "Page 1",
      pageNumber: 1,
      width: 320,
      height: 180,
    });
    expect(["pdftoppm", "synthetic"]).toContain(pdf.method);
    expect(pdf.bytes.byteLength).toBeGreaterThan(100);

    const pptx = await rasterizeVeronicaPreparedAsset({
      asset: {
        assetId: "deck",
        originalFilename: "deck.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        mediaKind: "pptx",
        checksum: "c".repeat(64),
        byteLength: 0,
        bytes: createFixturePptx(1),
        extractedCandidates: [],
      },
      candidateId: "deck-slide-1",
      label: "Slide 1",
      slideNumber: 1,
      width: 320,
      height: 180,
    });
    expect(["libreoffice", "synthetic"]).toContain(pptx.method);
    expect(pptx.bytes.byteLength).toBeGreaterThan(100);
  });
});
