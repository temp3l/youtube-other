import {
  buildStatusRateLimitEvidence,
  reconcileTikTokAmbiguousEffect,
  validateTikTokStatusQueryRequest,
  validateTikTokStatusQueryResponse,
  type TikTokDirectPostEffectReference,
  type TikTokStatusQueryRequest,
  type TikTokStatusQueryResponse,
  type TikTokStatusReconciliationDecision,
  type TikTokStatusReconciliationEvidence,
} from "@mediaforge/domain";

export type TikTokPublishStatusQueryAdapter = {
  queryPublishStatus(
    request: TikTokStatusQueryRequest
  ): Promise<TikTokStatusQueryResponse>;
};

export type TikTokPublishStatusQueryScenario =
  | {
      readonly kind: "status";
      readonly providerStatus: TikTokStatusQueryResponse["providerStatus"];
      readonly publicVideoId?: string;
      readonly failReason?: string;
      readonly providerCorrelation?: TikTokStatusQueryResponse["providerCorrelation"];
    }
  | {
      readonly kind: "rate_limited";
      readonly retryAfter: string;
    };

export class FixtureTikTokPublishStatusAdapter
  implements TikTokPublishStatusQueryAdapter
{
  public readonly queries: TikTokStatusQueryRequest[] = [];

  public constructor(
    private readonly scenarios: ReadonlyMap<
      string,
      readonly TikTokPublishStatusQueryScenario[]
    >
  ) {}

  public async queryPublishStatus(
    request: TikTokStatusQueryRequest
  ): Promise<TikTokStatusQueryResponse> {
    const parsed = validateTikTokStatusQueryRequest(request);
    this.queries.push(parsed);
    const sequence = this.scenarios.get(parsed.publishId) ?? [];
    const index = this.queries.filter(
      (query) => query.publishId === parsed.publishId
    ).length - 1;
    const scenario = sequence[index] ?? sequence[sequence.length - 1];
    if (!scenario) {
      return validateTikTokStatusQueryResponse({
        schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
        publishId: parsed.publishId,
        providerStatus: "NOT_FOUND",
        providerCorrelation: {},
        queriedAt: parsed.queriedAt,
      });
    }
    if (scenario.kind === "rate_limited") {
      return validateTikTokStatusQueryResponse({
        schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
        publishId: parsed.publishId,
        providerStatus: "PROCESSING_UPLOAD",
        providerCorrelation: {},
        rateLimit: buildStatusRateLimitEvidence({
          retryAfter: scenario.retryAfter,
          queriedAt: parsed.queriedAt,
        }),
        queriedAt: parsed.queriedAt,
      });
    }
    return validateTikTokStatusQueryResponse({
      schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
      publishId: parsed.publishId,
      providerStatus: scenario.providerStatus,
      providerCorrelation: scenario.providerCorrelation ?? {},
      publicVideoId: scenario.publicVideoId,
      failReason: scenario.failReason,
      queriedAt: parsed.queriedAt,
    });
  }
}

export type TikTokStatusReconciliationServiceInput = {
  readonly adapter: TikTokPublishStatusQueryAdapter;
  readonly maxPollAttempts?: number;
  readonly pollIntervalSeconds?: number;
};

export class TikTokStatusReconciliationService {
  private readonly maxPollAttempts;
  private readonly pollIntervalSeconds;

  public constructor(private readonly input: TikTokStatusReconciliationServiceInput) {
    this.maxPollAttempts = input.maxPollAttempts ?? 5;
    this.pollIntervalSeconds = input.pollIntervalSeconds ?? 30;
  }

  public buildStatusQueryRequest(input: {
    readonly effect: TikTokDirectPostEffectReference;
    readonly queriedAt: string;
  }): TikTokStatusQueryRequest {
    return validateTikTokStatusQueryRequest({
      schemaVersion: "mediaforge.tiktok-status-reconciliation.v1",
      publishId: input.effect.publishId,
      providerAccountId: input.effect.binding.providerAccountId,
      credentialVersion: input.effect.binding.credentialVersion,
      recoveryIdentity: input.effect.recoveryIdentity,
      queriedAt: input.queriedAt,
    });
  }

  public async queryStatus(input: {
    readonly effect: TikTokDirectPostEffectReference;
    readonly queriedAt: string;
  }): Promise<TikTokStatusQueryResponse> {
    const request = this.buildStatusQueryRequest(input);
    return this.input.adapter.queryPublishStatus(request);
  }

  public async reconcileUncertainEffect(input: {
    readonly effect: TikTokDirectPostEffectReference;
    readonly pollAttempt: number;
    readonly reconciledAt: string;
  }): Promise<TikTokStatusReconciliationDecision> {
    const response = await this.queryStatus({
      effect: input.effect,
      queriedAt: input.reconciledAt,
    });
    return reconcileTikTokAmbiguousEffect({
      effect: input.effect,
      response,
      pollAttempt: input.pollAttempt,
      maxPollAttempts: this.maxPollAttempts,
      reconciledAt: input.reconciledAt,
      pollIntervalSeconds: this.pollIntervalSeconds,
    });
  }
}

export type TikTokStatusReconciliationAuditSink = {
  append(input: {
    readonly action: "tiktok.status.reconciled";
    readonly effectId: string;
    readonly recoveryIdentity: string;
    readonly evidence: TikTokStatusReconciliationEvidence;
  }): Promise<void>;
};

export async function auditTikTokStatusReconciliation(input: {
  readonly decision: TikTokStatusReconciliationDecision;
  readonly audit?: TikTokStatusReconciliationAuditSink;
}): Promise<void> {
  if (!input.audit) {
    return;
  }
  await input.audit.append({
    action: "tiktok.status.reconciled",
    effectId: input.decision.evidence.effectReference.effectId,
    recoveryIdentity: input.decision.evidence.effectReference.recoveryIdentity,
    evidence: input.decision.evidence,
  });
}
