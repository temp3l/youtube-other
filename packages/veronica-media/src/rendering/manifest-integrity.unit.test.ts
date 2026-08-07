import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSemanticMediaPlan } from "../planning/semantic-planner.js";
import { ingestSupplementalMediaAsset } from "../ingestion/secure-ingest.js";
import { createVeronicaPilotFixtures } from "../fixtures/pilot.js";
import { buildRenderManifest } from "./build-render-manifest.js";
import {
  RENDER_ASPECT_ASSET_MISMATCH,
  validateRenderManifestAspectIntegrity,
} from "./manifest-integrity.js";

describe("render manifest aspect integrity", () => {
  const fixtures = createVeronicaPilotFixtures();
  const ingested = fixtures.files.map((file) => ingestSupplementalMediaAsset(file));
  const plan = buildSemanticMediaPlan({
    episodeId: "episode-manifest-test",
    originalNarration: fixtures.narration.original,
    revisedNarration: fixtures.narration.revised,
    assets: ingested,
    targetLanguage: "it",
    sourceLanguage: "it",
  });
  const preparedAssetPaths = Object.fromEntries(
    plan.preparedAssets.map((prepared) => [
      prepared.preparedAssetId,
      path.join("/tmp", prepared.relativePath),
    ]),
  );

  it("accepts landscape manifest referencing landscape prepared assets", () => {
    const manifest = buildRenderManifest({
      plan,
      aspectRatio: "16:9",
      placements: plan.landscapePlacements,
      preparedAssetPaths,
      outputPath: "/tmp/landscape.mp4",
      narrationAudioPath: "/tmp/narration.wav",
    });
    const result = validateRenderManifestAspectIntegrity({ manifest, plan, preparedAssetPaths });
    expect(result.valid).toBe(true);
  });

  it("accepts portrait manifest referencing portrait prepared assets", () => {
    const manifest = buildRenderManifest({
      plan,
      aspectRatio: "9:16",
      placements: plan.portraitPlacements,
      preparedAssetPaths,
      outputPath: "/tmp/portrait.mp4",
      narrationAudioPath: "/tmp/narration.wav",
    });
    const result = validateRenderManifestAspectIntegrity({ manifest, plan, preparedAssetPaths });
    expect(result.valid).toBe(true);
    for (const clip of manifest.clips) {
      const operation = clip.operations[0];
      if (operation && "assetPath" in operation) {
        const preparedId = path.basename(operation.assetPath, ".png");
        const prepared = plan.preparedAssets.find((asset) => asset.preparedAssetId === preparedId);
        expect(prepared?.aspectRatio).toBe("9:16");
      }
    }
  });

  it("rejects portrait manifest that references landscape prepared assets", () => {
    const portraitManifest = buildRenderManifest({
      plan,
      aspectRatio: "9:16",
      placements: plan.portraitPlacements,
      preparedAssetPaths,
      outputPath: "/tmp/portrait.mp4",
      narrationAudioPath: "/tmp/narration.wav",
    });
    const landscapePrepared = plan.preparedAssets.find((asset) => asset.aspectRatio === "16:9");
    expect(landscapePrepared).toBeDefined();
    const tampered = {
      ...portraitManifest,
      clips: portraitManifest.clips.map((clip, index) =>
        index === 0
          ? {
              ...clip,
              operations: clip.operations.map((operation) =>
                "assetPath" in operation
                  ? {
                      ...operation,
                      assetPath: preparedAssetPaths[landscapePrepared!.preparedAssetId]!,
                    }
                  : operation,
              ),
            }
          : clip,
      ),
    };
    const result = validateRenderManifestAspectIntegrity({
      manifest: tampered,
      plan,
      preparedAssetPaths,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === RENDER_ASPECT_ASSET_MISMATCH)).toBe(true);
  });
});
