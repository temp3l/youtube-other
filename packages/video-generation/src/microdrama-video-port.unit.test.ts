import { describe, expect, it } from "vitest";

import {
  APPROVAL_SCHEMA_VERSION,
  approvalRecordSchema,
  type ApprovalRecord,
} from "@mediaforge/domain";

import {
  VIDEO_GENERATION_APPROVAL_GATE,
  VIDEO_GENERATION_SCHEMA_VERSION,
  type VideoGenerationRequest,
} from "./contracts.js";
import { buildVideoGenerationCacheKey } from "./cache-key.js";
import { VideoGenerationApprovalError } from "./approval-policy.js";
import { FakeVideoProviderAdapter } from "./fake-adapter.js";
import {
  InMemoryVideoGenerationBudgetPort,
  InMemoryVideoGenerationCache,
  MicrodramaVideoGenerationPort,
} from "./microdrama-video-port.js";
import { shouldRetryAmbiguousVideoEffect } from "./effect-reconciliation.js";

const promptHash = "a".repeat(64);
const sourceImageHash = "b".repeat(64);
const outputHash = "c".repeat(64);

function baseRequest(
  overrides: Partial<VideoGenerationRequest> = {}
): VideoGenerationRequest {
  return {
    schemaVersion: VIDEO_GENERATION_SCHEMA_VERSION,
    generationId: "video-gen-001",
    episodeId: "E001",
    shotSemanticId: "shot.sem.e001.001.001",
    shotPlanRevisionId: "shot-plan-rev-1",
    clipKind: "source-plate-motion",
    providerCapabilityId: "fake-video-v1",
    promptHash,
    sourceImageHash,
    durationSeconds: 4,
    forceRegeneration: false,
    ...overrides,
  };
}

function approval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return approvalRecordSchema.parse({
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    id: "approval-video-001",
    workflowInstanceId: "workflow-instance-001",
    taskId: "microdrama.generate-video-clip",
    profileId: "history",
    unitId: "episode-001",
    locale: "en",
    variant: "short",
    decision: "approved",
    actor: "reviewer@example.invalid",
    reason: "Approved for canary generation.",
    boundRevision: "shot-plan-rev-1",
    artifactHashes: [outputHash],
    createdAt: "2026-08-12T00:00:00.000Z",
    scope: {
      gate: VIDEO_GENERATION_APPROVAL_GATE,
      locale: "en",
      variant: "short",
      inputArtifactHashes: [promptHash, sourceImageHash],
      outputArtifactHashes: [outputHash],
      highRisk: false,
    },
    ...overrides,
  });
}

function dispatchContext(approvals: readonly ApprovalRecord[] = [approval()]) {
  return {
    workflowInstanceId: "workflow-instance-001",
    taskId: "microdrama.generate-video-clip",
    approvals,
    evaluatedAt: "2026-08-12T01:00:00.000Z",
  };
}

function createPort(adapter = new FakeVideoProviderAdapter()) {
  return new MicrodramaVideoGenerationPort({
    adapter,
    cache: new InMemoryVideoGenerationCache(),
    budget: new InMemoryVideoGenerationBudgetPort(),
    providerId: "fake-video",
    taskId: "microdrama.generate-video-clip",
  });
}

describe("microdrama video generation port", () => {
  it("builds stable cache keys from semantic shot identity and revision-bound inputs", () => {
    const request = baseRequest();
    const first = buildVideoGenerationCacheKey(request);
    const second = buildVideoGenerationCacheKey({
      ...request,
      generationId: "video-gen-002",
    });
    expect(first).toBe(second);
    expect(buildVideoGenerationCacheKey({
      ...request,
      promptHash: "d".repeat(64),
    })).not.toBe(first);
  });

  it("blocks dispatch without a current render-qa approval for the shot plan revision", async () => {
    const port = createPort();
    await expect(
      port.generate({
        request: baseRequest(),
        dispatchContext: dispatchContext([]),
        correlationId: "corr-001",
        evaluatedAt: "2026-08-12T01:00:00.000Z",
        inputArtifactHashes: [promptHash, sourceImageHash],
      })
    ).rejects.toBeInstanceOf(VideoGenerationApprovalError);

    await expect(
      port.generate({
        request: baseRequest({ shotPlanRevisionId: "shot-plan-rev-2" }),
        dispatchContext: dispatchContext(),
        correlationId: "corr-002",
        evaluatedAt: "2026-08-12T01:00:00.000Z",
        inputArtifactHashes: [promptHash, sourceImageHash],
      })
    ).rejects.toMatchObject({ code: "VIDEO_APPROVAL_REVISION_MISMATCH" });
  });

  it("generates through the fake adapter, records cost, and reuses the cache", async () => {
    const adapter = new FakeVideoProviderAdapter();
    const budget = new InMemoryVideoGenerationBudgetPort();
    const port = new MicrodramaVideoGenerationPort({
      adapter,
      cache: new InMemoryVideoGenerationCache(),
      budget,
      providerId: "fake-video",
      taskId: "microdrama.generate-video-clip",
    });

    const first = await port.generate({
      request: baseRequest(),
      dispatchContext: dispatchContext(),
      correlationId: "corr-003",
      evaluatedAt: "2026-08-12T01:00:00.000Z",
      inputArtifactHashes: [promptHash, sourceImageHash],
    });
    expect(first.kind).toBe("generated");
    if (first.kind !== "generated") throw new Error("expected generated");
    expect(adapter.submissions).toHaveLength(1);
    expect(budget.attributions).toHaveLength(1);

    const second = await port.generate({
      request: baseRequest({ generationId: "video-gen-002" }),
      dispatchContext: dispatchContext(),
      correlationId: "corr-004",
      evaluatedAt: "2026-08-12T01:01:00.000Z",
      inputArtifactHashes: [promptHash, sourceImageHash],
    });
    expect(second.kind).toBe("cache-hit");
    expect(adapter.submissions).toHaveLength(1);
  });

  it("blocks paid dispatch when the budget preflight rejects the estimate", async () => {
    const adapter = new FakeVideoProviderAdapter("fake-video-v1", {
      kind: "complete",
    }, 200);
    const port = createPort(adapter);
    await expect(
      port.generate({
        request: baseRequest({ durationSeconds: 4 }),
        dispatchContext: dispatchContext(),
        correlationId: "corr-005",
        evaluatedAt: "2026-08-12T01:00:00.000Z",
        inputArtifactHashes: [promptHash, sourceImageHash],
      })
    ).rejects.toThrow("Video generation estimate exceeds the test budget.");
    expect(adapter.submissions).toHaveLength(0);
  });

  it("returns ambiguous effects without auto-retry and reconciles them explicitly", async () => {
    const adapter = new FakeVideoProviderAdapter("fake-video-v1", {
      kind: "ambiguous",
      message: "Provider accepted but artifact state is unknown.",
    });
    const port = createPort(adapter);
    const request = baseRequest({ generationId: "video-gen-ambiguous" });

    const outcome = await port.generate({
      request,
      dispatchContext: dispatchContext(),
      correlationId: "corr-006",
      evaluatedAt: "2026-08-12T01:00:00.000Z",
      inputArtifactHashes: [promptHash, sourceImageHash],
    });
    expect(outcome.kind).toBe("ambiguous");
    if (outcome.kind !== "ambiguous") throw new Error("expected ambiguous");
    expect(shouldRetryAmbiguousVideoEffect(outcome.effect)).toBe(true);
    expect(adapter.submissions).toHaveLength(1);

    const reconciled = await port.reconcileAmbiguousEffect({
      effect: outcome.effect,
      request,
      providerEvidence: { resolveAs: "completed" },
      correlationId: "corr-007",
      evaluatedAt: "2026-08-12T01:05:00.000Z",
    });
    expect(reconciled.kind).toBe("generated");
    expect(adapter.reconciliations).toHaveLength(1);
    expect(adapter.submissions).toHaveLength(1);
  });

  it("honors forceRegeneration by bypassing a warm cache entry", async () => {
    const adapter = new FakeVideoProviderAdapter();
    const port = createPort(adapter);
    const context = dispatchContext();

    await port.generate({
      request: baseRequest(),
      dispatchContext: context,
      correlationId: "corr-008",
      evaluatedAt: "2026-08-12T01:00:00.000Z",
      inputArtifactHashes: [promptHash, sourceImageHash],
    });
    const forced = await port.generate({
      request: baseRequest({
        generationId: "video-gen-forced",
        forceRegeneration: true,
      }),
      dispatchContext: context,
      correlationId: "corr-009",
      evaluatedAt: "2026-08-12T01:01:00.000Z",
      inputArtifactHashes: [promptHash, sourceImageHash],
    });
    expect(forced.kind).toBe("generated");
    expect(adapter.submissions).toHaveLength(2);
  });
});
