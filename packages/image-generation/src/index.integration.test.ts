import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { createPlaceholderImage, exportSceneWorkbook } from "./index.js";
import { scenePlanSchema } from "@mediaforge/domain";

describe("image workflow", () => {
  it("exports workbook files and placeholder images", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-images-"));
    const plan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "Hello world.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "intro",
          subject: "person",
          action: "speaking",
          setting: "studio",
          composition: "centered",
          cameraFraming: "medium shot",
          mood: "calm",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: [],
          aspectRatios: ["16:9"],
          imagePrompt: "person speaking",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft"
        }
      ]
    });
    await exportSceneWorkbook(path.join(dir, "episode"), [
      {
        sceneId: "scene-001",
        sequenceNumber: 1,
        aspectRatio: "16:9",
        timestampStart: 0,
        timestampEnd: 4,
        visualPurpose: "intro",
        prompt: "person speaking",
        negativePrompt: "text",
        continuity: "",
        expectedFilename: "scene-001__000000-000004__16x9.png"
      }
    ], { batchSize: 8, aspectRatio: "16:9", globalStyle: "clean" });
    const asset = await createPlaceholderImage(path.join(dir, "placeholder.png"), plan.scenes[0]!, "16:9");
    expect(asset.width).toBe(1920);
    expect(await pathExists(path.join(dir, "episode", "images", "scene-workbook.html"))).toBe(true);
    const [r, g, b] = await samplePixel(path.join(dir, "placeholder.png"), 20, 20);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(170);
    expect(b).toBeGreaterThan(150);
  }, 10000);
});

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await import("node:fs/promises").then((fs) => fs.access(filePath));
    return true;
  } catch {
    return false;
  }
}

async function samplePixel(filePath: string, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await import("sharp").then((module) =>
    module.default(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  );
  const index = (y * info.width + x) * info.channels;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
}
