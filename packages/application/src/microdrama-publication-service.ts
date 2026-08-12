import {
  approvePublicationIntent,
  evaluatePublicationDispatchAdmission,
  evaluateRetryAdmission,
  planPublicationIntent,
  rejectPublicationBypassCommand,
  resolvePublicationCapability,
  type CreatorContentConsentRevision,
  type MicrodramaPublicationAttempt,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationDispatchAdmission,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationTargetProfile,
  type TikTokPostExportApprovalRevision,
} from "@mediaforge/domain";

export type MicrodramaPublicationServicePort = {
  upsertTargetProfile(input: {
    readonly profile: MicrodramaPublicationTargetProfile;
  }): MicrodramaPublicationTargetProfile;
  recordConsentRevision(input: {
    readonly consent: CreatorContentConsentRevision;
  }): CreatorContentConsentRevision;
  recordExportApprovalRevision(input: {
    readonly exportApproval: TikTokPostExportApprovalRevision;
  }): TikTokPostExportApprovalRevision;
  saveIntent(input: {
    readonly intent: MicrodramaPublicationIntent;
  }): MicrodramaPublicationIntent;
  getIntent(intentId: string): MicrodramaPublicationIntent | null;
  listAttemptsByIntent(intentId: string): readonly MicrodramaPublicationAttempt[];
  evaluateDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: MicrodramaPublicationCapabilityState;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): MicrodramaPublicationDispatchAdmission;
};

export type MicrodramaPublicationServiceInput = {
  readonly port: MicrodramaPublicationServicePort;
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
};

export class MicrodramaPublicationBlockedError extends Error {
  public constructor(
    public readonly admission: MicrodramaPublicationDispatchAdmission
  ) {
    super(admission.message ?? "Microdrama publication dispatch blocked.");
    this.name = "MicrodramaPublicationBlockedError";
  }
}

export class MicrodramaPublicationService {
  public constructor(private readonly input: MicrodramaPublicationServiceInput) {}

  public resolveCapability(): MicrodramaPublicationCapabilityState {
    return resolvePublicationCapability({ state: this.input.capabilityState });
  }

  public registerTargetProfile(input: {
    readonly profile: MicrodramaPublicationTargetProfile;
  }): MicrodramaPublicationTargetProfile {
    return this.input.port.upsertTargetProfile({ profile: input.profile });
  }

  public registerConsentRevision(input: {
    readonly consent: CreatorContentConsentRevision;
  }): CreatorContentConsentRevision {
    return this.input.port.recordConsentRevision({ consent: input.consent });
  }

  public registerExportApprovalRevision(input: {
    readonly exportApproval: TikTokPostExportApprovalRevision;
  }): TikTokPostExportApprovalRevision {
    return this.input.port.recordExportApprovalRevision({
      exportApproval: input.exportApproval,
    });
  }

  public createIntent(input: {
    readonly intentId: string;
    readonly targetProfile: MicrodramaPublicationTargetProfile;
    readonly binding: MicrodramaPublicationIntent["binding"];
    readonly dispatchMode: MicrodramaPublicationIntent["dispatchMode"];
    readonly scheduledAt?: string | null;
    readonly idempotencyKey: string;
    readonly createdAt: string;
  }): MicrodramaPublicationIntent {
    const intent = planPublicationIntent(input);
    return this.input.port.saveIntent({ intent });
  }

  public approveIntent(input: {
    readonly intentId: string;
    readonly exportApproval: TikTokPostExportApprovalRevision;
    readonly consent: CreatorContentConsentRevision;
    readonly now: string;
  }): MicrodramaPublicationIntent {
    const intent = this.input.port.getIntent(input.intentId);
    if (!intent) {
      throw new Error("Publication intent not found.");
    }
    const approved = approvePublicationIntent({
      intent,
      exportApproval: input.exportApproval,
      consent: input.consent,
      now: input.now,
    });
    return this.input.port.saveIntent({ intent: approved });
  }

  public evaluateDispatch(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): MicrodramaPublicationDispatchAdmission {
    return this.input.port.evaluateDispatchAdmission({
      ...input,
      capabilityState: this.resolveCapability(),
    });
  }

  public requireDispatch(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): MicrodramaPublicationDispatchAdmission {
    const admission = this.evaluateDispatch(input);
    if (!admission.allowed) {
      throw new MicrodramaPublicationBlockedError(admission);
    }
    return admission;
  }

  public rejectBypass(input: {
    readonly command: "force" | "retry" | "resume";
    readonly intentId: string;
  }): ReturnType<typeof rejectPublicationBypassCommand> {
    const intent = this.input.port.getIntent(input.intentId);
    if (!intent) {
      throw new Error("Publication intent not found.");
    }
    return rejectPublicationBypassCommand({
      command: input.command,
      intent,
    });
  }

  public evaluateRetry(input: {
    readonly intentId: string;
    readonly attemptId?: string;
  }): ReturnType<typeof evaluateRetryAdmission> {
    const intent = this.input.port.getIntent(input.intentId);
    if (!intent) {
      throw new Error("Publication intent not found.");
    }
    const attempt = input.attemptId
      ? this.input.port
          .listAttemptsByIntent(input.intentId)
          .find((candidate) => candidate.attemptId === input.attemptId)
      : undefined;
    return evaluateRetryAdmission({
      intentState: intent.state,
      attemptState: attempt?.state,
    });
  }
}

export function evaluateMicrodramaPublicationCapabilityAdmission(input: {
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
}): { readonly allowed: boolean; readonly state: MicrodramaPublicationCapabilityState } {
  const state = resolvePublicationCapability({ state: input.capabilityState });
  return { allowed: state !== "disabled", state };
}

export function evaluateMicrodramaPublicationAdmissionFromRecords(input: {
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
  readonly targetProfile?: MicrodramaPublicationTargetProfile;
  readonly intent: MicrodramaPublicationIntent;
  readonly consent?: CreatorContentConsentRevision;
  readonly exportApproval?: TikTokPostExportApprovalRevision;
  readonly operatorDispatchConfirmed?: boolean;
  readonly scheduleConsentRecorded?: boolean;
}): MicrodramaPublicationDispatchAdmission {
  return evaluatePublicationDispatchAdmission({
    ...input,
    capabilityState: resolvePublicationCapability({
      state: input.capabilityState,
    }),
  });
}
