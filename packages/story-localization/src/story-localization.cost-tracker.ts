import { type ModelPricing } from "./story-localization.types.js";
import {
  aggregateStoryTelemetryAttempts,
  normalizeStoryCostRecord,
  type NormalizedCostRecord,
  type StoryTelemetryAggregate,
  type StoryTelemetryAttempt,
} from "./story-request-telemetry.js";

export interface StoryLocalizationUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
}

export interface StoryLocalizationCostResult {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly normalized: NormalizedCostRecord;
}

export function estimateStoryLocalizationCost(
  pricing: ModelPricing | undefined,
  usage: StoryLocalizationUsage
): StoryLocalizationCostResult {
  const inputTokens = usage.inputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  if (!pricing) {
    const normalized = normalizeStoryCostRecord({
      provider: "openai",
      model: "unknown",
      usage,
    });
    return {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      estimatedCostUsd: null,
      normalized,
    };
  }
  const regularInput = Math.max(0, inputTokens - cachedInputTokens);
  const inputCost = (regularInput / 1_000_000) * pricing.inputUsdPerMillionTokens;
  const cachedCost =
    pricing.cachedInputUsdPerMillionTokens === undefined
      ? 0
      : (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPerMillionTokens;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  const estimatedCostUsd = inputCost + cachedCost + outputCost;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    estimatedCostUsd,
    normalized: normalizeStoryCostRecord({
      provider: "openai",
      model: "unknown",
      pricing,
      usage,
    }),
  };
}

export function aggregateStoryCosts(
  attempts: readonly StoryTelemetryAttempt[]
): readonly StoryTelemetryAggregate[] {
  return aggregateStoryTelemetryAttempts(attempts);
}
