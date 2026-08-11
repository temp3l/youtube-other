import { createHash } from "node:crypto";

declare const logicalRequestFingerprintBrand: unique symbol;
declare const resultCacheKeyBrand: unique symbol;
declare const promptPrefixFingerprintBrand: unique symbol;
declare const promptCacheRoutingKeyBrand: unique symbol;
declare const batchSubmissionKeyBrand: unique symbol;
declare const batchRequestSetFingerprintBrand: unique symbol;

export type LogicalRequestFingerprint = string & {
  readonly [logicalRequestFingerprintBrand]: true;
};
export type ResultCacheKey = string & { readonly [resultCacheKeyBrand]: true };
export type PromptPrefixFingerprint = string & {
  readonly [promptPrefixFingerprintBrand]: true;
};
export type PromptCacheRoutingKey = string & {
  readonly [promptCacheRoutingKeyBrand]: true;
};
export type BatchSubmissionKey = string & {
  readonly [batchSubmissionKeyBrand]: true;
};
export type BatchRequestSetFingerprint = string & {
  readonly [batchRequestSetFingerprintBrand]: true;
};

export type CanonicalFingerprintValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalFingerprintValue[]
  | { readonly [key: string]: CanonicalFingerprintValue };

function canonicalize(value: CanonicalFingerprintValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Fingerprint inputs must contain only finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

function fingerprint(namespace: string, value: CanonicalFingerprintValue): string {
  return createHash("sha256")
    .update(`${namespace}\n${canonicalize(value)}`, "utf8")
    .digest("hex");
}

export type OpenAiReasoningConfiguration = Readonly<{
  effort?: string;
  summary?: string;
}>;

export function createLogicalRequestFingerprint(input: {
  readonly operation: string;
  readonly provider: "openai";
  readonly model: string;
  readonly reasoning?: OpenAiReasoningConfiguration;
  readonly semanticInput: CanonicalFingerprintValue;
  readonly outputContractVersion: string;
  readonly promptPolicyVersion: string;
  readonly locale?: string;
  readonly providerConfiguration?: CanonicalFingerprintValue;
  /** Observability-only values are accepted explicitly and never affect identity. */
  readonly operationalMetadata?: Readonly<{
    readonly requestId?: string;
    readonly generatedAt?: string;
    readonly workerId?: string;
  }>;
}): LogicalRequestFingerprint {
  return fingerprint("openai-logical-request.v1", {
    operation: input.operation,
    provider: input.provider,
    model: input.model,
    reasoning: input.reasoning ?? null,
    semanticInput: input.semanticInput,
    outputContractVersion: input.outputContractVersion,
    promptPolicyVersion: input.promptPolicyVersion,
    locale: input.locale ?? null,
    providerConfiguration: input.providerConfiguration ?? null,
  }) as LogicalRequestFingerprint;
}

export function createResultCacheKey(
  logicalRequestFingerprint: LogicalRequestFingerprint
): ResultCacheKey {
  return fingerprint("openai-result-cache.v1", {
    logicalRequestFingerprint,
  }) as ResultCacheKey;
}

export function createPromptPrefixFingerprint(input: {
  readonly provider: "openai";
  readonly modelFamily: string;
  readonly promptFamily: string;
  readonly promptPolicyVersion: string;
  readonly outputContractVersion: string;
  readonly stablePrefix: string;
  /**
   * Exact serialized provider-visible structures rendered ahead of the marked
   * content block, such as a Structured Outputs format or stable tool list.
   */
  readonly stableProviderPrefix?: CanonicalFingerprintValue;
  /** Dynamic suffix is documented here only to make its exclusion testable. */
  readonly dynamicSuffix?: CanonicalFingerprintValue;
}): PromptPrefixFingerprint {
  return fingerprint("openai-prompt-prefix.v1", {
    provider: input.provider,
    modelFamily: input.modelFamily,
    promptFamily: input.promptFamily,
    promptPolicyVersion: input.promptPolicyVersion,
    outputContractVersion: input.outputContractVersion,
    stablePrefix: input.stablePrefix,
    ...(input.stableProviderPrefix === undefined
      ? {}
      : { stableProviderPrefix: input.stableProviderPrefix }),
  }) as PromptPrefixFingerprint;
}

export function createPromptCacheRoutingKey(input: {
  readonly promptFamily: string;
  readonly modelFamily: string;
  readonly promptPrefixFingerprint: PromptPrefixFingerprint;
}): PromptCacheRoutingKey {
  return [
    "mediaforge",
    input.promptFamily.trim().toLowerCase().replace(/[^a-z0-9.-]+/gu, "-"),
    input.modelFamily.trim().toLowerCase().replace(/[^a-z0-9.-]+/gu, "-"),
    input.promptPrefixFingerprint.slice(0, 24),
  ].join(":") as PromptCacheRoutingKey;
}

export function createBatchSubmissionKey(input: {
  readonly provider: "openai";
  readonly endpoint: string;
  readonly completionWindow: string;
  readonly inputManifest: CanonicalFingerprintValue;
}): BatchSubmissionKey {
  return fingerprint("openai-batch-submission.v1", input) as BatchSubmissionKey;
}

export interface OpenAiBatchSubmissionIdentity {
  readonly batchSubmissionKey: BatchSubmissionKey;
  readonly requestSetFingerprint: BatchRequestSetFingerprint;
}

function asCanonicalFingerprintValue(value: unknown): CanonicalFingerprintValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Batch request items must contain only finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => asCanonicalFingerprintValue(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>).map(
        ([key, entry]) => [key, asCanonicalFingerprintValue(entry)]
      )
    );
  }
  throw new Error("Batch request items must be JSON-serializable values.");
}

/**
 * Derives identity from the exact provider request set. JSONL order is excluded:
 * OpenAI maps Batch results by unique custom_id and does not promise output order.
 */
export function createOpenAiBatchSubmissionIdentity(input: {
  readonly endpoint: string;
  readonly completionWindow: string;
  readonly jsonl: string;
  readonly submissionPolicyVersion: string;
  readonly purpose: "initial" | "failed-item-retry";
  readonly parentBatchSubmissionKey?: BatchSubmissionKey;
}): OpenAiBatchSubmissionIdentity {
  const items = input.jsonl
    .split(/\r?\n/gu)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`Invalid Batch JSONL line ${index + 1}.`, { cause: error });
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Batch JSONL line ${index + 1} must be an object.`);
      }
      const record = parsed as Readonly<Record<string, unknown>>;
      if (
        typeof record["custom_id"] !== "string" ||
        typeof record["method"] !== "string" ||
        typeof record["url"] !== "string" ||
        !("body" in record)
      ) {
        throw new Error(
          `Batch JSONL line ${index + 1} must contain custom_id, method, url, and body.`
        );
      }
      return {
        customId: record["custom_id"],
        method: record["method"],
        url: record["url"],
        body: asCanonicalFingerprintValue(record["body"]),
      } satisfies CanonicalFingerprintValue;
    })
    .sort((left, right) => {
      const byId = String(left.customId).localeCompare(String(right.customId));
      return byId !== 0
        ? byId
        : canonicalize(left).localeCompare(canonicalize(right));
    });
  if (items.length === 0) {
    throw new Error("Batch request set must contain at least one item.");
  }
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1]?.customId === items[index]?.customId) {
      throw new Error(`Duplicate Batch custom_id ${String(items[index]?.customId)}.`);
    }
  }
  const requestSetFingerprint = fingerprint(
    "openai-batch-request-set.v1",
    items
  ) as BatchRequestSetFingerprint;
  const batchSubmissionKey = createBatchSubmissionKey({
    provider: "openai",
    endpoint: input.endpoint,
    completionWindow: input.completionWindow,
    inputManifest: {
      requestSetFingerprint,
      submissionPolicyVersion: input.submissionPolicyVersion,
      purpose: input.purpose,
      parentBatchSubmissionKey: input.parentBatchSubmissionKey ?? null,
    },
  });
  return { batchSubmissionKey, requestSetFingerprint };
}

export type OpenAiRequestModality =
  | "text"
  | "text-and-image"
  | "image-generation"
  | "image-edit"
  | "speech"
  | "transcription"
  | "batch-control";

export type OpenAiExecutionTopology =
  | "single-process"
  | "multi-process-possible"
  | "multi-process-demonstrated"
  | "unknown";

export interface PaidOpenAiRetryPolicy {
  readonly owner: "application" | "sdk" | "none";
  /** Additional transport retries after the first physical attempt. */
  readonly maxTransportRetries: number;
  readonly backoff: "none" | "fixed" | "exponential" | "exponential-jitter";
}

export interface PaidOpenAiRequestDescriptor {
  readonly provider: "openai";
  readonly operationId: string;
  readonly callFamily: string;
  readonly logicalRequestFingerprint: LogicalRequestFingerprint;
  readonly model: string;
  readonly reasoning: OpenAiReasoningConfiguration | null;
  readonly serviceTier: "default" | "flex" | "batch" | "priority" | null;
  readonly timeoutMs: number;
  readonly retryPolicy: PaidOpenAiRetryPolicy;
  readonly modality: OpenAiRequestModality;
  readonly executionTopology: OpenAiExecutionTopology;
}

export function createPaidOpenAiRequestDescriptor(
  input: PaidOpenAiRequestDescriptor
): PaidOpenAiRequestDescriptor {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error("OpenAI paid request timeoutMs must be a positive integer.");
  }
  if (
    !Number.isSafeInteger(input.retryPolicy.maxTransportRetries) ||
    input.retryPolicy.maxTransportRetries < 0
  ) {
    throw new Error("OpenAI maxTransportRetries must be a non-negative integer.");
  }
  if (
    input.retryPolicy.owner === "none" &&
    input.retryPolicy.maxTransportRetries !== 0
  ) {
    throw new Error("A request with no retry owner cannot configure retries.");
  }
  return Object.freeze(input);
}

export interface OpenAiRetryEnvelope {
  readonly sdkMaxRetries: number;
  readonly applicationMaxRetries: number;
  readonly repairActions: number;
  readonly escalationActions: number;
  readonly fallbackActions: number;
}

export interface OpenAiRetryEnvelopeSummary extends OpenAiRetryEnvelope {
  readonly transportAttemptsPerLogicalAction: number;
  readonly maximumLogicalActions: number;
  readonly maximumPhysicalProviderAttempts: number;
  readonly transportRetryOwner: "application" | "sdk" | "none";
}

export function characterizeOpenAiRetryEnvelope(
  envelope: OpenAiRetryEnvelope
): OpenAiRetryEnvelopeSummary {
  for (const [name, value] of Object.entries(envelope)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }
  if (envelope.sdkMaxRetries > 0 && envelope.applicationMaxRetries > 0) {
    throw new Error("SDK and application transport retries cannot both be enabled.");
  }
  const transportAttemptsPerLogicalAction =
    (envelope.sdkMaxRetries + 1) * (envelope.applicationMaxRetries + 1);
  const maximumLogicalActions =
    1 + envelope.repairActions + envelope.escalationActions + envelope.fallbackActions;
  return {
    ...envelope,
    transportAttemptsPerLogicalAction,
    maximumLogicalActions,
    maximumPhysicalProviderAttempts:
      transportAttemptsPerLogicalAction * maximumLogicalActions,
    transportRetryOwner:
      envelope.applicationMaxRetries > 0
        ? "application"
        : envelope.sdkMaxRetries > 0
          ? "sdk"
          : "none",
  };
}

export type PaidOpenAiOutcomeKind =
  | "success"
  | "definitely-failed-before-provider-effect"
  | "ambiguous-provider-effect"
  | "provider-rejection";

export interface PaidOpenAiFailureDetails {
  readonly message: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly providerRequestId?: string;
}

export type PaidOpenAiOutcome<T> =
  | { readonly kind: "success"; readonly value: T; readonly providerRequestId?: string }
  | {
      readonly kind: "definitely-failed-before-provider-effect";
      readonly error: PaidOpenAiFailureDetails;
    }
  | {
      readonly kind: "ambiguous-provider-effect";
      readonly error: PaidOpenAiFailureDetails;
    }
  | {
      readonly kind: "provider-rejection";
      readonly error: PaidOpenAiFailureDetails;
    };

function errorDetails(error: unknown): PaidOpenAiFailureDetails {
  const record =
    error && typeof error === "object"
      ? (error as {
          readonly message?: unknown;
          readonly code?: unknown;
          readonly status?: unknown;
          readonly request_id?: unknown;
        })
      : undefined;
  return {
    message:
      typeof record?.message === "string"
        ? record.message
        : error instanceof Error
          ? error.message
          : String(error),
    ...(typeof record?.code === "string" ? { code: record.code } : {}),
    ...(typeof record?.status === "number" ? { statusCode: record.status } : {}),
    ...(typeof record?.request_id === "string"
      ? { providerRequestId: record.request_id }
      : {}),
  };
}

export function classifyPaidOpenAiFailure(input: {
  readonly dispatchStarted: boolean;
  readonly error: unknown;
}): Exclude<PaidOpenAiOutcome<never>, { readonly kind: "success" }> {
  const error = errorDetails(input.error);
  if (!input.dispatchStarted) {
    return { kind: "definitely-failed-before-provider-effect", error };
  }
  if (error.statusCode !== undefined) {
    return { kind: "provider-rejection", error };
  }
  return { kind: "ambiguous-provider-effect", error };
}

export class AmbiguousPaidOpenAiEffectError extends Error {
  public readonly outcomeKind = "ambiguous-provider-effect" as const;

  public constructor(
    message: string,
    public readonly providerRequestId?: string,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AmbiguousPaidOpenAiEffectError";
  }
}

export interface OpenAiUsageInput {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly cacheWriteInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outputTokens?: number;
  readonly audioInputTokens?: number;
  readonly audioOutputTokens?: number;
  readonly audioDurationSeconds?: number;
  readonly transcriptionDurationSeconds?: number;
  readonly imageCount?: number;
}

export interface NormalizedOpenAiUsage {
  readonly inputTokens: number;
  readonly uncachedInputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens: number;
  readonly reasoningTokens: number;
  readonly outputTokens: number;
  readonly audioInputTokens: number;
  readonly audioOutputTokens: number;
  readonly audioDurationSeconds: number;
  readonly transcriptionDurationSeconds: number;
  readonly imageCount: number;
}

function usageQuantity(value: number | undefined, name: string): number {
  const normalized = value ?? 0;
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
  return normalized;
}

export function normalizeOpenAiUsage(input: OpenAiUsageInput): NormalizedOpenAiUsage {
  const inputTokens = usageQuantity(input.inputTokens, "inputTokens");
  const cachedInputTokens = usageQuantity(
    input.cachedInputTokens,
    "cachedInputTokens"
  );
  const cacheWriteInputTokens = usageQuantity(
    input.cacheWriteInputTokens,
    "cacheWriteInputTokens"
  );
  if (cachedInputTokens + cacheWriteInputTokens > inputTokens) {
    throw new Error(
      "Cached and cache-write input tokens cannot exceed total input tokens."
    );
  }
  return {
    inputTokens,
    uncachedInputTokens: inputTokens - cachedInputTokens - cacheWriteInputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    reasoningTokens: usageQuantity(input.reasoningTokens, "reasoningTokens"),
    outputTokens: usageQuantity(input.outputTokens, "outputTokens"),
    audioInputTokens: usageQuantity(input.audioInputTokens, "audioInputTokens"),
    audioOutputTokens: usageQuantity(input.audioOutputTokens, "audioOutputTokens"),
    audioDurationSeconds: usageQuantity(
      input.audioDurationSeconds,
      "audioDurationSeconds"
    ),
    transcriptionDurationSeconds: usageQuantity(
      input.transcriptionDurationSeconds,
      "transcriptionDurationSeconds"
    ),
    imageCount: usageQuantity(input.imageCount, "imageCount"),
  };
}

export interface PaidOpenAiCallRecord {
  readonly descriptor: PaidOpenAiRequestDescriptor;
  readonly providerRequestId?: string;
  readonly physicalAttempt: number;
  readonly startedAt: string;
  readonly latencyMs: number;
  readonly outcome: PaidOpenAiOutcomeKind;
  readonly usage: NormalizedOpenAiUsage;
  readonly promptCacheRoutingKey?: PromptCacheRoutingKey;
  readonly promptPolicyVersion?: string;
  readonly retryReason?: string;
  readonly repairReason?: string;
  readonly escalationReason?: string;
  readonly estimatedUncachedCostMicros?: number;
  readonly estimatedActualCostMicros?: number;
  readonly estimatedCacheWritePremiumMicros?: number;
  readonly estimatedCachedReadSavingsMicros?: number;
}

export interface PromptCacheRoutingThroughput {
  readonly routingKey: PromptCacheRoutingKey;
  readonly models: readonly string[];
  readonly operationIds: readonly string[];
  readonly callFamilies: readonly string[];
  readonly promptPolicyVersions: readonly string[];
  readonly requestCount: number;
  readonly peakRequestsPerMinute: number;
  readonly cacheReadRequests: number;
  readonly cacheWriteRequests: number;
  readonly cacheHitRate: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens: number;
  readonly estimatedEquivalentUncachedCostMicros: number | null;
  readonly estimatedActualCostMicros: number | null;
  readonly estimatedCacheWritePremiumMicros: number | null;
  readonly estimatedCachedReadSavingsMicros: number | null;
  readonly estimatedNetSavingsMicros: number | null;
  readonly cacheRoi: number | null;
}

export function summarizePromptCacheRoutingThroughput(
  records: readonly PaidOpenAiCallRecord[]
): readonly PromptCacheRoutingThroughput[] {
  const grouped = new Map<PromptCacheRoutingKey, PaidOpenAiCallRecord[]>();
  for (const record of records) {
    if (!record.promptCacheRoutingKey) continue;
    const group = grouped.get(record.promptCacheRoutingKey) ?? [];
    group.push(record);
    grouped.set(record.promptCacheRoutingKey, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([routingKey, group]) => {
      const minuteCounts = new Map<string, number>();
      for (const record of group) {
        const minute = record.startedAt.slice(0, 16);
        minuteCounts.set(minute, (minuteCounts.get(minute) ?? 0) + 1);
      }
      const cacheReadRequests = group.filter(
        (record) => record.usage.cachedInputTokens > 0
      ).length;
      const cacheWriteRequests = group.filter(
        (record) => record.usage.cacheWriteInputTokens > 0
      ).length;
      const costComparable = group.every(
        (record) =>
          record.estimatedUncachedCostMicros !== undefined &&
          record.estimatedActualCostMicros !== undefined
      );
      const economicsComparable = group.every(
        (record) =>
          record.estimatedCacheWritePremiumMicros !== undefined &&
          record.estimatedCachedReadSavingsMicros !== undefined,
      );
      const equivalentUncachedCostMicros = costComparable
        ? group.reduce(
            (total, record) => total + (record.estimatedUncachedCostMicros ?? 0),
            0,
          )
        : null;
      const actualCostMicros = costComparable
        ? group.reduce(
            (total, record) => total + (record.estimatedActualCostMicros ?? 0),
            0,
          )
        : null;
      const cacheWritePremiumMicros = economicsComparable
        ? group.reduce(
            (total, record) =>
              total + (record.estimatedCacheWritePremiumMicros ?? 0),
            0,
          )
        : null;
      const cachedReadSavingsMicros = economicsComparable
        ? group.reduce(
            (total, record) =>
              total + (record.estimatedCachedReadSavingsMicros ?? 0),
            0,
          )
        : null;
      const netSavingsMicros = costComparable
        ? (equivalentUncachedCostMicros ?? 0) - (actualCostMicros ?? 0)
        : null;
      return {
        routingKey,
        models: [...new Set(group.map((record) => record.descriptor.model))].sort(),
        operationIds: [
          ...new Set(group.map((record) => record.descriptor.operationId)),
        ].sort(),
        callFamilies: [
          ...new Set(group.map((record) => record.descriptor.callFamily)),
        ].sort(),
        promptPolicyVersions: [
          ...new Set(
            group.flatMap((record) =>
              record.promptPolicyVersion ? [record.promptPolicyVersion] : [],
            ),
          ),
        ].sort(),
        requestCount: group.length,
        peakRequestsPerMinute: Math.max(0, ...minuteCounts.values()),
        cacheReadRequests,
        cacheWriteRequests,
        cacheHitRate: group.length === 0 ? 0 : cacheReadRequests / group.length,
        inputTokens: group.reduce(
          (total, record) => total + record.usage.inputTokens,
          0,
        ),
        cachedInputTokens: group.reduce(
          (total, record) => total + record.usage.cachedInputTokens,
          0
        ),
        cacheWriteInputTokens: group.reduce(
          (total, record) => total + record.usage.cacheWriteInputTokens,
          0
        ),
        estimatedEquivalentUncachedCostMicros: equivalentUncachedCostMicros,
        estimatedActualCostMicros: actualCostMicros,
        estimatedCacheWritePremiumMicros: cacheWritePremiumMicros,
        estimatedCachedReadSavingsMicros: cachedReadSavingsMicros,
        estimatedNetSavingsMicros: netSavingsMicros,
        cacheRoi:
          netSavingsMicros === null || actualCostMicros === null || actualCostMicros === 0
            ? null
            : netSavingsMicros / actualCostMicros,
      };
    });
}
