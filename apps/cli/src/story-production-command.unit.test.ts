import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { collectStoryProductionRepairSuggestionsMock } = vi.hoisted(() => ({
  collectStoryProductionRepairSuggestionsMock: vi.fn(async () => []),
}));

vi.mock("@mediaforge/story-localization", async () => {
  const actual = await vi.importActual<
    typeof import("@mediaforge/story-localization")
  >("@mediaforge/story-localization");
  const { buildStoryProductionStatusReport } = await import(
    "../../../packages/story-localization/src/story-workflow-status.js"
  );
  const horrorAffectPersistence = await import(
    "../../../packages/story-localization/src/horror-affect-plan.persistence.js"
  );
  return {
    ...actual,
    ...horrorAffectPersistence,
    buildStoryProductionStatusReport,
  };
});

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    workspaceDir: await fs.mkdtemp(path.join(os.tmpdir(), "story-production-cli-")),
  })),
}));

vi.mock("./story-render-command.js", () => ({
  collectStoryProductionRepairSuggestions:
    collectStoryProductionRepairSuggestionsMock,
  registerStoryProductionRepairCommand: vi.fn(),
}));

import {
  buildPersistedHorrorAffectPlanArtifact,
  buildPlannedStoryWorkflowManifest,
  persistHorrorAffectPlanArtifact,
  resolveHorrorAffectPlanArtifactPaths,
  StoryWorkflowManifestStore,
} from "@mediaforge/story-localization";
import {
  commandStoriesBatchTodo,
  commandStoriesProductionBatch,
  commandStoriesProductionNext,
  commandStoriesProductionResume,
  commandStoriesProductionStatus,
} from "./story-production-command.js";

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

describe("story production command", () => {
  it("stops blocked episodes at todo while continuing ready episodes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-production-batch-"));
    const blockedManifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full", "short"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const readyManifest = buildPlannedStoryWorkflowManifest({
      episodeId: "010-the-cleaner-of-death",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const blockedStages = blockedManifest.stages.map((stage) => {
      if (
        stage.stageType === "localize-full" &&
        stage.locale === "es" &&
        stage.format === "full"
      ) {
        return {
          ...stage,
          status: "failed" as const,
          latestOutcome: {
            schemaVersion: "stage-outcome-v1" as const,
            status: "failed" as const,
            stageId: stage.stageId,
            executionId: blockedManifest.executionId,
            failure: {
              schemaVersion: "stage-failure-v1" as const,
              category: "localization-provider-failure" as const,
              retryability: "retryable" as const,
              message: "provider timeout",
              occurredAt: "2026-07-01T00:01:00.000Z",
            },
            failureCategory: "localization-provider-failure" as const,
            retryability: "retryable" as const,
            fingerprintInputs: stage.fingerprintInputs,
            cache: stage.cache,
            warnings: [],
            cost: {
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              estimatedCostMicros: null,
              actualCostMicros: null,
            },
            startedAt: "2026-07-01T00:00:30.000Z",
            completedAt: "2026-07-01T00:01:00.000Z",
            observability: {
              attemptNumber: 1,
              durationMs: 30000,
            },
          },
        };
      }
      if (
        stage.stageType === "rewrite-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "validate-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "quality-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      return stage;
    });
    await new StoryWorkflowManifestStore(root, blockedManifest.episodeId).create({
      ...blockedManifest,
      stages: blockedStages,
    });
    await new StoryWorkflowManifestStore(root, readyManifest.episodeId).create(
      readyManifest
    );

    const output = makeOutput();
    await commandStoriesProductionBatch(
      {
        episodes: `${blockedManifest.episodeId},${readyManifest.episodeId}`,
        outputRoot: root,
        json: true,
      },
      output
    );

    const payload = JSON.parse(output.read()) as {
      readonly summary: { readonly ready: number; readonly retryable: number };
      readonly actions: readonly {
        readonly episodeId: string;
        readonly status: string;
        readonly commands: readonly string[];
      }[];
    };
    expect(payload.summary.ready).toBe(1);
    expect(payload.summary.retryable).toBe(1);
    expect(payload.actions).toContainEqual(
      expect.objectContaining({
        episodeId: blockedManifest.episodeId,
        status: "retryable",
        commands: [
          `npm run mediaforge -- stories batch todo --episode ${blockedManifest.episodeId}`,
        ],
      })
    );
    expect(payload.actions).toContainEqual(
      expect.objectContaining({
        episodeId: readyManifest.episodeId,
        status: "ready",
        commands: [
          `npm run mediaforge -- stories rewrite-full --episode ${readyManifest.episodeId} --resume`,
        ],
      })
    );
  });

  it("reports workflow-gated status and actionable next stages", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-production-status-"));
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full", "short"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    await new StoryWorkflowManifestStore(root, manifest.episodeId).create(manifest);
    const horrorAffectPaths = resolveHorrorAffectPlanArtifactPaths({
      outputDirectory: root,
      episodeSlug: manifest.episodeId,
    });
    await persistHorrorAffectPlanArtifact({
      paths: horrorAffectPaths,
      artifact: buildPersistedHorrorAffectPlanArtifact({
        episodeNumber: "009",
        episodeSlug: manifest.episodeId,
        sourceHash: "a".repeat(64),
        storyIrHash: "b".repeat(64),
        rolloutMode: "off",
        eligibility: {
          eligible: true,
          reason: "canonical-english-fiction",
        },
      }),
    });

    const statusOutput = makeOutput();
    await commandStoriesProductionStatus(
      {
        episode: manifest.episodeId,
        outputRoot: root,
        json: true,
      },
      statusOutput
    );
    const statusJson = JSON.parse(statusOutput.read()) as readonly {
      readonly summary: { readonly ready: number };
      readonly horrorAffectPlan: {
        readonly state: string;
        readonly rolloutMode: string;
        readonly eligible: boolean;
        readonly planHash: string | null;
        readonly reasons: readonly unknown[];
      };
    }[];
    expect(statusJson[0]?.summary.ready).toBeGreaterThan(0);
    expect(statusJson[0]?.horrorAffectPlan).toMatchObject({
      state: "current",
      rolloutMode: "off",
      eligible: true,
      planHash: null,
      reasons: [],
    });

    const humanStatusOutput = makeOutput();
    await commandStoriesProductionStatus(
      {
        episode: manifest.episodeId,
        outputRoot: root,
      },
      humanStatusOutput
    );
    expect(humanStatusOutput.read()).toContain(
      "Horror affect plan: state=current mode=off"
    );

    const nextOutput = makeOutput();
    await commandStoriesProductionNext(
      {
        episode: manifest.episodeId,
        outputRoot: root,
      },
      nextOutput
    );
    expect(nextOutput.read()).toContain("Next actionable stages:");
    expect(nextOutput.read()).toContain("rewrite-full");

    const resumeOutput = makeOutput();
    await commandStoriesProductionResume(
      {
        episode: manifest.episodeId,
        outputRoot: root,
        json: true,
      },
      resumeOutput
    );
    const resumeJson = JSON.parse(resumeOutput.read()) as {
      readonly actionable: readonly { readonly stageType: string }[];
    };
    expect(resumeJson.actionable[0]?.stageType).toBe("rewrite-full");
  });

  it("lists retryable, blocked, and ready todo actions with repair suggestions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-production-todo-"));
    const retryableManifest = buildPlannedStoryWorkflowManifest({
      episodeId: "011-the-red-room",
      locales: ["en", "es"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const retryableStages = retryableManifest.stages.map((stage) => {
      if (
        stage.stageType === "localize-full" &&
        stage.locale === "es" &&
        stage.format === "full"
      ) {
        return {
          ...stage,
          status: "failed" as const,
          latestOutcome: {
            schemaVersion: "stage-outcome-v1" as const,
            status: "failed" as const,
            stageId: stage.stageId,
            executionId: retryableManifest.executionId,
            failure: {
              schemaVersion: "stage-failure-v1" as const,
              category: "localization-provider-failure" as const,
              retryability: "retryable" as const,
              message: "provider timeout",
              occurredAt: "2026-07-01T00:01:00.000Z",
            },
            failureCategory: "localization-provider-failure" as const,
            retryability: "retryable" as const,
            fingerprintInputs: stage.fingerprintInputs,
            cache: stage.cache,
            warnings: [],
            cost: {
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              estimatedCostMicros: null,
              actualCostMicros: null,
            },
            startedAt: "2026-07-01T00:00:30.000Z",
            completedAt: "2026-07-01T00:01:00.000Z",
            observability: {
              attemptNumber: 1,
              durationMs: 30000,
            },
          },
        };
      }
      if (
        stage.stageType === "rewrite-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "validate-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "quality-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      return stage;
    });
    const readyManifest = buildPlannedStoryWorkflowManifest({
      episodeId: "012-the-empty-house",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const blockedManifest = buildPlannedStoryWorkflowManifest({
      episodeId: "013-the-silent-window",
      locales: ["en"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const blockedStages = blockedManifest.stages.map((stage) => {
      if (
        stage.stageType === "rewrite-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "validate-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "quality-full" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "succeeded" as const };
      }
      if (
        stage.stageType === "audio" &&
        stage.locale === "en" &&
        stage.format === "full"
      ) {
        return { ...stage, status: "failed" as const };
      }
      return stage;
    });
    await new StoryWorkflowManifestStore(root, retryableManifest.episodeId).create({
      ...retryableManifest,
      stages: retryableStages,
    });
    await new StoryWorkflowManifestStore(root, readyManifest.episodeId).create(
      readyManifest
    );
    await new StoryWorkflowManifestStore(root, blockedManifest.episodeId).create({
      ...blockedManifest,
      stages: blockedStages,
    });
    collectStoryProductionRepairSuggestionsMock.mockResolvedValueOnce([
      {
        episodeId: blockedManifest.episodeId,
        locale: "en",
        variant: "full",
        issues: [{ code: "AUDIO_MISSING", message: "Narration audio is not ready." }],
        commands: [
          `npm run mediaforge -- stories audio generate --episode ${blockedManifest.episodeId} --languages en --profiles full --only-ready`,
          `npm run mediaforge -- stories render --episode ${blockedManifest.episodeId} --languages en --profiles full --only-ready`,
        ],
      },
    ]);

    const output = makeOutput();
    await commandStoriesBatchTodo(
      {
        episodes: [
          retryableManifest.episodeId,
          readyManifest.episodeId,
          blockedManifest.episodeId,
        ].join(","),
        outputRoot: root,
        json: true,
      },
      output
    );

    const payload = JSON.parse(output.read()) as {
      readonly retryable: readonly {
        readonly episodeId: string;
        readonly commands: readonly string[];
      }[];
      readonly blocked: readonly {
        readonly episodeId: string;
        readonly commands: readonly string[];
        readonly reason: string;
      }[];
      readonly ready: readonly {
        readonly episodeId: string;
        readonly commands: readonly string[];
      }[];
    };
    expect(payload.retryable).toContainEqual(
      expect.objectContaining({
        episodeId: retryableManifest.episodeId,
        commands: [
          `npm run mediaforge -- stories rewrite-full --episode ${retryableManifest.episodeId} --languages es --resume`,
        ],
      })
    );
    expect(payload.blocked).toContainEqual(
      expect.objectContaining({
        episodeId: blockedManifest.episodeId,
        reason: "Narration audio is not ready.",
        commands: [
          `npm run mediaforge -- stories audio generate --episode ${blockedManifest.episodeId} --languages en --profiles full --only-ready`,
          `npm run mediaforge -- stories render --episode ${blockedManifest.episodeId} --languages en --profiles full --only-ready`,
        ],
      })
    );
    expect(payload.ready).toContainEqual(
      expect.objectContaining({
        episodeId: readyManifest.episodeId,
        commands: [
          `npm run mediaforge -- stories rewrite-full --episode ${readyManifest.episodeId} --resume`,
        ],
      })
    );
  });
});
