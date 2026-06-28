import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { mkdtempSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";

let workspaceDir = "";

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir,
  })),
}));

const {
  loadOrBootstrapEpisodeManifest,
  registerImagesResumeCommand,
} = await import("./images-resume-command.js");

function makeScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "011-the-black-eyed-children",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "Two children stood outside the door.",
        sourceSegmentIds: ["scene-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "establish",
        textRequirement: { required: false },
        subject: "two children",
        action: "stand outside the door",
        setting: "a frozen motel hallway",
        composition: "wide shot with the door centered",
        cameraFraming: "wide",
        mood: "tense",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: ["no watermark"],
        aspectRatios: ["16:9"],
        imagePrompt: "placeholder",
        expectedImageFilenames: [
          "scene-001__000000-000004__16x9.png",
        ],
        qualityStatus: "draft",
      },
    ],
  });
}

describe("images resume command", () => {
  beforeEach(() => {
    workspaceDir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-images-resume-"));
  });

  it("registers the resume command with concurrency and bootstrap options", () => {
    const program = new Command();
    const images = program.command("images");
    registerImagesResumeCommand(images);

    const resume = images.commands.find((command) => command.name() === "resume");
    expect(resume).toBeDefined();
    const flags = resume?.options.map((option) => option.flags) ?? [];
    expect(flags).toContain("--episode <episode-id>");
    expect(flags).toContain("--source <path>");
    expect(flags).toContain("--concurrency <number>");
    expect(flags).toContain("--allow-unapproved-character-references");
  });

  it("bootstraps a missing episode manifest from the local episode folder", async () => {
    const episodeDir = path.join(workspaceDir, "011-the-black-eyed-children");
    await fs.mkdir(path.join(episodeDir, "source"), { recursive: true });
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "source", "011-the-black-eyed-children-en-full.md"),
      "# Episode 011\n\n## Audio Generation Instructions\n\n- Keep the tone restrained.\n\n# Narration Script\n\nTwo children stood outside the door."
    );
    await fs.writeFile(
      path.join(episodeDir, "shared", "scenes.json"),
      `${JSON.stringify(makeScenePlan(), null, 2)}\n`
    );

    const result = await loadOrBootstrapEpisodeManifest({
      episode: "011-the-black-eyed-children",
    });

    expect(result.created).toBe(true);
    expect(result.manifestPath).toBe(
      path.join(episodeDir, "manifest.json")
    );
    expect(result.manifest.scenePlan?.sourceId).toBe(
      "011-the-black-eyed-children"
    );
    expect(await fs.stat(result.manifestPath)).toBeTruthy();

    const second = await loadOrBootstrapEpisodeManifest({
      episode: "011-the-black-eyed-children",
    });

    expect(second.created).toBe(false);
    expect(second.manifest.scenePlan?.scenes).toHaveLength(1);
  });

  it("documents the canonical singular episode resume command example", async () => {
    const docsPath = path.resolve("docs/cli.md");
    const docs = await fs.readFile(docsPath, "utf8");

    expect(docs).toContain("node apps/cli/dist/index.js episode resume-images");
    expect(docs).not.toContain(
      "node apps/cli/dist/index.js episodes resume-images"
    );
    expect(docs).toContain(
      "npm run mediaforge -- episode resume-images --episode <episode-id> --concurrency 2"
    );
  });
});
