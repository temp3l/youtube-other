import type { SpeechCostEstimate, SpeechProviderId } from "./contracts.js";

export interface SpeechPricingVersion {
  readonly id: string;
  readonly provider: SpeechProviderId;
  readonly creditsPerThousandCharacters?: number;
  readonly currencyAmountPerThousandCharacters?: number;
  readonly currency?: string;
  readonly activeFrom: string;
}

export function estimateSpeechCharacterPricing(
  billableCharacters: number,
  pricing: SpeechPricingVersion
): SpeechCostEstimate {
  if (!Number.isSafeInteger(billableCharacters) || billableCharacters < 0)
    throw new Error("Billable characters must be a non-negative integer.");
  const units = billableCharacters / 1_000;
  return {
    billableCharacters,
    ...(pricing.creditsPerThousandCharacters === undefined
      ? {}
      : { estimatedCredits: units * pricing.creditsPerThousandCharacters }),
    ...(pricing.currencyAmountPerThousandCharacters === undefined
      ? {}
      : {
          estimatedCurrencyAmount:
            units * pricing.currencyAmountPerThousandCharacters,
        }),
    ...(pricing.currency ? { currency: pricing.currency.toUpperCase() } : {}),
  };
}
