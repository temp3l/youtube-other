import crypto from "node:crypto";

import { contentProfileIdSchema } from "@mediaforge/domain";

export type PromptCacheMode = "disabled" | "implicit" | "explicit";

export type PromptCacheDowngradeReason =
  | "EXPLICIT_CACHE_DISABLED"
  | "PROVIDER_UNSUPPORTED"
  | "MODEL_UNSUPPORTED"
  | "PREFIX_TOO_SHORT"
  | "INSUFFICIENT_EXPECTED_REUSE"
  | "REPAIR_CACHE_DISABLED";

/** The subset of the installed Responses request type used for prompt caching. */
export interface OpenAiResponsesPromptCacheFields {
  readonly prompt_cache_key: string;
  readonly prompt_cache_retention: "in_memory" | "24h";
}

export interface PromptCachePlan {
  readonly mode: PromptCacheMode;
  readonly cacheKey?: string;
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
  shard: number,
): string {
  return buildPromptCacheKey(
    {
      namespace: contract.namespace ?? "youtube",
      family: contract.genre,
      version: contract.contractVersion,
      operation: contract.planner,
      format: contract.schemaVersion,
      language: "shared",
      languageIndependent: true,
      modelTier: contract.modelFamily,
      referenceBundleClass: sha256(normalizePromptText(contract.stablePrefix)),
    },
    shard,
  );
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
      ? Math.max(1, Math.min(4, Math.ceil(args.expectedReuseCount / 50)))
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
  const model = args.model.trim().toLowerCase();
  const modelSupportsExplicitCaching =
    model.length > 0 && !model.startsWith("gpt-image") && !model.startsWith("dall-e");
  const base = planPromptCache({
    ...(args.requestedMode ? { requestedMode: args.requestedMode } : {}),
    modelSupportsExplicitCaching,
    reusablePrefix: args.reusablePrefix,
    expectedReuseCount: args.expectedReuseCount,
    itemIdentity: args.itemIdentity,
    keyParts: {
      namespace: args.contract.namespace ?? "youtube",
      family: args.contract.genre,
      version: args.contract.contractVersion,
      operation: args.contract.planner,
      format: args.contract.schemaVersion,
      language: "shared",
      languageIndependent: true,
      modelTier: args.contract.modelFamily,
      referenceBundleClass: sha256(normalizePromptText(args.contract.stablePrefix)),
    },
    breakpointAfterBlock: args.breakpointAfterBlock,
    ...(args.minimumPrefixTokens !== undefined
      ? { minimumPrefixTokens: args.minimumPrefixTokens }
      : {}),
    ...(args.minimumReuseCount !== undefined
      ? { minimumReuseCount: args.minimumReuseCount }
      : {}),
  });
  return base.mode === "explicit"
    ? { ...base, cacheKey: buildOpenAiResponsesPromptCacheKey(args.contract, base.shard) }
    : base;
}

export function openAiPromptCacheFields(
  plan: PromptCachePlan
): Readonly<OpenAiResponsesPromptCacheFields> | Record<string, never> {
  return plan.mode === "explicit" && plan.cacheKey
    ? {
        prompt_cache_key: plan.cacheKey,
        prompt_cache_retention: plan.ttl === "24h" ? "24h" : "in_memory",
      }
    : {};
}

export function normalizeOpenAiResponsesPromptCacheUsage(input: {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
}): {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheRead: boolean;
} {
  const inputTokens = input.inputTokens ?? 0;
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  return { inputTokens, cachedInputTokens, cacheRead: cachedInputTokens > 0 };
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
