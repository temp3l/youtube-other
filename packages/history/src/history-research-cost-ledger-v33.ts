import fs from "node:fs/promises";
import type { HistoryResearchCostConfigV33 } from "./history-research-cost-config-v33.js";
import type { ProviderRunMetadataV3_3 } from "./history-research-v33.js";

export interface HistoryPricingCatalogV33 {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly models: Readonly<
    Record<
      string,
      {
        readonly inputUsdPer1M?: number;
        readonly cachedInputUsdPer1M?: number;
        readonly outputUsdPer1M?: number;
        readonly webSearchUsdPerCall?: number;
      }
    >
  >;
}

export interface CostLedgerEntryV3_3 {
  readonly provider: string;
  readonly model: string;
  readonly operation: string;
  readonly batchId: string | null;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number | null;
  readonly webSearchCalls: number;
  readonly directToolCallCostUsd: number | null;
  readonly modelTokenCostUsd: number | null;
  readonly retryCostUsd: number | null;
  readonly escalationCostUsd: number | null;
  readonly pricingVersion: string;
  readonly timestamp: string;
}

export interface EpisodeCostLedgerV3_3 {
  readonly pricingVersion: string;
  readonly pricingStatus: "configured" | "unconfigured";
  readonly softBudgetUsd: number;
  readonly hardBudgetUsd: number;
  readonly cumulativeCostUsd: number | null;
  readonly costEstimateAvailable: boolean;
  readonly entries: readonly CostLedgerEntryV3_3[];
  readonly warnings: readonly string[];
  readonly stopReason:
    | "within_budget"
    | "soft_budget_reached"
    | "hard_budget_reached"
    | "audited_override";
  readonly auditedOverride: boolean;
}

export const UNCONFIGURED_HISTORY_PRICING_V33: HistoryPricingCatalogV33 = {
  version: "unconfigured",
  effectiveFrom: "1970-01-01T00:00:00.000Z",
  models: {},
};

export async function loadHistoryPricingCatalogV33(
  path: string | null
): Promise<HistoryPricingCatalogV33> {
  if (!path) return UNCONFIGURED_HISTORY_PRICING_V33;
  try {
    const raw = JSON.parse(await fs.readFile(path, "utf8")) as HistoryPricingCatalogV33;
    if (!raw.version || typeof raw.models !== "object" || raw.models === null)
      return UNCONFIGURED_HISTORY_PRICING_V33;
    return raw;
  } catch {
    return UNCONFIGURED_HISTORY_PRICING_V33;
  }
}

export function createEpisodeCostLedgerV33(
  config: Pick<
    HistoryResearchCostConfigV33,
    "softCostBudgetUsdPerEpisode" | "hardCostBudgetUsdPerEpisode"
  >,
  pricing: HistoryPricingCatalogV33,
  options: { readonly auditedOverride?: boolean } = {}
): EpisodeCostLedgerV3_3 {
  return {
    pricingVersion: pricing.version,
    pricingStatus:
      pricing.version === "unconfigured" ? "unconfigured" : "configured",
    softBudgetUsd: config.softCostBudgetUsdPerEpisode,
    hardBudgetUsd: config.hardCostBudgetUsdPerEpisode,
    cumulativeCostUsd: pricing.version === "unconfigured" ? null : 0,
    costEstimateAvailable: pricing.version !== "unconfigured",
    entries: [],
    warnings:
      pricing.version === "unconfigured"
        ? ["pricing status: unconfigured", "cost estimate: unavailable"]
        : [],
    stopReason: options.auditedOverride ? "audited_override" : "within_budget",
    auditedOverride: options.auditedOverride ?? false,
  };
}

function estimateModelTokenCostUsd(
  pricing: HistoryPricingCatalogV33,
  model: string,
  usage: {
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
  }
): number | null {
  const entry = pricing.models[model];
  if (!entry) return null;
  if (
    entry.inputUsdPer1M === undefined &&
    entry.cachedInputUsdPer1M === undefined &&
    entry.outputUsdPer1M === undefined
  )
    return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const cached = Math.max(0, usage.cachedInputTokens);
  return (
    (uncached * (entry.inputUsdPer1M ?? 0)) / 1_000_000 +
    (cached * (entry.cachedInputUsdPer1M ?? entry.inputUsdPer1M ?? 0)) /
      1_000_000 +
    (usage.outputTokens * (entry.outputUsdPer1M ?? 0)) / 1_000_000
  );
}

export function estimateWebSearchCostUsd(
  pricing: HistoryPricingCatalogV33,
  model: string,
  calls: number
): number | null {
  const rate = pricing.models[model]?.webSearchUsdPerCall;
  if (rate === undefined) return null;
  return rate * calls;
}

export function canSpendPaidWorkV33(
  ledger: EpisodeCostLedgerV3_3,
  input: { readonly lowPriority?: boolean } = {}
): {
  readonly allowed: boolean;
  readonly reason: EpisodeCostLedgerV3_3["stopReason"];
} {
  if (ledger.auditedOverride)
    return { allowed: true, reason: "audited_override" };
  if (!ledger.costEstimateAvailable)
    return { allowed: true, reason: "within_budget" };
  const cumulative = ledger.cumulativeCostUsd ?? 0;
  if (cumulative >= ledger.hardBudgetUsd)
    return { allowed: false, reason: "hard_budget_reached" };
  if (input.lowPriority && cumulative >= ledger.softBudgetUsd)
    return { allowed: false, reason: "soft_budget_reached" };
  return { allowed: true, reason: "within_budget" };
}

export function appendCostLedgerEntryV33(
  ledger: EpisodeCostLedgerV3_3,
  pricing: HistoryPricingCatalogV33,
  entry: Omit<
    CostLedgerEntryV3_3,
    | "modelTokenCostUsd"
    | "directToolCallCostUsd"
    | "retryCostUsd"
    | "escalationCostUsd"
    | "pricingVersion"
  > & {
    readonly modelTokenCostUsd?: number | null;
    readonly directToolCallCostUsd?: number | null;
    readonly retryCostUsd?: number | null;
    readonly escalationCostUsd?: number | null;
    readonly isEscalation?: boolean;
    readonly isRetry?: boolean;
  }
): EpisodeCostLedgerV3_3 {
  const modelTokenCostUsd =
    entry.modelTokenCostUsd !== undefined
      ? entry.modelTokenCostUsd
      : estimateModelTokenCostUsd(pricing, entry.model, entry);
  const directToolCallCostUsd =
    entry.directToolCallCostUsd !== undefined
      ? entry.directToolCallCostUsd
      : estimateWebSearchCostUsd(pricing, entry.model, entry.webSearchCalls);
  const componentCosts = [
    modelTokenCostUsd,
    directToolCallCostUsd,
    entry.retryCostUsd ?? null,
    entry.escalationCostUsd ?? null,
  ];
  const anyCost = componentCosts.some((value) => value !== null);
  const entryCost = anyCost
    ? componentCosts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const nextCumulative =
    ledger.costEstimateAvailable && entryCost !== null
      ? (ledger.cumulativeCostUsd ?? 0) + entryCost
      : ledger.cumulativeCostUsd;
  const warnings = [...ledger.warnings];
  let stopReason = ledger.stopReason;
  if (ledger.costEstimateAvailable && nextCumulative !== null) {
    if (!ledger.auditedOverride && nextCumulative >= ledger.hardBudgetUsd)
      stopReason = "hard_budget_reached";
    else if (!ledger.auditedOverride && nextCumulative >= ledger.softBudgetUsd) {
      stopReason = "soft_budget_reached";
      if (!warnings.includes("soft cost budget approached or reached"))
        warnings.push("soft cost budget approached or reached");
    }
  }
  return {
    ...ledger,
    cumulativeCostUsd: nextCumulative,
    stopReason: ledger.auditedOverride ? "audited_override" : stopReason,
    warnings,
    entries: [
      ...ledger.entries,
      {
        provider: entry.provider,
        model: entry.model,
        operation: entry.operation,
        batchId: entry.batchId,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens,
        webSearchCalls: entry.webSearchCalls,
        directToolCallCostUsd,
        modelTokenCostUsd,
        retryCostUsd: entry.isRetry ? modelTokenCostUsd : (entry.retryCostUsd ?? null),
        escalationCostUsd: entry.isEscalation
          ? modelTokenCostUsd
          : (entry.escalationCostUsd ?? null),
        pricingVersion: pricing.version,
        timestamp: entry.timestamp,
      },
    ],
  };
}

export function appendProviderRunToCostLedgerV33(
  ledger: EpisodeCostLedgerV3_3,
  pricing: HistoryPricingCatalogV33,
  run: ProviderRunMetadataV3_3,
  options: {
    readonly operation: string;
    readonly batchId?: string | null;
    readonly webSearchCalls?: number;
    readonly isEscalation?: boolean;
    readonly isRetry?: boolean;
    readonly reasoningTokens?: number | null;
  }
): EpisodeCostLedgerV3_3 {
  return appendCostLedgerEntryV33(ledger, pricing, {
    provider: run.provider,
    model: run.model,
    operation: options.operation,
    batchId: options.batchId ?? null,
    inputTokens: run.inputTokens,
    cachedInputTokens: run.cachedInputTokens,
    outputTokens: run.outputTokens,
    reasoningTokens: options.reasoningTokens ?? null,
    webSearchCalls: options.webSearchCalls ?? 0,
    timestamp: run.requestedAt,
    ...(options.isEscalation !== undefined
      ? { isEscalation: options.isEscalation }
      : {}),
    isRetry: options.isRetry || run.retryCount > 0,
  });
}

export function formatCostStatusV33(ledger: EpisodeCostLedgerV3_3): {
  readonly pricingStatus: string;
  readonly costEstimate: string;
  readonly cumulativeCostUsd: number | null;
  readonly softBudgetUsd: number;
  readonly hardBudgetUsd: number;
  readonly stopReason: EpisodeCostLedgerV3_3["stopReason"];
  readonly entryCount: number;
  readonly warnings: readonly string[];
} {
  return {
    pricingStatus: ledger.pricingStatus,
    costEstimate: ledger.costEstimateAvailable
      ? String(ledger.cumulativeCostUsd ?? 0)
      : "unavailable",
    cumulativeCostUsd: ledger.cumulativeCostUsd,
    softBudgetUsd: ledger.softBudgetUsd,
    hardBudgetUsd: ledger.hardBudgetUsd,
    stopReason: ledger.stopReason,
    entryCount: ledger.entries.length,
    warnings: ledger.warnings,
  };
}
