import type { HistoryResearchCostConfigV33 } from "./history-research-cost-config-v33.js";

export type SearchBudgetStopReasonV3_3 =
  | "within_budget"
  | "soft_limit_reached"
  | "hard_limit_reached"
  | "cluster_limit_reached"
  | "alternate_source_limit_reached"
  | "audited_override";

export interface SearchCallRecordV3_3 {
  readonly clusterId: string | null;
  readonly query: string;
  readonly kind: "discovery" | "alternate-source";
  readonly retrievedResultCount: number;
  readonly acceptedSourceCount: number;
  readonly rejectedSourceCount: number;
  readonly rejectionReasons: readonly string[];
  readonly estimatedDirectSearchCostUsd: number | null;
  readonly at: string;
}

export interface SearchBudgetLedgerV3_3 {
  readonly softLimit: number;
  readonly hardLimit: number;
  readonly maxSearchesPerCluster: number;
  readonly maxAlternateSourceAttempts: number;
  readonly totalSearchCalls: number;
  readonly alternateSourceAttempts: number;
  readonly callsByCluster: Readonly<Record<string, number>>;
  readonly acceptedSourceCount: number;
  readonly rejectedSourceCount: number;
  readonly retrievedResultCount: number;
  readonly estimatedDirectSearchCostUsd: number | null;
  readonly remainingSoftBudget: number;
  readonly remainingHardBudget: number;
  readonly stopReason: SearchBudgetStopReasonV3_3;
  readonly auditedOverride: boolean;
  readonly calls: readonly SearchCallRecordV3_3[];
}

export function createSearchBudgetLedgerV33(
  config: Pick<
    HistoryResearchCostConfigV33,
    | "maxWebSearchCallsPerEpisode"
    | "hardMaxWebSearchCallsPerEpisode"
    | "maxSearchesPerResearchCluster"
    | "maxAlternateSourceAttempts"
  >,
  options: { readonly auditedOverride?: boolean } = {}
): SearchBudgetLedgerV3_3 {
  return {
    softLimit: config.maxWebSearchCallsPerEpisode,
    hardLimit: config.hardMaxWebSearchCallsPerEpisode,
    maxSearchesPerCluster: config.maxSearchesPerResearchCluster,
    maxAlternateSourceAttempts: config.maxAlternateSourceAttempts,
    totalSearchCalls: 0,
    alternateSourceAttempts: 0,
    callsByCluster: {},
    acceptedSourceCount: 0,
    rejectedSourceCount: 0,
    retrievedResultCount: 0,
    estimatedDirectSearchCostUsd: null,
    remainingSoftBudget: config.maxWebSearchCallsPerEpisode,
    remainingHardBudget: config.hardMaxWebSearchCallsPerEpisode,
    stopReason: "within_budget",
    auditedOverride: options.auditedOverride ?? false,
    calls: [],
  };
}

export function canPerformSearchV33(
  ledger: SearchBudgetLedgerV3_3,
  input: {
    readonly clusterId: string | null;
    readonly kind: SearchCallRecordV3_3["kind"];
    readonly lowPriority?: boolean;
  }
): { readonly allowed: boolean; readonly reason: SearchBudgetStopReasonV3_3 } {
  if (ledger.auditedOverride)
    return { allowed: true, reason: "audited_override" };
  if (ledger.totalSearchCalls >= ledger.hardLimit)
    return { allowed: false, reason: "hard_limit_reached" };
  if (
    input.kind === "alternate-source" &&
    ledger.alternateSourceAttempts >= ledger.maxAlternateSourceAttempts
  )
    return { allowed: false, reason: "alternate_source_limit_reached" };
  if (input.clusterId) {
    const used = ledger.callsByCluster[input.clusterId] ?? 0;
    if (used >= ledger.maxSearchesPerCluster)
      return { allowed: false, reason: "cluster_limit_reached" };
  }
  if (
    input.lowPriority &&
    ledger.totalSearchCalls >= ledger.softLimit
  )
    return { allowed: false, reason: "soft_limit_reached" };
  if (ledger.totalSearchCalls >= ledger.softLimit && input.lowPriority !== false)
    return { allowed: false, reason: "soft_limit_reached" };
  return { allowed: true, reason: "within_budget" };
}

export function recordSearchCallV33(
  ledger: SearchBudgetLedgerV3_3,
  call: Omit<SearchCallRecordV3_3, "at"> & { readonly at?: string }
): SearchBudgetLedgerV3_3 {
  const clusterId = call.clusterId;
  const callsByCluster = { ...ledger.callsByCluster };
  if (clusterId)
    callsByCluster[clusterId] = (callsByCluster[clusterId] ?? 0) + 1;
  const totalSearchCalls = ledger.totalSearchCalls + 1;
  const alternateSourceAttempts =
    ledger.alternateSourceAttempts +
    (call.kind === "alternate-source" ? 1 : 0);
  const estimatedDirectSearchCostUsd =
    call.estimatedDirectSearchCostUsd === null &&
    ledger.estimatedDirectSearchCostUsd === null
      ? null
      : (ledger.estimatedDirectSearchCostUsd ?? 0) +
        (call.estimatedDirectSearchCostUsd ?? 0);
  let stopReason: SearchBudgetStopReasonV3_3 = "within_budget";
  if (!ledger.auditedOverride && totalSearchCalls >= ledger.hardLimit)
    stopReason = "hard_limit_reached";
  else if (!ledger.auditedOverride && totalSearchCalls >= ledger.softLimit)
    stopReason = "soft_limit_reached";
  return {
    ...ledger,
    totalSearchCalls,
    alternateSourceAttempts,
    callsByCluster,
    acceptedSourceCount:
      ledger.acceptedSourceCount + call.acceptedSourceCount,
    rejectedSourceCount:
      ledger.rejectedSourceCount + call.rejectedSourceCount,
    retrievedResultCount:
      ledger.retrievedResultCount + call.retrievedResultCount,
    estimatedDirectSearchCostUsd,
    remainingSoftBudget: Math.max(0, ledger.softLimit - totalSearchCalls),
    remainingHardBudget: Math.max(0, ledger.hardLimit - totalSearchCalls),
    stopReason: ledger.auditedOverride ? "audited_override" : stopReason,
    calls: [
      ...ledger.calls,
      {
        ...call,
        at: call.at ?? new Date().toISOString(),
      },
    ],
  };
}
