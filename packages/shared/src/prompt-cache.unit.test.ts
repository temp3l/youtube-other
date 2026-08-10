import { describe, expect, it } from "vitest";
import {
  aggregatePromptCacheUsage,
  buildOpenAiResponsesPromptCacheKey,
  buildPromptCacheKey,
  normalizeOpenAiResponsesPromptCacheUsage,
  openAiPromptCacheFields,
  planOpenAiResponsesPromptCache,
  planPromptCache,
  renderCacheablePrompt,
  stablePromptCacheShard,
} from "./prompt-cache.js";

describe("prompt cache planning", () => {
  it("keeps dynamic content after an identical stable prefix", () => {
    const first = renderCacheablePrompt({
      stableBlocks: [
        { id: "contract", content: "Stable rules\r\nNo scaffolding" },
      ],
      dynamicBlocks: [{ id: "story", content: "Episode 30 Clara" }],
    });
    const second = renderCacheablePrompt({
      stableBlocks: [
        { id: "contract", content: "Stable rules\nNo scaffolding" },
      ],
      dynamicBlocks: [{ id: "story", content: "Episode 31 David" }],
    });
    expect(first.staticPrefix).toBe(second.staticPrefix);
    expect(first.rendered.indexOf("Episode 30")).toBeGreaterThan(
      first.staticPrefix.length
    );
    expect(first.breakpointAfterBlock).toBe("contract");
  });

  it("uses privacy-preserving reference classes and deterministic shards", () => {
    const key = buildPromptCacheKey(
      {
        family: "image-scene",
        version: "v5",
        operation: "scene",
        format: "full",
        language: "de",
        modelTier: "image-2",
        aspectBucket: "16x9",
        referenceBundleClass: "Clara /home/private/reference.png",
      },
      2
    );
    expect(key).toMatch(
      /^mediaforge:image-scene:v5:scene:full:de:image-2:16x9:[a-f0-9]{12}:shard-2$/u
    );
    expect(key).not.toContain("Clara");
    expect(key).not.toContain("private");
    expect(stablePromptCacheShard("scene-03", 4)).toBe(
      stablePromptCacheShard("scene-03", 4)
    );
  });

  it("reuses language-independent visual prompt keys across locales and aliases", () => {
    const common = {
      profileId: "strategic-reinvention",
      family: "image-scene",
      version: "v5",
      operation: "scene",
      format: "full",
      modelTier: "image-2",
      languageIndependent: true,
    } as const;
    expect(buildPromptCacheKey({ ...common, language: "it" }, 1)).toBe(
      buildPromptCacheKey(
        { ...common, profileId: "veronicabenini", language: "de" },
        1
      )
    );
  });

  it("only enables explicit caching for eligible reused prefixes", () => {
    const plan = planPromptCache({
      modelSupportsExplicitCaching: true,
      reusablePrefix: "stable ".repeat(900),
      expectedReuseCount: 3,
      itemIdentity: "scene-03",
      keyParts: {
        family: "image-scene",
        version: "v5",
        operation: "scene",
        format: "full",
        language: "en",
        modelTier: "image-2",
      },
      breakpointAfterBlock: "references",
    });
    expect(plan.mode).toBe("explicit");
    expect(openAiPromptCacheFields(plan)).toEqual({
      prompt_cache_key: plan.cacheKey,
      prompt_cache_retention: "in_memory",
    });
    expect(
      planPromptCache({
        modelSupportsExplicitCaching: true,
        reusablePrefix: "small",
        expectedReuseCount: 1,
        itemIdentity: "repair",
        keyParts: {
          family: "repair",
          version: "v1",
          operation: "repair",
          format: "full",
          language: "en",
          modelTier: "image-2",
        },
        breakpointAfterBlock: "rules",
        repair: true,
      }).mode
    ).toBe("implicit");
  });

  it("derives Responses cache keys from the stable contract, not episode data", () => {
    const contract = {
      genre: "history",
      planner: "visual-direction",
      contractVersion: "v1",
      schemaVersion: "v1",
      modelFamily: "gpt",
      stablePrefix: "Stable instructions only",
    } as const;
    expect(buildOpenAiResponsesPromptCacheKey(contract, 0)).toBe(
      buildOpenAiResponsesPromptCacheKey(contract, 0)
    );
    expect(
      planOpenAiResponsesPromptCache({
        model: "gpt-4.1-mini",
        reusablePrefix: "stable ".repeat(900),
        expectedReuseCount: 2,
        itemIdentity: "constant-planner-identity",
        contract,
        breakpointAfterBlock: "contract",
      }).cacheKey
    ).toBe(buildOpenAiResponsesPromptCacheKey(contract, 0));
  });

  it("fails closed for unsupported models and short stable prefixes", () => {
    const contract = {
      genre: "history",
      planner: "visual-direction",
      contractVersion: "v1",
      schemaVersion: "v1",
      modelFamily: "image",
      stablePrefix: "stable ".repeat(900),
    } as const;
    expect(
      planOpenAiResponsesPromptCache({
        model: "gpt-image-2",
        reusablePrefix: contract.stablePrefix,
        expectedReuseCount: 2,
        itemIdentity: "planner",
        contract,
        breakpointAfterBlock: "contract",
      })
    ).toMatchObject({ mode: "disabled", downgradeReason: "MODEL_UNSUPPORTED" });
    expect(
      planOpenAiResponsesPromptCache({
        model: "gpt-4.1-mini",
        reusablePrefix: "short",
        expectedReuseCount: 2,
        itemIdentity: "planner",
        contract: { ...contract, modelFamily: "gpt", stablePrefix: "short" },
        breakpointAfterBlock: "contract",
      })
    ).toMatchObject({ mode: "implicit", downgradeReason: "PREFIX_TOO_SHORT" });
  });

  it("normalizes provider cache reads without reporting writes not supplied by Responses", () => {
    expect(
      normalizeOpenAiResponsesPromptCacheUsage({
        inputTokens: 2_000,
        cachedInputTokens: 1_500,
      })
    ).toEqual({ inputTokens: 2_000, cachedInputTokens: 1_500, cacheRead: true });
  });

  it("aggregates cache reads, writes, and savings by requested dimensions", () => {
    const aggregates = aggregatePromptCacheUsage(
      [
        {
          model: "gpt-5.6-terra",
          promptFamily: "story-localize",
          promptVersion: "v3",
          language: "de",
          format: "full",
          stage: "localization",
          batch: "batch-1",
          cacheKey: "safe-key",
          inputTokens: 2_000,
          cachedInputTokens: 1_500,
          cacheWriteTokens: 0,
          outputTokens: 500,
          reasoningTokens: 50,
          estimatedUncachedCostUsd: 1,
          estimatedActualCostUsd: 0.6,
        },
      ],
      ["model", "language", "cacheKey"]
    );
    expect(aggregates[0]).toMatchObject({
      recordCount: 1,
      cacheReadRatio: 0.75,
      estimatedSavingsUsd: 0.4,
    });
  });
});
