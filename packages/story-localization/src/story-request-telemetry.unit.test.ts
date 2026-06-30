import { describe, expect, it } from "vitest";
import {
  aggregateStoryTelemetryAttempts,
  buildStoryRequestFingerprint,
  normalizeStoryCostRecord,
  type StoryRequestFingerprintInput,
} from "./story-request-telemetry.js";

function baseFingerprint(
  overrides: Partial<StoryRequestFingerprintInput> = {}
): StoryRequestFingerprintInput {
  return {
    episodeSlug: "episode-one",
    language: "en",
    locale: "en-US",
    variant: "full",
    owner: "narration",
    provider: "openai",
    model: "gpt-5.5",
    stage: "canonical-full",
    purpose: "initial-generation",
    promptCompilerVersion: "story-prompt-compiler-v1",
    promptFingerprint: "prompt-fingerprint",
    promptModuleFingerprints: ["module-a", "module-b"],
    responseSchemaName: "full_narration_story_package",
    responseSchemaVersion: "1",
    responseSchemaFingerprint: "schema-fingerprint",
    reasoningEffort: "high",
    maxOutputTokens: 2000,
    storyIrHash: "a".repeat(64),
    fullContractHash: "b".repeat(64),
    fullContractVersion: "full-story-contract-v1",
    targetWordRange: { min: 500, max: 900 },
    ...overrides,
  } as StoryRequestFingerprintInput;
}

describe("story request telemetry", () => {
  it("keeps semantically identical fingerprints deterministic", () => {
    expect(buildStoryRequestFingerprint(baseFingerprint())).toBe(
      buildStoryRequestFingerprint(baseFingerprint())
    );
  });

  it("changes fingerprints when material request dimensions change", () => {
    const base = buildStoryRequestFingerprint(baseFingerprint());
    expect(
      buildStoryRequestFingerprint(baseFingerprint({ model: "gpt-5-mini" }))
    ).not.toBe(base);
    expect(
      buildStoryRequestFingerprint(baseFingerprint({ locale: "es-419", language: "es" }))
    ).not.toBe(base);
    expect(
      buildStoryRequestFingerprint(
        baseFingerprint({
          stage: "localized-full",
          purpose: "localization",
          locale: "es-419",
          language: "es",
          parent: {
            kind: "canonical-english-full",
            language: "en",
            locale: "en-US",
            variant: "full",
            fingerprint: "c".repeat(64),
          },
        })
      )
    ).not.toBe(base);
  });

  it("keeps non-semantic metadata out of canonical request identity", () => {
    const left = buildStoryRequestFingerprint(
      baseFingerprint({ promptModuleFingerprints: ["module-b", "module-a"] })
    );
    const right = buildStoryRequestFingerprint(
      baseFingerprint({ promptModuleFingerprints: ["module-a", "module-b"] })
    );
    expect(left).toBe(right);
  });

  it("normalizes success and unknown-cost records without fabricating zeros", () => {
    const success = normalizeStoryCostRecord({
      provider: "openai",
      model: "gpt-5.5",
      pricing: {
        inputUsdPerMillionTokens: 2,
        cachedInputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 8,
      },
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 200,
        outputTokens: 500,
        reasoningTokens: 50,
      },
    });
    expect(success.amountKind).toBe("estimated");
    expect(success.estimatedCachedInputCostUsd).toBeGreaterThan(0);
    expect(success.totalEstimatedCostUsd).toBeGreaterThan(0);

    const unknown = normalizeStoryCostRecord({
      provider: "openai",
      model: "gpt-5.5",
      usage: {
        inputTokens: 1000,
      },
    });
    expect(unknown.amountKind).toBe("unavailable");
    expect(unknown.totalEstimatedCostUsd).toBeNull();
  });

  it("aggregates telemetry by stage, status, locale, variant, and model", () => {
    const aggregates = aggregateStoryTelemetryAttempts([
      {
        episodeSlug: "episode-one",
        language: "en",
        locale: "en-US",
        variant: "full",
        owner: "narration",
        stage: "canonical-full",
        status: "success",
        provider: "openai",
        model: "gpt-5.5",
        repair: false,
        retryCount: 0,
        cost: normalizeStoryCostRecord({
          provider: "openai",
          model: "gpt-5.5",
          pricing: {
            inputUsdPerMillionTokens: 2,
            outputUsdPerMillionTokens: 8,
          },
          usage: { inputTokens: 100, outputTokens: 50 },
        }),
      },
      {
        episodeSlug: "episode-one",
        language: "es",
        locale: "es-419",
        variant: "full",
        owner: "narration",
        stage: "localized-full",
        status: "failed",
        provider: "openai",
        model: "gpt-5.5",
        repair: true,
        retryCount: 1,
        duplicateSuppressionCount: 1,
        failureReason: "max_output_tokens",
        cost: normalizeStoryCostRecord({
          provider: "openai",
          model: "gpt-5.5",
          usage: { inputTokens: 100 },
        }),
      },
    ]);
    expect(aggregates).toHaveLength(2);
    const success = aggregates.find((entry) => entry.status === "success");
    const failed = aggregates.find((entry) => entry.status === "failed");
    expect(success?.totalCalls).toBe(1);
    expect(failed?.failedCalls).toBe(1);
    expect(failed?.unknownCostCount).toBe(1);
    expect(failed?.duplicateSuppressionCount).toBe(1);
  });
});
