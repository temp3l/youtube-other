import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scenePlanSchema, visualSourceSceneSchema } from "@mediaforge/domain";
import { hashFile } from "@mediaforge/shared";

const configMocks = vi.hoisted(() => ({
  loadRuntimeConfigMock: vi.fn(),
  loadEpisodeConfigMock: vi.fn(),
}));

vi.mock("@mediaforge/config", async () => {
  const actual =
    await vi.importActual<typeof import("@mediaforge/config")>(
      "@mediaforge/config"
    );
  return {
    ...actual,
    loadRuntimeConfig: configMocks.loadRuntimeConfigMock,
    loadEpisodeConfig: configMocks.loadEpisodeConfigMock,
  };
});

vi.mock("@mediaforge/visual-planning", async () => {
  const actual =
    await vi.importActual<typeof import("@mediaforge/visual-planning")>(
      "@mediaforge/visual-planning"
    );
  const migration = await import(
    "../../../packages/visual-planning/src/legacy-shot-plan.js"
  );
  return {
    ...actual,
    migrateLegacyEpisodeShots: migration.migrateLegacyEpisodeShots,
  };
});

const {
  planShotsCommand,
  previewShotsCommand,
  registerShotsCommands,
  migrateShotsCommand,
  validateShotsCommand,
} = await import("./shots.js");

afterEach(() => {
  configMocks.loadRuntimeConfigMock.mockReset();
  configMocks.loadEpisodeConfigMock.mockReset();
});

async function setupWorkspace() {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "shots-cli-"));
  const episodeId = "episode-fixture";
  const episodeDir = path.join(workspaceDir, episodeId);
  await fs.mkdir(path.join(episodeDir, "state", "visual-retention"), {
    recursive: true,
  });
  await fs.mkdir(path.join(episodeDir, "canonical"), { recursive: true });
  await fs.mkdir(path.join(episodeDir, "shared", "images", "generated"), {
    recursive: true,
  });
  const imagePath = path.join(
    episodeDir,
    "shared",
    "images",
    "generated",
    "scene-001.png"
  );
  await sharp({
    create: {
      width: 720,
      height: 1280,
      channels: 3,
      background: { r: 100, g: 80, b: 60 },
    },
  })
    .png()
    .toFile(imagePath);

  const sourceScenes = [
    visualSourceSceneSchema.parse({
      sourceSceneId: "source-scene-001",
      sceneId: "scene-001",
      narrationStartMs: 0,
      narrationEndMs: 1500,
      sourceImageId: "image-001",
      sourceImagePath: "shared/images/generated/scene-001.png",
      sourceImageSha256: "a".repeat(64),
      importance: "hook",
      focalRegions: [],
    }),
  ];
  await fs.writeFile(
    path.join(episodeDir, "state", "visual-retention", "source-scenes.json"),
    `${JSON.stringify(sourceScenes, null, 2)}\n`,
    "utf8"
  );
  const scenePlan = scenePlanSchema.parse({
    sourceId: episodeId,
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "A hallway waits.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 1.5,
        timing: { startSeconds: 0, endSeconds: 1.5 },
        visualPurpose: "hook",
        subject: "hallway",
        action: "shown",
        setting: "dark house",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["9:16"],
        imagePrompt: "hallway",
        expectedImageFilenames: ["scene-001.png"],
        qualityStatus: "draft",
      },
    ],
  });
  await fs.writeFile(
    path.join(episodeDir, "canonical", "scenes.json"),
    `${JSON.stringify(scenePlan, null, 2)}\n`,
    "utf8"
  );

  const runtimeConfig = {
    workspaceDir,
    visualRetention: {
      pacingProfiles: {
        atmospheric: {
          id: "atmospheric",
          shotDurationMs: { minMs: 2000, maxMs: 12000 },
          staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
          movingShotDurationMs: { minMs: 2000, maxMs: 12000 },
          openingCadenceMs: { minMs: 3000, maxMs: 6000 },
          climaxCadenceMs: { minMs: 2000, maxMs: 5000 },
        },
        balanced: {
          id: "balanced",
          shotDurationMs: { minMs: 2000, maxMs: 8000 },
          staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
          movingShotDurationMs: { minMs: 2000, maxMs: 10000 },
          openingCadenceMs: { minMs: 3000, maxMs: 6000 },
          climaxCadenceMs: { minMs: 2000, maxMs: 5000 },
        },
        "high-retention": {
          id: "high-retention",
          shotDurationMs: { minMs: 1500, maxMs: 6000 },
          staticShotDurationMs: { minMs: 1500, maxMs: 4000 },
          movingShotDurationMs: { minMs: 1500, maxMs: 8000 },
          openingCadenceMs: { minMs: 1500, maxMs: 4000 },
          climaxCadenceMs: { minMs: 1500, maxMs: 3500 },
        },
        "shorts-aggressive": {
          id: "shorts-aggressive",
          shotDurationMs: { minMs: 1000, maxMs: 5000 },
          staticShotDurationMs: { minMs: 1000, maxMs: 3000 },
          movingShotDurationMs: { minMs: 1000, maxMs: 6000 },
          openingCadenceMs: { minMs: 1500, maxMs: 3500 },
          climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
        },
      },
      defaults: {
        short: [
          {
            id: "short-45-60",
            pacingProfileId: "shorts-aggressive",
            narrationDurationMs: { minMs: 45000, maxMs: 60000 },
            budget: {
              sourceImageCount: { min: 1, max: 5 },
              shotCount: { min: 1, max: 5 },
              shotsPerImage: { min: 1, max: 3 },
              maxConsecutiveSourceImageUses: 3,
              maxTotalSourceImageUses: 5,
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
          },
        ],
        full: [],
      },
    },
  };
  configMocks.loadRuntimeConfigMock.mockResolvedValue(runtimeConfig);
  configMocks.loadEpisodeConfigMock.mockResolvedValue(null);

  return { episodeDir };
}

async function setupLegacyWorkspace() {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "shots-migrate-"));
  const episodeId = "legacy-fixture";
  const episodeDir = path.join(workspaceDir, episodeId);
  await fs.mkdir(path.join(episodeDir, "canonical"), { recursive: true });
  const scenes = [0, 1, 2].map((index) => {
    const sceneNumber = index + 1;
    const sceneId = `scene-${String(sceneNumber).padStart(3, "0")}`;
    return {
      id: sceneId,
      sequenceNumber: sceneNumber,
      canonicalNarration: `Legacy scene ${sceneNumber}.`,
      sourceSegmentIds: [`segment-${String(sceneNumber).padStart(3, "0")}`],
      estimatedDurationSeconds: 6,
      timing: { startSeconds: index * 6, endSeconds: index * 6 + 6 },
      visualPurpose: "migration",
      textRequirement: { required: false },
      subject: "subject",
      action: "shown",
      setting: "room",
      composition: "centered",
      cameraFraming: "medium",
      mood: "tense",
      aspectRatios: ["9:16"],
      imagePrompt: "legacy",
      expectedImageFilenames: [`${sceneId}.png`],
      qualityStatus: "approved",
    };
  });
  await fs.writeFile(
    path.join(episodeDir, "canonical", "scenes.json"),
    `${JSON.stringify(scenePlanSchema.parse({ sourceId: episodeId, scenes }), null, 2)}\n`,
    "utf8"
  );
  for (const scene of scenes) {
    const imagePath = path.join(
      episodeDir,
      "shared",
      "images",
      "generated",
      `${scene.id}.png`
    );
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await sharp({
      create: {
        width: 1600,
        height: 1600,
        channels: 3,
        background: { r: 80, g: 90, b: 100 },
      },
    })
      .png()
      .toFile(imagePath);
    const manifestPath = path.join(
      episodeDir,
      "state",
      "image-generation",
      "manifests",
      `${scene.id}.json`
    );
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({ sceneId: scene.id, outputPath: imagePath, outputSha256: await hashFile(imagePath) }, null, 2)}\n`,
      "utf8"
    );
  }
  await setupWorkspace();
  const previousRuntimeConfig = (await configMocks.loadRuntimeConfigMock()) as {
    readonly visualRetention: unknown;
  };
  configMocks.loadRuntimeConfigMock.mockResolvedValue({
    workspaceDir,
    visualRetention: previousRuntimeConfig.visualRetention,
  });
  configMocks.loadEpisodeConfigMock.mockResolvedValue(null);
  return { episodeDir };
}

describe("shot commands", () => {
  it("registers plan, inspect, validate, preview, and migrate commands", () => {
    const program = new Command();
    registerShotsCommands(program);
    const shots = program.commands.find(
      (command) => command.name() === "shots"
    );
    expect(shots?.commands.map((command) => command.name())).toEqual([
      "plan",
      "inspect",
      "validate",
      "preview",
      "migrate",
    ]);
  });

  it("dry-runs legacy shot migration through the CLI command API", async () => {
    const { episodeDir } = await setupLegacyWorkspace();
    const result = await migrateShotsCommand({
      episode: "legacy-fixture",
      variant: "short",
      locale: "en",
      dryRun: true,
    });

    expect(result.status).toBe("migrated");
    expect(result.sourceFormat).toBe("canonical-scene-plan-image-manifests");
    expect(result.validation.valid).toBe(true);
    expect(result.artifactsWritten).toContain(
      path.join(episodeDir, "state", "visual-retention", "shot-plan.short.en.json")
    );
    await expect(
      fs.access(path.join(episodeDir, "state", "visual-retention"))
    ).rejects.toThrow();
  });

  it("plans to the resolver-owned path and reuses a stable plan", async () => {
    const { episodeDir } = await setupWorkspace();
    const options = {
      episode: "episode-fixture",
      variant: "short",
      locale: "en",
      format: "json" as const,
    };
    const created = await planShotsCommand(options);
    const reused = await planShotsCommand(options);

    expect(created.planPath).toBe(
      path.join(
        episodeDir,
        "state",
        "visual-retention",
        "shot-plan.short.en.json"
      )
    );
    expect(created.status).toBe("created");
    expect(reused.status).toBe("reused");
  });

  it("persists validation results to the resolver-owned path", async () => {
    const { episodeDir } = await setupWorkspace();
    await planShotsCommand({
      episode: "episode-fixture",
      variant: "short",
      locale: "en",
      format: "json",
    });
    const result = await validateShotsCommand({
      episode: "episode-fixture",
      variant: "short",
      locale: "en",
      format: "json",
    });

    expect(result.reportPath).toBe(
      path.join(
        episodeDir,
        "state",
        "visual-retention",
        "validation.short.en.json"
      )
    );
    expect(result.status).toBe("created");
    expect(typeof result.valid).toBe("boolean");
  });

  it("writes storyboard and contact sheet to resolver-owned paths", async () => {
    const { episodeDir } = await setupWorkspace();
    await planShotsCommand({
      episode: "episode-fixture",
      variant: "short",
      locale: "en",
      format: "json",
    });
    const result = await previewShotsCommand({
      episode: "episode-fixture",
      variant: "short",
      locale: "en",
      format: "json",
    });

    expect(result.storyboard.path).toBe(
      path.join(
        episodeDir,
        "state",
        "visual-retention",
        "storyboard.short.en.html"
      )
    );
    expect(result.contactSheet.path).toBe(
      path.join(
        episodeDir,
        "state",
        "visual-retention",
        "contact-sheet.short.en.png"
      )
    );
    expect(await fs.readFile(result.storyboard.path, "utf8")).toContain(
      "episode-fixture storyboard"
    );
    expect(
      (await fs.readFile(result.contactSheet.path)).subarray(1, 4).toString()
    ).toBe("PNG");
  });
});
