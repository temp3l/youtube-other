import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

let workspaceDir = "";
const thumbnailMocks = vi.hoisted(() => ({
  generateStoryThumbnail: vi.fn(),
  readThumbnailStoryFile: vi.fn(),
}));

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir,
  })),
}));

vi.mock("@mediaforge/image-generation", async () => {
  const actual = await vi.importActual<typeof import("@mediaforge/image-generation")>(
    "@mediaforge/image-generation"
  );
  return {
    ...actual,
    generateStoryThumbnail: thumbnailMocks.generateStoryThumbnail,
    readThumbnailStoryFile: thumbnailMocks.readThumbnailStoryFile,
  };
});

const { registerThumbnailCommands } = await import("./thumbnail-commands.js");

describe("thumbnail commands", () => {
  beforeEach(async () => {
    workspaceDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-thumbnail-cli-"));
    thumbnailMocks.generateStoryThumbnail.mockReset();
    thumbnailMocks.readThumbnailStoryFile.mockReset();
    thumbnailMocks.readThumbnailStoryFile.mockResolvedValue({
      episodeNumber: 18,
      storyTitle: "The Smiling Man",
      storySummary: "A woman hears someone following her home.",
      protagonistDescription: "an adult woman frozen in fear",
      threatDescription: "a smiling man in the darkness",
      settingDescription: "an empty street at night",
      moodDescription: "dread",
      keyVisualMoment: "she realizes the smiling man is still behind her",
    });
    await fs.mkdir(path.join(workspaceDir, "018-the-smiling-man", "story-production"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(workspaceDir, "018-the-smiling-man", "story-production", "thumbnail-story.json"),
      "{}"
    );
    await fs.mkdir(
      path.join(
        workspaceDir,
        "018-the-smiling-man",
        "locales",
        "en",
        "short",
        "metadata"
      ),
      { recursive: true }
    );
    await fs.writeFile(
      path.join(
        workspaceDir,
        "018-the-smiling-man",
        "locales",
        "en",
        "short",
        "metadata",
        "youtube-metadata.json"
      ),
      JSON.stringify({
        thumbnail: { recommendedText: "HE KEPT SMILING" },
      })
    );
  });

  it("registers the thumbnails generate command with the expected flags", () => {
    const program = new Command();
    registerThumbnailCommands(program);
    const thumbnails = program.commands.find((command) => command.name() === "thumbnails");
    const generate = thumbnails?.commands.find((command) => command.name() === "generate");
    expect(generate).toBeDefined();
    const flags = generate?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode-slug <slug>");
    expect(flags).toContain("--locale <locale>");
    expect(flags).toContain("--format <full|short>");
    expect(flags).toContain("--style <cinematic-horror|editorial-card>");
    expect(flags).toContain("--dry-run");
  });

  it("defaults to cinematic-horror and resolves hook text from metadata when omitted", async () => {
    thumbnailMocks.generateStoryThumbnail.mockResolvedValue({
      episodeSlug: "018-the-smiling-man",
      locale: "en",
      format: "short",
      style: "cinematic-horror",
      outputPath: path.join(workspaceDir, "018-the-smiling-man", "thumbnails", "short", "en.png"),
      manifestPath: path.join(workspaceDir, "018-the-smiling-man", "thumbnails", "manifests", "short-en.json"),
      backgroundPath: path.join(workspaceDir, "018-the-smiling-man", "thumbnails", "backgrounds", "short-en.png"),
      backgroundManifestPath: path.join(workspaceDir, "018-the-smiling-man", "thumbnails", "manifests", "background-short-en.json"),
      model: "gpt-image-2",
      quality: "high",
      width: 1080,
      height: 1920,
      generationSize: "1024x1536",
      promptVersion: "cinematic-horror-reference-v2",
      promptFingerprint: "p".repeat(64),
      sourceFingerprint: "s".repeat(64),
      backgroundFingerprint: "b".repeat(64),
      compositionFingerprint: "c".repeat(64),
      hookText: "HE KEPT SMILING",
      emphasisWord: "KEPT",
      referencePath: "reference-thumbnails/thumbnail-short.png",
      referenceSha256: "r".repeat(64),
      dryRun: true,
      reused: false,
      backgroundReused: false,
      compositionReused: false,
      generated: false,
    });
    const program = new Command();
    registerThumbnailCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "thumbnails",
      "generate",
      "--episode-slug",
      "018-the-smiling-man",
      "--locale",
      "en",
      "--format",
      "short",
      "--dry-run",
    ]);

    expect(thumbnailMocks.readThumbnailStoryFile).toHaveBeenCalledTimes(1);
    expect(thumbnailMocks.generateStoryThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: workspaceDir,
        episodeSlug: "018-the-smiling-man",
        locale: "en",
        format: "short",
        style: undefined,
        hookText: "HE KEPT SMILING",
        dryRun: true,
      })
    );
  });

  it("reports the output path on success", async () => {
    const outputPath = path.join(
      workspaceDir,
      "018-the-smiling-man",
      "thumbnails",
      "full",
      "de.png"
    );
    thumbnailMocks.generateStoryThumbnail.mockResolvedValue({
      episodeSlug: "018-the-smiling-man",
      locale: "de",
      format: "full",
      style: "editorial-card",
      outputPath,
      manifestPath: `${outputPath}.manifest.json`,
      backgroundPath: path.join(workspaceDir, "018-the-smiling-man", "thumbnails", "backgrounds", "full-de.png"),
      backgroundManifestPath: path.join(workspaceDir, "018-the-smiling-man", "thumbnails", "manifests", "background-full-de.json"),
      model: "gpt-image-2",
      quality: "high",
      width: 1920,
      height: 1080,
      generationSize: "1536x1024",
      promptVersion: "cinematic-horror-reference-v2",
      promptFingerprint: "p".repeat(64),
      sourceFingerprint: "s".repeat(64),
      backgroundFingerprint: "b".repeat(64),
      compositionFingerprint: "c".repeat(64),
      hookText: "ER FOLGTE IHR NACH HAUSE",
      emphasisWord: "FOLGTE",
      referencePath: "reference-thumbnails/thumbnail-full.png",
      referenceSha256: "r".repeat(64),
      dryRun: false,
      reused: false,
      backgroundReused: false,
      compositionReused: false,
      generated: true,
    });
    const writes: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });
    try {
      const program = new Command();
      registerThumbnailCommands(program);
      await fs.mkdir(
        path.join(
          workspaceDir,
          "018-the-smiling-man",
          "locales",
          "de",
          "full",
          "metadata"
        ),
        { recursive: true }
      );
      await fs.writeFile(
        path.join(
          workspaceDir,
          "018-the-smiling-man",
          "locales",
          "de",
          "full",
          "metadata",
          "youtube-metadata.json"
        ),
        JSON.stringify({
          thumbnail: { recommendedText: "ER FOLGTE IHR NACH HAUSE" },
        })
      );
      await program.parseAsync([
        "node",
        "cli",
        "thumbnails",
        "generate",
        "--episode-slug",
        "018-the-smiling-man",
        "--locale",
        "de",
        "--format",
        "full",
        "--style",
        "editorial-card",
      ]);
    } finally {
      stdoutSpy.mockRestore();
    }
    expect(writes.join("")).toContain(path.resolve(outputPath));
  });

  it("surfaces generation failures as non-zero parse failures", async () => {
    thumbnailMocks.generateStoryThumbnail.mockRejectedValueOnce(
      new Error("generation failed")
    );
    const program = new Command();
    registerThumbnailCommands(program);
    await expect(
      program.parseAsync([
        "node",
        "cli",
        "thumbnails",
        "generate",
        "--episode-slug",
        "018-the-smiling-man",
        "--locale",
        "en",
        "--format",
        "short",
      ])
    ).rejects.toThrow(/generation failed/i);
  });
});
