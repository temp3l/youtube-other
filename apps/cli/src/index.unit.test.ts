import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  NarrationPipeline,
  narrationPipelineModeSchema,
} from "@mediaforge/speech";
import { describe, expect, it } from "vitest";
import { buildSceneInspectOutput } from "./scene-inspect-output.js";

describe("CLI scene inspect output", () => {
  it("includes a summary alongside the full visual plan when available", () => {
    const output = buildSceneInspectOutput(
      { id: "scene-001" },
      {
        previousSceneId: "scene-000",
        renderability: "mergeWithPrevious",
        reusedFromSceneId: "scene-000",
        materialDifferencesFromPrevious: ["camera angle changed"],
        validationIssues: [{ code: "ABSTRACT_VISIBLE_ACTION" }],
      }
    );

    expect(output).toMatchObject({
      scene: { id: "scene-001" },
      visualPlanSummary: {
        previousSceneId: "scene-000",
        renderability: "mergeWithPrevious",
        reusedFromSceneId: "scene-000",
        materialDifferencesFromPrevious: ["camera angle changed"],
        validationIssueCodes: ["ABSTRACT_VISIBLE_ACTION"],
      },
    });
  });

  it("falls back to the scene when no visual plan exists", () => {
    expect(buildSceneInspectOutput({ id: "scene-001" }, null)).toEqual({
      scene: { id: "scene-001" },
    });
  });
});

describe("CLI narration pipeline integration", () => {
  async function createEpisode(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-narration-cli-"));
    const episodeDir = path.join(root, "001-test-story");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(
      path.join(episodeDir, "script.md"),
      [
        "# Narration Script",
        "",
        "This is the opening hook. It leads into a quiet discovery.",
        "",
        "Then the truth becomes clear. The ending resolves without extra words.",
        "",
      ].join("\n"),
      "utf8"
    );
    return episodeDir;
  }

  it("plans dry-run output without writing staged artifacts", async () => {
    const episodeDir = await createEpisode();
    const result = await new NarrationPipeline().run({
      episodeDir,
      language: "en",
      stage: "all",
      rolloutMode: "new",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stages.map((stage) => stage.status)).toEqual([
      "planned",
      "planned",
      "planned",
      "planned",
      "planned",
    ]);
    await expect(fs.access(result.paths.spokenTextJson)).rejects.toThrow();
  });

  it("reports status as machine-readable staged results", async () => {
    const episodeDir = await createEpisode();
    const pipeline = new NarrationPipeline();
    await pipeline.run({
      episodeDir,
      language: "en",
      stage: "prepare",
      rolloutMode: "new",
    });

    const result = await pipeline.run({
      episodeDir,
      language: "en",
      stage: "status",
      rolloutMode: "new",
    });

    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "status", status: "completed" }),
        expect.objectContaining({ stage: "prepare", status: "completed" }),
      ])
    );
  });

  it("rejects invalid rollout modes before mutation", () => {
    expect(() => narrationPipelineModeSchema.parse("experimental")).toThrow();
  });

  it("skips completed prepare on resume and reruns when forced", async () => {
    const episodeDir = await createEpisode();
    const pipeline = new NarrationPipeline();
    await pipeline.run({
      episodeDir,
      language: "en",
      stage: "prepare",
      rolloutMode: "new",
    });

    const resumed = await pipeline.run({
      episodeDir,
      language: "en",
      stage: "prepare",
      rolloutMode: "new",
      resume: true,
    });
    const forced = await pipeline.run({
      episodeDir,
      language: "en",
      stage: "prepare",
      rolloutMode: "new",
      force: true,
    });

    expect(resumed.stages[0]).toMatchObject({ stage: "prepare", status: "skipped" });
    expect(forced.stages[0]).toMatchObject({ stage: "prepare", status: "completed" });
  });

  it("blocks staged mutation when rollout mode is legacy", async () => {
    const episodeDir = await createEpisode();
    const result = await new NarrationPipeline().run({
      episodeDir,
      language: "en",
      stage: "prepare",
      rolloutMode: "legacy",
    });

    expect(result.exitCode).toBe(3);
    expect(result.stages[0]).toMatchObject({
      stage: "prepare",
      status: "blocked",
    });
  });

  it("preserves legacy audio generation as the default rollout mode", async () => {
    const config = await loadRuntimeConfig();
    expect(config.narrationPipelineMode).toBe("legacy");
  });
});
