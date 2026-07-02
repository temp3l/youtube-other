import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema, shotPlanSchema } from "@mediaforge/domain";
import { buildShotPreviewArtifacts } from "./shot-preview-output.js";

async function createFixtureEpisode() {
  const episodeDir = await fs.mkdtemp(path.join(os.tmpdir(), "shot-preview-"));
  const imagePath = path.join(
    episodeDir,
    "shared",
    "images",
    "generated",
    "scene-001.png"
  );
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await sharp({
    create: {
      width: 720,
      height: 1280,
      channels: 3,
      background: { r: 120, g: 80, b: 60 },
    },
  })
    .png()
    .toFile(imagePath);
  return { episodeDir, imagePath };
}

describe("shot preview output", () => {
  it("builds escaped offline storyboard html and a local contact sheet", async () => {
    const { episodeDir, imagePath } = await createFixtureEpisode();
    const shotPlan = shotPlanSchema.parse({
      schemaVersion: 1,
      sourceId: "episode-fixture",
      locale: "en",
      variant: "short",
      aspectRatio: "9:16",
      sourceScenes: [
        {
          sourceSceneId: "source-scene-001",
          sceneId: "scene-001",
          narrationStartMs: 0,
          narrationEndMs: 1500,
          sourceImageId: "image-001",
          sourceImagePath: path.relative(episodeDir, imagePath),
          sourceImageSha256: "a".repeat(64),
          importance: "hook",
          focalRegions: [],
        },
      ],
      shots: [
        {
          shotId: "scene-001-shot-001",
          sourceSceneId: "source-scene-001",
          sceneId: "scene-001",
          sourceImageId: "image-001",
          startMs: 0,
          endMs: 1500,
          treatment: {
            family: "framing",
            catalogVersion: "shot-treatment-catalog-v1",
            treatmentId: "medium-crop",
            variant: "medium-crop",
          },
          overlays: [
            {
              id: "shot-overlay-evidence-001",
              kind: "evidence-insert",
              asset: { assetId: "overlay-1" },
              sourceFactId: "fact-1",
            },
          ],
          transition: { kind: "hard-cut", durationMs: 0 },
        },
      ],
      pacingProfile: {
        mode: "inline",
        profile: {
          id: "shorts-aggressive",
          shotDurationMs: { minMs: 1000, maxMs: 3000 },
          staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
          movingShotDurationMs: { minMs: 1000, maxMs: 3000 },
          openingCadenceMs: { minMs: 1000, maxMs: 3000 },
          climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
        },
      },
      visualBudget: {
        sourceImageCount: { min: 1, max: 2 },
        shotCount: { min: 1, max: 2 },
        shotsPerImage: { min: 1, max: 2 },
        maxConsecutiveSourceImageUses: 2,
        maxTotalSourceImageUses: 2,
        cropLimits: {
          minCropArea: 0.35,
          minFaceMargin: 0.08,
          maxCropZoom: 2,
          minOutputHeightPx: 1080,
          maxAdjacentSameImageCropIou: 0.82,
        },
        motionLimits: {
          minShotDurationMs: 1000,
          pushInScaleRange: { min: 1.03, max: 1.14 },
          fastPushInScaleRange: { min: 1.08, max: 1.22 },
          panTravelFractionOfImage: { min: 0.03, max: 0.12 },
          rotationDegreesRange: { min: -1, max: 1 },
          dissolveDurationMs: { minMs: 120, maxMs: 250 },
          dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
        },
        effectCaps: [],
      },
      planningSeed: "seed",
    });
    const scenePlan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "<dangerous> hallway text",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 1.5,
          timing: { startSeconds: 0, endSeconds: 1.5 },
          visualPurpose: "hook",
          subject: "hallway",
          action: "appears",
          setting: "house",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "tense",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: [],
          aspectRatios: ["9:16"],
          imagePrompt: "prompt",
          expectedImageFilenames: ["scene-001.png"],
          qualityStatus: "draft",
        },
      ],
    });
    const storyboardPath = path.join(
      episodeDir,
      "state",
      "visual-retention",
      "storyboard.short.en.html"
    );
    const artifacts = await buildShotPreviewArtifacts({
      shotPlan,
      scenePlan,
      episodeDir,
      validationIssues: [
        {
          code: "SOURCE_IMAGE_OVERUSED",
          severity: "warning",
          message: "warning",
          shotId: "scene-001-shot-001",
        },
      ],
      storyboardPath,
    });

    expect(artifacts.storyboardHtml).toContain("&lt;dangerous&gt;");
    expect(artifacts.storyboardHtml).not.toContain("http://");
    expect(artifacts.entries[0]?.evidenceInsertSummary).toBe("fact-1");
    expect(artifacts.contactSheetPng.subarray(1, 4).toString()).toBe("PNG");
  });
});
