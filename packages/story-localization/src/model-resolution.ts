export interface ModelResolutionRecord {
  readonly configuredModel: string;
  readonly resolvedModel: string;
  readonly actualResponseModel: string;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly fallbackPolicyId?: string;
}

export interface ModelFallbackPolicy {
  readonly id: string;
  readonly approvedFallbacks: Readonly<Record<string, readonly string[]>>;
}

export class UnapprovedModelFallbackError extends Error {
  constructor(readonly record: ModelResolutionRecord) {
    super(`Provider returned unapproved model ${record.actualResponseModel}; configured=${record.configuredModel}, resolved=${record.resolvedModel}.`);
    this.name = "UnapprovedModelFallbackError";
  }
}

function sameResolvedModel(resolved: string, actual: string): boolean {
  return actual === resolved || actual.startsWith(`${resolved}-20`);
}

export function resolveModelResponse(args: {
  readonly configuredModel: string;
  readonly resolvedModel?: string;
  readonly actualResponseModel: string;
  readonly fallbackReason?: string;
  readonly fallbackPolicy?: ModelFallbackPolicy;
  readonly offlineMock?: boolean;
}): ModelResolutionRecord {
  const resolvedModel = args.resolvedModel ?? args.configuredModel;
  const exact = sameResolvedModel(resolvedModel, args.actualResponseModel);
  const mock = args.offlineMock === true && args.actualResponseModel === "mock";
  const approved = args.fallbackPolicy?.approvedFallbacks[resolvedModel]?.includes(args.actualResponseModel) ?? false;
  const fallbackPolicyId = approved ? args.fallbackPolicy?.id : undefined;
  const record: ModelResolutionRecord = {
    configuredModel: args.configuredModel,
    resolvedModel,
    actualResponseModel: args.actualResponseModel,
    fallbackUsed: !exact && !mock,
    ...(!exact && !mock ? { fallbackReason: args.fallbackReason ?? "provider-response-model-mismatch" } : {}),
    ...(fallbackPolicyId ? { fallbackPolicyId } : {}),
  };
  if (!exact && !mock && !approved) throw new UnapprovedModelFallbackError(record);
  return record;
}

export function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { readonly retryable?: unknown; readonly status?: unknown; readonly code?: unknown; readonly message?: unknown; readonly name?: unknown };
  if (record.retryable === true) return true;
  if (typeof record.status === "number" && [408, 409, 425, 429, 500, 502, 503, 504].includes(record.status)) return true;
  if (typeof record.code === "string" && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ECONNREFUSED", "EPIPE"].includes(record.code)) return true;
  return /connection|connect|timeout|timed out|dns|fetch failed|network error|socket hang up|temporary failure/iu.test([record.name, record.code, record.message].filter((value): value is string => typeof value === "string").join(" "));
}

export function resolveProviderRetryDecision(error: unknown, attempt: number, maximumAttempts: number): "retry" | "terminal-failure" {
  return attempt < maximumAttempts && isRetryableProviderError(error) ? "retry" : "terminal-failure";
}
