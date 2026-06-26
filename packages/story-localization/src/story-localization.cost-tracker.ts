import { type ModelPricing } from "./story-localization.types.js";

export interface StoryLocalizationUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
}

export interface StoryLocalizationCostResult {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number | null;
}

export function estimateStoryLocalizationCost(
  pricing: ModelPricing | undefined,
  usage: StoryLocalizationUsage
): StoryLocalizationCostResult {
  const inputTokens = usage.inputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  if (!pricing) {
    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: null,
    };
  }
  const regularInput = Math.max(0, inputTokens - cachedInputTokens);
  const inputCost = (regularInput / 1_000_000) * pricing.inputUsdPerMillionTokens;
  const cachedCost =
    pricing.cachedInputUsdPerMillionTokens === undefined
      ? 0
      : (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPerMillionTokens;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: inputCost + cachedCost + outputCost,
  };
}

