import { hashText } from "@mediaforge/shared";
import {
  STORY_AFFECT_REPAIR_ROUTING_VERSION,
  STORY_ARCHITECTURE_AFFECT_ISSUE_CODES,
  STORY_LOCAL_AFFECT_ISSUE_CODES,
  type StoryAffectIssueCode,
  type StoryAffectProtectedFact,
  type StoryAffectRepairScope,
} from "./story-generation-contracts.js";
import { type StoryNarrationVariant } from "./story-generation-preflight.js";
import { stableSerialize } from "./stable-json.js";
import {
  GENERATED_STORY_VALIDATION_ISSUE_CODES,
  type GeneratedStoryValidationIssueCode,
} from "./generated-story-validator.js";

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
  | "beat"
  | "beat-range"
  | "opening"
  | "hook"
  | "ending"
  | "full-regeneration"
  | "short-regeneration";

export interface StoryRetryRoute {
  readonly purpose: StoryRetryPurpose;
  readonly scope: StoryRetryScope;
}

export interface NormalizedIncompleteResponse {
  readonly status: "incomplete";
  readonly reason: string;
  readonly rawReason?: unknown;
  readonly usage?: PersistedFailedRequestUsage;
}

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
        | "beat"
        | "beat-range"
        | "opening"
        | "hook"
        | "ending";
    }
  | {
      readonly action: "regenerate";
      readonly purpose: StoryRetryPurpose;
      readonly scope: "full-regeneration" | "short-regeneration";
    };

export interface StoryAffectRoutingFinding {
  readonly id: string;
  readonly assessment: "strength" | "weakness";
  readonly issueCode?: StoryAffectIssueCode;
  readonly paragraphSpans: readonly {
    readonly start: number;
    readonly end: number;
  }[];
  readonly affectRefs: {
    readonly beatIds: readonly string[];
  };
  readonly repairScope?: StoryAffectRepairScope;
  readonly modifiableBeatIds?: readonly string[];
  readonly protectedFacts?: readonly StoryAffectProtectedFact[];
}

export type StoryAffectRepairRoutingDecision =
  | {
      readonly action: "block";
      readonly reason:
        | "deterministic-validation"
        | "duplicate-failed-fingerprint"
        | "retry-cap-exhausted"
        | "invalid-repair-evidence"
        | "requires-parent-full-regeneration";
      readonly issueIds: readonly string[];
      readonly routingFingerprint: string;
    }
  | {
      readonly action: "repair";
      readonly purpose: StoryRetryPurpose;
      readonly scope: StoryAffectRepairScope;
      readonly issueIds: readonly string[];
      readonly issueCodes: readonly StoryAffectIssueCode[];
      readonly affectedBeatIds: readonly string[];
      readonly protectedFacts: readonly StoryAffectProtectedFact[];
      readonly routingFingerprint: string;
    }
  | {
      readonly action: "regenerate";
      readonly purpose: "canonical-full" | "localized-full";
      readonly scope: "full-regeneration";
      readonly issueIds: readonly string[];
      readonly issueCodes: readonly StoryAffectIssueCode[];
      readonly routingFingerprint: string;
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

export class StoryRetryRouteError extends Error {
  readonly code:
    | "INVALID_REPAIR_ROUTE"
    | "RETRY_CAP_EXHAUSTED"
    | "DUPLICATE_FAILED_REQUEST_BLOCKED"
    | "UNSUPPORTED_REPAIR_SCOPE";
  readonly route?: StoryRetryRoute;

  constructor(
    code: StoryRetryRouteError["code"],
    message: string,
    options?: {
      readonly route?: StoryRetryRoute;
      readonly cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "StoryRetryRouteError";
    this.code = code;
    if (options?.route) {
      this.route = options.route;
    }
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
  const normalized = normalizeIncompleteResponse(record);
  return normalized?.reason ?? null;
}

export function normalizeIncompleteResponse(
  record: unknown
): NormalizedIncompleteResponse | null {
  const direct = readIncompleteShape(record);
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
    return readIncompleteShape(
      (record.response as { readonly body?: unknown }).body
    );
  }
  return null;
}

function normalizeUsage(
  record: unknown
): PersistedFailedRequestUsage | undefined {
  if (!record || typeof record !== "object") {
    return undefined;
  }
  const usage = record as {
    readonly input_tokens?: unknown;
    readonly output_tokens?: unknown;
    readonly total_tokens?: unknown;
    readonly input_tokens_details?: { readonly cached_tokens?: unknown };
    readonly output_tokens_details?: { readonly reasoning_tokens?: unknown };
  };
  const normalized: PersistedFailedRequestUsage = {
    ...(typeof usage.input_tokens === "number"
      ? { inputTokens: usage.input_tokens }
      : {}),
    ...(typeof usage.input_tokens_details?.cached_tokens === "number"
      ? { cachedInputTokens: usage.input_tokens_details.cached_tokens }
      : {}),
    ...(typeof usage.output_tokens_details?.reasoning_tokens === "number"
      ? { reasoningTokens: usage.output_tokens_details.reasoning_tokens }
      : {}),
    ...(typeof usage.output_tokens === "number"
      ? { outputTokens: usage.output_tokens }
      : {}),
    ...(typeof usage.total_tokens === "number"
      ? { totalTokens: usage.total_tokens }
      : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readIncompleteShape(
  record: unknown
): NormalizedIncompleteResponse | null {
  const direct = readIncompleteReason(record);
  if (!direct || !record || typeof record !== "object") {
    return null;
  }
  const value = record as {
    readonly incomplete_details?: { readonly reason?: unknown } | null;
    readonly incompleteReason?: unknown;
    readonly status?: unknown;
    readonly usage?: unknown;
  };
  const usage = normalizeUsage(value.usage);
  return {
    status: "incomplete",
    reason: direct,
    ...(value.incomplete_details?.reason !== undefined
      ? { rawReason: value.incomplete_details.reason }
      : value.incompleteReason !== undefined
        ? { rawReason: value.incompleteReason }
        : {}),
    ...(usage ? { usage } : {}),
  };
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
  if (typeof value.incomplete_details?.reason === "string") {
    return value.incomplete_details.reason.length > 0
      ? value.incomplete_details.reason
      : "incomplete";
  }
  if (typeof value.incompleteReason === "string") {
    return value.incompleteReason.length > 0
      ? value.incompleteReason
      : "incomplete";
  }
  return value.status === "incomplete" ? "incomplete" : null;
}

export function shouldAllowDeterministicRepair(
  issues: readonly string[]
): boolean {
  const normalized = issues.map((entry) => entry.toLowerCase());
  return !normalized.some((entry) =>
    [
      "routed to short generator",
      "routed to full regeneration",
      "contradicts parent full",
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

export function inferRepairScopeFromIssueCodes(args: {
  readonly purpose: StoryRetryPurpose;
  readonly issueCodes: readonly GeneratedStoryValidationIssueCode[];
}): Extract<
  StoryRetryScope,
  | "field"
  | "sentence"
  | "paragraph"
  | "paragraph-range"
  | "opening"
  | "hook"
  | "ending"
> | null {
  const codes = new Set(args.issueCodes);
  if (args.purpose === "canonical-full" || args.purpose === "localized-full") {
    if (codes.has(GENERATED_STORY_VALIDATION_ISSUE_CODES.FULL_TRUNCATED)) {
      return "ending";
    }
    return null;
  }
  if (codes.has(GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_HOOK_TOO_LATE)) {
    return "hook";
  }
  if (
    codes.has(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_MISSING_FINAL_CONSEQUENCE
    )
  ) {
    return "ending";
  }
  if (
    codes.has(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_WORD_RANGE_INVALID
    ) ||
    codes.has(GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_UNSUPPORTED_FACT) ||
    codes.has(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_ORPHANED_REFERENCE
    ) ||
    codes.has(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_STRUCTURAL_COMMENTARY
    ) ||
    codes.has(
      GENERATED_STORY_VALIDATION_ISSUE_CODES.SHORT_METADATA_AUDIO_VISUAL_LEAKAGE
    )
  ) {
    return "sentence";
  }
  return null;
}

export function assertRouteCompatible(route: StoryRetryRoute): StoryRetryRoute {
  switch (route.purpose) {
    case "canonical-full":
    case "localized-full":
      if (route.scope === "short-regeneration" || route.scope === "hook") {
        throw new StoryRetryRouteError(
          "INVALID_REPAIR_ROUTE",
          `Incompatible full-story retry route ${route.scope} for ${route.purpose}.`,
          { route }
        );
      }
      return route;
    case "canonical-short":
    case "localized-short":
      if (route.scope === "full-regeneration" || route.scope === "paragraph") {
        throw new StoryRetryRouteError(
          "INVALID_REPAIR_ROUTE",
          `Incompatible short-story retry route ${route.scope} for ${route.purpose}.`,
          { route }
        );
      }
      return route;
    default: {
      const exhaustive: never = route.purpose;
      return exhaustive;
    }
  }
}

export function decideRetryRoute(args: {
  readonly purpose: StoryRetryPurpose;
  readonly issueCodes?: readonly GeneratedStoryValidationIssueCode[];
  readonly requestedScope?: Extract<
    StoryRetryScope,
    | "field"
    | "sentence"
    | "paragraph"
    | "paragraph-range"
    | "beat"
    | "beat-range"
    | "opening"
    | "hook"
    | "ending"
  >;
  readonly issues?: readonly string[];
  readonly incompleteReason?: string | null;
  readonly previousFailedFingerprint?: boolean;
  readonly nextOutputCap?: number;
  readonly currentOutputCap?: number;
  readonly allowTargetedRepair?: boolean;
  readonly attemptNumber?: number;
  readonly retryCap?: number;
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
    assertRouteCompatible({
      purpose: args.purpose,
      scope: regenerationScopeForPurpose(args.purpose),
    });
    return {
      action: "regenerate",
      purpose: args.purpose,
      scope: regenerationScopeForPurpose(args.purpose),
    };
  }
  if (
    args.retryCap !== undefined &&
    args.attemptNumber !== undefined &&
    args.attemptNumber >= args.retryCap
  ) {
    return {
      action: "block",
      reason: "deterministic-validation",
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
    const scope: Extract<
      StoryRetryScope,
      | "field"
      | "sentence"
      | "paragraph"
      | "paragraph-range"
      | "beat"
      | "beat-range"
      | "opening"
      | "hook"
      | "ending"
    > =
      args.requestedScope ??
      (args.issueCodes
        ? inferRepairScopeFromIssueCodes({
            purpose: args.purpose,
            issueCodes: args.issueCodes,
          })
        : null) ??
      (args.purpose === "canonical-short" || args.purpose === "localized-short"
        ? "hook"
        : "paragraph");
    assertRouteCompatible({ purpose: args.purpose, scope });
    return {
      action: "repair",
      purpose: args.purpose,
      scope,
    };
  }
  assertRouteCompatible({
    purpose: args.purpose,
    scope: regenerationScopeForPurpose(args.purpose),
  });
  return {
    action: "regenerate",
    purpose: args.purpose,
    scope: regenerationScopeForPurpose(args.purpose),
  };
}

export function computeStoryAffectRepairRoutingFingerprint(args: {
  readonly purpose: StoryRetryPurpose;
  readonly findings: readonly StoryAffectRoutingFinding[];
  readonly paragraphCount: number;
  readonly availableModifiableBeatIds: readonly string[];
  readonly deterministicFailureIds?: readonly string[];
  readonly attemptNumber?: number;
  readonly retryCap?: number;
}): string {
  return hashText(
    stableSerialize({
      routingVersion: STORY_AFFECT_REPAIR_ROUTING_VERSION,
      purpose: args.purpose,
      paragraphCount: args.paragraphCount,
      availableModifiableBeatIds: [...args.availableModifiableBeatIds].sort(),
      deterministicFailureIds: [...(args.deterministicFailureIds ?? [])].sort(),
      attemptNumber: args.attemptNumber ?? 0,
      retryCap: args.retryCap ?? 1,
      findings: args.findings.map((finding) => ({
        id: finding.id,
        assessment: finding.assessment,
        issueCode: finding.issueCode ?? null,
        paragraphSpans: finding.paragraphSpans,
        beatIds: [...finding.affectRefs.beatIds],
        repairScope: finding.repairScope ?? null,
        modifiableBeatIds: [...(finding.modifiableBeatIds ?? [])],
        protectedFacts: [...(finding.protectedFacts ?? [])],
      })),
    })
  );
}

function isArchitectureAffectIssue(issueCode: StoryAffectIssueCode): boolean {
  return (
    STORY_ARCHITECTURE_AFFECT_ISSUE_CODES as readonly StoryAffectIssueCode[]
  ).includes(issueCode);
}

function isLocalAffectIssue(issueCode: StoryAffectIssueCode): boolean {
  return (
    STORY_LOCAL_AFFECT_ISSUE_CODES as readonly StoryAffectIssueCode[]
  ).includes(issueCode);
}

function hasValidLocalRepairEvidence(args: {
  readonly finding: StoryAffectRoutingFinding;
  readonly paragraphCount: number;
  readonly availableModifiableBeatIds: ReadonlySet<string>;
}): boolean {
  const finding = args.finding;
  if (
    finding.assessment !== "weakness" ||
    !finding.issueCode ||
    !isLocalAffectIssue(finding.issueCode) ||
    !finding.repairScope ||
    !finding.modifiableBeatIds ||
    finding.modifiableBeatIds.length === 0 ||
    !finding.protectedFacts ||
    finding.protectedFacts.length === 0 ||
    finding.paragraphSpans.length === 0
  ) {
    return false;
  }
  if (
    finding.repairScope === "beat" &&
    finding.modifiableBeatIds.length !== 1
  ) {
    return false;
  }
  if (
    finding.repairScope === "beat-range" &&
    finding.modifiableBeatIds.length < 2
  ) {
    return false;
  }
  if (
    finding.paragraphSpans.some(
      (span) =>
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.end) ||
        span.start < 1 ||
        span.end < span.start ||
        span.end > args.paragraphCount
    )
  ) {
    return false;
  }
  const citedBeatIds = new Set(finding.affectRefs.beatIds);
  if (
    finding.modifiableBeatIds.some(
      (beatId) =>
        !citedBeatIds.has(beatId) ||
        !args.availableModifiableBeatIds.has(beatId)
    )
  ) {
    return false;
  }
  return finding.protectedFacts.every(
    (fact) => fact.id.trim().length > 0 && fact.statement.trim().length > 0
  );
}

export function decideStoryAffectRepairRoute(args: {
  readonly purpose: StoryRetryPurpose;
  readonly findings: readonly StoryAffectRoutingFinding[];
  readonly paragraphCount: number;
  readonly availableModifiableBeatIds: readonly string[];
  readonly deterministicFailureIds?: readonly string[];
  readonly previousFailedFingerprint?: boolean;
  readonly attemptNumber?: number;
  readonly retryCap?: number;
}): StoryAffectRepairRoutingDecision {
  const issueIds = args.findings.map((finding) => finding.id);
  const routingFingerprint = computeStoryAffectRepairRoutingFingerprint(args);
  if ((args.deterministicFailureIds?.length ?? 0) > 0) {
    return {
      action: "block",
      reason: "deterministic-validation",
      issueIds,
      routingFingerprint,
    };
  }
  if (args.previousFailedFingerprint) {
    return {
      action: "block",
      reason: "duplicate-failed-fingerprint",
      issueIds,
      routingFingerprint,
    };
  }
  if ((args.attemptNumber ?? 0) >= (args.retryCap ?? 1)) {
    return {
      action: "block",
      reason: "retry-cap-exhausted",
      issueIds,
      routingFingerprint,
    };
  }
  const issueCodes = args.findings
    .map((finding) => finding.issueCode)
    .filter((issueCode): issueCode is StoryAffectIssueCode =>
      Boolean(issueCode)
    );
  if (
    args.findings.length > 0 &&
    issueCodes.length === args.findings.length &&
    issueCodes.some(isArchitectureAffectIssue)
  ) {
    if (
      args.purpose === "canonical-short" ||
      args.purpose === "localized-short"
    ) {
      return {
        action: "block",
        reason: "requires-parent-full-regeneration",
        issueIds,
        routingFingerprint,
      };
    }
    return {
      action: "regenerate",
      purpose: args.purpose,
      scope: "full-regeneration",
      issueIds,
      issueCodes,
      routingFingerprint,
    };
  }
  const availableModifiableBeatIds = new Set(args.availableModifiableBeatIds);
  if (
    args.findings.length === 0 ||
    !args.findings.every((finding) =>
      hasValidLocalRepairEvidence({
        finding,
        paragraphCount: args.paragraphCount,
        availableModifiableBeatIds,
      })
    )
  ) {
    return {
      action: "block",
      reason: "invalid-repair-evidence",
      issueIds,
      routingFingerprint,
    };
  }
  const affectedBeatIds = [
    ...new Set(
      args.findings.flatMap((finding) => finding.modifiableBeatIds ?? [])
    ),
  ];
  const protectedFacts = [
    ...new Map(
      args.findings
        .flatMap((finding) => finding.protectedFacts ?? [])
        .map((fact) => [fact.id, fact])
    ).values(),
  ];
  return {
    action: "repair",
    purpose: args.purpose,
    scope: affectedBeatIds.length === 1 ? "beat" : "beat-range",
    issueIds,
    issueCodes,
    affectedBeatIds,
    protectedFacts,
    routingFingerprint,
  };
}
