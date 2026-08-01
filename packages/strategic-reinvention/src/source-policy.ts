import { type ContentLocale, type ContentSourceManifest, type ContentTier } from "@mediaforge/domain";

export type SourceOperation = "summarize" | "adapt" | "translate" | "voice" | "visualize" | "publish" | "monetize";

interface SourcePolicyRequestBase {
  readonly operation: SourceOperation;
  readonly locale: ContentLocale;
  readonly targetTier: ContentTier;
  readonly commercial: boolean;
  readonly now: Date;
}

export type SourcePolicyRequest =
  | (SourcePolicyRequestBase & { readonly operation: "summarize" | "adapt" | "translate" | "publish" | "monetize"; readonly requestedAiTransformation?: never })
  | (SourcePolicyRequestBase & { readonly operation: "voice"; readonly requestedAiTransformation?: "syntheticVoice" })
  | (SourcePolicyRequestBase & { readonly operation: "visualize"; readonly requestedAiTransformation?: "syntheticLikeness" });

export interface SourcePolicyDecision {
  readonly allowed: boolean;
  readonly reasonCodes: readonly string[];
}

/**
 * Evaluates every source permission independently.  Callers must never treat
 * one favourable field as an override for a failed rights or sensitivity gate.
 */
export function evaluateSourcePolicy(
  source: ContentSourceManifest,
  request: SourcePolicyRequest,
): SourcePolicyDecision {
  const reasonCodes: string[] = [];
  if (!["creator-owned", "publisher-owned", "licensed"].includes(source.rights.status)) {
    reasonCodes.push("RIGHTS_STATUS_NOT_APPROVED");
  }
  if (!source.rights.allowedUses.includes(request.operation)) {
    reasonCodes.push("USE_NOT_PERMITTED");
  }
  const transformationRequired = {
    summarize: "summarize",
    adapt: "adapt",
    translate: "translate",
  } as const;
  const transformation = transformationRequired[request.operation as keyof typeof transformationRequired];
  if (transformation && !source.aiTransformations[transformation]) {
    reasonCodes.push("TRANSFORMATION_NOT_PERMITTED");
  }
  if (request.requestedAiTransformation && !source.aiTransformations[request.requestedAiTransformation]) {
    reasonCodes.push("SYNTHETIC_TRANSFORMATION_NOT_PERMITTED");
  }
  if (!source.rights.permittedLocales.includes(request.locale)) {
    reasonCodes.push("LOCALE_NOT_PERMITTED");
  }
  if (request.commercial && !source.rights.commercialUse) {
    reasonCodes.push("COMMERCIAL_USE_NOT_PERMITTED");
  }
  if (source.rights.expiresAt && Date.parse(source.rights.expiresAt) <= request.now.getTime()) {
    reasonCodes.push("RIGHTS_EXPIRED");
  }
  if (source.sensitivity.classification === "blocked") {
    reasonCodes.push("SENSITIVITY_BLOCKED");
  }
  if (source.sensitivity.classification === "high-risk") {
    reasonCodes.push("HIGH_RISK_SOURCE");
  }
  if (source.sensitivity.classification === "sensitive" && !source.sensitivity.manualReviewRequired) {
    reasonCodes.push("SENSITIVITY_REVIEW_REQUIRED");
  }
  if (["premium", "private"].includes(source.accessLevel) && !source.sensitivity.manualReviewRequired) {
    reasonCodes.push("ACCESS_REVIEW_REQUIRED");
  }
  if (["premium", "private"].includes(source.accessLevel) && ["public", "lead-generation"].includes(request.targetTier)) {
    reasonCodes.push("ACCESS_TIER_LEAKAGE");
  }
  if (!source.approvedBy || !source.approvedAt || Date.parse(source.approvedAt) > request.now.getTime()) {
    reasonCodes.push("SOURCE_APPROVAL_REQUIRED");
  }
  return { allowed: reasonCodes.length === 0, reasonCodes };
}

export interface SourcePolicyTelemetry {
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly allowed: boolean;
  readonly reasonCodes: readonly string[];
}

export function sourcePolicyTelemetry(
  source: ContentSourceManifest,
  decision: SourcePolicyDecision,
): SourcePolicyTelemetry {
  return {
    sourceId: source.sourceId,
    sourceHash: source.sourceHash,
    allowed: decision.allowed,
    reasonCodes: decision.reasonCodes,
  };
}
