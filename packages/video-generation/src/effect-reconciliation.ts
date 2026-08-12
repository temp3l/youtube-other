import type {
  VideoGenerationEffect,
  VideoGenerationEffectStatus,
  VideoProviderAdapterResult,
} from "./contracts.js";

export type VideoEffectReconciliationDecision =
  | {
      readonly kind: "resolved";
      readonly nextStatus: Extract<
        VideoGenerationEffectStatus,
        "succeeded" | "failed"
      >;
      readonly providerResult: VideoProviderAdapterResult;
    }
  | {
      readonly kind: "still-ambiguous";
      readonly effect: VideoGenerationEffect;
      readonly message: string;
    };

export function reconcileVideoGenerationEffect(input: {
  readonly effect: VideoGenerationEffect;
  readonly providerResult: VideoProviderAdapterResult;
}): VideoEffectReconciliationDecision {
  if (input.effect.status !== "ambiguous") {
    throw new Error(
      `Only ambiguous effects can be reconciled; received ${input.effect.status}.`
    );
  }
  if (input.providerResult.kind === "ambiguous") {
    return {
      kind: "still-ambiguous",
      effect: input.effect,
      message: input.providerResult.message,
    };
  }
  if (input.providerResult.kind === "pending") {
    return {
      kind: "still-ambiguous",
      effect: input.effect,
      message: "Provider evidence is still pending reconciliation.",
    };
  }
  return {
    kind: "resolved",
    nextStatus:
      input.providerResult.kind === "completed" ? "succeeded" : "failed",
    providerResult: input.providerResult,
  };
}

export function shouldRetryAmbiguousVideoEffect(
  effect: VideoGenerationEffect
): boolean {
  return effect.status === "ambiguous" && effect.reconciliationRequired;
}
