import { describe, expect, it } from "vitest";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { resolveLocaleWorkflowBranch } from "./story-workflow-locales.js";
import { resolveShortWorkflow } from "./story-workflow-shorts.js";
import { resolveVisualBranch } from "./story-workflow-visual.js";
import {
  buildStoryProductionStatusReport,
  buildStoryWorkflowStatusReport,
} from "./story-workflow-status.js";
import { workflowLocaleSchema } from "./story-workflow.schemas.js";

describe("story workflow integration harness", () => {
  it("covers planned success, locale fallback, partial failure, and sp prevention", () => {
    expect(workflowLocaleSchema.safeParse("sp").success).toBe(false);
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full", "short"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const english = manifest.artifacts[0];
    const locale = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [],
    });
    const short = resolveShortWorkflow({
      locale: "en",
      ...(english ? { parentFull: english } : {}),
    });
    const visual = resolveVisualBranch({
      englishFullAccepted: true,
      englishQualityPassed: true,
      localeFailures: ["es"],
    });
    const status = buildStoryWorkflowStatusReport(manifest);
    const production = buildStoryProductionStatusReport(manifest);
    expect(locale.status).toBe("blocked");
    expect(short.status).toBe("skipped");
    expect(visual.sharedImagesStatus).toBe("planned");
    expect(status.result).toBe("planned");
    expect(
      manifest.stages.some(
        (stage) => stage.stageId === "stage:image-prompt:en:full"
      )
    ).toBe(true);
    expect(
      production.entries.find(
        (entry) =>
          entry.stageType === "image-prompt" &&
          entry.locale === "en" &&
          entry.format === "full"
      )?.status
    ).toBe("waiting");
  });

  it("propagates retryable blockers through production gate evaluation", () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "es"],
      formats: ["full", "short"],
      createdAt: "2026-07-01T00:00:00.000Z",
      dryRun: true,
    });
    const stages = manifest.stages.map((stage) => {
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
        stage.stageType === "localize-full" &&
        stage.locale === "es" &&
        stage.format === "full"
      ) {
        return {
          ...stage,
          status: "failed" as const,
          latestOutcome: {
            schemaVersion: "stage-outcome-v1",
            status: "failed" as const,
            stageId: stage.stageId,
            executionId: manifest.executionId,
            failure: {
              schemaVersion: "stage-failure-v1",
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
      return stage;
    });
    const report = buildStoryProductionStatusReport({
      ...manifest,
      stages,
    });
    const englishAudio = report.entries.find(
      (entry) =>
        entry.stageType === "audio" &&
        entry.locale === "en" &&
        entry.format === "full"
    );
    const localizationRetry = report.entries.find(
      (entry) =>
        entry.stageType === "localize-full" &&
        entry.locale === "es" &&
        entry.format === "full"
    );
    const spanishShort = report.entries.find(
      (entry) =>
        entry.stageType === "rewrite-short" &&
        entry.locale === "es" &&
        entry.format === "short"
    );

    expect(englishAudio?.status).toBe("ready");
    expect(localizationRetry?.status).toBe("retryable");
    expect(spanishShort?.status).toBe("blocked");
    expect(spanishShort?.blockedBy[0]?.stageId).toBe(
      "stage:quality-full:es:full"
    );
    expect(
      report.categories.find((entry) => entry.category === "audio")?.ready
    ).toBeGreaterThan(0);
  });
});
