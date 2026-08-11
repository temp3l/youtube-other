import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenAIDebugLogEntry } from "./openai-debug-logger.js";

const PRICING_VERSION = "openai-api-standard-2026-08-11";
const PRICING_SOURCE = "https://openai.com/api/pricing/";

interface TokenPricing {
  readonly inputUsdPerMillion: number;
  readonly cachedInputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly cacheWriteMultiplier?: number;
}

interface ImageTokenPricing {
  readonly textInputUsdPerMillion: number;
  readonly cachedTextInputUsdPerMillion: number;
  readonly textOutputUsdPerMillion: number;
  readonly imageInputUsdPerMillion: number;
  readonly cachedImageInputUsdPerMillion: number;
  readonly imageOutputUsdPerMillion: number;
}

const TEXT_PRICING: Readonly<Record<string, TokenPricing>> = {
  "gpt-5.4-mini": {
    inputUsdPerMillion: 0.75,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 4.5,
    cacheWriteMultiplier: 1.25,
  },
  "gpt-5.6-terra": {
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.2,
    outputUsdPerMillion: 12,
    cacheWriteMultiplier: 1.25,
  },
  "gpt-5.6-sol": {
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30,
    cacheWriteMultiplier: 1.25,
  },
  "gpt-5.5": {
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30,
    cacheWriteMultiplier: 1.25,
  },
};

const GPT_IMAGE_2_PRICING: ImageTokenPricing = {
  textInputUsdPerMillion: 5,
  cachedTextInputUsdPerMillion: 1.25,
  textOutputUsdPerMillion: 10,
  imageInputUsdPerMillion: 8,
  cachedImageInputUsdPerMillion: 2,
  imageOutputUsdPerMillion: 30,
};

export interface OpenAIEpisodeUsageTotals {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly textInputTokens: number;
  readonly imageInputTokens: number;
  readonly textOutputTokens: number;
  readonly imageOutputTokens: number;
  readonly audioDurationSeconds: number;
  readonly imageCount: number;
}

export interface OpenAIEpisodeCostBreakdown {
  readonly providerCalls: number;
  readonly successfulProviderCalls: number;
  readonly failedProviderCalls: number;
  readonly unpricedProviderCalls: number;
  readonly knownEstimatedCostUsd: number;
  readonly usage: OpenAIEpisodeUsageTotals;
}

export interface OpenAIEpisodeCostSummary {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceDirectory: "debug/openai-calls";
  readonly pricing: {
    readonly version: string;
    readonly source: string;
    readonly description: string;
  };
  readonly calls: {
    readonly loggedRecords: number;
    readonly skippedMalformedRecords: number;
    readonly paidProviderCalls: number;
    readonly successfulProviderCalls: number;
    readonly failedProviderCalls: number;
    readonly unpricedProviderCalls: number;
  };
  readonly usage: OpenAIEpisodeUsageTotals;
  readonly knownEstimatedCostUsd: number;
  readonly totalEstimatedCostUsd: number | null;
  readonly costCoverage: "COMPLETE" | "PARTIAL" | "NONE";
  readonly byModel: Readonly<Record<string, OpenAIEpisodeCostBreakdown>>;
  readonly byOperation: Readonly<Record<string, OpenAIEpisodeCostBreakdown>>;
}

interface MutableUsageTotals {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  textInputTokens: number;
  imageInputTokens: number;
  textOutputTokens: number;
  imageOutputTokens: number;
  audioDurationSeconds: number;
  imageCount: number;
}

interface MutableBreakdown {
  providerCalls: number;
  successfulProviderCalls: number;
  failedProviderCalls: number;
  unpricedProviderCalls: number;
  knownCostMicros: number;
  usage: MutableUsageTotals;
}

interface PricedCall {
  readonly costMicros: number | null;
  readonly usage: MutableUsageTotals;
}

const summaryRefreshes = new Map<string, Promise<OpenAIEpisodeCostSummary>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberAt(value: unknown, ...keys: string[]): number | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, candidate);
    }
  }
  return undefined;
}

function recordAt(value: unknown, ...keys: string[]): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    if (isRecord(value[key])) return value[key];
  }
  return undefined;
}

function findUsage(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!isRecord(value) || depth > 4) return undefined;
  if (
    numberAt(value, "input_tokens", "inputTokens", "output_tokens", "outputTokens") !==
    undefined
  ) {
    return value;
  }
  for (const key of ["usage", "response", "data", "result"]) {
    const found = findUsage(value[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function emptyUsage(): MutableUsageTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    textInputTokens: 0,
    imageInputTokens: 0,
    textOutputTokens: 0,
    imageOutputTokens: 0,
    audioDurationSeconds: 0,
    imageCount: 0,
  };
}

function addUsage(target: MutableUsageTotals, usage: MutableUsageTotals): void {
  for (const key of Object.keys(target) as Array<keyof MutableUsageTotals>) {
    target[key] += usage[key];
  }
}

function extractUsage(entry: OpenAIDebugLogEntry): MutableUsageTotals {
  const normalized = isRecord(entry.usage) ? entry.usage : undefined;
  const raw = findUsage(entry.response) ?? normalized;
  const inputDetails = recordAt(raw, "input_tokens_details", "inputTokensDetails");
  const outputDetails = recordAt(raw, "output_tokens_details", "outputTokensDetails");
  const inputTokens =
    numberAt(normalized, "inputTokens", "input_tokens") ??
    numberAt(raw, "input_tokens", "inputTokens") ??
    0;
  const outputTokens =
    numberAt(normalized, "outputTokens", "output_tokens") ??
    numberAt(raw, "output_tokens", "outputTokens") ??
    0;
  const cachedInputTokens =
    numberAt(normalized, "cachedInputTokens", "cached_input_tokens") ??
    numberAt(inputDetails, "cached_tokens", "cachedTokens") ??
    0;
  const cacheWriteTokens =
    numberAt(normalized, "cacheWriteTokens", "cache_write_tokens") ??
    numberAt(inputDetails, "cache_write_tokens", "cacheWriteTokens") ??
    0;
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    textInputTokens: numberAt(inputDetails, "text_tokens", "textTokens") ?? 0,
    imageInputTokens: numberAt(inputDetails, "image_tokens", "imageTokens") ?? 0,
    textOutputTokens: numberAt(outputDetails, "text_tokens", "textTokens") ?? 0,
    imageOutputTokens: numberAt(outputDetails, "image_tokens", "imageTokens") ?? 0,
    audioDurationSeconds:
      numberAt(normalized, "durationSeconds", "audioDurationSeconds") ?? 0,
    imageCount: numberAt(normalized, "imageCount", "image_count") ?? 0,
  };
}

function modelPricing(model: string): TokenPricing | undefined {
  return Object.entries(TEXT_PRICING).find(
    ([name]) => model === name || model.startsWith(`${name}-20`)
  )?.[1];
}

function serviceTier(entry: OpenAIDebugLogEntry): string {
  const response = isRecord(entry.response) ? entry.response : undefined;
  const nestedResponse = recordAt(response, "response");
  const request = isRecord(entry.request) ? entry.request : undefined;
  const requestBody = recordAt(request, "body");
  for (const candidate of [
    response?.["service_tier"],
    nestedResponse?.["service_tier"],
    request?.["service_tier"],
    requestBody?.["service_tier"],
  ]) {
    if (typeof candidate === "string") return candidate.toLowerCase();
  }
  return "default";
}

function serviceTierMultiplier(tier: string): number | null {
  if (tier === "default" || tier === "standard" || tier === "auto") return 1;
  if (tier === "flex" || tier === "batch") return 0.5;
  return null;
}

function tokenCostMicros(
  usage: MutableUsageTotals,
  pricing: TokenPricing,
  multiplier: number
): number | null {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return null;
  const uncached = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens
  );
  const usd =
    ((uncached * pricing.inputUsdPerMillion +
      usage.cachedInputTokens * pricing.cachedInputUsdPerMillion +
      usage.cacheWriteTokens *
        pricing.inputUsdPerMillion *
        (pricing.cacheWriteMultiplier ?? 1) +
      usage.outputTokens * pricing.outputUsdPerMillion) /
      1_000_000) *
    multiplier;
  return Math.round(usd * 1_000_000);
}

function imageCostMicros(
  usage: MutableUsageTotals,
  multiplier: number
): number | null {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return null;
  const hasModalityBreakdown =
    usage.textInputTokens +
      usage.imageInputTokens +
      usage.textOutputTokens +
      usage.imageOutputTokens >
    0;
  if (!hasModalityBreakdown) return null;
  const inputBreakdown = usage.textInputTokens + usage.imageInputTokens;
  const outputBreakdown = usage.textOutputTokens + usage.imageOutputTokens;
  if (inputBreakdown !== usage.inputTokens || outputBreakdown !== usage.outputTokens) {
    return null;
  }
  if (
    usage.cachedInputTokens > 0 &&
    usage.textInputTokens > 0 &&
    usage.imageInputTokens > 0
  ) {
    return null;
  }
  const cachedText = usage.imageInputTokens === 0 ? usage.cachedInputTokens : 0;
  const cachedImage = usage.textInputTokens === 0 ? usage.cachedInputTokens : 0;
  const usd =
    ((Math.max(0, usage.textInputTokens - cachedText) *
      GPT_IMAGE_2_PRICING.textInputUsdPerMillion +
      cachedText * GPT_IMAGE_2_PRICING.cachedTextInputUsdPerMillion +
      Math.max(0, usage.imageInputTokens - cachedImage) *
        GPT_IMAGE_2_PRICING.imageInputUsdPerMillion +
      cachedImage * GPT_IMAGE_2_PRICING.cachedImageInputUsdPerMillion +
      usage.textOutputTokens * GPT_IMAGE_2_PRICING.textOutputUsdPerMillion +
      usage.imageOutputTokens * GPT_IMAGE_2_PRICING.imageOutputUsdPerMillion) /
      1_000_000) *
    multiplier;
  return Math.round(usd * 1_000_000);
}

function priceCall(entry: OpenAIDebugLogEntry): PricedCall {
  const usage = extractUsage(entry);
  const tierMultiplier = serviceTierMultiplier(serviceTier(entry));
  if (!entry.model || tierMultiplier === null) return { costMicros: null, usage };
  if (entry.model === "gpt-image-2" || entry.model.startsWith("gpt-image-2-20")) {
    return { costMicros: imageCostMicros(usage, tierMultiplier), usage };
  }
  if (entry.model === "gpt-4o-mini-tts") {
    return {
      costMicros:
        usage.audioDurationSeconds > 0
          ? Math.round((usage.audioDurationSeconds / 60) * 0.015 * 1_000_000)
          : null,
      usage,
    };
  }
  const pricing = modelPricing(entry.model);
  return {
    costMicros: pricing
      ? tokenCostMicros(usage, pricing, tierMultiplier)
      : null,
    usage,
  };
}

function emptyBreakdown(): MutableBreakdown {
  return {
    providerCalls: 0,
    successfulProviderCalls: 0,
    failedProviderCalls: 0,
    unpricedProviderCalls: 0,
    knownCostMicros: 0,
    usage: emptyUsage(),
  };
}

function addCall(
  breakdown: MutableBreakdown,
  entry: OpenAIDebugLogEntry,
  priced: PricedCall
): void {
  breakdown.providerCalls += 1;
  const failed = entry.status === "error" || entry.error !== undefined;
  if (failed) breakdown.failedProviderCalls += 1;
  else breakdown.successfulProviderCalls += 1;
  if (priced.costMicros === null) breakdown.unpricedProviderCalls += 1;
  else breakdown.knownCostMicros += priced.costMicros;
  addUsage(breakdown.usage, priced.usage);
}

function roundUsd(costMicros: number): number {
  return Number((costMicros / 1_000_000).toFixed(6));
}

function freezeBreakdown(value: MutableBreakdown): OpenAIEpisodeCostBreakdown {
  return {
    providerCalls: value.providerCalls,
    successfulProviderCalls: value.successfulProviderCalls,
    failedProviderCalls: value.failedProviderCalls,
    unpricedProviderCalls: value.unpricedProviderCalls,
    knownEstimatedCostUsd: roundUsd(value.knownCostMicros),
    usage: { ...value.usage },
  };
}

async function readDebugEntries(directory: string): Promise<{
  readonly entries: readonly OpenAIDebugLogEntry[];
  readonly skippedMalformedRecords: number;
}> {
  let names: string[];
  try {
    names = (await fs.readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [], skippedMalformedRecords: 0 };
    }
    throw error;
  }
  const entries: OpenAIDebugLogEntry[] = [];
  let skippedMalformedRecords = 0;
  for (const name of names.sort()) {
    try {
      const parsed = JSON.parse(
        await fs.readFile(path.join(directory, name), "utf8")
      ) as unknown;
      if (
        !isRecord(parsed) ||
        parsed["provider"] !== "openai" ||
        typeof parsed["paidProviderCalled"] !== "boolean"
      ) {
        skippedMalformedRecords += 1;
        continue;
      }
      entries.push(parsed as unknown as OpenAIDebugLogEntry);
    } catch {
      skippedMalformedRecords += 1;
    }
  }
  return { entries, skippedMalformedRecords };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function rebuild(input: {
  readonly episodeRoot: string;
  readonly generatedAt?: string;
}): Promise<OpenAIEpisodeCostSummary> {
  const episodeRoot = path.resolve(input.episodeRoot);
  const sourceDirectory = path.join(episodeRoot, "debug", "openai-calls");
  const { entries, skippedMalformedRecords } = await readDebugEntries(sourceDirectory);
  const total = emptyBreakdown();
  const byModel = new Map<string, MutableBreakdown>();
  const byOperation = new Map<string, MutableBreakdown>();
  for (const entry of entries) {
    if (!entry.paidProviderCalled) continue;
    const priced = priceCall(entry);
    addCall(total, entry, priced);
    const modelKey = entry.model ?? "unknown-model";
    const operationKey = entry.operation ?? "unknown-operation";
    const model = byModel.get(modelKey) ?? emptyBreakdown();
    const operation = byOperation.get(operationKey) ?? emptyBreakdown();
    addCall(model, entry, priced);
    addCall(operation, entry, priced);
    byModel.set(modelKey, model);
    byOperation.set(operationKey, operation);
  }
  const unknownCostRecords =
    total.unpricedProviderCalls + skippedMalformedRecords;
  const costCoverage =
    total.providerCalls === 0 && unknownCostRecords === 0
      ? "COMPLETE"
      : unknownCostRecords > 0 && total.knownCostMicros === 0
        ? "NONE"
        : unknownCostRecords > 0
          ? "PARTIAL"
          : "COMPLETE";
  const summary: OpenAIEpisodeCostSummary = {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceDirectory: "debug/openai-calls",
    pricing: {
      version: PRICING_VERSION,
      source: PRICING_SOURCE,
      description:
        "Token- and duration-derived estimate from durable terminal call logs; not an OpenAI invoice. Unknown usage or pricing keeps totalEstimatedCostUsd null.",
    },
    calls: {
      loggedRecords: entries.length,
      skippedMalformedRecords,
      paidProviderCalls: total.providerCalls,
      successfulProviderCalls: total.successfulProviderCalls,
      failedProviderCalls: total.failedProviderCalls,
      unpricedProviderCalls: total.unpricedProviderCalls,
    },
    usage: { ...total.usage },
    knownEstimatedCostUsd: roundUsd(total.knownCostMicros),
    totalEstimatedCostUsd:
      unknownCostRecords === 0 ? roundUsd(total.knownCostMicros) : null,
    costCoverage,
    byModel: Object.fromEntries(
      [...byModel.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, freezeBreakdown(value)])
    ),
    byOperation: Object.fromEntries(
      [...byOperation.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, freezeBreakdown(value)])
    ),
  };
  await writeJsonAtomic(path.join(episodeRoot, "openai-cost-summary.json"), summary);
  return summary;
}

export async function rebuildOpenAIEpisodeCostSummary(input: {
  readonly episodeRoot: string;
  readonly generatedAt?: string;
}): Promise<OpenAIEpisodeCostSummary> {
  const key = path.resolve(input.episodeRoot);
  const previous = summaryRefreshes.get(key) ?? Promise.resolve(undefined);
  const current = previous
    .catch(() => undefined)
    .then(() => rebuild(input));
  summaryRefreshes.set(key, current);
  try {
    return await current;
  } finally {
    if (summaryRefreshes.get(key) === current) summaryRefreshes.delete(key);
  }
}
