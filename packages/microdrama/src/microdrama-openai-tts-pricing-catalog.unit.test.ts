import { describe, expect, it } from "vitest";

import {
  MICRODRAMA_OPENAI_TTS_PLANNING_PRICING,
  estimateMicrodramaOpenAiTtsCostMinor,
  proposeMicrodramaTtsCanaryCostLimitMinor,
} from "./microdrama-openai-tts-pricing-catalog.js";

describe("microdrama OpenAI TTS planning pricing", () => {
  it("estimates character-based cost for the MICRO-033 canary corpus", () => {
    const estimate = estimateMicrodramaOpenAiTtsCostMinor({
      billableCharacters: 2543,
    });
    expect(estimate.pricingRevision).toBe(MICRODRAMA_OPENAI_TTS_PLANNING_PRICING.id);
    expect(estimate.estimatedCurrencyAmount).toBe(0.5086);
    expect(estimate.estimatedCostMinor).toBe(51);
    expect(estimate.currency).toBe("USD");
  });

  it("proposes a bounded cost ceiling with retry headroom for 37 initial syntheses", () => {
    const proposal = proposeMicrodramaTtsCanaryCostLimitMinor({
      billableCharacters: 2543,
      initialProviderSyntheses: 37,
      maximumTotalProviderRequests: 111,
    });
    expect(proposal.expectedBaseCostMinor).toBe(51);
    expect(proposal.retryReserveMinor).toBe(148);
    expect(proposal.proposedMaximumCostMinor).toBe(199);
    expect(proposal.currency).toBe("USD");
  });
});
