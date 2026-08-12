import {
  approvePublicationIntent,
  commitPublicationIdempotency,
  evaluatePublicationDispatchAdmission,
  evaluateIdempotencyAdmission,
  planPublicationIntent,
  preparePublicationAttempt,
  recordPublicationEffectEvidence,
  reservePublicationIdempotency,
  resolvePublicationCapability,
  transitionPublicationIntentState,
  type CreatorContentConsentRevision,
  type MicrodramaPublicationAttempt,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationDispatchAdmission,
  type MicrodramaPublicationEffectEvidence,
  type MicrodramaPublicationIdempotencyRecord,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationTargetProfile,
  type TikTokPostExportApprovalRevision,
  validateCreatorContentConsentRevision,
  validateMicrodramaPublicationAttempt,
  validateMicrodramaPublicationIntent,
  validateMicrodramaPublicationTargetProfile,
  validateTikTokPostExportApprovalRevision,
} from "@mediaforge/domain";

import {
  type MicrodramaPublicationPort,
  type RecordConsentRevisionInput,
  type RecordExportApprovalRevisionInput,
  type SavePublicationAttemptInput,
  type SavePublicationEffectEvidenceInput,
  type SavePublicationIdempotencyRecordInput,
  type SavePublicationIntentInput,
  type UpsertPublicationTargetProfileInput,
  MicrodramaPublicationConflictError,
} from "./microdrama-publication-port.js";

export class FakeMicrodramaPublicationRepository implements MicrodramaPublicationPort {
  private readonly targetProfiles = new Map<string, MicrodramaPublicationTargetProfile>();
  private readonly targetProfileIndex = new Map<string, string>();
  private readonly consents = new Map<string, CreatorContentConsentRevision>();
  private readonly exportApprovals = new Map<string, TikTokPostExportApprovalRevision>();
  private readonly intents = new Map<string, MicrodramaPublicationIntent>();
  private readonly idempotencyRecords = new Map<
    string,
    MicrodramaPublicationIdempotencyRecord
  >();
  private readonly attempts = new Map<string, MicrodramaPublicationAttempt>();
  private readonly effects = new Map<string, MicrodramaPublicationEffectEvidence>();
  private migrated = false;

  public migratePublication(): void {
    this.migrated = true;
  }

  public upsertTargetProfile(
    input: UpsertPublicationTargetProfileInput
  ): MicrodramaPublicationTargetProfile {
    this.requireMigrated();
    const profile = validateMicrodramaPublicationTargetProfile(input.profile);
    this.targetProfiles.set(profile.profileId, profile);
    this.targetProfileIndex.set(
      this.targetKey(profile.seriesId, profile.locale, profile.provider),
      profile.profileId
    );
    return profile;
  }

  public getTargetProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationTargetProfile["provider"];
  }): MicrodramaPublicationTargetProfile | null {
    const profileId = this.targetProfileIndex.get(
      this.targetKey(input.seriesId, input.locale, input.provider)
    );
    return profileId ? (this.targetProfiles.get(profileId) ?? null) : null;
  }

  public recordConsentRevision(
    input: RecordConsentRevisionInput
  ): CreatorContentConsentRevision {
    this.requireMigrated();
    const consent = validateCreatorContentConsentRevision(input.consent);
    this.consents.set(consent.consentRevisionId, consent);
    return consent;
  }

  public getConsentRevision(
    consentRevisionId: string
  ): CreatorContentConsentRevision | null {
    return this.consents.get(consentRevisionId) ?? null;
  }

  public recordExportApprovalRevision(
    input: RecordExportApprovalRevisionInput
  ): TikTokPostExportApprovalRevision {
    this.requireMigrated();
    const exportApproval = validateTikTokPostExportApprovalRevision(
      input.exportApproval
    );
    this.exportApprovals.set(
      exportApproval.exportApprovalRevisionId,
      exportApproval
    );
    return exportApproval;
  }

  public getExportApprovalRevision(
    exportApprovalRevisionId: string
  ): TikTokPostExportApprovalRevision | null {
    return this.exportApprovals.get(exportApprovalRevisionId) ?? null;
  }

  public saveIntent(input: SavePublicationIntentInput): MicrodramaPublicationIntent {
    this.requireMigrated();
    const intent = validateMicrodramaPublicationIntent(input.intent);
    const existing = this.intents.get(intent.intentId);
    if (existing) {
      if (existing.fingerprint !== intent.fingerprint) {
        throw new MicrodramaPublicationConflictError(
          "Publication intent identity is immutable once created."
        );
      }
      if (JSON.stringify(existing.binding) !== JSON.stringify(intent.binding)) {
        throw new MicrodramaPublicationConflictError(
          "Publication intent binding is immutable once created."
        );
      }
    }
    this.intents.set(intent.intentId, intent);
    return intent;
  }

  public getIntent(intentId: string): MicrodramaPublicationIntent | null {
    return this.intents.get(intentId) ?? null;
  }

  public getIdempotencyRecord(
    idempotencyKey: string
  ): MicrodramaPublicationIdempotencyRecord | null {
    return this.idempotencyRecords.get(idempotencyKey) ?? null;
  }

  public saveIdempotencyRecord(
    input: SavePublicationIdempotencyRecordInput
  ): MicrodramaPublicationIdempotencyRecord {
    this.requireMigrated();
    const existing = this.idempotencyRecords.get(input.record.idempotencyKey);
    if (
      existing &&
      existing.fingerprint !== input.record.fingerprint &&
      existing.intentId !== input.record.intentId
    ) {
      throw new MicrodramaPublicationConflictError("Idempotency key conflict.");
    }
    this.idempotencyRecords.set(input.record.idempotencyKey, input.record);
    return input.record;
  }

  public saveAttempt(input: SavePublicationAttemptInput): MicrodramaPublicationAttempt {
    this.requireMigrated();
    const attempt = validateMicrodramaPublicationAttempt(input.attempt);
    const existing = this.attempts.get(attempt.attemptId);
    if (existing) {
      if (
        existing.attemptFence !== attempt.attemptFence ||
        existing.binding !== attempt.binding
      ) {
        throw new MicrodramaPublicationConflictError(
          "Publication attempt binding is immutable."
        );
      }
    }
    this.attempts.set(attempt.attemptId, attempt);
    return attempt;
  }

  public listAttemptsByIntent(intentId: string): readonly MicrodramaPublicationAttempt[] {
    return [...this.attempts.values()].filter(
      (attempt) => attempt.intentId === intentId
    );
  }

  public saveEffectEvidence(
    input: SavePublicationEffectEvidenceInput
  ): MicrodramaPublicationEffectEvidence {
    this.requireMigrated();
    this.effects.set(input.effect.effectId, input.effect);
    return input.effect;
  }

  public evaluateDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: MicrodramaPublicationCapabilityState;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): MicrodramaPublicationDispatchAdmission {
    const intent = this.getIntent(input.intentId);
    if (!intent) {
      return evaluatePublicationDispatchAdmission({
        correlationId: input.correlationId,
        evaluatedAt: input.evaluatedAt,
        capabilityState: resolvePublicationCapability({
          state: input.capabilityState,
        }),
        intent: planPublicationIntent({
          intentId: input.intentId,
          targetProfile: {
            schemaVersion: "mediaforge.microdrama-publication.v1",
            profileId: "missing.profile",
            seriesId: "series.missing",
            locale: "en-us",
            provider: "tiktok",
            providerAccountId: "account.missing",
            credentialVersion: "cred.v0",
            metadataProfileId: "meta.missing",
            scheduleProfileId: "schedule.missing",
            enabled: false,
            registeredAt: input.evaluatedAt,
          },
          binding: {
            provider: "tiktok",
            providerAccountId: "account.missing",
            credentialVersion: "cred.v0",
            episodeId: "episode.missing",
            episodeRevisionId: "rev.missing",
            locale: "en-us",
            renderHash: "0".repeat(64),
            metadataRevisionId: "meta.rev.missing",
            consentRevisionId: "consent.missing",
            exportApprovalRevisionId: "export.missing",
            privacy: "private",
            interactionSettings: {
              allowComments: false,
              allowDuet: false,
              allowStitch: false,
            },
            aiContentDeclared: true,
            commercialContentDeclared: false,
          },
          dispatchMode: "manual",
          idempotencyKey: "missing",
          createdAt: input.evaluatedAt,
        }),
      });
    }
    const targetProfile = this.targetProfiles.get(intent.targetProfileId) ?? undefined;
    const consent = this.getConsentRevision(intent.binding.consentRevisionId) ?? undefined;
    const exportApproval =
      this.getExportApprovalRevision(intent.binding.exportApprovalRevisionId) ??
      undefined;
    const idempotency = this.getIdempotencyRecord(intent.idempotencyKey) ?? undefined;
    return evaluatePublicationDispatchAdmission({
      correlationId: input.correlationId,
      evaluatedAt: input.evaluatedAt,
      capabilityState: resolvePublicationCapability({
        state: input.capabilityState,
      }),
      targetProfile,
      intent,
      consent,
      exportApproval,
      idempotency,
      operatorDispatchConfirmed: input.operatorDispatchConfirmed,
      scheduleConsentRecorded: input.scheduleConsentRecorded,
    });
  }

  public planAndApproveIntent(input: {
    readonly intentId: string;
    readonly targetProfile: MicrodramaPublicationTargetProfile;
    readonly binding: MicrodramaPublicationIntent["binding"];
    readonly dispatchMode: MicrodramaPublicationIntent["dispatchMode"];
    readonly idempotencyKey: string;
    readonly exportApproval: TikTokPostExportApprovalRevision;
    readonly consent: CreatorContentConsentRevision;
    readonly createdAt: string;
  }): MicrodramaPublicationIntent {
    const draft = planPublicationIntent({
      intentId: input.intentId,
      targetProfile: input.targetProfile,
      binding: input.binding,
      dispatchMode: input.dispatchMode,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.createdAt,
    });
    this.saveIntent({ intent: draft });
    const approved = approvePublicationIntent({
      intent: draft,
      exportApproval: input.exportApproval,
      consent: input.consent,
      now: input.createdAt,
    });
    this.saveIntent({ intent: approved });
    const idempotencyAdmission = evaluateIdempotencyAdmission({
      idempotencyKey: approved.idempotencyKey,
      fingerprint: approved.fingerprint,
      existing: this.getIdempotencyRecord(approved.idempotencyKey) ?? undefined,
    });
    if (!idempotencyAdmission.allowed) {
      throw new MicrodramaPublicationConflictError("Idempotency reservation rejected.");
    }
    this.saveIdempotencyRecord({
      record: reservePublicationIdempotency({
        idempotencyKey: approved.idempotencyKey,
        fingerprint: approved.fingerprint,
        intentId: approved.intentId,
        reservedAt: input.createdAt,
      }),
    });
    return approved;
  }

  public prepareApprovedAttempt(input: {
    readonly attemptId: string;
    readonly intentId: string;
    readonly attemptFence: number;
    readonly now: string;
    readonly providerRequestId?: string;
    readonly providerCorrelationId?: string;
  }): {
    readonly intent: MicrodramaPublicationIntent;
    readonly attempt: MicrodramaPublicationAttempt;
  } {
    const intent = this.getIntent(input.intentId);
    if (!intent) {
      throw new Error("Intent not found.");
    }
    const preparedIntent = transitionPublicationIntentState({
      intent,
      nextState: "prepared",
      now: input.now,
    });
    this.saveIntent({ intent: preparedIntent });
    const attempt = preparePublicationAttempt({
      attemptId: input.attemptId,
      intent: preparedIntent,
      attemptFence: input.attemptFence,
      providerCorrelation: {
        ...(input.providerRequestId !== undefined
          ? { requestId: input.providerRequestId }
          : {}),
        ...(input.providerCorrelationId !== undefined
          ? { correlationId: input.providerCorrelationId }
          : {}),
      },
      createdAt: input.now,
    });
    this.saveAttempt({ attempt });
    return { intent: preparedIntent, attempt };
  }

  public commitAttemptIdempotency(input: {
    readonly idempotencyKey: string;
    readonly committedAt: string;
  }): MicrodramaPublicationIdempotencyRecord {
    const record = this.getIdempotencyRecord(input.idempotencyKey);
    if (!record) {
      throw new Error("Idempotency record not found.");
    }
    const committed = commitPublicationIdempotency({
      record,
      committedAt: input.committedAt,
    });
    this.saveIdempotencyRecord({ record: committed });
    return committed;
  }

  public recordAttemptEffect(input: {
    readonly effectId: string;
    readonly attempt: MicrodramaPublicationAttempt;
    readonly outcomeState: MicrodramaPublicationEffectEvidence["outcomeState"];
    readonly providerResponseId?: string;
    readonly recordedAt: string;
  }): MicrodramaPublicationEffectEvidence {
    return this.saveEffectEvidence({
      effect: recordPublicationEffectEvidence({
        effectId: input.effectId,
        attempt: input.attempt,
        outcomeState: input.outcomeState,
        providerCorrelation: {
          ...input.attempt.providerCorrelation,
          ...(input.providerResponseId !== undefined
            ? { responseId: input.providerResponseId }
            : {}),
        },
        recordedAt: input.recordedAt,
      }),
    });
  }

  private requireMigrated(): void {
    if (!this.migrated) {
      throw new Error("Publication repository migration has not run.");
    }
  }

  private targetKey(
    seriesId: string,
    locale: string,
    provider: MicrodramaPublicationTargetProfile["provider"]
  ): string {
    return `${seriesId}:${locale.toLowerCase()}:${provider}`;
  }
}
