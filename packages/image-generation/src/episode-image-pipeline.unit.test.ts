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
  buildSceneVisualSpec,
  diffSpec,
  generateEpisodeImages,
  isRetryableError,
  loadEpisodeImageGenerationSettings,
  loadEpisodeSceneVisualPlan,
  planEpisodeImageGeneration,
  OpenAIImageGenerator,
  repairForSemanticDifference,
  type CharacterRegistry,
  type SceneVisualSpec,
  type CharacterDefinition,
  upsertCharacterRegistry,
  validatePrompt,
  validateSceneVisualSpec,
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

interface MalformedSceneRegressionFixture {
  readonly name: string;
  readonly previous?: Partial<SceneVisualSpec>;
  readonly current: Partial<SceneVisualSpec>;
  readonly expectedIssueCodes?: string[];
  readonly unexpectedIssueCodes?: string[];
}

async function loadMalformedSceneRegressionFixtures(): Promise<
  MalformedSceneRegressionFixture[]
> {
  const fixturePath = new URL(
    "./__fixtures__/malformed-scene-regressions.json",
    import.meta.url
  );
  return JSON.parse(
    await fs.readFile(fixturePath, "utf8")
  ) as MalformedSceneRegressionFixture[];
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

function createSequencedMockClient(
  calls: Array<{ method: "generate" | "edit"; body: unknown }>,
  b64s: readonly string[]
) {
  let index = 0;
  return {
    images: {
      generate(body: unknown) {
        calls.push({ method: "generate", body });
        const next = b64s[Math.min(index, b64s.length - 1)] ?? b64s[0];
        index += 1;
        return {
          withResponse: async () => ({
            data: { data: [{ b64_json: next }] },
            response: new Response(null, { status: 200 }),
            request_id: `req_generate_${index}`,
          }),
        };
      },
      edit(body: unknown) {
        calls.push({ method: "edit", body });
        const next = b64s[Math.min(index, b64s.length - 1)] ?? b64s[0];
        index += 1;
        return {
          withResponse: async () => ({
            data: { data: [{ b64_json: next }] },
            response: new Response(null, { status: 200 }),
            request_id: `req_edit_${index}`,
          }),
        };
      },
    },
  } as never;
}

function createFailingMockClient(
  calls: Array<{ method: "generate" | "edit"; body: unknown }>,
  error: Error
) {
  return {
    images: {
      generate(body: unknown) {
        calls.push({ method: "generate", body });
        return {
          withResponse: async () => {
            throw error;
          },
        };
      },
      edit(body: unknown) {
        calls.push({ method: "edit", body });
        return {
          withResponse: async () => {
            throw error;
          },
        };
      },
    },
  } as never;
}

function makePreparedProviderRequest(args: {
  readonly scene: SceneVisualSpec;
  readonly prompt: string;
  readonly outputPath: string;
  readonly referenceImages?: Array<{
    characterId: string;
    path: string;
    sha256: string;
  }>;
}) {
  const referenceImages = args.referenceImages ?? [];
  return {
    sceneId: args.scene.sceneId,
    scene: args.scene,
    model: "gpt-image-2",
    size: "1536x1024",
    quality: "medium" as const,
    outputFormat: "png" as const,
    background: "opaque" as const,
    outputPath: args.outputPath,
    operation:
      referenceImages.length > 0 ? ("image-edit" as const) : ("image-generation" as const),
    aspectRatio: "16:9" as const,
    promptVersion: 1,
    referenceImages,
    characterContexts: args.scene.characters.map((usage) => ({
      characterId: usage.characterId,
      usage,
    })),
    prompt: args.prompt,
    promptHash: `prompt:${args.prompt}`,
    providerRequestHash: `hash:${args.prompt}`,
  };
}

function createConcurrentPromptMockClient(args: {
  readonly calls: Array<{ method: "generate" | "edit"; body: unknown }>;
  readonly delaysByPrompt: Readonly<Record<string, number>>;
  readonly b64ByPrompt: Readonly<Record<string, string>>;
  readonly failingPrompts?: ReadonlySet<string>;
  readonly counters: { active: number; maxActive: number };
}) {
  return {
    images: {
      generate(body: unknown) {
        args.calls.push({ method: "generate", body });
        return {
          withResponse: async () => {
            const prompt =
              typeof body === "object" &&
              body !== null &&
              "prompt" in body &&
              typeof (body as { prompt?: unknown }).prompt === "string"
                ? ((body as { prompt: string }).prompt as string)
                : "";
            args.counters.active += 1;
            args.counters.maxActive = Math.max(
              args.counters.maxActive,
              args.counters.active
            );
            try {
              const delayMs = args.delaysByPrompt[prompt] ?? 0;
              if (delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              }
              if (args.failingPrompts?.has(prompt)) {
                throw new Error(`forced failure for ${prompt}`);
              }
              const b64 = args.b64ByPrompt[prompt];
              if (!b64) {
                throw new Error(`missing mock image for prompt ${prompt}`);
              }
              return {
                data: { data: [{ b64_json: b64 }] },
                response: new Response(null, { status: 200 }),
                request_id: `req_${prompt}`,
              };
            } finally {
              args.counters.active -= 1;
            }
          },
        };
      },
      edit(body: unknown) {
        args.calls.push({ method: "edit", body });
        return {
          withResponse: async () => {
            throw new Error("unexpected edit request in concurrency test");
          },
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
    ).toContain("visible action is too generic or abstract");
    expect(
      validatePrompt(
        "rough ink collage and photorealistic cinematic horror in the same prompt",
        spec
      )
    ).toContain("prompt contains contradictory style directions");
  });

  it("prefers a single clean primary event over repeated narration fragments", () => {
    const spec = {
      ...makeSceneSpec(),
      focalSubject: "The next incident removed some",
      visibleAction:
        "The next incident removed some of that comfort. Two children knock and ask to use his phone, keeping their faces lowered.",
      environment: "cinematic documentary background",
      foreground: "foreground evidence and incidental detail",
      background: "background context and atmospheric depth",
      distinctiveAnchor: "two children at the motel door",
      canonicalNarration:
        "The next incident removed some of that comfort. Two children knock and ask to use his phone, keeping their faces lowered.",
    };
    const prompt = buildPromptFromSpec(spec, undefined, makeRegistry());
    expect(prompt).toContain(
      "Two children knock and ask to use his phone, keeping their faces lowered."
    );
    expect(
      prompt.match(/The next incident removed some/gu)?.length ?? 0
    ).toBeLessThanOrEqual(1);
  });

  it("emits typed visual-plan issues for placeholder language and repeated narration", () => {
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        sourceNarration:
          "The event happened... The event happened. The event happened...",
        environment: "a grounded environment suggested by the narration",
        foreground: "foreground evidence related to the narration",
        background: "background context reinforcing the narration",
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "PLACEHOLDER_ENVIRONMENT"
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "DUPLICATED_NARRATION"
    );
  });

  it("derives a concrete space from narration when the scene setting is generic", () => {
    const spec = buildSceneVisualSpec(
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "Two children stood outside Noah's motel room in freezing rain.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "introduce the setting",
        subject: "Two children stood outside Noah's",
        action: "shown",
        setting: "cinematic documentary background",
        composition: "centered",
        cameraFraming: "wide shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no subtitles", "no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      } as never,
      makeRegistry()
    );

    expect(spec.environment).toContain("motel room");
    expect(spec.environment).not.toContain("suggested by");
    expect(spec.foreground).toContain("two children at the threshold");
    expect(spec.foreground).not.toContain("foreground details centered on");
    expect(spec.background).not.toContain("background details that echo");
    expect(spec.background).not.toContain("two children at the threshold");
  });

  it("repairs generic visual fields with concrete inferred visuals instead of copying narration", () => {
    const spec = buildSceneVisualSpec(
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration:
          "Two children stood outside Noah's motel room in freezing rain.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "introduce the setting",
        subject: "shown",
        action: "shown",
        setting: "cinematic documentary background",
        composition: "centered",
        cameraFraming: "wide shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no subtitles", "no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      } as never,
      makeRegistry()
    );

    expect(spec.focalSubject).toBe("two children at the doorway");
    expect(spec.visibleAction).toBe("wait silently at the threshold");
    expect(spec.environment).toContain("motel room");
    expect(spec.focalSubject).not.toBe(
      "Two children stood outside Noah's motel room in freezing rain."
    );
    expect(spec.visibleAction).not.toContain("freezing rain");
  });

  it("surfaces unresolved abstract beats as typed plan issues instead of narration copies", () => {
    const scene = {
      id: "scene-001",
      sequenceNumber: 1,
      canonicalNarration:
        "The discovery changed the meaning of everything that came before.",
      sourceSegmentIds: ["scene-001"],
      estimatedDurationSeconds: 4,
      timing: { startSeconds: 0, endSeconds: 4 },
      visualPurpose: "transition",
      subject: "shown",
      action: "shown",
      setting: "cinematic documentary background",
      composition: "centered",
      cameraFraming: "wide shot",
      mood: "uneasy",
      continuityReferences: [],
      onScreenText: "",
      negativeConstraints: ["no subtitles", "no watermark"],
      aspectRatios: ["16:9"],
      imagePrompt: "placeholder",
      expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
      qualityStatus: "draft",
    } as never;
    const spec = buildSceneVisualSpec(scene, makeRegistry());
    const issues = validateSceneVisualSpec(spec, undefined, undefined);

    expect(spec.focalSubject).toBe("unresolved visual subject");
    expect(spec.visibleAction).toBe("unresolved visible action");
    expect(spec.environment).toBe("unresolved environment");
    expect(spec.focalSubject).not.toBe(scene.canonicalNarration);
    expect(issues.map((issue) => issue.code)).toContain("MISSING_FOCAL_SUBJECT");
    expect(issues.map((issue) => issue.code)).toContain(
      "ABSTRACT_VISIBLE_ACTION"
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "PLACEHOLDER_ENVIRONMENT"
    );
  });

  it("resolves recurring characters through aliases", () => {
    const registry = makeRegistry();
    registry.characters[0] = {
      ...registry.characters[0]!,
      aliases: ["Noah"],
    };
    const spec = buildSceneVisualSpec(
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "Noah opens the motel room door.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "reaction",
        subject: "Noah",
        action: "opens the motel room door",
        setting: "motel room doorway",
        composition: "medium frame",
        cameraFraming: "medium shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no subtitles", "no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      } as never,
      registry
    );

    expect(spec.characters.map((character) => character.characterId)).toContain(
      "daniel-mercer"
    );
    expect(spec.unresolvedRecurringCharacterMentions).toBeUndefined();
  });

  it("resolves collective character labels without requiring literal names", () => {
    const registry = makeRegistry();
    registry.characters[0] = {
      ...registry.characters[0]!,
      id: "black-eyed-children",
      name: "Black Eyed Children",
      role: "supernatural antagonists",
      aliases: ["the black eyed children"],
      collectiveLabels: ["children", "kids"],
    };
    const spec = buildSceneVisualSpec(
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "The children knock softly outside the motel door.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "establish",
        subject: "the children",
        action: "knock softly outside the motel door",
        setting: "motel room doorway",
        composition: "wide frame",
        cameraFraming: "wide shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no subtitles", "no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      } as never,
      registry
    );

    expect(spec.characters.map((character) => character.characterId)).toEqual([
      "black-eyed-children",
    ]);
    expect(spec.unresolvedRecurringCharacterMentions).toBeUndefined();
  });

  it("surfaces unresolved collective character mentions as typed issues", () => {
    const spec = buildSceneVisualSpec(
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "The children knock softly outside the motel door.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "establish",
        subject: "the children",
        action: "knock softly outside the motel door",
        setting: "motel room doorway",
        composition: "wide frame",
        cameraFraming: "wide shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no subtitles", "no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft",
      } as never,
      makeRegistry()
    );
    const issues = validateSceneVisualSpec(spec, undefined, undefined);

    expect(spec.characters).toHaveLength(0);
    expect(spec.unresolvedRecurringCharacterMentions).toEqual(["children"]);
    expect(issues.map((issue) => issue.code)).toContain(
      "UNRESOLVED_RECURRING_CHARACTER"
    );
  });

  it("flags contradictions between required visible features and exclusions", () => {
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        focalSubject: "two children at the motel door",
        visibleAction: "two children wait at the threshold",
        prohibitedElements: ["No children", "No readable text"],
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "CONTRADICTORY_REQUIRED_FEATURE"
    );
  });

  it("flags required text that is contradicted by blanket text exclusions", () => {
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        textRequirement: {
          required: true,
          text: "ROOM 237",
          placement: "on the brass door plaque",
          reason: "The room number is essential to the reveal.",
        },
        prohibitedElements: ["No text", "No labels"],
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "CONTRADICTORY_REQUIRED_FEATURE"
    );
  });

  it("flags previous-scene narration leakage in current visual fields", () => {
    const previous = makeSceneSpec();
    const current = {
      ...makeSceneSpec(),
      sceneId: "scene-002",
      sourceNarration: "Daniel sees a new shadow by the door.",
      visibleAction: `reacts while ${previous.sourceNarration}`,
      distinctiveAnchor: "new shadow by the door",
    };
    const issues = validateSceneVisualSpec(current, undefined, previous);

    expect(issues.map((issue) => issue.code)).toContain(
      "PREVIOUS_SCENE_TEXT_LEAKAGE"
    );
  });

  it("flags empty or unresolved locations as typed location issues", () => {
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        environment: "unknown",
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).toContain("EMPTY_LOCATION");
  });

  it("flags overly verbose visual plan fields separately from prompt verbosity", () => {
    const longField = Array.from(
      { length: 42 },
      (_, index) => `detail${index}`
    ).join(" ");
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        visibleAction: longField,
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "VISUAL_FIELD_TOO_VERBOSE"
    );
  });

  it("flags character continuity requirements without resolved characters", () => {
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        characters: [],
        continuityElements: [
          "keep Daniel's jacket, backpack, face, and hair consistent",
        ],
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "MISSING_RECURRING_CHARACTER"
    );
  });

  it("does not treat generic scene continuity as missing character continuity", () => {
    const issues = validateSceneVisualSpec(
      {
        ...makeSceneSpec(),
        characters: [],
        continuityElements: ["continue the episode's visual continuity from scene-001"],
      },
      undefined,
      undefined
    );

    expect(issues.map((issue) => issue.code)).not.toContain(
      "MISSING_RECURRING_CHARACTER"
    );
  });

  it("covers malformed scene regression fixtures with typed validation issues", async () => {
    const fixtures = await loadMalformedSceneRegressionFixtures();

    for (const fixture of fixtures) {
      const previous = fixture.previous
        ? { ...makeSceneSpec(), ...fixture.previous }
        : undefined;
      const current = {
        ...makeSceneSpec(),
        ...(fixture.name === "genuine duplicate merge" && previous
          ? previous
          : {}),
        ...fixture.current,
      };
      const issueCodes = validateSceneVisualSpec(
        current,
        undefined,
        previous
      ).map((issue) => issue.code);

      for (const expected of fixture.expectedIssueCodes ?? []) {
        expect(issueCodes, fixture.name).toContain(expected);
      }
      for (const unexpected of fixture.unexpectedIssueCodes ?? []) {
        expect(issueCodes, fixture.name).not.toContain(unexpected);
      }
    }
  });

  it("marks abstract transition beats as merge candidates in persisted visual plans", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-renderability-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
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
    const plan = makeScenePlan([
      {
        id: "scene-001",
        canonicalNarration: "Daniel opens the motel room door.",
        subject: "Daniel Mercer",
        action: "opens the motel room door",
        setting: "motel room doorway",
      },
      {
        id: "scene-002",
        canonicalNarration:
          "The discovery changed the meaning of everything that came before.",
        subject: "the discovery",
        action: "the discovery changed everything",
        setting: "cinematic documentary background",
      },
    ] as never);

    await planEpisodeImageGeneration(
      episodeDir,
      "episode-fixture",
      plan,
      settings
    );

    const visualPlan = await loadEpisodeSceneVisualPlan(episodeDir, "scene-002");
    expect(visualPlan?.renderability).toBe("requiresInference");
  });

  it("collapses near-identical exposition beats into merge-with-previous candidates", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-similarity-merge-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
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
    const plan = makeScenePlan(
      Array.from({ length: 10 }, (_, index) => {
        const sceneNumber = String(index + 1).padStart(3, "0");
        if (index >= 8) {
          return {
            id: `scene-${sceneNumber}`,
            canonicalNarration: "Daniel studies the corridor on a monitor.",
            subject: "Daniel Mercer",
            action: "studies a monitor in the dim corridor",
            setting: "warehouse hallway with concrete walls",
          };
        }
        return {
          id: `scene-${sceneNumber}`,
          canonicalNarration: `Daniel studies a different corridor detail ${index + 1}.`,
          subject: `Daniel Mercer ${index + 1}`,
          action: `studies a different corridor detail ${index + 1}`,
          setting: `warehouse hallway variant ${index + 1}`,
        };
      })
    );

    await planEpisodeImageGeneration(
      episodeDir,
      "episode-fixture",
      plan,
      settings
    );

    const visualPlan = await loadEpisodeSceneVisualPlan(episodeDir, "scene-010");
    expect(visualPlan?.renderability).toBe("mergeWithPrevious");
  });

  it("reuses the previous scene image for merge-with-previous beats", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-merge-reuse-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
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
    const plan = makeScenePlan(
      Array.from({ length: 10 }, (_, index) => {
        const sceneNumber = String(index + 1).padStart(3, "0");
        return {
          id: `scene-${sceneNumber}`,
          canonicalNarration:
            index >= 8
              ? "Daniel opens the motel room door."
              : `Daniel studies corridor detail ${index + 1}.`,
          subject: index >= 8 ? "Daniel Mercer" : `Daniel Mercer ${index + 1}`,
          action:
            index >= 8
              ? "opens the motel room door"
              : `studies corridor detail ${index + 1}`,
          setting:
            index >= 8 ? "motel room doorway" : `warehouse hallway ${index + 1}`,
          expectedImageFilenames: [
            `scene-${sceneNumber}__${String(index * 4).padStart(6, "0")}-${String(index * 4 + 4).padStart(6, "0")}__16x9.png`,
          ],
          timing: { startSeconds: index * 4, endSeconds: index * 4 + 4 },
        };
      })
    );
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];

    const result = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client: createMockClient(calls, await createImageBuffer("#446688")) }
    );

    expect(calls.length).toBeGreaterThanOrEqual(8);
    expect(result[result.length - 1]?.status).toBe("skipped");

    const sceneTenManifest = JSON.parse(
      await fs.readFile(
        path.join(
          episodeDir,
          "state",
          "image-generation",
          "manifests",
          "scene-010.json"
        ),
        "utf8"
      )
    ) as Record<string, unknown>;
    const sceneNineManifest = JSON.parse(
      await fs.readFile(
        path.join(
          episodeDir,
          "state",
          "image-generation",
          "manifests",
          "scene-009.json"
        ),
        "utf8"
      )
    ) as Record<string, unknown>;
    expect(sceneTenManifest["renderability"]).toBe("mergeWithPrevious");
    expect(sceneTenManifest["reusedFromSceneId"]).toBe("scene-009");

    const sceneOneOutput = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      "scene-009__000032-000036__16x9.png"
    );
    const sceneTwoOutput = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      "scene-010__000036-000040__16x9.png"
    );
    expect(await fs.stat(sceneOneOutput)).toBeTruthy();
    expect(await fs.stat(sceneTwoOutput)).toBeTruthy();
  });

  it("keeps reuse within the episode-level budget after validation", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-merge-budget-"));
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
    const plan = makeScenePlan(
      Array.from({ length: 12 }, (_, index) => ({
        id: `scene-${String(index + 1).padStart(3, "0")}`,
        canonicalNarration: "Daniel studies the corridor on a monitor.",
        subject: "Daniel Mercer",
        action: "studies a monitor in the dim corridor",
        setting: "warehouse hallway with concrete walls",
      }))
    );

    const result = await planEpisodeImageGeneration(
      episodeDir,
      "episode-fixture",
      plan,
      settings
    );

    const reusableCount = result.filter(
      (entry) =>
        entry.renderability === "mergeWithPrevious" ||
        entry.renderability === "mergeWithNext" ||
        entry.renderability === "skip"
    ).length;
    expect(reusableCount).toBeLessThanOrEqual(1);
    expect(
      result.filter((entry) => entry.renderability === "direct").length
    ).toBeGreaterThan(0);
  });

  it("never uses the same generated image in more than three consecutive scenes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-reuse-row-limit-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
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
    const plan = makeScenePlan(
      Array.from({ length: 30 }, (_, index) => ({
        id: `scene-${String(index + 1).padStart(3, "0")}`,
        canonicalNarration: "Daniel studies the corridor on a monitor.",
        subject: "Daniel Mercer",
        action: "studies a monitor in the dim corridor",
        setting: "warehouse hallway with concrete walls",
      }))
    );
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const colors = Array.from({ length: 40 }, (_, index) =>
      `#${(0x100000 + index).toString(16)}`
    );
    const client = createSequencedMockClient(
      calls,
      await Promise.all(colors.map((color) => createImageBuffer(color)))
    );

    await generateEpisodeImages(episodeDir, "episode-fixture", plan, settings, {
      client,
    });

    const outputHashes: string[] = [];
    for (const scene of plan.scenes) {
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(
            episodeDir,
            "state",
            "image-generation",
            "manifests",
            `${scene.id}.json`
          ),
          "utf8"
        )
      ) as Record<string, unknown>;
      outputHashes.push(String(manifest["outputSha256"] ?? ""));
    }
    let longestRun = 0;
    let currentRun = 0;
    let previousHash: string | undefined;
    for (const hash of outputHashes) {
      if (hash.length > 0 && hash === previousHash) {
        currentRun += 1;
      } else {
        currentRun = 1;
        previousHash = hash;
      }
      longestRun = Math.max(longestRun, currentRun);
    }

    expect(longestRun).toBeLessThanOrEqual(3);
    expect(calls.length).toBeGreaterThan(0);
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
    expect(currentPrompt).not.toContain(
      "EXPLICIT DIFFERENCES FROM PREVIOUS SCENE"
    );
  });

  it("repairs adjacent repetition with semantic anchors without rotating camera fields", () => {
    const previous = makeSceneSpec();
    const next = {
      ...previous,
      sceneId: "scene-002",
      narrativePurpose: "reaction",
      distinctiveAnchor: "the hallway door starts to open by itself",
    };
    const diffs = diffSpec(previous, next);
    expect(diffs.length).toBeGreaterThanOrEqual(2);
    const rewritten = repairForSemanticDifference(next, previous);
    expect(rewritten.visibleAction).toContain(
      "the hallway door starts to open by itself"
    );
    expect(rewritten.focalSubject).toContain(
      "the hallway door starts to open by itself"
    );
    expect(rewritten.shotSize).toBe(previous.shotSize);
    expect(rewritten.cameraAngle).toBe(previous.cameraAngle);
    expect(rewritten.composition).toBe(previous.composition);
  });

  it("surfaces fake differences as non-material instead of manufacturing pose or framing changes", () => {
    const previous = makeSceneSpec();
    const next = {
      ...previous,
      sceneId: "scene-002",
      distinctiveAnchor: previous.distinctiveAnchor,
    };
    const rewritten = repairForSemanticDifference(next, previous);
    const prompt = buildPromptFromSpec(rewritten, previous, makeRegistry());
    const issues = validateSceneVisualSpec(rewritten, undefined, previous);

    expect(rewritten).toEqual(next);
    expect(prompt).not.toContain("in a different pose");
    expect(prompt).not.toContain("reframed to place the subject off-center");
    expect(issues.map((issue) => issue.code)).toContain(
      "NON_MATERIAL_SCENE_DIFFERENCE"
    );
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
      providerRequest: makePreparedProviderRequest({
        scene: { ...makeSceneSpec(), characters: [] },
        prompt: "a lonely corridor",
        outputPath: path.join(dir, "text.png"),
      }),
      referenceImages: [],
    });
    await generator.generate({
      providerRequest: makePreparedProviderRequest({
        scene: makeSceneSpec(),
        prompt: buildPromptFromSpec(makeSceneSpec(), undefined, makeRegistry()),
        outputPath: path.join(dir, "ref.png"),
        referenceImages: [
          {
            characterId: "daniel-mercer",
            path: path.join(dir, "reference.png"),
            sha256: "reference-hash",
          },
        ],
      }),
      referenceImages: [
        {
          characterId: "daniel-mercer",
          filePath: path.join(dir, "reference.png"),
          mimeType: "image/png",
        },
      ],
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
    expect(
      await fs.stat(
        path.join(
          episodeDir,
          "state",
          "image-generation",
          "visual-plans",
          "scene-001.json"
        )
      )
    ).toBeTruthy();
    expect(
      await fs.stat(
        path.join(
          episodeDir,
          "shared",
          "images",
          "generated",
          "scene-001__000000-000004__16x9.png"
        )
      )
    ).toBeTruthy();
    const providerRequestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "provider-requests",
      "scene-001.json"
    );
    const providerResponsePath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "provider-responses",
      "scene-001.json"
    );
    const checkpointPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "checkpoints",
      "scene-001.json"
    );
    expect(await fs.stat(providerRequestPath)).toBeTruthy();
    expect(await fs.stat(providerResponsePath)).toBeTruthy();
    expect(await fs.stat(checkpointPath)).toBeTruthy();
    const providerRequest = JSON.parse(
      await fs.readFile(providerRequestPath, "utf8")
    ) as Record<string, unknown>;
    const providerResponse = JSON.parse(
      await fs.readFile(providerResponsePath, "utf8")
    ) as Record<string, unknown>;
    const checkpoint = JSON.parse(
      await fs.readFile(checkpointPath, "utf8")
    ) as Record<string, unknown>;
    expect(providerRequest["sceneId"]).toBe("scene-001");
    expect(providerRequest["provider"]).toBe("openai");
    expect(providerResponse["sceneId"]).toBe("scene-001");
    expect(providerResponse["provider"]).toBe("openai");
    expect(checkpoint["status"]).toBe("generated");
    expect(checkpoint["cacheDecision"]).toBe("generated");
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
    const reusedCheckpoint = JSON.parse(
      await fs.readFile(checkpointPath, "utf8")
    ) as Record<string, unknown>;
    expect(reusedCheckpoint["status"]).toBe("reused_cached_output");
    expect(reusedCheckpoint["cacheDecision"]).toBe("reused-existing");
  });

  it("persists failure artifacts when provider generation fails", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-provider-failure-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const plan = makeScenePlan([{ id: "scene-001" }] as never);
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

    const result = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      {
        client: createFailingMockClient(calls, new Error("provider offline")),
      }
    );

    expect(result[0]?.status).toBe("failed");
    expect(calls).toHaveLength(1);
    const providerRequestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "provider-requests",
      "scene-001.json"
    );
    const providerResponsePath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "provider-responses",
      "scene-001.json"
    );
    const checkpointPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "checkpoints",
      "scene-001.json"
    );
    const failurePath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "failures",
      "scene-001.json"
    );
    expect(await fs.stat(providerRequestPath)).toBeTruthy();
    await expect(fs.stat(providerResponsePath)).rejects.toThrow();
    const checkpoint = JSON.parse(
      await fs.readFile(checkpointPath, "utf8")
    ) as Record<string, unknown>;
    const failure = JSON.parse(
      await fs.readFile(failurePath, "utf8")
    ) as Record<string, unknown>;
    expect(checkpoint["status"]).toBe("provider_failed");
    expect(checkpoint["cacheDecision"]).toBe("provider-failed");
    expect(failure["stage"]).toBe("provider");
    expect(failure["category"]).toBe("provider-transient-error");
    expect(failure["retryable"]).toBe(true);
  });

  it("bounds independent scene generation with the configured concurrency", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-concurrency-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const plan = makeScenePlan([
      {
        id: "scene-001",
        canonicalNarration: "A motel hallway lamp flickers over an empty corridor.",
        subject: "An empty motel hallway",
        action: "a hallway lamp flickers over the carpet",
        setting: "motel corridor",
      },
      {
        id: "scene-002",
        canonicalNarration: "Rainwater slides down the motel window beside the door.",
        subject: "A motel window",
        action: "rainwater slides down the glass",
        setting: "motel room window",
      },
      {
        id: "scene-003",
        canonicalNarration: "A bedside recorder glows red in the dark room.",
        subject: "A bedside recorder",
        action: "the recorder glows red in the dark",
        setting: "dark motel room",
      },
    ] as never);
    const settings = loadEpisodeImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1536x1024",
      OPENAI_IMAGE_QUALITY: "medium",
      OPENAI_IMAGE_CONCURRENCY: "2",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000",
      OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES: "true",
    });
    const planned = await planEpisodeImageGeneration(
      episodeDir,
      "episode-fixture",
      plan,
      settings
    );
    const colors = ["#112233", "#223344", "#334455"];
    const b64ByPrompt = Object.fromEntries(
      await Promise.all(
        planned.map(async (entry, index) => [
          entry.prompt,
          await createImageBuffer(colors[index] ?? "#112233"),
        ])
      )
    );
    const delaysByPrompt = Object.fromEntries(
      planned.map((entry, index) => [entry.prompt, 40 + index * 10])
    );
    const calls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const counters = { active: 0, maxActive: 0 };

    const result = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      {
        client: createConcurrentPromptMockClient({
          calls,
          delaysByPrompt,
          b64ByPrompt,
          counters,
        }),
      }
    );

    expect(result.map((entry) => entry.status)).toEqual([
      "generated",
      "generated",
      "generated",
    ]);
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.method === "generate")).toBe(true);
    expect(counters.maxActive).toBe(2);
  });

  it("continues unrelated concurrent scenes after one provider failure and resumes only the failed scene", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-concurrency-failure-"));
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
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const plan = makeScenePlan([
      {
        id: "scene-001",
        canonicalNarration: "A motel hallway lamp flickers over an empty corridor.",
        subject: "An empty motel hallway",
        action: "a hallway lamp flickers over the carpet",
        setting: "motel corridor",
      },
      {
        id: "scene-002",
        canonicalNarration: "Rainwater slides down the motel window beside the door.",
        subject: "A motel window",
        action: "rainwater slides down the glass",
        setting: "motel room window",
      },
      {
        id: "scene-003",
        canonicalNarration: "A bedside recorder glows red in the dark room.",
        subject: "A bedside recorder",
        action: "the recorder glows red in the dark",
        setting: "dark motel room",
      },
    ] as never);
    const settings = loadEpisodeImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1536x1024",
      OPENAI_IMAGE_QUALITY: "medium",
      OPENAI_IMAGE_CONCURRENCY: "2",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000",
      OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES: "true",
    });
    const planned = await planEpisodeImageGeneration(
      episodeDir,
      "episode-fixture",
      plan,
      settings
    );
    const failurePrompt = planned[1]?.prompt;
    expect(failurePrompt).toBeTruthy();
    const colors = ["#445566", "#556677", "#667788"];
    const b64ByPrompt = Object.fromEntries(
      await Promise.all(
        planned.map(async (entry, index) => [
          entry.prompt,
          await createImageBuffer(colors[index] ?? "#445566"),
        ])
      )
    );
    const delaysByPrompt = Object.fromEntries(
      planned.map((entry, index) => [entry.prompt, 20 + index * 10])
    );
    const firstCalls: Array<{ method: "generate" | "edit"; body: unknown }> = [];

    const first = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      {
        client: createConcurrentPromptMockClient({
          calls: firstCalls,
          delaysByPrompt,
          b64ByPrompt,
          failingPrompts: new Set([failurePrompt!]),
          counters: { active: 0, maxActive: 0 },
        }),
      }
    );

    expect(first.map((entry) => entry.status)).toEqual([
      "generated",
      "failed",
      "generated",
    ]);

    const secondCalls: Array<{ method: "generate" | "edit"; body: unknown }> = [];
    const resumed = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      {
        client: createConcurrentPromptMockClient({
          calls: secondCalls,
          delaysByPrompt,
          b64ByPrompt,
          counters: { active: 0, maxActive: 0 },
        }),
      }
    );

    expect(resumed.map((entry) => entry.status)).toEqual([
      "skipped",
      "generated",
      "skipped",
    ]);
    expect(secondCalls).toHaveLength(1);
  });

  it("hydrates the canonical shared image path from a legacy state image", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-legacy-image-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(path.join(episodeDir, "state", "image-generation", "images"), {
      recursive: true,
    });
    const referencePath = path.join(dir, "daniel-reference.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#223344" },
      })
        .png()
        .toBuffer()
    );
    await upsertCharacterRegistry(
      episodeDir,
      "episode-fixture",
      makeRegistry("approved", referencePath).characters
    );
    const plan = makeScenePlan([{ id: "scene-001" }] as never);
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
    const legacyOutputPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "images",
      "scene-001.png"
    );
    await fs.writeFile(
      legacyOutputPath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#112233" },
      })
        .png()
        .toBuffer()
    );
    await fs.mkdir(path.join(episodeDir, "state", "image-generation", "manifests"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(
        episodeDir,
        "state",
        "image-generation",
        "manifests",
        "scene-001.json"
      ),
      `${JSON.stringify(
        {
          sceneId: "scene-001",
          promptVersion: 1,
          sceneHash: "stale",
          finalPrompt: "legacy prompt",
          promptHash: "stale",
          materialDifferencesFromPrevious: [],
          characterIds: ["daniel-mercer"],
          referenceImages: [],
          model: "gpt-image-2",
          size: "1536x1024",
          quality: "medium",
          outputPath: legacyOutputPath,
          outputSha256: "legacy",
          status: "generated",
          attempts: 1,
        },
        null,
        2
      )}\n`
    );

    const result = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client: createMockClient([], await createImageBuffer("#112233")) }
    );

    expect(result[0]?.status).toBe("generated");
    expect(
      await fs.stat(
        path.join(
          episodeDir,
          "shared",
          "images",
          "generated",
          "scene-001__000000-000004__16x9.png"
        )
      )
    ).toBeTruthy();
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
      value.providerRequestHash = "stale-provider-request-hash";
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

  it("keeps diagnostic manifest edits reusable but regenerates provider request changes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-provider-request-hash-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const referencePath = path.join(dir, "daniel-reference.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#7788aa" },
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
    const highQualitySettings = loadEpisodeImageGenerationSettings({
      OPENAI_API_KEY: "test-key",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_SIZE: "1536x1024",
      OPENAI_IMAGE_QUALITY: "high",
      OPENAI_IMAGE_CONCURRENCY: "1",
      OPENAI_IMAGE_MAX_RETRIES: "0",
      OPENAI_IMAGE_TIMEOUT_MS: "1000",
      OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES: "true",
    });
    const b64 = await createImageBuffer("#7788aa");
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
    let promptHash = "";
    let providerRequestHash = "";
    await mutateManifest(manifestPath, (value) => {
      promptHash = String(value.promptHash);
      providerRequestHash = String(value.providerRequestHash);
      value.generatedAt = "diagnostic-only timestamp edit";
      value.validationIssueCodes = ["NON_VISUAL_AUDIO_REFERENCE"];
    });

    const reused = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      settings,
      { client }
    );
    expect(reused[0]?.status).toBe("skipped");
    expect(calls).toHaveLength(0);

    const regenerated = await generateEpisodeImages(
      episodeDir,
      "episode-fixture",
      plan,
      highQualitySettings,
      { client }
    );
    expect(regenerated[0]?.status).toBe("generated");
    expect(calls).toHaveLength(1);
    const updated = JSON.parse(
      await fs.readFile(manifestPath, "utf8")
    ) as Record<string, unknown>;
    expect(updated["promptHash"]).toBe(promptHash);
    expect(updated["providerRequestHash"]).not.toBe(providerRequestHash);
  });

  it("regenerates a scene when the visual plan hash changes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-visual-plan-hash-"));
    const episodeDir = path.join(dir, "episode");
    await fs.mkdir(episodeDir, { recursive: true });
    const referencePath = path.join(dir, "daniel-reference.png");
    await fs.writeFile(
      referencePath,
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#778899" },
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
    const b64 = await createImageBuffer("#778899");
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
      value.visualPlanHash = "stale-visual-plan-hash";
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
