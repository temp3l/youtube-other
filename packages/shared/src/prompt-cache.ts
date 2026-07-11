import crypto from "node:crypto";

export type PromptCacheMode = "disabled" | "implicit" | "explicit";

export interface PromptCachePlan {
  readonly mode: PromptCacheMode;
  readonly cacheKey?: string;
  readonly ttl?: "30m";
  readonly breakpointAfterBlock?: string;
  readonly estimatedReusablePrefixTokens: number;
  readonly expectedReuseCount: number;
  readonly shard: number;
}

export interface PromptCacheKeyParts {
  readonly namespace?: string;
  readonly family: string;
  readonly version: string;
  readonly operation: string;
  readonly format: string;
  readonly language: string;
  readonly modelTier: string;
  readonly aspectBucket?: string;
  readonly referenceBundleClass?: string;
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
  return [
    safeKeyPart(parts.namespace ?? "mediaforge"),
    safeKeyPart(parts.family),
    safeKeyPart(parts.version),
    safeKeyPart(parts.operation),
    safeKeyPart(parts.format),
    safeKeyPart(parts.language),
    safeKeyPart(parts.modelTier),
  ].join(":") + `${aspect}${referenceClass}:shard-${shard}`;
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
    };
  }
  const eligible =
    args.modelSupportsExplicitCaching &&
    estimatedReusablePrefixTokens >= (args.minimumPrefixTokens ?? 1024) &&
    args.expectedReuseCount >= (args.minimumReuseCount ?? 2) &&
    (!args.repair || args.explicitRepairCaching === true);
  if (!eligible) {
    return {
      mode: args.modelSupportsExplicitCaching ? "implicit" : "disabled",
      estimatedReusablePrefixTokens,
      expectedReuseCount: args.expectedReuseCount,
      shard,
    };
  }
  return {
    mode: "explicit",
    cacheKey: buildPromptCacheKey(args.keyParts, shard),
    ttl: "30m",
    breakpointAfterBlock: args.breakpointAfterBlock,
    estimatedReusablePrefixTokens,
    expectedReuseCount: args.expectedReuseCount,
    shard,
  };
}

export function openAiPromptCacheFields(
  plan: PromptCachePlan
): Readonly<Record<string, string>> {
  return plan.mode === "explicit" && plan.cacheKey
    ? { prompt_cache_key: plan.cacheKey, prompt_cache_retention: plan.ttl ?? "30m" }
    : {};
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
