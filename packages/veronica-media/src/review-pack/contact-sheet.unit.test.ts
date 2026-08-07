import { describe, expect, it } from "vitest";
import { buildContactSheetTiles, renderContactSheetSvg } from "./contact-sheet.js";
import { buildSemanticMediaPlan } from "../planning/semantic-planner.js";
import { ingestSupplementalMediaAsset } from "../ingestion/secure-ingest.js";
import { rasterizeVeronicaPreparedAssetSynthetic } from "../preparation/asset-rasterizer.js";
import { createVeronicaPilotFixtures } from "../fixtures/pilot.js";

describe("contact sheet visual evidence", () => {
  it("embeds prepared asset thumbnails referenced by render manifests", () => {
    const fixtures = createVeronicaPilotFixtures();
    const ingested = fixtures.files.map((file) => ingestSupplementalMediaAsset(file));
    const plan = buildSemanticMediaPlan({
      episodeId: "episode-contact-test",
      originalNarration: fixtures.narration.original,
      assets: ingested,
      targetLanguage: "it",
    });
    const preparedAssetBytes = Object.fromEntries(
      plan.preparedAssets.map((prepared) => [
        prepared.preparedAssetId,
        rasterizeVeronicaPreparedAssetSynthetic({
          asset: ingested[0]!,
          candidateId: prepared.preparedAssetId,
          label: prepared.preparedAssetId,
          width: prepared.width,
          height: prepared.height,
        }),
      ]),
    );
    const tiles = buildContactSheetTiles(plan, "16:9", preparedAssetBytes);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.preparedAssetId).not.toBe("unknown");
      expect(tile.thumbnailBase64).toBeTruthy();
      const prepared = plan.preparedAssets.find(
        (asset) => asset.preparedAssetId === tile.preparedAssetId,
      );
      expect(prepared?.aspectRatio).toBe("16:9");
    }
    const svg = renderContactSheetSvg({
      episodeId: "episode-contact-test",
      aspectRatio: "16:9",
      tiles,
    });
    expect(svg).toContain("data:image/png;base64,");
  });
});
