import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { createPlaceholderImage, exportSceneWorkbook } from "./index.js";
import {
  generateEpisodeImages,
  loadEpisodeImageGenerationSettings,
  planEpisodeImageGeneration,
  upsertCharacterRegistry,
  type CharacterRegistry,
} from "./episode-image-pipeline.js";

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
          qualityStatus: "draft",
        },
      ],
    });
    await exportSceneWorkbook(
      path.join(dir, "episode"),
      [
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
          expectedFilename: "scene-001__000000-000004__16x9.png",
        },
      ],
      { batchSize: 8, aspectRatio: "16:9", globalStyle: "clean" }
    );
    const asset = await createPlaceholderImage(
      path.join(dir, "placeholder.png"),
      plan.scenes[0]!,
      "16:9"
    );
    expect(asset.width).toBe(1920);
    expect(
      await pathExists(
        path.join(dir, "episode", "images", "scene-workbook.html")
      )
    ).toBe(true);
    const [r, g, b] = await samplePixel(
      path.join(dir, "placeholder.png"),
      20,
      20
    );
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(170);
    expect(b).toBeGreaterThan(150);
  }, 10000);

  it("routes text-only and reference-assisted scenes, writes prompts, and preserves resumability", async () => {
    const dir = mkdtempSync(
      path.join(os.tmpdir(), "mediaforge-episode-images-")
    );
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const referenceDir = path.join(
      episodeDir,
      "shared",
      "images",
      "character-references"
    );
    await fs.mkdir(referenceDir, { recursive: true });
    const referencePath = path.join(referenceDir, "daniel-mercer.png");
    const referenceBuffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#334455" },
    })
      .png()
      .toBuffer();
    await fs.writeFile(referencePath, referenceBuffer);

    const registry: CharacterRegistry = {
      episodeId: "episode-fixture",
      updatedAt: new Date().toISOString(),
      characters: [
        {
          id: "daniel-mercer",
          name: "Daniel Mercer",
          role: "Daniel",
          physicalDescription: "A tired adult man with a weathered face.",
          ageRange: "30s",
          genderPresentation: "man",
          face: {
            shape: "angular",
            skinTone: "light",
            eyeColor: "hazel",
            eyebrows: "thick",
            nose: "straight",
            mouth: "narrow",
            distinguishingFeatures: ["small scar near left eyebrow"],
          },
          hair: {
            color: "dark brown",
            length: "short",
            style: "messy",
          },
          build: "lean",
          defaultWardrobe: {
            upperBody: "dark field jacket",
            lowerBody: "dark jeans",
            footwear: "black boots",
            accessories: ["grey backpack"],
            carriedObjects: ["laptop"],
            colors: ["dark grey", "olive"],
          },
          continuityTraits: [
            "same facial structure",
            "same hairline",
            "same backpack",
            "same jacket",
          ],
          referenceImagePath: referencePath,
          referenceStatus: "approved",
        },
      ],
    };
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      registry.characters
    );

    const plan = scenePlanSchema.parse({
      sourceId: "episode-fixture",
      scenes: [
        {
          id: "scene-001",
          sequenceNumber: 1,
          canonicalNarration: "The corridor is empty and the recorder hums.",
          sourceSegmentIds: ["scene-001"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 0, endSeconds: 4 },
          visualPurpose: "establish",
          subject: "empty corridor",
          action: "shown",
          setting: "warehouse hallway",
          composition: "wide documentary frame",
          cameraFraming: "wide shot",
          mood: "uneasy",
          continuityReferences: [],
          onScreenText: "",
          negativeConstraints: ["no watermark"],
          aspectRatios: ["16:9"],
          imagePrompt: "empty corridor",
          expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
          qualityStatus: "draft",
        },
        {
          id: "scene-002",
          sequenceNumber: 2,
          canonicalNarration:
            "Daniel stops when he hears the whisper and looks toward the dark corridor.",
          sourceSegmentIds: ["scene-002"],
          estimatedDurationSeconds: 4,
          timing: { startSeconds: 4, endSeconds: 8 },
          visualPurpose: "reaction",
          subject: "Daniel Mercer",
          action: "hears the whisper and looks toward the corridor",
          setting: "warehouse hallway",
          composition: "medium reaction frame",
          cameraFraming: "medium shot",
          mood: "uneasy",
          continuityReferences: [
            "keep Daniel's jacket and backpack consistent",
          ],
          onScreenText: "",
          negativeConstraints: ["no watermark"],
          aspectRatios: ["16:9"],
          imagePrompt: "Daniel hears the whisper",
          expectedImageFilenames: ["scene-002__000004-000008__16x9.png"],
          qualityStatus: "draft",
        },
      ],
    });

    const settings = loadEpisodeImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1536x1024",
      OPENAI_IMAGE_QUALITY: "medium",
      OPENAI_IMAGE_CONCURRENCY: "1",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000",
      OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES: "true",
    });

    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const b64 = referenceBuffer.toString("base64");
    const client = createMockClient(calls, b64);

    const planned = await planEpisodeImageGeneration(
      episodeDir,
      "episode-fixture",
      plan,
      settings
    );
    expect(planned).toHaveLength(2);
    expect(planned[0]?.prompt).not.toBe(planned[1]?.prompt);
    expect(planned[1]?.validationFailures).toHaveLength(0);
    expect(planned[1]?.prompt).toContain(
      "EXPLICIT DIFFERENCES FROM PREVIOUS SCENE"
    );

    const generated = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(generated.map((item) => item.status)).toEqual([
      "generated",
      "generated",
    ]);
    expect(calls.map((call) => call.method)).toEqual(["generate", "edit"]);

    await expect(
      fs.access(
        path.join(episodeDir, "generated-assets", "images", "scene-001.png")
      )
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(episodeDir, "generated-assets", "images", "scene-002.png")
      )
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(
          episodeDir,
          "generated-assets",
          "image-manifests",
          "scene-001.json"
        )
      )
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(
          episodeDir,
          "generated-assets",
          "image-manifests",
          "scene-002.json"
        )
      )
    ).resolves.toBeUndefined();

    const manifestText = await fs.readFile(
      path.join(
        episodeDir,
        "generated-assets",
        "image-manifests",
        "scene-002.json"
      ),
      "utf8"
    );
    expect(manifestText).toContain("EXPLICIT DIFFERENCES FROM PREVIOUS SCENE");

    const resumable = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(resumable.map((item) => item.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  }, 20000);
});

function createMockClient(
  calls: Array<{ method: "generate" | "edit"; body: unknown }>,
  b64: string
) {
  return {
    images: {
      generate(body: unknown) {
        calls.push({ method: "generate", body });
        return {
          withResponse: async () => ({
            data: { data: [{ b64_json: b64 }] },
            response: new Response(null, { status: 200 }),
            request_id: "req_generate",
          }),
        };
      },
      edit(body: unknown) {
        calls.push({ method: "edit", body });
        return {
          withResponse: async () => ({
            data: { data: [{ b64_json: b64 }] },
            response: new Response(null, { status: 200 }),
            request_id: "req_edit",
          }),
        };
      },
    },
  } as never;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function samplePixel(
  filePath: string,
  x: number,
  y: number
): Promise<[number, number, number]> {
  const { data, info } = await import("sharp").then((module) =>
    module
      .default(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  );
  const index = (y * info.width + x) * info.channels;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
}
