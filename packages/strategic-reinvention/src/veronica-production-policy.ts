import type { PositioningFormat } from "./positioning-visual-contracts.js";

/**
 * Variant policy is deliberately downstream from shared semantic planning.
 * It selects representation and cadence only; it never changes meaning.
 */
export interface VeronicaProductionPolicy {
  readonly format: PositioningFormat;
  readonly eventDurationRangeSeconds: readonly [number, number];
  readonly stateComplexityRepresentation: "decisive-still" | "multi-state-sequence";
  readonly providerPromptLabel: string;
  readonly applyShortCausalRemediation: boolean;
  readonly semanticAutoRemediation: {
    readonly enabled: true;
    readonly maxRounds: 2;
    readonly actionableWarnings: readonly ["MULTI_STATE_STILL_AMBIGUITY"] | readonly [];
    readonly policyVersion: "veronica-semantic-auto-remediation.v1";
  };
}

const SHORT_POLICY: VeronicaProductionPolicy = {
  format: "short",
  eventDurationRangeSeconds: [3, 7],
  stateComplexityRepresentation: "decisive-still",
  providerPromptLabel: "Veronica conceptual Short",
  applyShortCausalRemediation: true,
  semanticAutoRemediation: {
    enabled: true,
    maxRounds: 2,
    actionableWarnings: ["MULTI_STATE_STILL_AMBIGUITY"],
    policyVersion: "veronica-semantic-auto-remediation.v1",
  },
};

const FULL_POLICY: VeronicaProductionPolicy = {
  format: "long",
  eventDurationRangeSeconds: [6, 15],
  stateComplexityRepresentation: "multi-state-sequence",
  providerPromptLabel: "Veronica long-form editorial sequence",
  applyShortCausalRemediation: false,
  semanticAutoRemediation: {
    enabled: true,
    maxRounds: 2,
    actionableWarnings: [],
    policyVersion: "veronica-semantic-auto-remediation.v1",
  },
};

export function resolveVeronicaProductionPolicy(
  format: PositioningFormat,
): VeronicaProductionPolicy {
  return format === "short" ? SHORT_POLICY : FULL_POLICY;
}
