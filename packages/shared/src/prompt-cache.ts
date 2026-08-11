import crypto from "node:crypto";

import { contentProfileIdSchema } from "@mediaforge/domain";
import {
  createPromptCacheRoutingKey,
  createPromptPrefixFingerprint,
  type PromptCacheRoutingKey,
  type PromptPrefixFingerprint,
} from "./openai-paid-request.js";

export type PromptCacheMode = "disabled" | "implicit" | "explicit";

export type OpenAiPromptCacheProjectionStrategy =
  | "gpt-5.6-explicit"
  | "legacy-automatic"
  | "unsupported";

export interface OpenAiPromptCacheCapability {
  readonly model: string;
  readonly strategy: OpenAiPromptCacheProjectionStrategy;
  readonly supportsExplicitBreakpoints: boolean;
  readonly supportsRequestWideOptions: boolean;
  readonly minimumPrefixTokens: number | null;
  readonly retentionMechanism: "prompt_cache_options" | "prompt_cache_retention" | "none";
  readonly ttl: "30m" | "in_memory" | "24h" | null;
}

export type PromptCacheDowngradeReason =
  | "EXPLICIT_CACHE_DISABLED"
  | "PROVIDER_UNSUPPORTED"
  | "MODEL_UNSUPPORTED"
  | "PREFIX_TOO_SHORT"
  | "INSUFFICIENT_EXPECTED_REUSE"
  | "REPAIR_CACHE_DISABLED";

export interface OpenAiResponsesExplicitPromptCacheFields {
  readonly prompt_cache_key: PromptCacheRoutingKey;
  readonly prompt_cache_options: {
    readonly mode: "explicit";
    readonly ttl: "30m";
  };
}

export interface OpenAiResponsesLegacyPromptCacheFields {
  readonly prompt_cache_key: PromptCacheRoutingKey;
  readonly prompt_cache_retention: "in_memory" | "24h";
}

export interface OpenAiResponsesImplicitPromptCacheFields {
  readonly prompt_cache_key: PromptCacheRoutingKey;
}

export type OpenAiResponsesPromptCacheFields =
  | OpenAiResponsesExplicitPromptCacheFields
  | OpenAiResponsesLegacyPromptCacheFields
  | OpenAiResponsesImplicitPromptCacheFields;

export interface OpenAiPromptCacheBreakpoint {
  readonly mode: "explicit";
}

export interface PromptCachePlan {
  readonly mode: PromptCacheMode;
  /** @deprecated Read-only compatibility for existing manifests. */
  readonly cacheKey?: string;
  readonly promptPrefixFingerprint?: PromptPrefixFingerprint;
  readonly promptCacheRoutingKey?: PromptCacheRoutingKey;
  readonly projectionStrategy?: OpenAiPromptCacheProjectionStrategy;
  /** `30m` is retained solely to read legacy batch manifests. New plans use SDK-supported values. */
  readonly ttl?: "in_memory" | "24h" | "30m";
  readonly breakpointAfterBlock?: string;
  readonly estimatedReusablePrefixTokens: number;
  readonly expectedReuseCount: number;
  readonly shard: number;
  readonly cacheSupported?: boolean;
  readonly cacheEligible?: boolean;
  readonly downgradeReason?: PromptCacheDowngradeReason;
}

export interface PromptCacheKeyParts {
  readonly namespace?: string;
  readonly profileId?: string;
  readonly family: string;
  readonly version: string;
  readonly operation: string;
  readonly format: string;
  readonly language: string;
  readonly modelTier: string;
  readonly aspectBucket?: string;
  readonly referenceBundleClass?: string;
  /** Shared visual prompts must reuse across localized editions. */
  readonly languageIndependent?: boolean;
}

export interface OpenAiResponsesPromptCacheContract {
  readonly namespace?: string;
  readonly genre: string;
  readonly planner: string;
  readonly contractVersion: string;
  readonly schemaVersion: string;
  readonly modelFamily: string;
  readonly stablePrefix: string;
}

export interface CacheablePrompt {
  readonly staticPrefix: string;
  readonly dynamicSuffix: string;
  readonly breakpointAfterBlock: string;
  readonly rendered: string;
}

export interface PromptCacheUsageRecord {
  readonly model: string;
  readonly promptFamily: string;
  readonly promptVersion: string;
  readonly language: string;
  readonly format: string;
  readonly stage: string;
  readonly batch?: string;
  readonly cacheKey?: string;
  readonly imageSubtype?: string;
  readonly date?: string;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly estimatedUncachedCostUsd?: number;
  readonly estimatedActualCostUsd?: number;
}

export interface PromptCacheUsageAggregate {
  readonly key: string;
  readonly recordCount: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cacheReadRatio: number;
  readonly cacheWriteRatio: number;
  readonly estimatedUncachedCostUsd: number;
  readonly estimatedActualCostUsd: number;
  readonly estimatedSavingsUsd: number;
}

function normalizePromptText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function safeKeyPart(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9.-]+/gu, "-");
  return normalized.replace(/^-+|-+$/gu, "") || "none";
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

const GPT_56_EXPLICIT_MODELS = new Set([
  "gpt-5.6",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
]);

const LEGACY_AUTOMATIC_MODEL_PREFIXES = [
  "gpt-4.1",
  "gpt-5.4",
  "gpt-5.5",
] as const;

function isDatedSnapshotOf(model: string, base: string): boolean {
  return new RegExp(`^${base.replaceAll(".", "\\.")}-\\d{4}-\\d{2}-\\d{2}$`, "u").test(
    model,
  );
}

/**
 * Resolve only provider capabilities that the repository has explicitly audited.
 * Unknown/custom model names fail closed instead of inheriting cache fields from
 * a similarly named model.
 */
export function resolveOpenAiPromptCacheCapability(
  inputModel: string,
): OpenAiPromptCacheCapability {
  const model = inputModel.trim().toLowerCase();
  const explicitBase = [...GPT_56_EXPLICIT_MODELS].find(
    (candidate) => model === candidate || isDatedSnapshotOf(model, candidate),
  );
  if (explicitBase) {
    return {
      model,
      strategy: "gpt-5.6-explicit",
      supportsExplicitBreakpoints: true,
      supportsRequestWideOptions: true,
      minimumPrefixTokens: 1_024,
      retentionMechanism: "prompt_cache_options",
      ttl: "30m",
    };
  }
  const legacyBase = LEGACY_AUTOMATIC_MODEL_PREFIXES.find(
    (candidate) => model === candidate || model.startsWith(`${candidate}-`),
  );
  if (legacyBase) {
    return {
      model,
      strategy: "legacy-automatic",
      supportsExplicitBreakpoints: false,
      supportsRequestWideOptions: false,
      minimumPrefixTokens: 1_024,
      retentionMechanism: "prompt_cache_retention",
      ttl: legacyBase === "gpt-5.5" ? "24h" : "in_memory",
    };
  }
  return {
    model,
    strategy: "unsupported",
    supportsExplicitBreakpoints: false,
    supportsRequestWideOptions: false,
    minimumPrefixTokens: null,
    retentionMechanism: "none",
    ttl: null,
  };
}

export function renderCacheablePrompt(args: {
  readonly stableBlocks: readonly { readonly id: string; readonly content: string }[];
  readonly dynamicBlocks: readonly { readonly id: string; readonly content: string }[];
}): CacheablePrompt {
  if (args.stableBlocks.length === 0) {
    throw new Error("A cacheable prompt requires at least one stable block.");
  }
  const renderBlocks = (
    blocks: readonly { readonly id: string; readonly content: string }[]
  ) =>
    blocks
      .map((block) => `## ${safeKeyPart(block.id)}\n${normalizePromptText(block.content)}`)
      .join("\n\n");
  const staticPrefix = renderBlocks(args.stableBlocks);
  const dynamicSuffix = renderBlocks(args.dynamicBlocks);
  return {
    staticPrefix,
    dynamicSuffix,
    breakpointAfterBlock: args.stableBlocks.at(-1)!.id,
    rendered: dynamicSuffix.length > 0 ? `${staticPrefix}\n\n${dynamicSuffix}` : staticPrefix,
  };
}

export function estimatePromptTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(normalizePromptText(value), "utf8") / 4);
}

export function stablePromptCacheShard(itemIdentity: string, shardCount: number): number {
  if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 32) {
    throw new Error("Prompt cache shard count must be an integer from 1 through 32.");
  }
  const prefix = sha256(itemIdentity).slice(0, 8);
  return Number.parseInt(prefix, 16) % shardCount;
}

export function buildPromptCacheKey(
  parts: PromptCacheKeyParts,
  shard: number
): string {
  const referenceClass = parts.referenceBundleClass
    ? `:${sha256(parts.referenceBundleClass).slice(0, 12)}`
    : "";
  const aspect = parts.aspectBucket ? `:${safeKeyPart(parts.aspectBucket)}` : "";
  const profile = parts.profileId
    ? safeKeyPart(contentProfileIdSchema.parse(parts.profileId))
    : undefined;
  return [
    safeKeyPart(parts.namespace ?? "mediaforge"),
    ...(profile ? [profile] : []),
    safeKeyPart(parts.family),
    safeKeyPart(parts.version),
    safeKeyPart(parts.operation),
    safeKeyPart(parts.format),
    safeKeyPart(parts.languageIndependent ? "shared" : parts.language),
    safeKeyPart(parts.modelTier),
  ].join(":") + `${aspect}${referenceClass}:shard-${shard}`;
}

/**
 * Derive a safe cache identity from the reusable planner contract only. Dynamic
 * episode and scene payloads deliberately never participate in this key.
 */
export function buildOpenAiResponsesPromptCacheKey(
  contract: OpenAiResponsesPromptCacheContract,
  _legacyShard: number,
): PromptCacheRoutingKey {
  const promptPrefixFingerprint = createPromptPrefixFingerprint({
    provider: "openai",
    modelFamily: contract.modelFamily,
    promptFamily: `${contract.genre}.${contract.planner}`,
    promptPolicyVersion: contract.contractVersion,
    outputContractVersion: contract.schemaVersion,
    stablePrefix: contract.stablePrefix,
  });
  return createPromptCacheRoutingKey({
    promptFamily: `${contract.genre}.${contract.planner}`,
    modelFamily: contract.modelFamily,
    promptPrefixFingerprint,
  });
}

export function planPromptCache(args: {
  readonly requestedMode?: PromptCacheMode;
  readonly modelSupportsExplicitCaching: boolean;
  readonly reusablePrefix: string;
  readonly expectedReuseCount: number;
  readonly itemIdentity: string;
  readonly shardCount?: number | "auto";
  readonly keyParts: PromptCacheKeyParts;
  readonly breakpointAfterBlock: string;
  readonly repair?: boolean;
  readonly explicitRepairCaching?: boolean;
  readonly minimumPrefixTokens?: number;
  readonly minimumReuseCount?: number;
}): PromptCachePlan {
  const estimatedReusablePrefixTokens = estimatePromptTokens(args.reusablePrefix);
  const requestedShardCount = args.shardCount ?? "auto";
  const shardCount =
    requestedShardCount === "auto"
      ? 1
      : requestedShardCount;
  const shard = stablePromptCacheShard(args.itemIdentity, shardCount);
  if (args.requestedMode === "disabled" || args.requestedMode === "implicit") {
    return {
      mode: args.requestedMode,
      estimatedReusablePrefixTokens,
      expectedReuseCount: args.expectedReuseCount,
      shard,
      cacheSupported: args.modelSupportsExplicitCaching,
      cacheEligible: false,
      downgradeReason: "EXPLICIT_CACHE_DISABLED",
    };
  }
  const downgradeReason = !args.modelSupportsExplicitCaching
    ? "MODEL_UNSUPPORTED"
    : estimatedReusablePrefixTokens < (args.minimumPrefixTokens ?? 1024)
      ? "PREFIX_TOO_SHORT"
      : args.expectedReuseCount < (args.minimumReuseCount ?? 2)
        ? "INSUFFICIENT_EXPECTED_REUSE"
        : args.repair && args.explicitRepairCaching !== true
          ? "REPAIR_CACHE_DISABLED"
          : undefined;
  if (downgradeReason) {
    return {
      mode: args.modelSupportsExplicitCaching ? "implicit" : "disabled",
      estimatedReusablePrefixTokens,
      expectedReuseCount: args.expectedReuseCount,
      shard,
      cacheSupported: args.modelSupportsExplicitCaching,
      cacheEligible: false,
      downgradeReason,
    };
  }
  return {
    mode: "explicit",
    cacheKey: buildPromptCacheKey(args.keyParts, shard),
    ttl: "in_memory",
    breakpointAfterBlock: args.breakpointAfterBlock,
    estimatedReusablePrefixTokens,
    expectedReuseCount: args.expectedReuseCount,
    shard,
    cacheSupported: true,
    cacheEligible: true,
  };
}

export function planOpenAiResponsesPromptCache(args: {
  readonly requestedMode?: PromptCacheMode;
  readonly model: string;
  readonly reusablePrefix: string;
  readonly expectedReuseCount: number;
  readonly itemIdentity: string;
  readonly contract: OpenAiResponsesPromptCacheContract;
  readonly breakpointAfterBlock: string;
  readonly minimumPrefixTokens?: number;
  readonly minimumReuseCount?: number;
}): PromptCachePlan {
  if (
    args.reusablePrefix !== args.contract.stablePrefix
  ) {
    throw new Error("Prompt cache contract stablePrefix must match the rendered reusable prefix.");
  }
  const capability = resolveOpenAiPromptCacheCapability(args.model);
  const estimatedReusablePrefixTokens = estimatePromptTokens(args.reusablePrefix);
  const minimumPrefixTokens =
    args.minimumPrefixTokens ?? capability.minimumPrefixTokens ?? Number.POSITIVE_INFINITY;
  const minimumReuseCount = args.minimumReuseCount ?? 2;
  const requestedMode = args.requestedMode ?? "explicit";
  const promptPrefixFingerprint = createPromptPrefixFingerprint({
    provider: "openai",
    modelFamily: args.contract.modelFamily,
    promptFamily: `${args.contract.genre}.${args.contract.planner}`,
    promptPolicyVersion: args.contract.contractVersion,
    outputContractVersion: args.contract.schemaVersion,
    stablePrefix: args.reusablePrefix,
  });
  const promptCacheRoutingKey = createPromptCacheRoutingKey({
    promptFamily: `${args.contract.genre}.${args.contract.planner}`,
    modelFamily: args.contract.modelFamily,
    promptPrefixFingerprint,
  });
  const common = {
    estimatedReusablePrefixTokens,
    expectedReuseCount: args.expectedReuseCount,
    shard: 0,
    promptPrefixFingerprint,
    projectionStrategy: capability.strategy,
    cacheSupported: capability.strategy !== "unsupported",
  } as const;
  if (requestedMode === "disabled") {
    return {
      ...common,
      mode: "disabled",
      cacheEligible: false,
      downgradeReason: "EXPLICIT_CACHE_DISABLED",
    };
  }
  if (capability.strategy === "unsupported") {
    return {
      ...common,
      mode: "disabled",
      cacheEligible: false,
      downgradeReason: "MODEL_UNSUPPORTED",
    };
  }
  if (estimatedReusablePrefixTokens < minimumPrefixTokens) {
    return {
      ...common,
      mode: capability.strategy === "legacy-automatic" ? "implicit" : "disabled",
      cacheEligible: false,
      downgradeReason: "PREFIX_TOO_SHORT",
    };
  }
  if (args.expectedReuseCount < minimumReuseCount) {
    return {
      ...common,
      mode: capability.strategy === "legacy-automatic" ? "implicit" : "disabled",
      cacheEligible: false,
      downgradeReason: "INSUFFICIENT_EXPECTED_REUSE",
    };
  }
  const mode =
    capability.strategy === "gpt-5.6-explicit" && requestedMode === "explicit"
      ? "explicit"
      : "implicit";
  return {
    ...common,
    mode,
    cacheKey: promptCacheRoutingKey,
    promptCacheRoutingKey,
    ttl: mode === "explicit" ? "30m" : capability.ttl ?? "in_memory",
    ...(mode === "explicit" ? { breakpointAfterBlock: args.breakpointAfterBlock } : {}),
    cacheEligible: true,
  };
}

export function openAiPromptCacheFields(
  plan: PromptCachePlan
): Readonly<OpenAiResponsesPromptCacheFields> | Record<string, never> {
  if (!plan.cacheEligible || !plan.promptCacheRoutingKey) return {};
  if (plan.mode === "explicit" && plan.projectionStrategy === "gpt-5.6-explicit") {
    return {
      prompt_cache_key: plan.promptCacheRoutingKey,
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
    };
  }
  if (plan.mode === "implicit" && plan.projectionStrategy === "legacy-automatic") {
    return {
      prompt_cache_key: plan.promptCacheRoutingKey,
      prompt_cache_retention: plan.ttl === "24h" ? "24h" : "in_memory",
    };
  }
  if (plan.mode === "implicit" && plan.projectionStrategy === "gpt-5.6-explicit") {
    return { prompt_cache_key: plan.promptCacheRoutingKey };
  }
  return {};
}

type OpenAiResponsesInputContent = Readonly<Record<string, unknown>> & {
  readonly type: string;
};

type OpenAiResponsesInputMessage = Readonly<Record<string, unknown>> & {
  readonly role: string;
  readonly content: readonly OpenAiResponsesInputContent[];
};

function isOpenAiResponsesInputMessage(value: unknown): value is OpenAiResponsesInputMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["role"] === "string" &&
    Array.isArray(record["content"]) &&
    record["content"].every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>)["type"] === "string",
    )
  );
}

/**
 * Project provider cache fields and the explicit breakpoint into the actual
 * serialized Responses body. The stable prefix is verified before projection so
 * a caller cannot accidentally mark a dynamic block as reusable.
 */
export function projectOpenAiResponsesPromptCache<TBody extends Record<string, unknown>>(
  body: TBody,
  plan: PromptCachePlan,
  stablePrefix: string,
): TBody & Partial<OpenAiResponsesExplicitPromptCacheFields & OpenAiResponsesLegacyPromptCacheFields> {
  const fields = openAiPromptCacheFields(plan);
  if (plan.mode !== "explicit") return { ...body, ...fields };
  const input = body["input"];
  if (!Array.isArray(input) || !input.every(isOpenAiResponsesInputMessage)) {
    throw new Error("Explicit prompt caching requires a typed Responses input message array.");
  }
  const systemIndex = input.findIndex((message) => message.role === "system");
  if (systemIndex < 0) {
    throw new Error("Explicit prompt caching requires a stable system prefix.");
  }
  const system = input[systemIndex]!;
  let prefixIndex = -1;
  system.content.forEach((block, index) => {
    if (block.type === "input_text" && block["text"] === stablePrefix) {
      prefixIndex = index;
    }
  });
  if (prefixIndex < 0) {
    throw new Error("The rendered stable prefix does not match the provider request body.");
  }
  if (prefixIndex !== system.content.length - 1) {
    throw new Error("The prompt cache breakpoint must terminate the stable system prefix.");
  }
  const content = system.content.map((block, index) =>
    index === prefixIndex
      ? { ...block, prompt_cache_breakpoint: { mode: "explicit" } satisfies OpenAiPromptCacheBreakpoint }
      : block,
  );
  const projectedInput = input.map((message, index) =>
    index === systemIndex ? { ...message, content } : message,
  );
  return { ...body, input: projectedInput, ...fields };
}

export function normalizeOpenAiResponsesPromptCacheUsage(input: {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly cacheWriteInputTokens?: number;
}): {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens: number;
  readonly cacheRead: boolean;
  readonly cacheWrite: boolean;
} {
  const inputTokens = input.inputTokens ?? 0;
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const cacheWriteInputTokens = input.cacheWriteInputTokens ?? 0;
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    cacheRead: cachedInputTokens > 0,
    cacheWrite: cacheWriteInputTokens > 0,
  };
}

export function aggregatePromptCacheUsage(
  records: readonly PromptCacheUsageRecord[],
  groupBy: readonly (
    | "model"
    | "promptFamily"
    | "language"
    | "format"
    | "imageSubtype"
    | "batch"
    | "cacheKey"
    | "date"
  )[]
): readonly PromptCacheUsageAggregate[] {
  const groups = new Map<string, PromptCacheUsageRecord[]>();
  for (const record of records) {
    const key = groupBy
      .map((dimension) => `${dimension}=${record[dimension] ?? "none"}`)
      .join("|");
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => {
      const sum = (select: (record: PromptCacheUsageRecord) => number) =>
        values.reduce((total, record) => total + select(record), 0);
      const inputTokens = sum((record) => record.inputTokens);
      const cachedInputTokens = sum((record) => record.cachedInputTokens);
      const cacheWriteTokens = sum((record) => record.cacheWriteTokens);
      const estimatedUncachedCostUsd = sum(
        (record) => record.estimatedUncachedCostUsd ?? 0
      );
      const estimatedActualCostUsd = sum(
        (record) => record.estimatedActualCostUsd ?? 0
      );
      return {
        key,
        recordCount: values.length,
        inputTokens,
        cachedInputTokens,
        cacheWriteTokens,
        outputTokens: sum((record) => record.outputTokens),
        reasoningTokens: sum((record) => record.reasoningTokens),
        cacheReadRatio: inputTokens === 0 ? 0 : cachedInputTokens / inputTokens,
        cacheWriteRatio: inputTokens === 0 ? 0 : cacheWriteTokens / inputTokens,
        estimatedUncachedCostUsd,
        estimatedActualCostUsd,
        estimatedSavingsUsd: Math.max(
          0,
          estimatedUncachedCostUsd - estimatedActualCostUsd
        ),
      };
    });
}
