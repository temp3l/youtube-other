import {
  applyTikTokDirectPostInitResponse,
  applyTikTokDirectPostThrottle,
  buildTikTokDirectPostInitRequest,
  commitPublicationIdempotency,
  evaluateTikTokDirectPostDispatchAdmission,
  planTikTokDirectPostPreparedEffect,
  reservePublicationIdempotency,
  type CreatorContentConsentRevision,
  type MicrodramaPublicationAttempt,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationIdempotencyRecord,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationTargetProfile,
  type TikTokAppAuditReadinessProjection,
  type TikTokCreatorPreflightResult,
  type TikTokDirectPostDispatchAdmission,
  type TikTokDirectPostEffectRecord,
  type TikTokMetadataRevision,
  type TikTokPostExportApprovalRevision,
  type TikTokTransferPlan,
} from "@mediaforge/domain";

import {
  type TikTokDirectPostAdapter,
  type TikTokDirectPostAdapterResult,
} from "./tiktok-direct-post-fake-adapter.js";

export type TikTokDirectPostPersistencePort = {
  getEffectByIdempotencyKey(
    idempotencyKey: string
  ): TikTokDirectPostEffectRecord | null;
  saveEffect(input: {
    readonly effect: TikTokDirectPostEffectRecord;
  }): TikTokDirectPostEffectRecord;
  getIdempotencyRecord(
    idempotencyKey: string
  ): MicrodramaPublicationIdempotencyRecord | null;
  saveIdempotencyRecord(input: {
    readonly record: MicrodramaPublicationIdempotencyRecord;
  }): MicrodramaPublicationIdempotencyRecord;
};

export type TikTokDirectPostDispatchContext = {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly capabilityState: MicrodramaPublicationCapabilityState;
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly intent: MicrodramaPublicationIntent;
  readonly attempt: MicrodramaPublicationAttempt;
  readonly consent: CreatorContentConsentRevision;
  readonly exportApproval: TikTokPostExportApprovalRevision;
  readonly metadata: TikTokMetadataRevision;
  readonly transferPlan: TikTokTransferPlan;
  readonly appAuditReadiness: TikTokAppAuditReadinessProjection | null;
  readonly creatorPreflight: TikTokCreatorPreflightResult;
  readonly observedAccountBinding: {
    readonly providerAccountId: string;
    readonly credentialVersion: string;
  };
  readonly operatorDispatchConfirmed?: boolean;
  readonly scheduleConsentRecorded?: boolean;
};

export type TikTokDirectPostDispatchInput = TikTokDirectPostDispatchContext & {
  readonly effectId: string;
  readonly initRequestId: string;
  readonly accountFence: string;
  readonly preparedAt: string;
  readonly dispatchedAt: string;
};

export type TikTokDirectPostDispatchResult = {
  readonly admission: TikTokDirectPostDispatchAdmission;
  readonly effect: TikTokDirectPostEffectRecord | null;
  readonly adapterResult?: TikTokDirectPostAdapterResult;
  readonly reusedExistingEffect: boolean;
};

export class TikTokDirectPostBlockedError extends Error {
  public constructor(public readonly admission: TikTokDirectPostDispatchAdmission) {
    super(admission.message ?? "TikTok Direct Post dispatch blocked.");
    this.name = "TikTokDirectPostBlockedError";
  }
}

export type TikTokDirectPostServiceInput = {
  readonly port: TikTokDirectPostPersistencePort;
  readonly adapter: TikTokDirectPostAdapter;
};

export class TikTokDirectPostService {
  public constructor(private readonly input: TikTokDirectPostServiceInput) {}

  public evaluateDispatchAdmission(
    input: TikTokDirectPostDispatchContext
  ): TikTokDirectPostDispatchAdmission {
    const existingEffect = this.input.port.getEffectByIdempotencyKey(
      input.intent.idempotencyKey
    );
    const idempotency =
      this.input.port.getIdempotencyRecord(input.intent.idempotencyKey) ?? undefined;
    return evaluateTikTokDirectPostDispatchAdmission({
      ...input,
      idempotency,
      existingEffect: existingEffect ?? undefined,
    });
  }

  public async dispatchInit(input: TikTokDirectPostDispatchInput): Promise<TikTokDirectPostDispatchResult> {
    const existingEffect = this.input.port.getEffectByIdempotencyKey(
      input.intent.idempotencyKey
    );
    const idempotencyRecord =
      this.input.port.getIdempotencyRecord(input.intent.idempotencyKey);

    if (
      existingEffect?.state === "init_dispatched" &&
      idempotencyRecord?.state === "committed"
    ) {
      return {
        admission: evaluateTikTokDirectPostDispatchAdmission({
          ...input,
          idempotency: idempotencyRecord,
          existingEffect,
        }),
        effect: existingEffect,
        reusedExistingEffect: true,
      };
    }

    const admission = evaluateTikTokDirectPostDispatchAdmission({
      ...input,
      idempotency: idempotencyRecord ?? undefined,
      existingEffect: existingEffect ?? undefined,
    });
    if (!admission.allowed) {
      throw new TikTokDirectPostBlockedError(admission);
    }

    let idempotency = idempotencyRecord;
    if (!idempotency) {
      idempotency = this.input.port.saveIdempotencyRecord({
        record: reservePublicationIdempotency({
          idempotencyKey: input.intent.idempotencyKey,
          fingerprint: input.intent.fingerprint,
          intentId: input.intent.intentId,
          reservedAt: input.preparedAt,
        }),
      });
    }

    const initRequest = buildTikTokDirectPostInitRequest({
      initRequestId: input.initRequestId,
      attempt: input.attempt,
      transferPlan: input.transferPlan,
      metadata: input.metadata,
      accountFence: input.accountFence,
      preparedAt: input.preparedAt,
    });

    let effect =
      existingEffect ??
      this.input.port.saveEffect({
        effect: planTikTokDirectPostPreparedEffect({
          effectId: input.effectId,
          initRequest,
          providerCorrelation: input.attempt.providerCorrelation,
          recordedAt: input.preparedAt,
        }),
      });

    const adapterResult = await this.input.adapter.initDirectPost({
      request: initRequest,
      dispatchedAt: input.dispatchedAt,
    });

    if (adapterResult.kind === "throttled") {
      effect = this.input.port.saveEffect({
        effect: applyTikTokDirectPostThrottle({
          effect,
          throttleEvidence: adapterResult.throttle,
        }),
      });
      return {
        admission,
        effect,
        adapterResult,
        reusedExistingEffect: false,
      };
    }

    effect = this.input.port.saveEffect({
      effect: applyTikTokDirectPostInitResponse({
        effect,
        initResponse: adapterResult.response,
        updatedAt: input.dispatchedAt,
      }),
    });

    this.input.port.saveIdempotencyRecord({
      record: commitPublicationIdempotency({
        record: idempotency,
        committedAt: input.dispatchedAt,
      }),
    });

    return {
      admission,
      effect,
      adapterResult,
      reusedExistingEffect: false,
    };
  }
}
