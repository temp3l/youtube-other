import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  AttemptObservabilityStore,
  BatchCoordinator,
  WorkflowPermanentFailureError,
  WorkflowProviderRetriesExhaustedError,
  adaptLegacyBatchManifest,
  canonicalBatchSidecarPath,
  createDeterministicBatchId,
  createDeterministicBatchItemId,
  redactStructuredMetadata,
  writeLegacyBatchSidecar,
  type BatchPlanInput,
  type BatchWorkItem,
} from "./index.js";

const hash = (character: string) => character.repeat(64);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-batch-"));
  const coordinator = new BatchCoordinator({ root });
  return { root, coordinator };
}

function item(
  key: string,
  execute: BatchWorkItem["execute"],
  fingerprint = hash("a")
): BatchWorkItem {
  return {
    key,
    taskId: "story.localize",
    unitId: `episode-${key}`,
    locale: "en",
    variant: "full",
    fingerprint,
    revisions: { prompt: "prompt.v2" },
    execute,
  };
}

function plan(
  items: readonly BatchWorkItem[],
  overrides: Partial<BatchPlanInput> = {}
): BatchPlanInput {
  return {
    profileId: "dark-truth",
    provider: "openai",
    model: "gpt-test",
    operation: "story.localize",
    executionMode: "sync",
    configuration: { concurrency: 2, retryLimit: 0 },
    items,
    ...overrides,
  };
}

describe("BatchCoordinator", () => {
  it("uses deterministic batch/item identities and compatible sync/provider manifests", async () => {
    const execute = vi.fn(() => ({ outputArtifacts: [], warnings: [] }));
    const { coordinator } = await fixture();
    const sync = coordinator.createManifest(plan([item("one", execute)]));
    const provider = coordinator.createManifest(
      plan([item("one", execute)], { executionMode: "provider-batch" })
    );

    expect(sync.id).toBe(provider.id);
    expect(sync.items[0]?.id).toBe(provider.items[0]?.id);
    expect(sync.items[0]?.groupKey).toContain("openai:gpt-test:en:full");
    expect(
      createDeterministicBatchId({
        profileId: "dark-truth",
        provider: "openai",
        model: "gpt-test",
        operation: "story.localize",
        itemIds: [sync.items[0]!.id],
      })
    ).toBe(sync.id);
    expect(
      createDeterministicBatchItemId({
        taskId: "story.localize",
        unitId: "episode-one",
        locale: "en",
        variant: "full",
        fingerprint: hash("a"),
      })
    ).toBe(sync.items[0]?.id);
  });

  it("preserves successful items across partial failure and resumes only retryable work", async () => {
    const first = vi.fn(() => ({ outputArtifacts: [], warnings: [] }));
    let fail = true;
    const second = vi.fn(() => {
      if (fail) {
        fail = false;
        throw new WorkflowProviderRetriesExhaustedError("rate limited");
      }
      return { outputArtifacts: [], warnings: [] };
    });
    const input = plan([item("one", first), item("two", second, hash("b"))]);
    const { coordinator } = await fixture();

    const partial = await coordinator.run(input);
    expect(partial.status).toBe("partial");
    expect(partial.totals).toMatchObject({ succeeded: 1, failedRetryable: 1 });

    const resumed = await coordinator.run(input);
    expect(resumed.status).toBe("succeeded");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("classifies retries independently, records provider/cost metadata, and totals costs", async () => {
    let transientCalls = 0;
    const transient = vi.fn(() => {
      transientCalls += 1;
      if (transientCalls === 1) {
        throw new WorkflowProviderRetriesExhaustedError("429");
      }
      return {
        outputArtifacts: [],
        warnings: ["recovered"],
        telemetry: {
          provider: "openai",
          model: "gpt-test",
          providerRequestId: "request-123",
          cacheStatus: "hit" as const,
          usage: { inputTokens: 10, outputTokens: 3 },
          cost: {
            estimatedMicros: 11,
            actualMicros: 9,
            currency: "USD" as const,
          },
        },
      };
    });
    const permanent = vi.fn(() => {
      throw new WorkflowPermanentFailureError(
        "PROVIDER_PERMANENT_FAILURE",
        "invalid request",
        "Repair the request."
      );
    });
    const { coordinator } = await fixture();
    const result = await coordinator.run(
      plan([item("one", transient), item("two", permanent, hash("b"))], {
        configuration: {
          concurrency: 2,
          retryLimit: 1,
          rateLimitPerSecond: 1_000,
        },
      })
    );

    expect(result.status).toBe("partial");
    expect(result.items[0]).toMatchObject({
      status: "succeeded",
      providerRequestId: "request-123",
      cacheStatus: "hit",
      usage: { inputTokens: 10, outputTokens: 3 },
    });
    expect(result.items[0]?.attemptIds).toHaveLength(2);
    expect(result.items[1]).toMatchObject({
      status: "failed-permanent",
      retryable: false,
    });
    expect(result.totals).toMatchObject({
      estimatedCostMicros: 11,
      actualCostMicros: 9,
    });
  });

  it("honors configured concurrency and cancellation", async () => {
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      if (active === 2) release();
      await gate;
      active -= 1;
      return { outputArtifacts: [], warnings: [] };
    });
    const { coordinator } = await fixture();
    await coordinator.run(
      plan([item("one", execute), item("two", execute, hash("b"))])
    );
    expect(maximum).toBe(2);

    const cancelledFixture = await fixture();
    const controller = new AbortController();
    controller.abort();
    const cancelled = await cancelledFixture.coordinator.run(
      plan([item("cancel", execute)]),
      controller.signal
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.items[0]?.status).toBe("cancelled");
  });

  it("reconciles provider evidence without replacing successful item evidence", async () => {
    const { coordinator } = await fixture();
    const manifest = await coordinator.plan(
      plan([
        item("one", () => ({ outputArtifacts: [], warnings: [] })),
        item("two", () => ({ outputArtifacts: [], warnings: [] }), hash("b")),
      ])
    );
    const reconciled = await coordinator.reconcile(manifest.id, [
      {
        itemId: manifest.items[0]!.id,
        status: "succeeded",
        providerRequestId: "provider-job-1",
      },
      {
        itemId: manifest.items[1]!.id,
        status: "failed-retryable",
        providerRequestId: "provider-job-2",
        errorCode: "RATE_LIMIT",
      },
    ]);
    expect(reconciled.status).toBe("partial");
    expect(
      reconciled.items.map((candidate) => candidate.providerRequestId)
    ).toEqual(["provider-job-1", "provider-job-2"]);

    const preserved = await coordinator.reconcile(manifest.id, [
      {
        itemId: manifest.items[0]!.id,
        status: "failed-permanent",
        errorCode: "LATE",
      },
    ]);
    expect(preserved.items[0]?.status).toBe("succeeded");
  });
});

describe("batch observability and compatibility adapters", () => {
  it("redacts secrets, explicit fields, and large binary payloads", () => {
    const redacted = redactStructuredMetadata(
      {
        apiKey: "secret-key",
        prompt: "private prompt",
        nested: { authorization: "Bearer secret" },
        image: `data:image/png;base64,${"a".repeat(2_000)}`,
      },
      ["prompt"]
    );
    expect(redacted).toEqual({
      apiKey: "[REDACTED]",
      prompt: "[REDACTED]",
      nested: { authorization: "[REDACTED]" },
      image: "[REDACTED_BINARY]",
    });
  });

  it("adapts story, image, and math stores to one canonical manifest and writes sidecars", async () => {
    const story = adaptLegacyBatchManifest({
      family: "story",
      manifest: {
        localBatchId: "slb-1",
        openAIBatchId: "openai-batch-1",
        category: "text-localization",
        model: "gpt-test",
        status: "imported_with_failures",
        createdAt: "2026-07-14T12:00:00.000Z",
        updatedAt: "2026-07-14T12:01:00.000Z",
        items: [
          {
            customId: "story-1",
            episodeNumber: "episode-1",
            language: "de",
            operation: "localized-full",
            configurationHash: hash("a"),
            status: "persisted",
            usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.25 },
          },
        ],
      },
    });
    const image = adaptLegacyBatchManifest({
      family: "image",
      manifest: {
        localBatchId: "img-1",
        category: "image-generation",
        model: "image-test",
        status: "failed",
        createdAt: "2026-07-14T12:00:00.000Z",
        updatedAt: "2026-07-14T12:01:00.000Z",
        items: [
          {
            customId: "image-1",
            identity: {
              episodeId: "episode-1",
              language: "en",
              variant: "full",
              operation: "generation",
              identityHash: hash("b"),
            },
            status: "api-failed",
            error: {
              code: "rate_limit",
              message: "retry later",
              apiKey: "secret",
            },
          },
        ],
      },
    });
    const math = adaptLegacyBatchManifest({
      family: "math",
      manifest: {
        batchId: "math-1",
        status: "partial",
        updatedAt: "2026-07-14T12:01:00.000Z",
        items: [
          {
            skillId: "M5-ZO-001",
            variant: "standard",
            language: "de",
            status: "succeeded",
            attempts: 1,
          },
        ],
      },
    });

    expect(story).toMatchObject({
      legacyBatchId: "slb-1",
      providerBatchId: "openai-batch-1",
      profileId: "dark-truth",
      totals: { estimatedCostMicros: 250_000 },
    });
    expect(image.items[0]).toMatchObject({
      status: "failed-retryable",
      errorCode: "rate_limit",
      errorMessage: "retry later",
    });
    expect(math).toMatchObject({
      profileId: "mathematics-education",
      executionMode: "sync",
    });

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "batch-sidecar-"));
    const legacyManifestPath = path.join(root, "batch.json");
    await writeLegacyBatchSidecar({
      family: "math",
      legacyManifestPath,
      manifest: {
        batchId: "math-1",
        status: "succeeded",
        updatedAt: "2026-07-14T12:01:00.000Z",
        items: [
          {
            skillId: "M5-ZO-001",
            variant: "standard",
            language: "de",
            status: "succeeded",
            attempts: 1,
          },
        ],
      },
    });
    await expect(
      fs.stat(canonicalBatchSidecarPath(legacyManifestPath))
    ).resolves.toBeDefined();
  });

  it("persists the structured attempt contract emitted by normal task execution", async () => {
    const { root, coordinator } = await fixture();
    const result = await coordinator.run(
      plan([
        item("one", () => ({
          outputArtifacts: [],
          warnings: ["fixture"],
          telemetry: {
            provider: "openai",
            providerRequestId: "request-1",
            cost: { actualMicros: 7, currency: "USD" },
          },
        })),
      ])
    );
    const attemptId = result.items[0]!.attemptIds[0]!;
    const store = new AttemptObservabilityStore(
      path.join(root, result.id, "runs")
    );
    const [runId] = await fs.readdir(path.join(root, result.id, "runs"));
    expect(runId).toBeDefined();
    const telemetry = await store.read(runId!, attemptId);
    expect(telemetry).toMatchObject({
      batchId: result.id,
      batchItemId: result.items[0]!.id,
      providerRequestId: "request-1",
      cost: { actualMicros: 7, currency: "USD" },
      warnings: ["fixture"],
    });
  });
});
