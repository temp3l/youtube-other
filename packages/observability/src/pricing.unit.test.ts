import { describe, expect, it } from "vitest";
import { estimateTokenCostMicros } from "./pricing.js";

describe("token pricing", () => {
  const pricing = {
    inputTokensMicros: 10,
    cachedInputTokensMicros: 1,
    cacheWriteInputTokensMicros: 12,
    outputTokensMicros: 20,
  } as const;

  it("prices mutually exclusive uncached, cached, cache-write, and output tokens", () => {
    const result = estimateTokenCostMicros(pricing, {
      inputTokens: 1_000,
      cachedInputTokens: 300,
      cacheWriteInputTokens: 200,
      outputTokens: 100,
    });
    expect(result).toEqual({
      pricingVersion: "configured",
      costMicros: 9_700,
      warning: undefined,
    });
  });

  it("does not price cached or cache-write tokens again as ordinary input", () => {
    expect(
      estimateTokenCostMicros(pricing, {
        inputTokens: 500,
        cachedInputTokens: 500,
      }).costMicros
    ).toBe(500);
    expect(
      estimateTokenCostMicros(pricing, {
        inputTokens: 500,
        cacheWriteInputTokens: 500,
      }).costMicros
    ).toBe(6_000);
  });

  it("keeps impossible and unpriced usage detectable", () => {
    expect(
      estimateTokenCostMicros(pricing, {
        inputTokens: 100,
        cachedInputTokens: 80,
        cacheWriteInputTokens: 30,
      })
    ).toMatchObject({ costMicros: null, warning: expect.stringContaining("Invalid") });
    expect(estimateTokenCostMicros(undefined, { inputTokens: 1 })).toMatchObject({
      costMicros: null,
      warning: "Missing token pricing.",
    });
    expect(
      estimateTokenCostMicros(
        { inputTokensMicros: 10 },
        { inputTokens: 100, cacheWriteInputTokens: 25 }
      )
    ).toMatchObject({
      costMicros: null,
      warning: "Missing cache-write input token pricing entry.",
    });
  });
});
