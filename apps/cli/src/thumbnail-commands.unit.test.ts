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
  beforeEach(() => {
    workspaceDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-thumbnail-cli-"));
    thumbnailMocks.generateStoryThumbnail.mockReset();
    thumbnailMocks.readThumbnailStoryFile.mockReset();
    thumbnailMocks.readThumbnailStoryFile.mockResolvedValue({
      title: "Hachishakusama",
      summary: "A woman hears her name called before the threat closes in.",
      protagonistDescription: "an adult woman frozen in fear",
      threatDescription: "a towering supernatural woman in the distance",
      settingDescription: "a narrow village road at night",
    });
  });

  it("registers the thumbnails generate command with the expected flags", () => {
    const program = new Command();
    registerThumbnailCommands(program);
    const thumbnails = program.commands.find((command) => command.name() === "thumbnails");
    const generate = thumbnails?.commands.find((command) => command.name() === "generate");
    expect(generate).toBeDefined();
    const flags = generate?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode <slug>");
    expect(flags).toContain("--locale <locale>");
    expect(flags).toContain("--format <full|short>");
    expect(flags).toContain("--story-file <path>");
    expect(flags).toContain("--dry-run");
  });

  it("parses full and short formats and preserves dry-run behavior", async () => {
    thumbnailMocks.generateStoryThumbnail.mockResolvedValue({
      episodeSlug: "014-hachishakusama-the-eight-foot-woman",
      locale: "en",
      format: "short",
      outputPath: path.join(workspaceDir, "014-hachishakusama-the-eight-foot-woman", "locales", "en", "short", "thumbnails", "thumbnail.png"),
      manifestPath: path.join(workspaceDir, "014-hachishakusama-the-eight-foot-woman", "locales", "en", "short", "thumbnails", "thumbnail.manifest.json"),
      model: "gpt-image-2",
      quality: "high",
      textStrategy: "post-rendered",
      width: 864,
      height: 1536,
      promptVersion: "horror-thumbnail-v1",
      promptFingerprint: "p".repeat(64),
      sourceFingerprint: "s".repeat(64),
      hookText: "SHE CALLED HER NAME",
      emphasisWord: "CALLED",
      dryRun: true,
      reused: false,
      generated: false,
    });
    const program = new Command();
    registerThumbnailCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "thumbnails",
      "generate",
      "--episode",
      "014-hachishakusama-the-eight-foot-woman",
      "--locale",
      "en",
      "--format",
      "short",
      "--hook-text",
      "She called her name",
      "--story-file",
      path.join(workspaceDir, "story.json"),
      "--dry-run",
    ]);

    expect(thumbnailMocks.readThumbnailStoryFile).toHaveBeenCalledTimes(1);
    expect(thumbnailMocks.generateStoryThumbnail).toHaveBeenCalledTimes(1);
    expect(thumbnailMocks.generateStoryThumbnail.mock.calls[0]?.[0]).toMatchObject({
      workspaceRoot: workspaceDir,
      episodeSlug: "014-hachishakusama-the-eight-foot-woman",
      locale: "en",
      format: "short",
      hookText: "She called her name",
      dryRun: true,
    });
  });

  it("reports the output path on success", async () => {
    const outputPath = path.join(
      workspaceDir,
      "014-hachishakusama-the-eight-foot-woman",
      "locales",
      "de",
      "full",
      "thumbnails",
      "thumbnail.png"
    );
    thumbnailMocks.generateStoryThumbnail.mockResolvedValue({
      episodeSlug: "014-hachishakusama-the-eight-foot-woman",
      locale: "de",
      format: "full",
      outputPath,
      manifestPath: `${outputPath}.manifest.json`,
      model: "gpt-image-2",
      quality: "high",
      textStrategy: "post-rendered",
      width: 1536,
      height: 864,
      promptVersion: "horror-thumbnail-v1",
      promptFingerprint: "p".repeat(64),
      sourceFingerprint: "s".repeat(64),
      hookText: "SIE RIEF IHREN NAMEN",
      emphasisWord: "RIEF",
      dryRun: false,
      reused: false,
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
      await program.parseAsync([
        "node",
        "cli",
        "thumbnails",
        "generate",
        "--episode",
        "014-hachishakusama-the-eight-foot-woman",
        "--locale",
        "de",
        "--format",
        "full",
        "--hook-text",
        "Sie rief ihren Namen",
        "--story-file",
        path.join(workspaceDir, "story.json"),
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
        "--episode",
        "014-hachishakusama-the-eight-foot-woman",
        "--locale",
        "en",
        "--format",
        "full",
        "--hook-text",
        "She called her name",
        "--story-file",
        path.join(workspaceDir, "story.json"),
      ])
    ).rejects.toThrow(/generation failed/i);
  });
});
