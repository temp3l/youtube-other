import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  buildEpisodeLoadResult,
  createApprovalRecord,
} from "@mediaforge/dark-truth";
import { hashFile } from "@mediaforge/shared";
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
  commandEpisodeLocalized,
  commandEpisodeShort,
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

describe("episode commands", () => {
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
});
