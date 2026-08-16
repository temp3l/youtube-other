import { describe, expect, it } from "vitest";

import {
  MICRO_033_CANARY_TOTAL_BILLABLE_CHARACTERS,
  computeMicro033ProviderConfigRevision,
  MICRO_033_PLANNING_OPENAI_TTS_MODEL_CONFIGURATION,
  resolveMicro033CanaryCostProposal,
  resolveMicro033CanaryEpisodeCostMinorAllocations,
} from "./micro-033-canary-bindings.js";

describe("MICRO-033 canary bindings", () => {
  it("allocates the planning cost ceiling across E001-E003 episodes", () => {
    const proposal = resolveMicro033CanaryCostProposal();
    const allocations = resolveMicro033CanaryEpisodeCostMinorAllocations();

    expect(proposal.proposedMaximumCostMinor).toBe(199);
    expect(allocations).toEqual({ E001: 64, E002: 67, E003: 68 });
    expect(
      Object.values(allocations).reduce((sum, value) => sum + value, 0)
    ).toBe(proposal.proposedMaximumCostMinor);
  });

  it("anchors billable character totals for the authorization pack", () => {
    expect(MICRO_033_CANARY_TOTAL_BILLABLE_CHARACTERS).toBe(2543);
    expect(computeMicro033ProviderConfigRevision(
      MICRO_033_PLANNING_OPENAI_TTS_MODEL_CONFIGURATION
    )).toBe(
      "a5b5a465a3c8cb33cb71467421e0e7d9471143342cecbb88511e5c9ff2a967e9"
    );
  });
});
