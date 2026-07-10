import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertUniqueBatchCustomIds,
  buildOrchestrationCustomId,
  loadBatchRunPlan,
  mapBatchManifestStatusToOrchestrationStatus,
  mapBatchProviderItemStatusToOrchestrationStatus,
  mapWorkflowBatchItemStatusToOrchestrationStatus,
  mapWorkflowBatchStatusToOrchestrationStatus,
  mapWorkflowStageStatusToOrchestrationStatus,
  parseBatchCustomId,
  reconcileWorkflowBatch,
  resolveBatchRunPlanPath,
  saveBatchRunPlan,
} from "./story-workflow-batch.js";
import {
  batchRunPlanSchema,
  episodeProductionSummarySchema,
} from "./story-workflow.schemas.js";
import {
  batchRunPlanSchemaVersion,
  productionSummarySchemaVersion,
  workflowSchemaVersion,
  type BatchRunPlan,
  type EpisodeProductionSummary,
} from "./story-workflow.types.js";

function fingerprintInputs() {
  return {
    parentFingerprints: [],
    workflowSchemaVersion,
  };
}

describe("story workflow batch reconciliation", () => {
  it("keeps item success and exposes retryable failed items", () => {
    const result = reconcileWorkflowBatch({
      id: "batch-localize",
      status: "imported_with_failures",
      category: "text-localization",
      operation: "localization",
      stageIds: ["stage:localize-full:es:full" as never],
      items: [
        {
          customId: "ok",
          stageId: "stage:localize-full:es:full" as never,
          locale: "es",
          format: "full",
          status: "persisted",
          updatedAt: "2026-07-01T00:00:00.000Z",
          fingerprintInputs: fingerprintInputs(),
        },
        {
          customId: "bad",
          stageId: "stage:localize-full:fr:full" as never,
          locale: "fr",
          format: "full",
          status: "failed",
          updatedAt: "2026-07-01T00:00:00.000Z",
          fingerprintInputs: fingerprintInputs(),
          failure: {
            schemaVersion: "stage-failure-v1",
            category: "localization-provider-failure",
            retryability: "retryable",
            message: "Provider failed.",
            occurredAt: "2026-07-01T00:00:00.000Z",
          },
        },
      ],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(result.completedItemCount).toBe(1);
    expect(result.failedItemCount).toBe(1);
    expect(result.retryableItems.map((item) => item.customId)).toEqual(["bad"]);
  });

  it("marks expired batch items retryable", () => {
    const result = reconcileWorkflowBatch({
      id: "batch-expired",
      status: "expired",
      category: "text-localization",
      operation: "localization",
      stageIds: ["stage:localize-full:es:full" as never],
      items: [
        {
          customId: "pending",
          stageId: "stage:localize-full:es:full" as never,
          locale: "es",
          format: "full",
          status: "submitted",
          updatedAt: "2026-07-01T00:00:00.000Z",
          fingerprintInputs: fingerprintInputs(),
        },
      ],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(result.submission.items[0]?.status).toBe("failed");
    expect(result.retryableItems).toHaveLength(1);
  });
});

const now = "2026-07-09T00:00:00.000Z";

function productionSummary(): EpisodeProductionSummary {
  return {
    schemaVersion: productionSummarySchemaVersion,
    episodeId: "001-the-calhoun-effect",
    status: "running",
    stageCounts: {
      planned: 1,
      running: 1,
    },
    stages: [
      {
        stageType: "rewrite-full",
        locale: "en",
        format: "full",
        status: "running",
        sourceStageId: "stage:rewrite-full:en:full" as never,
        updatedAt: now,
      },
    ],
    activeCustomIds: ["dte:v1:rewrite-full:001-the-calhoun-effect:en:full:story:abcdef12"],
    failedCustomIds: [],
    updatedAt: now,
  };
}

function batchRunPlan(): BatchRunPlan {
  return {
    schemaVersion: batchRunPlanSchemaVersion,
    runId: "run-20260709-a",
    createdAt: now,
    updatedAt: now,
    items: [
      {
        customId:
          "dte:v1:rewrite-full:001-the-calhoun-effect:en:full:story:abcdef12",
        episodeId: "001-the-calhoun-effect",
        stageType: "rewrite-full",
        locale: "en",
        format: "full",
        status: "planned",
        operation: "canonical-english-full",
        updatedAt: now,
      },
    ],
    episodes: [productionSummary()],
  };
}

describe("batch run state foundation", () => {
  it("validates run-state schema and rejects duplicate custom IDs", () => {
    expect(batchRunPlanSchema.parse(batchRunPlan()).runId).toBe("run-20260709-a");

    expect(() =>
      batchRunPlanSchema.parse({
        ...batchRunPlan(),
        items: [batchRunPlan().items[0], batchRunPlan().items[0]],
      })
    ).toThrow(/Duplicate batch plan custom_id/u);
  });

  it("validates production summary schema", () => {
    expect(episodeProductionSummarySchema.parse(productionSummary())).toMatchObject({
      episodeId: "001-the-calhoun-effect",
      status: "running",
    });

    expect(() =>
      episodeProductionSummarySchema.parse({
        ...productionSummary(),
        stages: [
          {
            stageType: "unsupported-stage",
            status: "planned",
          },
        ],
      })
    ).toThrow();
  });

  it("persists run state under batches/<run-id>/batch-plan.json", async () => {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "batch-run-plan-"));
    const plan = await saveBatchRunPlan({
      workspaceRoot,
      plan: batchRunPlan(),
    });
    expect(plan.runId).toBe("run-20260709-a");
    expect(
      resolveBatchRunPlanPath({
        workspaceRoot,
        runId: "run-20260709-a",
      })
    ).toBe(path.join(workspaceRoot, "batches", "run-20260709-a", "batch-plan.json"));
    await expect(
      loadBatchRunPlan({
        workspaceRoot,
        runId: "run-20260709-a",
      })
    ).resolves.toMatchObject({ runId: "run-20260709-a" });
  });

  it("maps workflow, text batch, and image batch statuses", () => {
    expect(mapWorkflowStageStatusToOrchestrationStatus("cached")).toBe("cached");
    expect(mapWorkflowBatchStatusToOrchestrationStatus("imported_with_failures")).toBe(
      "partial"
    );
    expect(mapWorkflowBatchItemStatusToOrchestrationStatus("schema-invalid")).toBe(
      "failed"
    );
    expect(mapBatchManifestStatusToOrchestrationStatus("in_progress")).toBe(
      "running"
    );
    expect(mapBatchProviderItemStatusToOrchestrationStatus("policy-rejected")).toBe(
      "failed"
    );
  });

  it("builds and parses valid readable custom IDs", () => {
    const customId = buildOrchestrationCustomId({
      stageType: "image-generation",
      episodeId: "001-the-calhoun-effect",
      locale: "en",
      format: "short",
      subject: "scene-01",
      fingerprint: "abcdef123456",
    });
    expect(customId).toBe(
      "dte:v1:image-generation:001-the-calhoun-effect:en:short:scene-01:abcdef123456"
    );
    expect(parseBatchCustomId(customId)).toMatchObject({
      kind: "orchestration",
      stageType: "image-generation",
      locale: "en",
      format: "short",
      originalCustomId: customId,
    });
  });

  it("parses existing deterministic text and image custom IDs", () => {
    expect(
      parseBatchCustomId("dte:001:localization:de:abcdef12:12345678")
    ).toMatchObject({
      kind: "legacy-text",
      stageType: "localize-full",
      locale: "de",
      format: "full",
    });
    expect(
      parseBatchCustomId(
        "dte-img:v2:001-the-calhoun-effect:en:full:full-scene:generation:scene:scene-01:abcdef123456"
      )
    ).toMatchObject({
      kind: "legacy-image",
      stageType: "image-generation",
      locale: "en",
      format: "full",
    });
  });

  it("rejects invalid stage, language, profile, and extra custom ID segments", () => {
    expect(() =>
      parseBatchCustomId("dte:v1:not-a-stage:001-the-calhoun-effect:en:full:story:abcdef12")
    ).toThrow(/Unsupported stage/u);
    expect(() =>
      parseBatchCustomId("dte:v1:rewrite-full:001-the-calhoun-effect:sp:full:story:abcdef12")
    ).toThrow(/Unsupported language/u);
    expect(() =>
      parseBatchCustomId("dte:v1:rewrite-full:001-the-calhoun-effect:en:vertical:story:abcdef12")
    ).toThrow(/Unsupported profile/u);
    expect(() =>
      parseBatchCustomId(
        "dte:v1:rewrite-full:001-the-calhoun-effect:en:full:story:abcdef12:extra"
      )
    ).toThrow(/Invalid orchestration custom_id/u);
  });

  it("parses retry suffixes and preserves the original ID link", () => {
    expect(
      parseBatchCustomId(
        "dte:v1:rewrite-short:001-the-calhoun-effect:en:short:story:abcdef12:retry-r2"
      )
    ).toMatchObject({
      retryNumber: 2,
      originalCustomId:
        "dte:v1:rewrite-short:001-the-calhoun-effect:en:short:story:abcdef12",
    });
    expect(
      parseBatchCustomId("dte:001:english-short:en:abcdef12:12345678:r3")
    ).toMatchObject({
      retryNumber: 3,
      originalCustomId: "dte:001:english-short:en:abcdef12:12345678",
    });
  });

  it("rejects duplicate custom IDs before batch plan use", () => {
    expect(() =>
      assertUniqueBatchCustomIds([
        {
          customId:
            "dte:v1:rewrite-full:001-the-calhoun-effect:en:full:story:abcdef12",
        },
        {
          customId:
            "dte:v1:rewrite-full:001-the-calhoun-effect:en:full:story:abcdef12",
        },
      ])
    ).toThrow(/Duplicate custom_id/u);
  });
});
