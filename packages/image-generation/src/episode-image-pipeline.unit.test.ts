import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import {
  approveEpisodeCharacter,
  buildPromptFromSpec,
  diffSpec,
  generateEpisodeImages,
  isRetryableError,
  loadEpisodeImageGenerationSettings,
  planEpisodeImageGeneration,
  OpenAIImageGenerator,
  rewriteForDifference,
  type CharacterRegistry,
  type SceneVisualSpec,
  type CharacterDefinition,
  upsertCharacterRegistry,
  validatePrompt,
} from "./episode-image-pipeline.js";

function makeScenePlan(
  sceneOverrides: Array<Partial<ScenePlan["scenes"][number]>>
): ScenePlan {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: sceneOverrides.map((override, index) => ({
      id: `scene-${String(index + 1).padStart(3, "0")}`,
      sequenceNumber: index + 1,
      canonicalNarration: "Daniel studies the corridor on a monitor.",
      sourceSegmentIds: ["scene-001"],
      estimatedDurationSeconds: 4,
      timing: { startSeconds: index * 4, endSeconds: index * 4 + 4 },
      visualPurpose: "Depict the narrated concept clearly and directly.",
      subject: "Daniel",
      action: "studies a monitor in the dim corridor",
      setting: "warehouse hallway with concrete walls",
      composition: "balanced editorial composition with safe overlay area",
      cameraFraming: "medium shot",
      mood: "uneasy",
      continuityReferences: [],
      onScreenText: "",
      negativeConstraints: ["no watermark", "no unreadable text"],
      aspectRatios: ["16:9"],
      imagePrompt: "placeholder",
      expectedImageFilenames: [
        `scene-${String(index + 1).padStart(3, "0")}__000000-000004__16x9.png`,
      ],
      qualityStatus: "draft",
      ...override,
    })),
  });
}

function makeRegistry(
  referenceStatus: CharacterDefinition["referenceStatus"] = "approved",
  referenceImagePath = path.join("/tmp", "daniel.png")
): CharacterRegistry {
  return {
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
        referenceStatus,
        referenceImagePath,
      },
    ],
  };
}

function makeSceneSpec(): SceneVisualSpec {
    return {
      sceneId: "scene-001",
      sequenceNumber: 1,
      narrativePurpose: "establish",
      focalSubject: "Daniel Mercer",
    visibleAction: "studies the corridor on a monitor",
    environment: "dark parking garage corridor",
    foreground: "laptop screen glow and a trembling hand",
    background: "shadowed concrete walls",
    shotSize: "medium-close-up",
    cameraAngle: "eye-level",
    sourceNarration: "Daniel studies the corridor on a monitor.",
    composition:
      "Daniel occupies the right third with the corridor leading into darkness",
    lighting: "low-key cinematic lighting with controlled contrast",
      timeOfDay: "night",
      mood: "uneasy",
      distinctiveAnchor: "Daniel notices the impossible duplicate on the monitor",
      continuityElements: ["keep Daniel's jacket, backpack, and hair consistent"],
      textRequirement: { required: false },
      characters: [
        {
          characterId: "daniel-mercer",
        pose: "leaning forward",
        expression: "tense",
        position: "right third",
      },
    ],
    prohibitedElements: ["No text", "No watermark"],
  };
}

async function createImageBuffer(color: string): Promise<string> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer()
    .then((buffer) => buffer.toString("base64"));
}

async function mutateManifest(
  manifestPath: string,
  mutate: (value: Record<string, unknown>) => void
): Promise<void> {
  const value = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  mutate(value);
  await fs.writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

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

describe("episode image pipeline helpers", () => {
  it("builds an identity prompt that keeps immutable traits separate from wardrobe continuity", () => {
    const registry = makeRegistry();
    const prompt = buildPromptFromSpec(makeSceneSpec(), undefined, registry);
    expect(prompt).toContain(
      "approved identity reference image for character `daniel-mercer`"
    );
    expect(prompt).toContain("same facial geometry");
    expect(prompt).toContain("dark field jacket");
    expect(prompt).toContain("grey backpack");
  });

  it("flags generic shown actions and contradictory style guidance", () => {
    const spec = makeSceneSpec();
    const shownPrompt = buildPromptFromSpec(
      { ...spec, visibleAction: "shown" },
      undefined,
      makeRegistry()
    );
    expect(
      validatePrompt(shownPrompt, { ...spec, visibleAction: "shown" })
    ).toContain("prompt uses shown or otherwise generic action");
    expect(
      validatePrompt(
        "rough ink collage and photorealistic cinematic horror in the same prompt",
        spec
      )
    ).toContain("prompt contains contradictory style directions");
  });

  it("keeps ordinary scenes text-free and allows exact required text without blanket bans", () => {
    const registry = makeRegistry();
    const noTextPrompt = buildPromptFromSpec(
      makeSceneSpec(),
      undefined,
      registry
    );
    const textPrompt = buildPromptFromSpec(
      {
        ...makeSceneSpec(),
        textRequirement: {
          required: true,
          text: "ROOM 237",
          placement: "on the worn brass plaque",
          reason: "The room number is essential to the narrated reveal.",
        },
      },
      undefined,
      registry
    );

    expect(noTextPrompt).toContain(
      "Do not include captions, subtitles, labels, logos, watermarks, or readable text."
    );
    expect(textPrompt).toContain('Render exactly: "ROOM 237".');
    expect(textPrompt).toContain("Placement: on the worn brass plaque.");
    expect(textPrompt).not.toContain(
      "Do not include captions, subtitles, labels, logos, watermarks, or readable text."
    );
  });

  it("does not reject adjacent prompts that differ in scene-specific content", () => {
    const registry = makeRegistry();
    const previous = makeSceneSpec();
    const current = {
      ...previous,
      sceneId: "scene-002",
      sequenceNumber: 2,
      narrativePurpose: "reaction" as const,
      focalSubject: "Daniel Mercer at the corridor door",
      visibleAction: "turns from the monitor to the hallway door",
      environment: "tight hallway outside the motel room",
      foreground: "the room key and Daniel's trembling hand",
      background: "the dark corridor beyond the motel door",
      shotSize: "medium-close-up" as const,
      cameraAngle: "over-the-shoulder" as const,
      lighting: "cold practical light spilling from the room",
      timeOfDay: "late night",
      mood: "tense",
      distinctiveAnchor: "the hallway door starts to open by itself",
    };
    const currentPrompt = buildPromptFromSpec(current, previous, registry);
    const previousPrompt = buildPromptFromSpec(previous, undefined, registry);
    expect(
      validatePrompt(currentPrompt, current, previousPrompt, previous)
    ).not.toContain("prompt overlaps too much with the previous prompt");
  });

  it("scores adjacent differences and rewrites repeated shot choices", () => {
    const previous = makeSceneSpec();
    const next = {
      ...previous,
      sceneId: "scene-002",
      narrativePurpose: "reaction",
      visibleAction: "searches the hallway",
      shotSize: "wide",
      cameraAngle: "high-angle",
      distinctiveAnchor: "different evidence",
      composition: "wide overhead frame with more negative space",
    };
    const diffs = diffSpec(previous, next);
    expect(diffs.length).toBeGreaterThanOrEqual(3);
    const rewritten = rewriteForDifference(next, previous);
    expect(rewritten.shotSize).not.toBe(previous.shotSize);
    expect(rewritten.cameraAngle).not.toBe(previous.cameraAngle);
  });

  it("classifies retryable versus terminal API failures", () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ code: "invalid_api_key" })).toBe(false);
    expect(isRetryableError({ status: 500 })).toBe(true);
  });

  it("supports text-only and reference-assisted routing", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-routing-"));
    const b64 = await createImageBuffer("#00ff00");
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const client = createMockClient(calls, b64);
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

    await fs.writeFile(
      path.join(dir, "reference.png"),
      Buffer.from(b64, "base64")
    );
    const generator = new OpenAIImageGenerator(settings, client);
    await generator.generate({
      scene: { ...makeSceneSpec(), characters: [] },
      prompt: "a lonely corridor",
      referenceImages: [],
      outputPath: path.join(dir, "text.png"),
    });
    await generator.generate({
      scene: makeSceneSpec(),
      prompt: buildPromptFromSpec(makeSceneSpec(), undefined, makeRegistry()),
      referenceImages: [
        {
          characterId: "daniel-mercer",
          filePath: path.join(dir, "reference.png"),
          mimeType: "image/png",
        },
      ],
      outputPath: path.join(dir, "ref.png"),
    });
    expect(calls.map((call) => call.method)).toEqual(["generate", "edit"]);
  });

  it("writes manifests atomically and resumes from valid outputs", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-resume-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const referencePath = path.join(dir, "daniel-reference.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#223344" },
      })
        .png()
        .toBuffer()
    );
    const plan = makeScenePlan([
      {
        sceneId: "scene-001",
        sequenceNumber: 1,
        id: "scene-001",
        subject: "Daniel",
        action: "studies the corridor on a monitor",
      },
    ] as never);
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const b64 = await createImageBuffer("#123456");
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const client = createMockClient(calls, b64);
    const first = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(first[0]?.status).toBe("generated");
    expect(
      await fs.stat(
        path.join(
          episodeDir,
          "state",
          "image-generation",
          "manifests",
          "scene-001.json"
        )
      )
    ).toBeTruthy();
    calls.length = 0;
    const second = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(second[0]?.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("regenerates a scene when the scene hash changes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-scene-hash-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const referencePath = path.join(dir, "daniel-reference.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#334455" },
      })
        .png()
        .toBuffer()
    );
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const plan = makeScenePlan([
      {
        sceneId: "scene-001",
        sequenceNumber: 1,
        sourceSegmentIds: ["segment-002"],
      },
    ] as never);
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
    const b64 = await createImageBuffer("#445566");
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const client = createMockClient(calls, b64);
    const first = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(first[0]?.status).toBe("generated");
    calls.length = 0;
    const manifestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests",
      "scene-001.json"
    );
    await mutateManifest(manifestPath, (value) => {
      value.sceneHash = "stale-scene-hash";
    });
    const second = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(second[0]?.status).toBe("generated");
    expect(calls).toHaveLength(1);
  });

  it("regenerates a scene when the prompt hash changes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-prompt-hash-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const referencePath = path.join(dir, "daniel-reference.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#556677" },
      })
        .png()
        .toBuffer()
    );
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const plan = makeScenePlan([
      {
        sceneId: "scene-001",
        sequenceNumber: 1,
      },
    ] as never);
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
    const b64 = await createImageBuffer("#667788");
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const client = createMockClient(calls, b64);
    const first = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(first[0]?.status).toBe("generated");
    calls.length = 0;
    const manifestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests",
      "scene-001.json"
    );
    await mutateManifest(manifestPath, (value) => {
      value.promptHash = "stale-prompt-hash";
    });
    const second = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(second[0]?.status).toBe("generated");
    expect(calls).toHaveLength(1);
  });
});

describe("character registry helpers", () => {
  it("persists character registry entries for planning and approval", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-registry-"));
    await fs.mkdir(dir, { recursive: true });
    const referencePath = path.join(dir, "daniel.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#556677" },
      })
        .png()
        .toBuffer()
    );
    const registry = await upsertCharacterRegistry(
      dir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    expect(registry.characters[0]?.referenceStatus).toBe("approved");
    const approved = await approveEpisodeCharacter(
      dir,
      "episode-fixture",
      "daniel-mercer"
    );
    expect(approved.characters[0]?.referenceStatus).toBe("approved");
  });
});
