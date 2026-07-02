import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  NarrationPipeline,
  buildNarrationBatchStatus,
  buildNarrationTargetStatusFromResult,
  createNarrationArtifactPaths,
  narrationPipelineModeSchema,
  type NarrationPipelineResult,
  type NarrationPipelineStageResult,
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

  async function createStatusResult(input: {
    readonly episodeId: string;
    readonly language: string;
    readonly stages: readonly NarrationPipelineStageResult[];
    readonly status?: NarrationPipelineResult["status"];
  }): Promise<NarrationPipelineResult> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-narration-status-"));
    const episodeDir = path.join(root, input.episodeId);
    await fs.mkdir(episodeDir, { recursive: true });
    return {
      episodeId: input.episodeId,
      language: input.language,
      locale: input.language,
      variant: "full",
      rolloutMode: "new",
      dryRun: false,
      stages: input.stages,
      paths: createNarrationArtifactPaths({
        episodeId: input.episodeId,
        locale: input.language,
        variant: "full",
        episodeRoot: episodeDir,
      }),
      exitCode: input.stages.some((stage) => stage.status === "failed")
        ? 2
        : input.stages.some((stage) => stage.status === "blocked")
          ? 3
          : 0,
      status: input.status ?? "ready",
    };
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

  it("summarizes mixed success and failure while preserving independent target records", async () => {
    const success = buildNarrationTargetStatusFromResult(
      await createStatusResult({
        episodeId: "001-test-story",
        language: "en",
        stages: [{ stage: "validate", status: "completed", outputPaths: ["quality-gate.json"], message: "READY" }],
      }),
      10
    );
    const failed = buildNarrationTargetStatusFromResult(
      await createStatusResult({
        episodeId: "001-test-story",
        language: "de",
        stages: [
          {
            stage: "generate",
            status: "failed",
            outputPaths: [],
            message: "ProviderResponseError: api_key=sk-secret narration text should not leak",
          },
        ],
        status: "failed",
      }),
      12
    );

    const batch = buildNarrationBatchStatus({ targets: [success, failed] });

    expect(batch.summary).toMatchObject({ success: 1, failed: 1, total: 2 });
    expect(batch.exitCode).toBe(2);
    expect(batch.targets.map((target) => target.language)).toEqual(["en", "de"]);
    expect(batch.targets[1]?.message).toContain("[redacted]");
    expect(batch.targets[1]?.message).not.toContain("sk-secret");
    expect(batch.targets[1]?.message).not.toContain("narration text should not leak");
  });

  it("reports all-failed, warning-only strict, and blocked batch outcomes", async () => {
    const failedEn = buildNarrationTargetStatusFromResult(
      await createStatusResult({
        episodeId: "001-test-story",
        language: "en",
        stages: [{ stage: "generate", status: "failed", outputPaths: [], message: "provider failed" }],
        status: "failed",
      }),
      10
    );
    const failedDe = buildNarrationTargetStatusFromResult(
      await createStatusResult({
        episodeId: "001-test-story",
        language: "de",
        stages: [{ stage: "generate", status: "failed", outputPaths: [], message: "provider failed" }],
        status: "failed",
      }),
      11
    );
    const warning = buildNarrationTargetStatusFromResult(
      await createStatusResult({
        episodeId: "001-test-story",
        language: "en",
        stages: [
          { stage: "validate", status: "completed", outputPaths: ["quality-gate.json"], message: "READY_WITH_WARNINGS" },
        ],
      }),
      8
    );
    const blocked = buildNarrationTargetStatusFromResult(
      await createStatusResult({
        episodeId: "001-test-story",
        language: "en",
        stages: [{ stage: "assemble", status: "blocked", outputPaths: [], message: "missing chunk" }],
        status: "blocked",
      }),
      9
    );

    expect(buildNarrationBatchStatus({ targets: [failedEn, failedDe] }).summary).toMatchObject({
      failed: 2,
      total: 2,
    });
    expect(buildNarrationBatchStatus({ targets: [warning] }).exitCode).toBe(0);
    expect(buildNarrationBatchStatus({ targets: [warning], strictMode: true }).exitCode).toBe(4);
    expect(buildNarrationBatchStatus({ targets: [blocked] }).summary.blocked).toBe(1);
    expect(blocked.failureClass).toBe("assembly");
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

    const resumedStatus = buildNarrationTargetStatusFromResult(resumed, 5);
    expect(resumedStatus.outcome).toBe("success");
    expect(resumedStatus.latestStageStatus).toBe("skipped");
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
