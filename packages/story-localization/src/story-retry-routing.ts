import { type StoryNarrationVariant } from "./story-generation-preflight.js";

export type StoryRetryPurpose =
  | "canonical-full"
  | "localized-full"
  | "canonical-short"
  | "localized-short";

export type StoryRetryScope =
  | "field"
  | "sentence"
  | "paragraph"
  | "paragraph-range"
  | "opening"
  | "hook"
  | "ending"
  | "full-regeneration"
  | "short-regeneration";

export type StoryRetryDecision =
  | {
      readonly action: "block";
      readonly reason:
        | "deterministic-validation"
        | "duplicate-failed-fingerprint"
        | "unchanged-output-cap";
    }
  | {
      readonly action: "repair";
      readonly purpose: StoryRetryPurpose;
      readonly scope:
        | "field"
        | "sentence"
        | "paragraph"
        | "paragraph-range"
        | "opening"
        | "hook"
        | "ending";
    }
  | {
      readonly action: "regenerate";
      readonly purpose: StoryRetryPurpose;
      readonly scope: "full-regeneration" | "short-regeneration";
    };

export interface PersistedFailedRequestUsage {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface PersistedFailedRequestMetadata {
  readonly model: string;
  readonly reasoningEffort?: string;
  readonly outputCap: number;
  readonly attemptNumber: number;
  readonly requestFingerprint?: string;
  readonly incompleteReason?: string;
  readonly usage?: PersistedFailedRequestUsage;
  readonly estimatedCostUsd?: number | null;
}

export class StoryRetryableRequestError extends Error {
  readonly metadata: PersistedFailedRequestMetadata;
  readonly retryable: boolean;

  constructor(
    message: string,
    metadata: PersistedFailedRequestMetadata,
    options?: { readonly retryable?: boolean; readonly cause?: unknown }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "StoryRetryableRequestError";
    this.metadata = metadata;
    this.retryable = options?.retryable ?? false;
  }
}

export function buildPersistedFailedRequestMetadata(
  args: PersistedFailedRequestMetadata
): PersistedFailedRequestMetadata {
  return {
    model: args.model,
    outputCap: args.outputCap,
    attemptNumber: args.attemptNumber,
    ...(args.reasoningEffort !== undefined
      ? { reasoningEffort: args.reasoningEffort }
      : {}),
    ...(args.requestFingerprint !== undefined
      ? { requestFingerprint: args.requestFingerprint }
      : {}),
    ...(args.incompleteReason !== undefined
      ? { incompleteReason: args.incompleteReason }
      : {}),
    ...(args.usage !== undefined ? { usage: args.usage } : {}),
    ...(args.estimatedCostUsd !== undefined
      ? { estimatedCostUsd: args.estimatedCostUsd }
      : {}),
  };
}

export function purposeFromVariant(
  variant: StoryNarrationVariant
): StoryRetryPurpose | null {
  switch (variant) {
    case "canonical-english-full":
    case "full-repair":
      return "canonical-full";
    case "localized-full":
      return "localized-full";
    case "canonical-english-short":
      return "canonical-short";
    case "localized-short":
    case "short-repair":
      return "localized-short";
    case "semantic-validation":
      return null;
    default: {
      const exhaustive: never = variant;
      return exhaustive;
    }
  }
}

export function regenerationScopeForPurpose(
  purpose: StoryRetryPurpose
): "full-regeneration" | "short-regeneration" {
  switch (purpose) {
    case "canonical-full":
    case "localized-full":
      return "full-regeneration";
    case "canonical-short":
    case "localized-short":
      return "short-regeneration";
    default: {
      const exhaustive: never = purpose;
      return exhaustive;
    }
  }
}

export function normalizeIncompleteReason(record: unknown): string | null {
  const direct = readIncompleteReason(record);
  if (direct) {
    return direct;
  }
  if (
    record &&
    typeof record === "object" &&
    "response" in record &&
    record.response &&
    typeof record.response === "object" &&
    "body" in record.response
  ) {
    return readIncompleteReason(
      (record.response as { readonly body?: unknown }).body
    );
  }
  return null;
}

function readIncompleteReason(record: unknown): string | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const value = record as {
    readonly incomplete_details?: { readonly reason?: unknown } | null;
    readonly incompleteReason?: unknown;
    readonly status?: unknown;
  };
  if (
    value.incomplete_details &&
    typeof value.incomplete_details.reason === "string" &&
    value.incomplete_details.reason.length > 0
  ) {
    return value.incomplete_details.reason;
  }
  if (
    typeof value.incompleteReason === "string" &&
    value.incompleteReason.length > 0
  ) {
    return value.incompleteReason;
  }
  if (value.status === "incomplete") {
    return "incomplete";
  }
  return null;
}

export function shouldAllowDeterministicRepair(
  issues: readonly string[]
): boolean {
  const normalized = issues.map((entry) => entry.toLowerCase());
  return !normalized.some((entry) =>
    [
      "routed to short generator",
      "routed to full regeneration",
      "unsupported fact",
      "contradicts parent full",
      "orphaned reference",
      "missing climax",
      "missing final consequence",
      "missing central threat",
      "missing central rule",
      "missing ending",
      "wrong language",
      "wrong locale",
    ].some((needle) => entry.includes(needle))
  );
}

export function decideRetryRoute(args: {
  readonly purpose: StoryRetryPurpose;
  readonly issues?: readonly string[];
  readonly incompleteReason?: string | null;
  readonly previousFailedFingerprint?: boolean;
  readonly nextOutputCap?: number;
  readonly currentOutputCap?: number;
  readonly allowTargetedRepair?: boolean;
}): StoryRetryDecision {
  if (args.previousFailedFingerprint) {
    return {
      action: "block",
      reason: "duplicate-failed-fingerprint",
    };
  }
  if (args.incompleteReason === "max_output_tokens") {
    if (
      args.nextOutputCap === undefined ||
      args.currentOutputCap === undefined ||
      args.nextOutputCap <= args.currentOutputCap
    ) {
      return {
        action: "block",
        reason: "unchanged-output-cap",
      };
    }
    return {
      action: "regenerate",
      purpose: args.purpose,
      scope: regenerationScopeForPurpose(args.purpose),
    };
  }
  const issues = args.issues ?? [];
  if (!shouldAllowDeterministicRepair(issues)) {
    return {
      action: "block",
      reason: "deterministic-validation",
    };
  }
  if (args.allowTargetedRepair) {
    return {
      action: "repair",
      purpose: args.purpose,
      scope: args.purpose === "canonical-short" || args.purpose === "localized-short"
        ? "hook"
        : "paragraph",
    };
  }
  return {
    action: "regenerate",
    purpose: args.purpose,
    scope: regenerationScopeForPurpose(args.purpose),
  };
}
