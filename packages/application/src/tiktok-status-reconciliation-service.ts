import {
  mergeReconciliationEvidence,
  type TikTokDirectPostEffectReference,
  type TikTokPublicationReceipt,
  type TikTokStatusReconciliationEvidence,
} from "@mediaforge/domain";
import {
  TikTokStatusReconciliationService,
  type TikTokPublishStatusQueryAdapter,
} from "@mediaforge/tiktok-publishing";

export type TikTokStatusReconciliationApplicationPort = {
  getUncertainEffect(
    effectId: string
  ): TikTokDirectPostEffectReference | null;
  saveReconciliationEvidence(input: {
    readonly evidence: TikTokStatusReconciliationEvidence;
  }): TikTokStatusReconciliationEvidence;
  savePublicationReceipt(input: {
    readonly receipt: TikTokPublicationReceipt;
  }): TikTokPublicationReceipt;
};

export type TikTokStatusReconciliationApplicationServiceInput = {
  readonly port: TikTokStatusReconciliationApplicationPort;
  readonly adapter: TikTokPublishStatusQueryAdapter;
  readonly maxPollAttempts?: number;
  readonly pollIntervalSeconds?: number;
};

export class TikTokStatusReconciliationApplicationService {
  private readonly reconciliationService: TikTokStatusReconciliationService;

  public constructor(
    private readonly input: TikTokStatusReconciliationApplicationServiceInput
  ) {
    this.reconciliationService = new TikTokStatusReconciliationService({
      adapter: input.adapter,
      maxPollAttempts: input.maxPollAttempts,
      pollIntervalSeconds: input.pollIntervalSeconds,
    });
  }

  public async reconcileUncertainEffect(input: {
    readonly effectId: string;
    readonly pollAttempt: number;
    readonly reconciledAt: string;
    readonly previousEvidence?: TikTokStatusReconciliationEvidence | null;
  }): Promise<{
    readonly decision: Awaited<
      ReturnType<TikTokStatusReconciliationService["reconcileUncertainEffect"]>
    >;
    readonly evidence: TikTokStatusReconciliationEvidence;
    readonly receipt: TikTokPublicationReceipt | null;
    readonly nextIntentState: "outcome_uncertain" | "reconciled" | "failed_known";
  }> {
    const effect = this.input.port.getUncertainEffect(input.effectId);
    if (!effect) {
      throw new Error("TikTok uncertain effect not found.");
    }

    const decision = await this.reconciliationService.reconcileUncertainEffect({
      effect,
      pollAttempt: input.pollAttempt,
      reconciledAt: input.reconciledAt,
    });
    const evidence = mergeReconciliationEvidence(
      input.previousEvidence ?? null,
      decision.evidence
    );
    const savedEvidence = this.input.port.saveReconciliationEvidence({ evidence });

    let receipt: TikTokPublicationReceipt | null = null;
    let nextIntentState: "outcome_uncertain" | "reconciled" | "failed_known" =
      "outcome_uncertain";

    if (decision.kind === "published") {
      receipt = this.input.port.savePublicationReceipt({
        receipt: decision.receipt,
      });
      nextIntentState = "reconciled";
    } else if (decision.kind === "failed_known") {
      nextIntentState = "failed_known";
    }

    return {
      decision,
      evidence: savedEvidence,
      receipt,
      nextIntentState,
    };
  }
}
