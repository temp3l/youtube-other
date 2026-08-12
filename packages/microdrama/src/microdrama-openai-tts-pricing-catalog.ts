import { estimateSpeechCharacterPricing } from "../../speech/src/platform/pricing.js";

export const MICRODRAMA_OPENAI_TTS_PRICING_REVISION =
  "microdrama.openai-tts.planning.v1" as const;

/**
 * Planning-only OpenAI TTS character pricing for bounded microdrama canaries.
 * Rates mirror the speech platform unit-test fixture; not live provider list prices.
 */
export const MICRODRAMA_OPENAI_TTS_PLANNING_PRICING = {
  id: MICRODRAMA_OPENAI_TTS_PRICING_REVISION,
  provider: "openai" as const,
  currencyAmountPerThousandCharacters: 0.2,
  currency: "usd",
  activeFrom: "2026-08-01T00:00:00.000Z",
};

const MINOR_PER_USD = 100;

export function estimateMicrodramaOpenAiTtsCostMinor(input: {
  readonly billableCharacters: number;
}): {
  readonly pricingRevision: typeof MICRODRAMA_OPENAI_TTS_PRICING_REVISION;
  readonly billableCharacters: number;
  readonly estimatedCurrencyAmount: number;
  readonly currency: string;
  readonly estimatedCostMinor: number;
} {
  const estimate = estimateSpeechCharacterPricing(
    input.billableCharacters,
    MICRODRAMA_OPENAI_TTS_PLANNING_PRICING
  );
  const estimatedCurrencyAmount = estimate.estimatedCurrencyAmount ?? 0;
  return {
    pricingRevision: MICRODRAMA_OPENAI_TTS_PRICING_REVISION,
    billableCharacters: input.billableCharacters,
    estimatedCurrencyAmount,
    currency: estimate.currency ?? "USD",
    estimatedCostMinor: Math.ceil(estimatedCurrencyAmount * MINOR_PER_USD),
  };
}

export function proposeMicrodramaTtsCanaryCostLimitMinor(input: {
  readonly billableCharacters: number;
  readonly maximumTotalProviderRequests: number;
  readonly initialProviderSyntheses: number;
}): {
  readonly expectedBaseCostMinor: number;
  readonly retryReserveMinor: number;
  readonly proposedMaximumCostMinor: number;
  readonly currency: string;
  readonly pricingRevision: typeof MICRODRAMA_OPENAI_TTS_PRICING_REVISION;
} {
  const base = estimateMicrodramaOpenAiTtsCostMinor({
    billableCharacters: input.billableCharacters,
  });
  const perRequestMinor = Math.max(
    1,
    Math.ceil(base.estimatedCostMinor / Math.max(1, input.initialProviderSyntheses))
  );
  const retryReserveMinor =
    perRequestMinor * (input.maximumTotalProviderRequests - input.initialProviderSyntheses);
  return {
    expectedBaseCostMinor: base.estimatedCostMinor,
    retryReserveMinor,
    proposedMaximumCostMinor: base.estimatedCostMinor + retryReserveMinor,
    currency: base.currency,
    pricingRevision: base.pricingRevision,
  };
}
