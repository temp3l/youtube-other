import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  buildEpisodeLoadResult,
  createApprovalRecord,
} from "@mediaforge/dark-truth";
import { authoredScriptResolverVersion, hashFile } from "@mediaforge/shared";
import type {
  CharacterRegistry,
  EpisodeImagePipelineSettings,
} from "@mediaforge/image-generation";

const imageGenerationMocks = vi.hoisted(() => ({
  generateEpisodeImageReferencesMock: vi.fn(),
  approveEpisodeCharacterMock: vi.fn(),
  loadEpisodeImageGenerationSettingsMock: vi.fn(),
}));
const imagesResumeMocks = vi.hoisted(() => ({
  commandImagesResumeMock: vi.fn(),
}));

vi.mock("@mediaforge/image-generation", async () => {
  const actual = await vi.importActual<typeof import("@mediaforge/image-generation")>(
    "@mediaforge/image-generation"
  );
  return {
    ...actual,
    resolveVideoImageSpec:
      "resolveVideoImageSpec" in actual
        ? actual.resolveVideoImageSpec
        : (videoKind: "full" | "short") => ({
            videoKind,
            width: videoKind === "short" ? 1080 : 1920,
            height: videoKind === "short" ? 1920 : 1080,
            aspectRatio: videoKind === "short" ? "9:16" : "16:9",
          }),
    assertVideoImageFilesMatchSpec:
      "assertVideoImageFilesMatchSpec" in actual
        ? actual.assertVideoImageFilesMatchSpec
        : vi.fn(async () => undefined),
    generateEpisodeImageReferences:
      imageGenerationMocks.generateEpisodeImageReferencesMock,
    approveEpisodeCharacter: imageGenerationMocks.approveEpisodeCharacterMock,
    loadEpisodeImageGenerationSettings:
      imageGenerationMocks.loadEpisodeImageGenerationSettingsMock,
  };
});

vi.mock("./images-resume-command.js", () => ({
  commandImagesResume: imagesResumeMocks.commandImagesResumeMock,
}));

const {
  commandEpisodeBootstrapCharacters,
  commandEpisodeValidate,
  commandEpisodeLocalized,
  commandEpisodeShort,
  resolveEpisodeLanguageSource,
  resolveVisualRetentionOptions,
  registerEpisodeCommands,
} = await import("./episode-commands.js");

const sourceRoot = path.resolve(
  "content-ideas/content/dark-truth-episodes-multilingual-production-pack"
);
const episodeSlug = "001-the-forbidden-village-where-japan-s-laws-do-not-apply";
const englishFullSource = path.join(
  sourceRoot,
  episodeSlug,
  "en",
  `${episodeSlug}-en-full.md`
);
const germanFullSource = path.join(
  sourceRoot,
  episodeSlug,
  "de",
  `${episodeSlug}-de-full.md`
);

async function approveCurrentManifest(
  outputRoot: string,
  sourceFile: string,
  language: "en" | "de" | "es" | "fr"
): Promise<string> {
  const result = await buildEpisodeLoadResult(sourceFile, outputRoot);
  const manifestHash = await hashFile(result.paths.generationManifestJson);
  await createApprovalRecord(
    path.join(outputRoot, episodeSlug, "reviews", language, "full"),
    {
      episodeId: episodeSlug,
      language,
      artifactType: "full",
      artifactPath: result.paths.generationManifestJson,
      artifactSha256: manifestHash,
      generationManifestSha256: manifestHash,
      sourceSha256: result.source.sourceSha256,
      reviewer: "steph",
      reviewedAt: new Date().toISOString(),
      decision: "approved",
    }
  );
  return result.paths.generationManifestJson;
}

async function mutateManifest(manifestPath: string): Promise<void> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  raw.generatedAt = new Date(Date.now() + 1000).toISOString();
  await fs.writeFile(manifestPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
}

type ValidationLanguage = "en" | "de";
type ValidationVariant = "full" | "short";

async function runEpisodeValidate(options: Parameters<typeof commandEpisodeValidate>[0]): Promise<{
  readonly output: string;
  readonly payload: {
    readonly status: string;
    readonly valid: boolean;
    readonly dryRun?: unknown;
    readonly results: readonly {
      readonly state: "valid" | "invalid";
      readonly validationCode: string;
      readonly artifactType: string;
    }[];
  };
  readonly exitCode: string | number | undefined;
}> {
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await commandEpisodeValidate(options);
    const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    return {
      output,
      payload: JSON.parse(output) as {
        readonly status: string;
        readonly valid: boolean;
        readonly dryRun?: unknown;
        readonly results: readonly {
          readonly state: "valid" | "invalid";
          readonly validationCode: string;
          readonly artifactType: string;
        }[];
      },
      exitCode: process.exitCode,
    };
  } finally {
    writeSpy.mockRestore();
    process.exitCode = previousExitCode;
  }
}

function validationCodeSet(payload: Awaited<ReturnType<typeof runEpisodeValidate>>["payload"]): Set<string> {
  return new Set(payload.results.map((result) => result.validationCode));
}

async function createValidationFixture(options: {
  readonly language?: ValidationLanguage;
  readonly variant?: ValidationVariant;
  readonly manifestLanguage?: ValidationLanguage;
  readonly manifestVariant?: ValidationVariant;
  readonly staleGenerationSource?: boolean;
  readonly staleShotSource?: boolean;
  readonly legacyFallback?: boolean;
  readonly summaryPathEscape?: boolean;
  readonly shotPathEscape?: boolean;
  readonly includeGenerationManifest?: boolean;
  readonly includeVisualRetention?: boolean;
} = {}): Promise<{
  readonly outputRoot: string;
  readonly episodeId: string;
  readonly language: ValidationLanguage;
  readonly variant: ValidationVariant;
  readonly generationManifestPath: string;
  readonly summaryManifestPath: string;
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "episode-validation-"));
  const outputRoot = path.join(tempDir, "episodes");
  const episodeId = "001-validation-fixture";
  const language = options.language ?? "en";
  const variant = options.variant ?? "full";
  const languageDir = path.join(
    outputRoot,
    episodeId,
    "languages",
    ...(variant === "short" ? ["short"] : [])
  );
  const scriptPath = path.join(languageDir, `script-${language}.md`);
  await fs.mkdir(languageDir, { recursive: true });
  await fs.writeFile(
    scriptPath,
    [
      "# Episode 001 - Validation Fixture",
      "",
      "## Anweisungen zur Audiogenerierung",
      "",
      "- Quiet narration.",
      "",
      "# Sprechtext",
      "",
      "This fixture exists only for read-only validation tests.",
      "",
    ].join("\n"),
    "utf8"
  );
  if (options.legacyFallback) {
    await fs.writeFile(
      path.join(outputRoot, episodeId, "script.md"),
      "legacy script",
      "utf8"
    );
  }
  const contentHash = await hashFile(scriptPath);
  const canonicalRelativePath =
    variant === "short"
      ? `episodes/${episodeId}/languages/short/script-${language}.md`
      : `episodes/${episodeId}/languages/script-${language}.md`;
  const cacheIdentity = `${authoredScriptResolverVersion}:${episodeId}:${language}:${variant}:${canonicalRelativePath}:${contentHash}`;
  const source = {
    episodeId,
    language,
    variant,
    absolutePath: scriptPath,
    canonicalRelativePath,
    contentHash,
    resolverVersion: authoredScriptResolverVersion,
    cacheIdentity,
  };
  const manifestLanguage = options.manifestLanguage ?? language;
  const manifestVariant = options.manifestVariant ?? variant;
  const generationManifestPath = path.join(
    outputRoot,
    episodeId,
    language,
    variant,
    "generation-manifest.json"
  );
  const summaryManifestPath = path.join(
    outputRoot,
    episodeId,
    "manifests",
    `${language}-${variant}.json`
  );
  await fs.mkdir(path.dirname(summaryManifestPath), { recursive: true });
  await fs.writeFile(
    summaryManifestPath,
    `${JSON.stringify(
      {
        episodeSlug: episodeId,
        language,
        artifactType: variant,
        currentArtifactPath: options.summaryPathEscape
          ? path.join(tempDir, "outside-generation-manifest.json")
          : generationManifestPath,
        source,
        updatedAt: "2026-07-03T00:00:00.000Z",
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  if (options.includeGenerationManifest !== false) {
    const visualDir = path.join(outputRoot, episodeId, "state", "visual-retention");
    const imagePath = path.join(
      outputRoot,
      episodeId,
      "shared",
      "images",
      "generated",
      "scene-001.png"
    );
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(imagePath, "present", "utf8");
    await fs.mkdir(visualDir, { recursive: true });
    const sourceScenesPath = path.join(visualDir, "source-scenes.json");
    const focalMetadataPath = path.join(visualDir, "focal-metadata.json");
    const shotPlanPath = path.join(visualDir, `shot-plan.${variant}.${language}.json`);
    const validationPath = path.join(visualDir, `validation.${variant}.${language}.json`);
    const artifactDir = path.join(outputRoot, episodeId, language, variant);
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.writeFile(
      path.join(artifactDir, "scenes.json"),
      `${JSON.stringify(
        {
          sourceId: episodeId,
          scenes: [
            {
              id: "scene-001",
              sequenceNumber: 1,
              canonicalNarration: "This fixture exists only for read-only validation tests.",
              sourceSegmentIds: ["scene-001"],
              estimatedDurationSeconds: 4,
              timing: { startSeconds: 0, endSeconds: 4 },
              visualPurpose: "fixture",
              textRequirement: { required: false },
              subject: "fixture",
              action: "validates",
              setting: "workspace",
              composition: "centered",
              cameraFraming: "medium shot",
              mood: "quiet",
              continuityReferences: [],
              onScreenText: "",
              negativeConstraints: [],
              aspectRatios: [variant === "short" ? "9:16" : "16:9"],
              imagePrompt: "A neutral validation fixture.",
              expectedImageFilenames: ["scene-001.png"],
              qualityStatus: "draft",
            },
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(artifactDir, "visual-plan.json"),
      `${JSON.stringify(
        {
          episodeId,
          language,
          artifactType: variant,
          generatedAt: "2026-07-03T00:00:00.000Z",
          scenes: [
            {
              sceneId: "scene-001",
              sequenceNumber: 1,
              startSeconds: 0,
              endSeconds: 4,
              narration: "This fixture exists only for read-only validation tests.",
              visualPurpose: "fixture",
              aspectRatios: [variant === "short" ? "9:16" : "16:9"],
              expectedImageFilenames: ["scene-001.png"],
            },
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(
        outputRoot,
        episodeId,
        "shared",
        variant === "short" ? "shorts-image-manifest.json" : "image-manifest.json"
      ),
      `${JSON.stringify(
        [
          {
            sceneId: "scene-001",
            sourcePath: "shared/images/generated/scene-001.png",
            width: 1920,
            height: 1080,
            mimeType: "image/png",
            checksumSha256: "a".repeat(64),
            validated: true,
          },
        ],
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.writeFile(sourceScenesPath, "[]\n", "utf8");
    await fs.writeFile(focalMetadataPath, "[]\n", "utf8");
    const shotSource = {
      resolverVersion: authoredScriptResolverVersion,
      episodeId,
      language,
      variant,
      relativePath: canonicalRelativePath,
      contentHash: options.staleShotSource ? "b".repeat(64) : contentHash,
      cacheIdentity: options.staleShotSource ? "changed" : cacheIdentity,
    };
    const sourceImagePath = options.shotPathEscape
      ? "../outside.png"
      : "shared/images/generated/scene-001.png";
    await fs.writeFile(
      shotPlanPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sourceId: episodeId,
          locale: language,
          variant,
          aspectRatio: variant === "short" ? "9:16" : "16:9",
          sourceIdentity: shotSource,
          sourceScenes: [
            {
              sourceSceneId: "source-scene-001",
              sceneId: "scene-001",
              narrationStartMs: 0,
              narrationEndMs: 4000,
              sourceImageId: "source-image-001",
              sourceImagePath,
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
              sourceImageId: "source-image-001",
              startMs: 0,
              endMs: 4000,
              treatment: {
                family: "framing",
                catalogVersion: "test",
                treatmentId: "medium-crop",
                variant: "medium-crop",
              },
              crop: { x: 0, y: 0, width: 1, height: 1 },
              overlays: [],
              transition: { kind: "hard-cut", durationMs: 0 },
            },
          ],
          pacingProfile: {
            mode: "inline",
            profile: {
              id: "balanced",
              shotDurationMs: { minMs: 2000, maxMs: 5000 },
              staticShotDurationMs: { minMs: 2000, maxMs: 5000 },
              movingShotDurationMs: { minMs: 2000, maxMs: 5000 },
              openingCadenceMs: { minMs: 1000, maxMs: 3000 },
              climaxCadenceMs: { minMs: 1000, maxMs: 3000 },
            },
          },
          visualBudget: {
            sourceImageCount: { min: 1, max: 3 },
            shotCount: { min: 1, max: 3 },
            shotsPerImage: { min: 1, max: 3 },
            maxConsecutiveSourceImageUses: 3,
            maxTotalSourceImageUses: 3,
            cropLimits: {
              minCropArea: 0.1,
              minFaceMargin: 0.05,
              maxCropZoom: 4,
              minOutputHeightPx: 720,
              maxAdjacentSameImageCropIou: 0.9,
            },
            motionLimits: {
              minShotDurationMs: 1000,
              pushInScaleRange: { min: 1, max: 1.2 },
              fastPushInScaleRange: { min: 1, max: 1.4 },
              panTravelFractionOfImage: { min: 0.01, max: 0.3 },
              rotationDegreesRange: { min: -2, max: 2 },
              dissolveDurationMs: { minMs: 0, maxMs: 500 },
              dipToBlackDurationMs: { minMs: 0, maxMs: 500 },
            },
            effectCaps: [],
          },
          planningSeed: "seed",
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.writeFile(
      validationPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          validationCode: "VALID",
          valid: true,
          issues: [],
          metrics: {},
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await fs.mkdir(path.dirname(generationManifestPath), { recursive: true });
    await fs.writeFile(
      generationManifestPath,
      `${JSON.stringify(
        {
          episodeId,
          language: manifestLanguage,
          artifactType: manifestVariant,
          sourceSha256: contentHash,
          source: {
            ...source,
            contentHash: options.staleGenerationSource ? "c".repeat(64) : contentHash,
            cacheIdentity: options.staleGenerationSource ? "changed" : cacheIdentity,
          },
          ...(options.includeVisualRetention === false
            ? {}
            : {
                visualRetention: {
                  sourceScenesPath,
                  focalMetadataPath,
                  shotPlanPath,
                  validationPath,
                },
              }),
          generatedAt: "2026-07-03T00:00:00.000Z",
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
  return {
    outputRoot,
    episodeId,
    language,
    variant,
    generationManifestPath,
    summaryManifestPath,
  };
}

describe("episode commands", () => {
  it("defaults visual retention to enabled unless explicitly disabled", () => {
    expect(resolveVisualRetentionOptions({})).toEqual({
      enabled: true,
      mode: "preview",
    });
    expect(resolveVisualRetentionOptions({ visualRetention: false })).toEqual({
      enabled: false,
      mode: "disabled",
    });
    expect(
      resolveVisualRetentionOptions({
        visualRetentionMode: "preview",
        visualProfile: "balanced",
        motionPreset: "strong",
        strictShotValidation: true,
      })
    ).toEqual({
      enabled: true,
      mode: "preview",
      profile: "balanced",
      motionPreset: "strong",
      strictValidation: true,
    });
  });

  it("forwards a subcommand language option when the root command also defines language", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "episode-cli-language-"));
    const outputRoot = path.join(tempDir, "episodes");
    const episodeDir = path.join(outputRoot, "001-test-episode");
    await fs.mkdir(path.join(episodeDir, "languages"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "languages", "script-de.md"),
      [
        "# Episode 001 - Testfolge",
        "",
        "## Anweisungen zur Audiogenerierung",
        "",
        "- Ruhig erzaehlen.",
        "",
        "# Sprechtext",
        "",
        "Dies ist ein deutscher Testtext mit genug Inhalt fuer die lokale Trockenlaufpruefung.",
        "",
        "---",
        "",
        "## Episoden-Metadaten",
        "",
        "Episode: 001",
        "Primary title: Testfolge",
        "Hashtags: #Test",
        "Format: 16:9, 1920 x 1080",
        "",
      ].join("\n"),
      "utf8"
    );
    const program = new Command();
    program.exitOverride();
    program.option("--language <code>", "root language option");
    registerEpisodeCommands(program);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let output = "";
    try {
      await program.parseAsync([
        "node",
        "mediaforge",
        "episode",
        "dry-run",
        "--episode",
        "001",
        "--source",
        outputRoot,
        "--output-root",
        outputRoot,
        "--language",
        "de",
        "--artifact",
        "full",
      ]);
      output = String(writeSpy.mock.calls[0]?.[0]);
    } finally {
      writeSpy.mockRestore();
    }

    const payload = JSON.parse(output) as {
      readonly language: string;
      readonly sourceFile: string;
      readonly source: {
        readonly episodeId: string;
        readonly language: string;
        readonly variant: string;
        readonly absolutePath: string;
        readonly canonicalRelativePath: string;
        readonly contentHash: string;
        readonly resolverVersion: string;
        readonly cacheIdentity: string;
      };
    };
    expect(payload.language).toBe("de");
    expect(payload.sourceFile).toBe(path.join(episodeDir, "languages", "script-de.md"));
    expect(payload.source).toMatchObject({
      episodeId: "001-test-episode",
      language: "de",
      variant: "full",
      absolutePath: payload.sourceFile,
      canonicalRelativePath: "episodes/001-test-episode/languages/script-de.md",
      resolverVersion: authoredScriptResolverVersion,
    });
    expect(payload.source.cacheIdentity).toBe(
      `${authoredScriptResolverVersion}:001-test-episode:de:full:episodes/001-test-episode/languages/script-de.md:${payload.source.contentHash}`
    );
  });

  it("bootstraps shared character references into the workspace and optionally approves them", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const registry: CharacterRegistry = {
      episodeId: "002-even-killers-can-lick",
      updatedAt: "2026-06-25T00:00:00.000Z",
      characters: [
        {
          id: "main-protagonist",
          name: "Main Protagonist",
        } as unknown as CharacterRegistry["characters"][number],
        {
          id: "supporting-character",
          name: "Supporting Character",
        } as unknown as CharacterRegistry["characters"][number],
      ],
    };
    imageGenerationMocks.generateEpisodeImageReferencesMock.mockResolvedValueOnce(
      registry
    );
    imageGenerationMocks.approveEpisodeCharacterMock.mockResolvedValue({
      ...registry,
      characters: registry.characters.map((character) => ({
        ...character,
        referenceStatus: "approved",
      })),
    });
    imageGenerationMocks.loadEpisodeImageGenerationSettingsMock.mockReturnValue({
      apiKey: "test",
      model: "gpt-image-2",
      size: "1536x1024",
      resolvedSize: "1536x1024",
      quality: "medium",
      concurrency: 1,
      maxRetries: 2,
      timeoutMs: 180000,
      allowUnapprovedCharacterReferences: false,
      force: false,
    } as EpisodeImagePipelineSettings);

    await expect(
      commandEpisodeBootstrapCharacters({
        episode: "002",
        source: sourceRoot,
        outputRoot,
        approve: true,
        json: true,
      })
    ).resolves.toBeUndefined();

    expect(
      imageGenerationMocks.loadEpisodeImageGenerationSettingsMock
    ).toHaveBeenCalledTimes(1);
    expect(
      imageGenerationMocks.generateEpisodeImageReferencesMock
    ).toHaveBeenCalledWith(
      path.join(outputRoot, "002-even-killers-can-lick"),
      "002-even-killers-can-lick",
      expect.objectContaining({ force: false })
    );
    expect(imageGenerationMocks.approveEpisodeCharacterMock).toHaveBeenCalledTimes(
      2
    );
    expect(
      await fs.readFile(
        path.join(
          outputRoot,
          "002-even-killers-can-lick",
          "shared",
          "characters.json"
        ),
        "utf8"
      )
    ).toContain("002-even-killers-can-lick");
  });

  it("synthesizes a shared character registry when the source pack omits characters.json", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    imageGenerationMocks.generateEpisodeImageReferencesMock.mockImplementation(
      async (episodeDir: string) =>
        JSON.parse(
          await fs.readFile(
            path.join(episodeDir, "shared", "characters.json"),
            "utf8"
          )
        ) as CharacterRegistry
    );
    imageGenerationMocks.approveEpisodeCharacterMock.mockImplementation(
      async (episodeDir: string, episodeId: string, characterId: string) => {
        const registry = JSON.parse(
          await fs.readFile(
            path.join(episodeDir, "shared", "characters.json"),
            "utf8"
          )
        ) as CharacterRegistry;
        return {
          ...registry,
          episodeId,
          characters: registry.characters.map((character) =>
            character.id === characterId
              ? { ...character, referenceStatus: "approved" }
              : character
          ),
        };
      }
    );
    imageGenerationMocks.loadEpisodeImageGenerationSettingsMock.mockReturnValue({
      apiKey: "test",
      model: "gpt-image-2",
      size: "1536x1024",
      resolvedSize: "1536x1024",
      quality: "medium",
      concurrency: 1,
      maxRetries: 2,
      timeoutMs: 180000,
      allowUnapprovedCharacterReferences: false,
      force: false,
    } as EpisodeImagePipelineSettings);

    await expect(
      commandEpisodeBootstrapCharacters({
        episode: "011",
        source: sourceRoot,
        outputRoot,
        approve: true,
        json: true,
      })
    ).resolves.toBeUndefined();

    const registryPath = path.join(
      outputRoot,
      "011-the-black-eyed-children",
      "shared",
      "characters.json"
    );
    const registry = JSON.parse(
      await fs.readFile(registryPath, "utf8")
    ) as CharacterRegistry;
    expect(registry.characters.length).toBeGreaterThan(0);
    expect(
      registry.characters.some((character) => /Noah Price/u.test(character.name))
    ).toBe(true);
    expect(
      registry.characters.some((character) =>
        /black[- ]eyed children/u.test(character.name)
      )
    ).toBe(true);
  });

  it("registers an episode alias for resuming image generation", () => {
    const program = new Command();
    registerEpisodeCommands(program);
    const episode = program.commands.find((command) => command.name() === "episode");
    expect(episode?.alias()).toBe("episodes");
    const resumeImages = episode?.commands.find((command) => command.name() === "resume-images");
    expect(resumeImages).toBeDefined();
    const flags = resumeImages?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode <number-or-slug>");
    expect(flags).toContain("--source <path>");
    expect(flags).toContain("--output-root <path>");
    expect(flags).toContain("--concurrency <number>");
    expect(flags).toContain("--allow-unapproved-character-references");
  });

  it("forwards episode alias options to the shared image resume implementation", async () => {
    imagesResumeMocks.commandImagesResumeMock.mockResolvedValueOnce(undefined);
    const program = new Command();
    registerEpisodeCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "episodes",
      "resume-images",
      "--episode",
      "011-the-black-eyed-children",
      "--source",
      "content-ideas/content/dark-truth-episodes-optimized",
      "--output-root",
      "episodes",
      "--concurrency",
      "2",
      "--allow-unapproved-character-references",
      "--force",
      "--json",
      "--verbose",
    ]);

    expect(imagesResumeMocks.commandImagesResumeMock).toHaveBeenCalledTimes(1);
    expect(imagesResumeMocks.commandImagesResumeMock.mock.calls[0]?.[0]).toMatchObject({
      episode: "011-the-black-eyed-children",
      source: "content-ideas/content/dark-truth-episodes-optimized",
      concurrency: 2,
      allowUnapprovedCharacterReferences: true,
      force: true,
      json: true,
      verbose: true,
      workspace: "episodes",
    });
  });

  it("smokes the documented singular resume-images command path", async () => {
    imagesResumeMocks.commandImagesResumeMock.mockReset();
    imagesResumeMocks.commandImagesResumeMock.mockResolvedValueOnce(undefined);
    const program = new Command();
    registerEpisodeCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "episode",
      "resume-images",
      "--episode",
      "011-the-black-eyed-children",
      "--source",
      "content-ideas/content/dark-truth-episodes-optimized",
      "--output-root",
      "episodes",
      "--concurrency",
      "2",
    ]);

    expect(imagesResumeMocks.commandImagesResumeMock).toHaveBeenCalledTimes(1);
    expect(imagesResumeMocks.commandImagesResumeMock.mock.calls[0]?.[0]).toMatchObject({
      episode: "011-the-black-eyed-children",
      source: "content-ideas/content/dark-truth-episodes-optimized",
      concurrency: 2,
      workspace: "episodes",
    });
  });

  it("rejects unsupported language codes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await approveCurrentManifest(outputRoot, englishFullSource, "en");
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de,xx",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Unsupported language code: xx");
  });

  it("rejects stale English approvals before localized generation", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const manifestPath = await approveCurrentManifest(
      outputRoot,
      englishFullSource,
      "en"
    );
    await mutateManifest(manifestPath);
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Approval is stale");
  });

  it("rejects disabling image reuse", async () => {
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot: path.join(
          await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-")),
          "episodes"
        ),
        languages: "de,es,fr",
        reuseImages: false,
        dryRun: true,
      })
    ).rejects.toThrow("--reuse-images");
  });

  it("blocks localized generation before English approval", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de,es,fr",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Missing approval");
    expect(await fs.stat(outputRoot).catch(() => null)).toBeNull();
  });

  it("allows localized generation after current English approval and keeps images untouched in dry-run mode", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await approveCurrentManifest(outputRoot, englishFullSource, "en");
    const canonicalGermanScript = path.join(
      outputRoot,
      episodeSlug,
      "languages",
      "script-de.md"
    );
    await fs.mkdir(path.dirname(canonicalGermanScript), { recursive: true });
    await fs.copyFile(germanFullSource, canonicalGermanScript);

    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).resolves.toBeUndefined();
    expect(
      await fs
        .stat(
          path.join(
            outputRoot,
            episodeSlug,
            "shared",
            "images",
            "image-manifest.json"
          )
        )
        .catch(() => null)
    ).toBeNull();
  });

  it("allows English-only localized generation without an approval record", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const episodeDir = path.join(outputRoot, episodeSlug);
    await fs.mkdir(path.join(episodeDir, "languages"), { recursive: true });
    await fs.copyFile(
      path.join("episodes", "011-the-black-eyed-children", "script.md"),
      path.join(episodeDir, "languages", "script-en.md")
    );

    await expect(
      commandEpisodeLocalized({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        languages: "en",
        reuseImages: true,
        dryRun: true,
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a stale workspace root script for English full localization", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const episodeDir = path.join(outputRoot, episodeSlug);
    const workspaceScript = path.join(episodeDir, "script.md");
    const packSource = englishFullSource;
    await fs.mkdir(path.dirname(workspaceScript), { recursive: true });
    await fs.writeFile(workspaceScript, "Workspace narration", "utf8");
    await expect(
      resolveEpisodeLanguageSource(
        outputRoot,
        {
          episodeId: episodeSlug,
          episodeNumber: "011",
          slug: episodeSlug,
          sourceDir: path.dirname(path.dirname(packSource)),
          candidates: [
            {
              language: "en",
              artifactType: "full",
              filePath: packSource,
              status: "present",
            },
          ],
        } as unknown as Parameters<typeof resolveEpisodeLanguageSource>[1],
        "en",
        "full"
      )
    ).rejects.toMatchObject({ code: "STALE_LAYOUT" });
  });

  it("prefers the canonical authored script resolver source when available", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const canonicalScript = path.join(
      outputRoot,
      episodeSlug,
      "languages",
      "script-en.md"
    );
    await fs.mkdir(path.dirname(canonicalScript), { recursive: true });
    await fs.writeFile(canonicalScript, "Canonical narration", "utf8");
    const result = await resolveEpisodeLanguageSource(
      outputRoot,
      {
        episodeId: episodeSlug,
        episodeNumber: "011",
        slug: episodeSlug,
        sourceDir: path.dirname(path.dirname(englishFullSource)),
        candidates: [
          {
            language: "en",
            artifactType: "full",
            filePath: englishFullSource,
            status: "present",
          },
        ],
      } as unknown as Parameters<typeof resolveEpisodeLanguageSource>[1],
      "en",
      "full"
    );

    expect(result.sourceFile).toBe(canonicalScript);
    expect(result.absolutePath).toBe(canonicalScript);
    expect(result.canonicalRelativePath).toBe(
      `episodes/${episodeSlug}/languages/script-en.md`
    );
    expect(result.contentHash).toBe(await hashFile(canonicalScript));
    expect(result.resolverVersion).toBe(authoredScriptResolverVersion);
    expect(result.cacheIdentity).toBe(
      `${authoredScriptResolverVersion}:${episodeSlug}:en:full:episodes/${episodeSlug}/languages/script-en.md:${result.contentHash}`
    );
    expect(result.identity).toMatchObject({
      episodeId: episodeSlug,
      language: "en",
      variant: "full",
      relativePath: `episodes/${episodeSlug}/languages/script-en.md`,
      contentHash: result.contentHash,
      resolverVersion: authoredScriptResolverVersion,
    });
  });

  it("surfaces stale authored script resolver errors", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await fs.mkdir(path.join(outputRoot, episodeSlug, "languages"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(outputRoot, episodeSlug, "languages", "script-en.md"),
      "same narration",
      "utf8"
    );
    await fs.mkdir(path.join(outputRoot, episodeSlug, "en", "full"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(outputRoot, episodeSlug, "en", "full", "script.md"),
      "same narration",
      "utf8"
    );

    await expect(
      resolveEpisodeLanguageSource(
        outputRoot,
        {
          episodeId: episodeSlug,
          episodeNumber: "011",
          slug: episodeSlug,
          sourceDir: path.dirname(path.dirname(englishFullSource)),
          candidates: [
            {
              language: "en",
              artifactType: "full",
              filePath: englishFullSource,
              status: "present",
            },
          ],
        } as unknown as Parameters<typeof resolveEpisodeLanguageSource>[1],
        "en",
        "full"
      )
    ).rejects.toMatchObject({ code: "STALE_LAYOUT" });
  });

  it("fails when English full localization is missing the canonical authored script", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await expect(
      resolveEpisodeLanguageSource(
        outputRoot,
        {
          episodeId: episodeSlug,
          episodeNumber: "011",
          slug: episodeSlug,
          sourceDir: path.dirname(path.dirname(englishFullSource)),
          candidates: [
            {
              language: "en",
              artifactType: "full",
              filePath: englishFullSource,
              status: "present",
            },
          ],
        } as unknown as Parameters<typeof resolveEpisodeLanguageSource>[1],
        "en",
        "full"
      )
    ).rejects.toMatchObject({ code: "MISSING_SCRIPT" });
  });

  it("requires German approval before the German Short", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await expect(
      commandEpisodeShort({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        language: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Missing approval");
  });

  it("allows the German Short after German approval in dry-run mode without new images", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    await approveCurrentManifest(outputRoot, germanFullSource, "de");
    const canonicalGermanShortScript = path.join(
      outputRoot,
      episodeSlug,
      "languages",
      "short",
      "script-de.md"
    );
    await fs.mkdir(path.dirname(canonicalGermanShortScript), { recursive: true });
    await fs.copyFile(germanFullSource, canonicalGermanShortScript);

    await expect(
      commandEpisodeShort({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        language: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).resolves.toBeUndefined();
    expect(
      await fs
        .stat(
          path.join(
            outputRoot,
            episodeSlug,
            "shared",
            "images",
            "image-manifest.json"
          )
        )
        .catch(() => null)
    ).toBeNull();
  });

  it("rejects stale German approvals before the German Short", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dark-truth-cli-"));
    const outputRoot = path.join(tempDir, "episodes");
    const manifestPath = await approveCurrentManifest(
      outputRoot,
      germanFullSource,
      "de"
    );
    await mutateManifest(manifestPath);
    await expect(
      commandEpisodeShort({
        episode: "001",
        source: sourceRoot,
        outputRoot,
        language: "de",
        reuseImages: true,
        dryRun: true,
      })
    ).rejects.toThrow("Approval is stale");
  });

  it("validates existing episode artifacts without dry-run semantics", async () => {
    const fixture = await createValidationFixture();
    const result = await runEpisodeValidate({
      episode: fixture.episodeId,
      source: fixture.outputRoot,
      outputRoot: fixture.outputRoot,
      language: fixture.language,
      artifact: fixture.variant,
      json: true,
    });

    expect(result.payload.valid).toBe(true);
    expect(result.payload.status).toBe("valid");
    expect(result.payload.dryRun).toBeUndefined();
    expect(result.output).not.toContain("dryRun");
    expect(result.exitCode).toBeUndefined();
    expect(validationCodeSet(result.payload)).toEqual(new Set(["VALID"]));
  });

  it("reports a missing generation manifest as invalid and sets exit code 1", async () => {
    const fixture = await createValidationFixture({
      includeGenerationManifest: false,
    });
    const result = await runEpisodeValidate({
      episode: fixture.episodeId,
      source: fixture.outputRoot,
      outputRoot: fixture.outputRoot,
      language: fixture.language,
      artifact: fixture.variant,
    });

    expect(result.payload.valid).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(validationCodeSet(result.payload)).toContain("MISSING_ARTIFACT");
    await expect(fs.stat(fixture.generationManifestPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports stale generation source identity", async () => {
    const fixture = await createValidationFixture({
      staleGenerationSource: true,
    });
    const result = await runEpisodeValidate({
      episode: fixture.episodeId,
      source: fixture.outputRoot,
      outputRoot: fixture.outputRoot,
      language: fixture.language,
      artifact: fixture.variant,
    });

    expect(result.payload.valid).toBe(false);
    expect(validationCodeSet(result.payload)).toContain("STALE_SOURCE_IDENTITY");
  });

  it("reports wrong language and wrong variant in existing artifacts", async () => {
    const wrongLanguage = await createValidationFixture({
      manifestLanguage: "de",
    });
    const languageResult = await runEpisodeValidate({
      episode: wrongLanguage.episodeId,
      source: wrongLanguage.outputRoot,
      outputRoot: wrongLanguage.outputRoot,
      language: wrongLanguage.language,
      artifact: wrongLanguage.variant,
    });
    expect(languageResult.payload.valid).toBe(false);
    expect(validationCodeSet(languageResult.payload)).toContain("WRONG_LANGUAGE");

    const wrongVariant = await createValidationFixture({
      manifestVariant: "short",
    });
    const variantResult = await runEpisodeValidate({
      episode: wrongVariant.episodeId,
      source: wrongVariant.outputRoot,
      outputRoot: wrongVariant.outputRoot,
      language: wrongVariant.language,
      artifact: wrongVariant.variant,
    });
    expect(variantResult.payload.valid).toBe(false);
    expect(validationCodeSet(variantResult.payload)).toContain("WRONG_VARIANT");
  });

  it("reports legacy authored script fallback attempts", async () => {
    const fixture = await createValidationFixture({
      legacyFallback: true,
    });
    const result = await runEpisodeValidate({
      episode: fixture.episodeId,
      source: fixture.outputRoot,
      outputRoot: fixture.outputRoot,
      language: fixture.language,
      artifact: fixture.variant,
    });

    expect(result.payload.valid).toBe(false);
    expect(validationCodeSet(result.payload)).toContain("LEGACY_FALLBACK_ATTEMPT");
  });

  it("reports root path escapes from manifests and shot plans", async () => {
    const summaryEscape = await createValidationFixture({
      summaryPathEscape: true,
    });
    const summaryResult = await runEpisodeValidate({
      episode: summaryEscape.episodeId,
      source: summaryEscape.outputRoot,
      outputRoot: summaryEscape.outputRoot,
      language: summaryEscape.language,
      artifact: summaryEscape.variant,
    });
    expect(summaryResult.payload.valid).toBe(false);
    expect(validationCodeSet(summaryResult.payload)).toContain("PATH_ESCAPE");

    const shotEscape = await createValidationFixture({
      shotPathEscape: true,
    });
    const shotResult = await runEpisodeValidate({
      episode: shotEscape.episodeId,
      source: shotEscape.outputRoot,
      outputRoot: shotEscape.outputRoot,
      language: shotEscape.language,
      artifact: shotEscape.variant,
    });
    expect(shotResult.payload.valid).toBe(false);
    expect(validationCodeSet(shotResult.payload)).toContain("PATH_ESCAPE");
  });
});
