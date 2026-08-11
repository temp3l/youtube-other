export type SourceGroundedQaExecutionProfile =
  | "INTERACTIVE"
  | "COST_OPTIMIZED"
  | "BULK";

export type SourceGroundedQaTransport = "SYNCHRONOUS_API" | "BATCH";

export type SourceGroundedQaProviderMode =
  | "CACHE_ONLY"
  | "FIXTURE"
  | "LIVE_AUTHORIZED";

export interface SourceGroundedQaTokenPricing {
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}

export interface SourceGroundedQaBudgetPolicy {
  readonly authorizationId: string;
  readonly maxProviderCalls: number;
  readonly maxEstimatedCostUsd: number;
  readonly maxFlagshipCallsPerPack: number;
  readonly maxEstimatedInputTokens?: number;
  readonly maxEstimatedOutputTokens?: number;
}

export interface SourceGroundedQaExecutionPolicy {
  readonly profile: SourceGroundedQaExecutionProfile;
  readonly transport: SourceGroundedQaTransport;
  readonly providerMode: SourceGroundedQaProviderMode;
  readonly serviceTier?: "flex";
  readonly minConcurrency: number;
  readonly targetConcurrency: number;
  readonly maxConcurrency: number;
  readonly maxInFlightPerPack: number;
  readonly maxInFlightEstimatedTokens: number;
  readonly adaptiveConcurrency: boolean;
  readonly maxRetries: number;
  readonly baseRetryDelayMs: number;
  readonly promptPrefixCaching: boolean;
  readonly shortSceneBatchSize: number;
  readonly longFormSceneBatchSize: number;
  readonly remediationBatchSize: number;
  readonly transientFailureCacheTtlMs: number;
  readonly deterministicFailureCacheTtlMs: number;
  readonly budget?: SourceGroundedQaBudgetPolicy;
  readonly modelPricing?: Readonly<Record<string, SourceGroundedQaTokenPricing>>;
  readonly flagshipModels?: readonly string[];
}

export function sourceGroundedQaExecutionPolicy(
  profile: SourceGroundedQaExecutionProfile = "INTERACTIVE",
  overrides: Partial<SourceGroundedQaExecutionPolicy> = {}
): SourceGroundedQaExecutionPolicy {
  const common = {
    providerMode: "CACHE_ONLY" as const,
    minConcurrency: 4,
    targetConcurrency: 8,
    maxConcurrency: 16,
    maxInFlightPerPack: 4,
    maxInFlightEstimatedTokens: 120_000,
    adaptiveConcurrency: true,
    maxRetries: 2,
    baseRetryDelayMs: 250,
    promptPrefixCaching: true,
    shortSceneBatchSize: 7,
    longFormSceneBatchSize: 5,
    remediationBatchSize: 5,
    transientFailureCacheTtlMs: 60_000,
    deterministicFailureCacheTtlMs: 24 * 60 * 60 * 1_000,
  } as const;
  if (profile === "COST_OPTIMIZED") {
    return {
      ...common,
      profile,
      transport: "SYNCHRONOUS_API",
      serviceTier: "flex",
      ...overrides,
    };
  }
  if (profile === "BULK") {
    return { ...common, profile, transport: "BATCH", ...overrides };
  }
  return {
    ...common,
    profile,
    transport: "SYNCHRONOUS_API",
    ...overrides,
  };
}

export class SourceGroundedQaBudgetError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PAID_QA_NOT_AUTHORIZED"
      | "PROVIDER_CALL_BUDGET_EXCEEDED"
      | "ESTIMATED_COST_BUDGET_EXCEEDED"
      | "FLAGSHIP_CALL_BUDGET_EXCEEDED"
      | "INPUT_TOKEN_BUDGET_EXCEEDED"
      | "OUTPUT_TOKEN_BUDGET_EXCEEDED"
      | "MODEL_PRICING_UNAVAILABLE"
  ) {
    super(message);
    this.name = "SourceGroundedQaBudgetError";
  }
}

export interface OpenAiRateLimitSnapshot {
  readonly requestsRemaining?: number;
  readonly tokensRemaining?: number;
  readonly requestResetAt?: Date;
  readonly tokenResetAt?: Date;
  readonly retryAfterMs?: number;
}

export class SourceGroundedQaTransportError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly rateLimit?: OpenAiRateLimitSnapshot
  ) {
    super(message);
    this.name = "SourceGroundedQaTransportError";
  }
}

export interface SourceGroundedQaWorkTelemetry {
  readonly queueWaitMs: number;
  readonly apiLatencyMs: number;
  readonly attemptCount: number;
  readonly retryCount: number;
  readonly rateLimitEvents: number;
  readonly throttleEvents: number;
  readonly effectiveConcurrency: number;
  readonly maxObservedConcurrency: number;
}

export interface SourceGroundedQaSchedulerSnapshot {
  readonly configuredConcurrency: number;
  readonly effectiveConcurrency: number;
  readonly maxObservedConcurrency: number;
  readonly inFlight: number;
  readonly pending: number;
  readonly inFlightEstimatedTokens: number;
  readonly throttleEvents: number;
  readonly rateLimitEvents: number;
  readonly retryCount: number;
  readonly providerCallsReserved: number;
  readonly estimatedCostUsd: number;
  readonly estimatedInputTokensReserved: number;
  readonly estimatedOutputTokensReserved: number;
  readonly budgetStatus: "CACHE_ONLY" | "WITHIN_BUDGET" | "EXHAUSTED";
}

export interface SourceGroundedQaProviderReservation {
  readonly model: string;
  readonly flagship: boolean;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedCostUsd: number | null;
}

interface QueueEntry<T> {
  readonly packId: string;
  readonly priority: number;
  readonly estimatedTokens: number;
  readonly enqueuedAt: number;
  readonly signal?: AbortSignal;
  readonly task: (signal?: AbortSignal) => Promise<T>;
  readonly provider?: SourceGroundedQaProviderReservation;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly resolve: (value: {
    readonly value: T;
    readonly telemetry: SourceGroundedQaWorkTelemetry;
  }) => void;
  readonly reject: (reason: unknown) => void;
}

function retryable(error: unknown): {
  readonly retryable: boolean;
  readonly rateLimit?: OpenAiRateLimitSnapshot;
} {
  if (error instanceof SourceGroundedQaTransportError) {
    return {
      retryable: error.retryable,
      ...(error.rateLimit ? { rateLimit: error.rateLimit } : {}),
    };
  }
  const status = (error as { readonly status?: unknown })?.status;
  return {
    retryable:
      status === 408 ||
      status === 409 ||
      status === 429 ||
      (typeof status === "number" && status >= 500 && status <= 599),
    ...(status === 429 ? { rateLimit: {} } : {}),
  };
}

function abortError(): Error {
  const error = new Error("Source-grounded QA work was cancelled.");
  error.name = "AbortError";
  return error;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true }
    );
  });
}

/**
 * Process-wide bounded provider queue. Queue ordering and operational policy
 * never participate in semantic cache identity.
 */
export class SourceGroundedQaScheduler {
  readonly #pending: QueueEntry<unknown>[] = [];
  readonly #packInFlight = new Map<string, number>();
  readonly #lastServed = new Map<string, number>();
  #running = 0;
  #inFlightEstimatedTokens = 0;
  #effectiveConcurrency: number;
  #maxObservedConcurrency = 0;
  #serveSequence = 0;
  #healthyCompletions = 0;
  #throttleEvents = 0;
  #rateLimitEvents = 0;
  #retryCount = 0;
  readonly #budgetLedgers = new Map<
    string,
    {
      providerCallsReserved: number;
      estimatedCostUsd: number;
      estimatedInputTokensReserved: number;
      estimatedOutputTokensReserved: number;
      flagshipCallsByPack: Map<string, number>;
      exhausted: boolean;
    }
  >();
  #latestAuthorizationId: string | undefined;
  #latestProviderMode: SourceGroundedQaProviderMode = "CACHE_ONLY";

  constructor(readonly policy: SourceGroundedQaExecutionPolicy) {
    if (
      policy.minConcurrency < 1 ||
      policy.targetConcurrency < policy.minConcurrency ||
      policy.maxConcurrency < policy.targetConcurrency ||
      policy.maxInFlightPerPack < 1
    ) {
      throw new Error("Invalid source-grounded QA concurrency policy.");
    }
    this.#effectiveConcurrency = policy.targetConcurrency;
  }

  snapshot(): SourceGroundedQaSchedulerSnapshot {
    const ledger = this.#latestAuthorizationId
      ? this.#budgetLedgers.get(this.#latestAuthorizationId)
      : undefined;
    return {
      configuredConcurrency: this.policy.targetConcurrency,
      effectiveConcurrency: this.#effectiveConcurrency,
      maxObservedConcurrency: this.#maxObservedConcurrency,
      inFlight: this.#running,
      pending: this.#pending.length,
      inFlightEstimatedTokens: this.#inFlightEstimatedTokens,
      throttleEvents: this.#throttleEvents,
      rateLimitEvents: this.#rateLimitEvents,
      retryCount: this.#retryCount,
      providerCallsReserved: ledger?.providerCallsReserved ?? 0,
      estimatedCostUsd: ledger?.estimatedCostUsd ?? 0,
      estimatedInputTokensReserved:
        ledger?.estimatedInputTokensReserved ?? 0,
      estimatedOutputTokensReserved:
        ledger?.estimatedOutputTokensReserved ?? 0,
      budgetStatus:
        this.#latestProviderMode === "CACHE_ONLY"
          ? "CACHE_ONLY"
          : ledger?.exhausted
            ? "EXHAUSTED"
            : "WITHIN_BUDGET",
    };
  }

  run<T>(input: {
    readonly packId: string;
    readonly priority: number;
    readonly estimatedTokens: number;
    readonly signal?: AbortSignal;
    readonly task: (signal?: AbortSignal) => Promise<T>;
    readonly provider?: SourceGroundedQaProviderReservation;
    readonly execution?: SourceGroundedQaExecutionPolicy;
  }): Promise<{
    readonly value: T;
    readonly telemetry: SourceGroundedQaWorkTelemetry;
  }> {
    if (input.signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      this.#pending.push({
        ...input,
        execution: input.execution ?? this.policy,
        estimatedTokens: Math.max(1, Math.round(input.estimatedTokens)),
        enqueuedAt: Date.now(),
        resolve,
        reject,
      } as QueueEntry<unknown>);
      this.#drain();
    });
  }

  #reserveProviderAttempt(entry: QueueEntry<unknown>): void {
    if (!entry.provider) return;
    this.#latestProviderMode = entry.execution.providerMode;
    if (entry.execution.providerMode === "FIXTURE") return;
    if (entry.execution.providerMode !== "LIVE_AUTHORIZED") {
      throw new SourceGroundedQaBudgetError(
        "Live source-grounded QA requires explicit paid-provider authorization.",
        "PAID_QA_NOT_AUTHORIZED"
      );
    }
    const budget = entry.execution.budget;
    if (!budget) {
      throw new SourceGroundedQaBudgetError(
        "Live source-grounded QA authorization is missing a hard budget.",
        "PAID_QA_NOT_AUTHORIZED"
      );
    }
    if (entry.provider.estimatedCostUsd === null) {
      throw new SourceGroundedQaBudgetError(
        `No configured pricing is available for ${entry.provider.model}; cost-bounded QA fails closed.`,
        "MODEL_PRICING_UNAVAILABLE"
      );
    }
    this.#latestAuthorizationId = budget.authorizationId;
    const ledger = this.#budgetLedgers.get(budget.authorizationId) ?? {
      providerCallsReserved: 0,
      estimatedCostUsd: 0,
      estimatedInputTokensReserved: 0,
      estimatedOutputTokensReserved: 0,
      flagshipCallsByPack: new Map<string, number>(),
      exhausted: false,
    };
    const fail = (
      message: string,
      code: SourceGroundedQaBudgetError["code"]
    ): never => {
      ledger.exhausted = true;
      this.#budgetLedgers.set(budget.authorizationId, ledger);
      throw new SourceGroundedQaBudgetError(message, code);
    };
    if (ledger.providerCallsReserved + 1 > budget.maxProviderCalls) {
      fail(
        `Provider request ${ledger.providerCallsReserved + 1} exceeds the authorized maximum of ${budget.maxProviderCalls}.`,
        "PROVIDER_CALL_BUDGET_EXCEEDED"
      );
    }
    if (
      ledger.estimatedCostUsd + entry.provider.estimatedCostUsd >
      budget.maxEstimatedCostUsd
    ) {
      fail(
        `Estimated provider spend would exceed the authorized USD ${budget.maxEstimatedCostUsd.toFixed(6)} ceiling.`,
        "ESTIMATED_COST_BUDGET_EXCEEDED"
      );
    }
    const flagshipForPack = ledger.flagshipCallsByPack.get(entry.packId) ?? 0;
    if (
      entry.provider.flagship &&
      flagshipForPack + 1 > budget.maxFlagshipCallsPerPack
    ) {
      fail(
        `Flagship request ${flagshipForPack + 1} for ${entry.packId} exceeds the authorized maximum of ${budget.maxFlagshipCallsPerPack}.`,
        "FLAGSHIP_CALL_BUDGET_EXCEEDED"
      );
    }
    if (
      budget.maxEstimatedInputTokens !== undefined &&
      ledger.estimatedInputTokensReserved +
        entry.provider.estimatedInputTokens >
        budget.maxEstimatedInputTokens
    ) {
      fail(
        "Estimated input-token ceiling would be exceeded.",
        "INPUT_TOKEN_BUDGET_EXCEEDED"
      );
    }
    if (
      budget.maxEstimatedOutputTokens !== undefined &&
      ledger.estimatedOutputTokensReserved +
        entry.provider.estimatedOutputTokens >
        budget.maxEstimatedOutputTokens
    ) {
      fail(
        "Estimated output-token ceiling would be exceeded.",
        "OUTPUT_TOKEN_BUDGET_EXCEEDED"
      );
    }
    ledger.providerCallsReserved += 1;
    ledger.estimatedCostUsd += entry.provider.estimatedCostUsd;
    ledger.estimatedInputTokensReserved +=
      entry.provider.estimatedInputTokens;
    ledger.estimatedOutputTokensReserved +=
      entry.provider.estimatedOutputTokens;
    if (entry.provider.flagship) {
      ledger.flagshipCallsByPack.set(entry.packId, flagshipForPack + 1);
    }
    this.#budgetLedgers.set(budget.authorizationId, ledger);
  }

  #next(): QueueEntry<unknown> | undefined {
    const eligible = this.#pending.filter((entry) => {
      if (entry.signal?.aborted) return true;
      if (
        (this.#packInFlight.get(entry.packId) ?? 0) >=
        this.policy.maxInFlightPerPack
      )
        return false;
      return (
        this.#running === 0 ||
        this.#inFlightEstimatedTokens + entry.estimatedTokens <=
          this.policy.maxInFlightEstimatedTokens
      );
    });
    if (eligible.length === 0) return undefined;
    eligible.sort(
      (left, right) =>
        left.priority - right.priority ||
        (this.#lastServed.get(left.packId) ?? -1) -
          (this.#lastServed.get(right.packId) ?? -1) ||
        left.enqueuedAt - right.enqueuedAt
    );
    const selected = eligible[0]!;
    this.#pending.splice(this.#pending.indexOf(selected), 1);
    return selected;
  }

  #drain(): void {
    while (this.#running < this.#effectiveConcurrency) {
      const entry = this.#next();
      if (!entry) return;
      if (entry.signal?.aborted) {
        entry.reject(abortError());
        continue;
      }
      this.#start(entry);
    }
  }

  #start(entry: QueueEntry<unknown>): void {
    this.#running += 1;
    this.#inFlightEstimatedTokens += entry.estimatedTokens;
    this.#packInFlight.set(
      entry.packId,
      (this.#packInFlight.get(entry.packId) ?? 0) + 1
    );
    this.#lastServed.set(entry.packId, this.#serveSequence++);
    this.#maxObservedConcurrency = Math.max(
      this.#maxObservedConcurrency,
      this.#running
    );
    const queueWaitMs = Date.now() - entry.enqueuedAt;
    void this.#execute(entry, queueWaitMs).finally(() => {
      this.#running -= 1;
      this.#inFlightEstimatedTokens -= entry.estimatedTokens;
      const packRunning = (this.#packInFlight.get(entry.packId) ?? 1) - 1;
      if (packRunning === 0) this.#packInFlight.delete(entry.packId);
      else this.#packInFlight.set(entry.packId, packRunning);
      this.#drain();
    });
  }

  async #execute(
    entry: QueueEntry<unknown>,
    queueWaitMs: number
  ): Promise<void> {
    const startedAt = Date.now();
    let attemptCount = 0;
    let retryCount = 0;
    let rateLimitEvents = 0;
    let throttleEvents = 0;
    try {
      while (true) {
        attemptCount += 1;
        try {
          this.#reserveProviderAttempt(entry);
          const value = await entry.task(entry.signal);
          this.#healthyCompletions += 1;
          if (
            this.policy.adaptiveConcurrency &&
            this.#effectiveConcurrency < this.policy.targetConcurrency &&
            this.#healthyCompletions >= this.#effectiveConcurrency * 2
          ) {
            this.#effectiveConcurrency += 1;
            this.#healthyCompletions = 0;
          }
          entry.resolve({
            value,
            telemetry: {
              queueWaitMs,
              apiLatencyMs: Date.now() - startedAt,
              attemptCount,
              retryCount,
              rateLimitEvents,
              throttleEvents,
              effectiveConcurrency: this.#effectiveConcurrency,
              maxObservedConcurrency: this.#maxObservedConcurrency,
            },
          });
          return;
        } catch (error) {
          const classification = retryable(error);
          if (
            !classification.retryable ||
            attemptCount > this.policy.maxRetries ||
            entry.signal?.aborted
          ) {
            throw error;
          }
          retryCount += 1;
          this.#retryCount += 1;
          if (classification.rateLimit) {
            rateLimitEvents += 1;
            this.#rateLimitEvents += 1;
            if (
              this.policy.adaptiveConcurrency &&
              this.#effectiveConcurrency > this.policy.minConcurrency
            ) {
              this.#effectiveConcurrency = Math.max(
                this.policy.minConcurrency,
                Math.floor(this.#effectiveConcurrency / 2)
              );
              throttleEvents += 1;
              this.#throttleEvents += 1;
            }
          }
          this.#healthyCompletions = 0;
          const exponential =
            this.policy.baseRetryDelayMs * 2 ** Math.max(0, retryCount - 1);
          const deterministicJitter =
            (entry.packId.length * 31 + retryCount * 17) %
            Math.max(1, this.policy.baseRetryDelayMs);
          await delay(
            Math.max(
              classification.rateLimit?.retryAfterMs ?? 0,
              exponential + deterministicJitter
            ),
            entry.signal
          );
        }
      }
    } catch (error) {
      entry.reject(error);
    }
  }
}

export const globalSourceGroundedQaScheduler = new SourceGroundedQaScheduler(
  sourceGroundedQaExecutionPolicy("INTERACTIVE")
);
