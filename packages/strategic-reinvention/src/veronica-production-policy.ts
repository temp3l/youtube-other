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
  readonly visualBeatPacing: {
    readonly enabled: boolean;
    readonly policyVersion: "veronica-short-visual-density.v1";
    readonly windows: readonly {
      readonly startSeconds: number;
      readonly endSeconds: number | null;
      readonly preferredSecondsPerBeat: readonly [number, number];
    }[];
    readonly typicalAssetRange: readonly [number, number];
    readonly openingTargets: {
      readonly first5Seconds: readonly [number, number];
      readonly first10Seconds: readonly [number, number];
      readonly first15Seconds: readonly [number, number];
    };
  };
  readonly semanticAutoRemediation: {
    readonly enabled: true;
    readonly maxRounds: 2;
    readonly actionableWarnings: readonly ["MULTI_STATE_STILL_AMBIGUITY"] | readonly [];
    readonly policyVersion: "veronica-semantic-auto-remediation.v3";
    readonly maximumGenericFallbackSceneRate: 0.2;
    readonly maximumRepeatedSemanticFamilyRate: 0.6;
  };
}

const SHORT_POLICY: VeronicaProductionPolicy = {
  format: "short",
  eventDurationRangeSeconds: [3, 7],
  stateComplexityRepresentation: "decisive-still",
  providerPromptLabel: "Veronica conceptual Short",
  applyShortCausalRemediation: true,
  visualBeatPacing: {
    enabled: true,
    policyVersion: "veronica-short-visual-density.v1",
    windows: [
      { startSeconds: 0, endSeconds: 5, preferredSecondsPerBeat: [2.5, 3.5] },
      { startSeconds: 5, endSeconds: 12, preferredSecondsPerBeat: [3, 4.5] },
      { startSeconds: 12, endSeconds: 30, preferredSecondsPerBeat: [4.5, 6] },
      { startSeconds: 30, endSeconds: null, preferredSecondsPerBeat: [5, 7] },
    ],
    typicalAssetRange: [8, 10],
    openingTargets: { first5Seconds: [2, 2], first10Seconds: [3, 3], first15Seconds: [3, 4] },
  },
  semanticAutoRemediation: {
    enabled: true,
    maxRounds: 2,
    actionableWarnings: ["MULTI_STATE_STILL_AMBIGUITY"],
    policyVersion: "veronica-semantic-auto-remediation.v3",
    maximumGenericFallbackSceneRate: 0.2,
    maximumRepeatedSemanticFamilyRate: 0.6,
  },
};

const FULL_POLICY: VeronicaProductionPolicy = {
  format: "long",
  eventDurationRangeSeconds: [6, 15],
  stateComplexityRepresentation: "multi-state-sequence",
  providerPromptLabel: "Veronica long-form editorial sequence",
  applyShortCausalRemediation: false,
  visualBeatPacing: {
    enabled: false,
    policyVersion: "veronica-short-visual-density.v1",
    windows: [],
    typicalAssetRange: [0, 0],
    openingTargets: { first5Seconds: [0, 0], first10Seconds: [0, 0], first15Seconds: [0, 0] },
  },
  semanticAutoRemediation: {
    enabled: true,
    maxRounds: 2,
    actionableWarnings: [],
    policyVersion: "veronica-semantic-auto-remediation.v3",
    maximumGenericFallbackSceneRate: 0.2,
    maximumRepeatedSemanticFamilyRate: 0.6,
  },
};

export function resolveVeronicaProductionPolicy(
  format: PositioningFormat,
): VeronicaProductionPolicy {
  return format === "short" ? SHORT_POLICY : FULL_POLICY;
}
