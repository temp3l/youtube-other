import { describe, expect, expectTypeOf, it } from "vitest";
import {
  characterizeOpenAiRetryEnvelope,
  classifyPaidOpenAiFailure,
  createBatchSubmissionKey,
  createLogicalRequestFingerprint,
  createPaidOpenAiRequestDescriptor,
  createPromptCacheRoutingKey,
  createPromptPrefixFingerprint,
  createResultCacheKey,
  normalizeOpenAiUsage,
  summarizePromptCacheRoutingThroughput,
  type PromptCacheRoutingKey,
  type ResultCacheKey,
} from "./openai-paid-request.js";

const logicalInput = {
  operation: "story-localization",
  provider: "openai",
  model: "gpt-5.6-terra",
  reasoning: { effort: "low" },
  semanticInput: { locale: "de", storyHash: "story-a" },
  outputContractVersion: "story.v3",
  promptPolicyVersion: "story-prompt.v5",
  locale: "de",
  providerConfiguration: { maxOutputTokens: 12_000 },
} as const;

describe("OpenAI paid-request identity", () => {
  it("keeps logical identity stable across retries and irrelevant telemetry", () => {
    const first = createLogicalRequestFingerprint({
      ...logicalInput,
      operationalMetadata: {
        requestId: "req-1",
        generatedAt: "2026-08-11T10:00:00.000Z",
      },
    });
    const second = createLogicalRequestFingerprint({
      ...logicalInput,
      operationalMetadata: {
        requestId: "req-2",
        generatedAt: "2026-08-11T11:00:00.000Z",
      },
    });
    expect(first).toBe(second);
    expect(createResultCacheKey(first)).toBe(createResultCacheKey(second));
  });

  it("invalidates logical identity for semantic, model, reasoning, and contract changes", () => {
    const baseline = createLogicalRequestFingerprint(logicalInput);
    expect(
      createLogicalRequestFingerprint({
        ...logicalInput,
        semanticInput: { locale: "de", storyHash: "story-b" },
      })
    ).not.toBe(baseline);
    expect(
      createLogicalRequestFingerprint({ ...logicalInput, model: "gpt-5.6-sol" })
    ).not.toBe(baseline);
    expect(
      createLogicalRequestFingerprint({
        ...logicalInput,
        reasoning: { effort: "medium" },
      })
    ).not.toBe(baseline);
    expect(
      createLogicalRequestFingerprint({
        ...logicalInput,
        outputContractVersion: "story.v4",
      })
    ).not.toBe(baseline);
  });

  it("keeps dynamic suffixes out of prefix and routing identities", () => {
    const first = createPromptPrefixFingerprint({
      provider: "openai",
      modelFamily: "gpt-5.6",
      promptFamily: "story-localization",
      promptPolicyVersion: "story-prompt.v5",
      outputContractVersion: "story.v3",
      stablePrefix: "stable rubric and schema",
      dynamicSuffix: { episodeId: "episode-1", story: "first" },
    });
    const second = createPromptPrefixFingerprint({
      provider: "openai",
      modelFamily: "gpt-5.6",
      promptFamily: "story-localization",
      promptPolicyVersion: "story-prompt.v5",
      outputContractVersion: "story.v3",
      stablePrefix: "stable rubric and schema",
      dynamicSuffix: { episodeId: "episode-2", story: "second" },
    });
    expect(first).toBe(second);
    expect(
      createPromptCacheRoutingKey({
        promptFamily: "story-localization",
        modelFamily: "gpt-5.6",
        promptPrefixFingerprint: first,
      })
    ).toBe(
      createPromptCacheRoutingKey({
        promptFamily: "story-localization",
        modelFamily: "gpt-5.6",
        promptPrefixFingerprint: second,
      })
    );
  });

  it("includes stable provider-rendered schemas in prefix identity", () => {
    const input = {
      provider: "openai" as const,
      modelFamily: "gpt-5.6",
      promptFamily: "story-localization",
      promptPolicyVersion: "story-prompt.v5",
      outputContractVersion: "story.v3",
      stablePrefix: "stable trust boundary",
    };
    const first = createPromptPrefixFingerprint({
      ...input,
      stableProviderPrefix: {
        structuredOutputFormat: '{"schema":{"type":"object"}}',
      },
      dynamicSuffix: { story: "first" },
    });
    const samePrefix = createPromptPrefixFingerprint({
      ...input,
      stableProviderPrefix: {
        structuredOutputFormat: '{"schema":{"type":"object"}}',
      },
      dynamicSuffix: { story: "second" },
    });
    const changedSchema = createPromptPrefixFingerprint({
      ...input,
      stableProviderPrefix: {
        structuredOutputFormat:
          '{"schema":{"type":"object","required":["story"]}}',
      },
    });
    expect(first).toBe(samePrefix);
    expect(first).not.toBe(changedSchema);
  });

  it("keeps result, routing, and batch keys type-distinct", () => {
    const logical = createLogicalRequestFingerprint(logicalInput);
    const result = createResultCacheKey(logical);
    const prefix = createPromptPrefixFingerprint({
      provider: "openai",
      modelFamily: "gpt-5.6",
      promptFamily: "story-localization",
      promptPolicyVersion: "story-prompt.v5",
      outputContractVersion: "story.v3",
      stablePrefix: "stable",
    });
    const routing = createPromptCacheRoutingKey({
      promptFamily: "story-localization",
      modelFamily: "gpt-5.6",
      promptPrefixFingerprint: prefix,
    });
    const batch = createBatchSubmissionKey({
      provider: "openai",
      endpoint: "/v1/responses",
      completionWindow: "24h",
      inputManifest: { sha256: "a".repeat(64) },
    });
    expectTypeOf(result).toMatchTypeOf<ResultCacheKey>();
    expectTypeOf(routing).toMatchTypeOf<PromptCacheRoutingKey>();
    expectTypeOf(routing).not.toMatchTypeOf<ResultCacheKey>();
    expect(result).not.toBe(routing);
    expect(batch).not.toBe(result);
  });
});

describe("OpenAI retry and outcome contracts", () => {
  it("rejects multiplied SDK and application retry ownership", () => {
    expect(() =>
      characterizeOpenAiRetryEnvelope({
        sdkMaxRetries: 2,
        applicationMaxRetries: 2,
        repairActions: 0,
        escalationActions: 0,
        fallbackActions: 0,
      })
    ).toThrow("cannot both be enabled");
    expect(
      characterizeOpenAiRetryEnvelope({
        sdkMaxRetries: 0,
        applicationMaxRetries: 2,
        repairActions: 1,
        escalationActions: 1,
        fallbackActions: 0,
      })
    ).toMatchObject({
      transportRetryOwner: "application",
      transportAttemptsPerLogicalAction: 3,
      maximumLogicalActions: 3,
      maximumPhysicalProviderAttempts: 9,
    });
  });

  it("keeps retry, repair, and escalation reasons separate in the descriptor", () => {
    const logicalRequestFingerprint = createLogicalRequestFingerprint(logicalInput);
    const descriptor = createPaidOpenAiRequestDescriptor({
      provider: "openai",
      operationId: "story-localization.generate",
      callFamily: "story-localization",
      logicalRequestFingerprint,
      model: logicalInput.model,
      reasoning: logicalInput.reasoning,
      serviceTier: "default",
      timeoutMs: 120_000,
      retryPolicy: {
        owner: "application",
        maxTransportRetries: 2,
        backoff: "exponential-jitter",
      },
      modality: "text",
      executionTopology: "single-process",
    });
    expect(descriptor.retryPolicy).toEqual({
      owner: "application",
      maxTransportRetries: 2,
      backoff: "exponential-jitter",
    });
    expect(descriptor).not.toHaveProperty("repairReason");
    expect(descriptor).not.toHaveProperty("escalationReason");
  });

  it("classifies only pre-dispatch failures as definitely effect-free", () => {
    expect(
      classifyPaidOpenAiFailure({ dispatchStarted: false, error: new Error("file") })
        .kind
    ).toBe("definitely-failed-before-provider-effect");
    expect(
      classifyPaidOpenAiFailure({ dispatchStarted: true, error: new Error("timeout") })
        .kind
    ).toBe("ambiguous-provider-effect");
    expect(
      classifyPaidOpenAiFailure({
        dispatchStarted: true,
        error: { status: 400, message: "invalid request" },
      }).kind
    ).toBe("provider-rejection");
  });
});

describe("OpenAI usage normalization", () => {
  it("keeps uncached, cached, write, reasoning, and output categories exclusive", () => {
    expect(
      normalizeOpenAiUsage({
        inputTokens: 1_000,
        cachedInputTokens: 300,
        cacheWriteInputTokens: 200,
        reasoningTokens: 50,
        outputTokens: 100,
        imageCount: 1,
      })
    ).toEqual({
      inputTokens: 1_000,
      uncachedInputTokens: 500,
      cachedInputTokens: 300,
      cacheWriteInputTokens: 200,
      reasoningTokens: 50,
      outputTokens: 100,
      audioInputTokens: 0,
      audioOutputTokens: 0,
      audioDurationSeconds: 0,
      transcriptionDurationSeconds: 0,
      imageCount: 1,
    });
    expect(() =>
      normalizeOpenAiUsage({
        inputTokens: 100,
        cachedInputTokens: 80,
        cacheWriteInputTokens: 30,
      })
    ).toThrow("cannot exceed total input tokens");
  });

  it("measures routing-key throughput and cache ROI without prompt contents", () => {
    const logicalRequestFingerprint = createLogicalRequestFingerprint(logicalInput);
    const prefix = createPromptPrefixFingerprint({
      provider: "openai",
      modelFamily: "gpt-5.6",
      promptFamily: "story-localization",
      promptPolicyVersion: "story-prompt.v5",
      outputContractVersion: "story.v3",
      stablePrefix: "stable",
    });
    const routingKey = createPromptCacheRoutingKey({
      promptFamily: "story-localization",
      modelFamily: "gpt-5.6",
      promptPrefixFingerprint: prefix,
    });
    const descriptor = createPaidOpenAiRequestDescriptor({
      provider: "openai",
      operationId: "story-localization.generate",
      callFamily: "story-localization",
      logicalRequestFingerprint,
      model: "gpt-5.6-terra",
      reasoning: { effort: "low" },
      serviceTier: "default",
      timeoutMs: 120_000,
      retryPolicy: { owner: "none", maxTransportRetries: 0, backoff: "none" },
      modality: "text",
      executionTopology: "single-process",
    });
    const usage = normalizeOpenAiUsage({
      inputTokens: 1_000,
      cachedInputTokens: 800,
      outputTokens: 100,
    });
    const summary = summarizePromptCacheRoutingThroughput([
      {
        descriptor,
        physicalAttempt: 1,
        startedAt: "2026-08-11T10:00:00.000Z",
        latencyMs: 100,
        outcome: "success",
        usage,
        promptCacheRoutingKey: routingKey,
        promptPolicyVersion: "story-prompt.v5",
        estimatedUncachedCostMicros: 100,
        estimatedActualCostMicros: 40,
        estimatedCacheWritePremiumMicros: 0,
        estimatedCachedReadSavingsMicros: 60,
      },
      {
        descriptor,
        physicalAttempt: 1,
        startedAt: "2026-08-11T10:00:30.000Z",
        latencyMs: 90,
        outcome: "success",
        usage,
        promptCacheRoutingKey: routingKey,
        promptPolicyVersion: "story-prompt.v5",
        estimatedUncachedCostMicros: 100,
        estimatedActualCostMicros: 40,
        estimatedCacheWritePremiumMicros: 0,
        estimatedCachedReadSavingsMicros: 60,
      },
    ]);
    expect(summary[0]).toMatchObject({
      requestCount: 2,
      peakRequestsPerMinute: 2,
      cacheReadRequests: 2,
      cacheHitRate: 1,
      estimatedNetSavingsMicros: 120,
      estimatedCacheWritePremiumMicros: 0,
      estimatedCachedReadSavingsMicros: 120,
      cacheRoi: 1.5,
      promptPolicyVersions: ["story-prompt.v5"],
    });
    expect(JSON.stringify(summary)).not.toContain("stable rubric");
  });
});
