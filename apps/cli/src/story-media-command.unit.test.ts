import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { runCommandMock } = vi.hoisted(() => ({
  runCommandMock: vi.fn(),
}));

vi.mock("@mediaforge/process-runner", () => ({
  runCommand: runCommandMock,
}));

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: path.join(os.tmpdir(), "story-media-workspace", "episodes"),
  })),
}));

import {
  buildPlannedStoryWorkflowManifest,
  StoryWorkflowManifestStore,
} from "@mediaforge/story-localization";
import {
  commandStoriesAudioGenerate,
  commandStoriesAudioValidate,
} from "./story-audio-command.js";
import { commandStoriesImagesGenerate } from "./story-images-command.js";

function makeOutput() {
  let text = "";
  return {
    stdout: {
      write(chunk: string) {
        text += chunk;
        return true;
      },
    },
    read() {
      return text;
    },
  };
}

describe("story media wrappers", () => {
  it("delegates ready audio targets to the staged narration CLI", async () => {
    runCommandMock.mockReset();
    runCommandMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        generatedAt: "2026-07-10T00:00:00.000Z",
        strictMode: false,
        summary: {
          success: 1,
          warning: 0,
          blocked: 0,
          failed: 0,
          total: 1,
        },
        exitCode: 0,
        targets: [],
      }),
      stderr: "",
      exitCode: 0,
    });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-audio-wrapper-"));
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "028-the-man-in-the-attic",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-10T00:00:00.000Z",
      dryRun: true,
    });
    await new StoryWorkflowManifestStore(root, manifest.episodeId).create({
      ...manifest,
      stages: manifest.stages.map((stage) => {
        if (
          stage.stageType === "rewrite-full" ||
          stage.stageType === "validate-full" ||
          stage.stageType === "quality-full"
        ) {
          return { ...stage, status: "succeeded" as const };
        }
        return stage;
      }),
    });

    const output = makeOutput();
    await commandStoriesAudioGenerate(
      {
        episode: manifest.episodeId,
        outputRoot: root,
        onlyReady: true,
        json: true,
      },
      output
    );

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const [, args] = runCommandMock.mock.calls[0] ?? [];
    expect(args).toEqual(
      expect.arrayContaining([
        "--json",
        "--workspace",
        root,
        "audio",
        "narration",
        "validate",
        "--episode",
        manifest.episodeId,
        "--language",
        "en",
        "--variant",
        "full",
        "--resume",
      ])
    );
    const payload = JSON.parse(output.read()) as {
      readonly summary: { readonly executed: number };
    };
    expect(payload.summary.executed).toBe(1);
  });

  it("validates completed audio targets through the staged narration CLI", async () => {
    runCommandMock.mockReset();
    runCommandMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        generatedAt: "2026-07-10T00:00:00.000Z",
        strictMode: false,
        summary: {
          success: 1,
          warning: 0,
          blocked: 0,
          failed: 0,
          total: 1,
        },
        exitCode: 0,
        targets: [],
      }),
      stderr: "",
      exitCode: 0,
    });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-audio-validate-"));
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "031-the-faceless-tall-man",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-10T00:00:00.000Z",
      dryRun: true,
    });
    await new StoryWorkflowManifestStore(root, manifest.episodeId).create({
      ...manifest,
      stages: manifest.stages.map((stage) =>
        stage.stageType === "audio"
          ? { ...stage, status: "succeeded" as const }
          : stage
      ),
    });

    const output = makeOutput();
    await commandStoriesAudioValidate(
      {
        episode: manifest.episodeId,
        outputRoot: root,
        json: true,
      },
      output
    );

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const [, args] = runCommandMock.mock.calls[0] ?? [];
    expect(args).toEqual(
      expect.arrayContaining([
        "--json",
        "--workspace",
        root,
        "audio",
        "narration",
        "validate",
        "--episode",
        manifest.episodeId,
        "--language",
        "en",
        "--variant",
        "full",
        "--validation-only",
      ])
    );
    const payload = JSON.parse(output.read()) as {
      readonly summary: { readonly executed: number };
    };
    expect(payload.summary.executed).toBe(1);
  });

  it("delegates ready image episodes to the story image wrapper", async () => {
    runCommandMock.mockReset();
    runCommandMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        episodeId: "028-the-man-in-the-attic",
        generated: 2,
        skipped: 0,
        failed: 0,
        total: 2,
      }),
      stderr: "",
      exitCode: 0,
    });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-images-wrapper-"));
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "028-the-man-in-the-attic",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-10T00:00:00.000Z",
      dryRun: true,
    });
    await new StoryWorkflowManifestStore(root, manifest.episodeId).create({
      ...manifest,
      stages: manifest.stages.map((stage) => {
        if (
          stage.stageType === "rewrite-full" ||
          stage.stageType === "validate-full" ||
          stage.stageType === "quality-full"
        ) {
          return { ...stage, status: "succeeded" as const };
        }
        return stage;
      }),
    });

    const output = makeOutput();
    await commandStoriesImagesGenerate(
      {
        episode: manifest.episodeId,
        outputRoot: root,
        onlyReady: true,
        json: true,
      },
      output
    );

    expect(runCommandMock).toHaveBeenCalledTimes(1);
    const [, args] = runCommandMock.mock.calls[0] ?? [];
    expect(args).toEqual(
      expect.arrayContaining([
        "--json",
        "stories",
        "resume-images",
        "--episode",
        manifest.episodeId,
        "--output-root",
        root,
      ])
    );
    const payload = JSON.parse(output.read()) as {
      readonly summary: { readonly executed: number };
    };
    expect(payload.summary.executed).toBe(1);
  });
});
