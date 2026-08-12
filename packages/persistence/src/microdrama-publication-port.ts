import type {
  CreatorContentConsentRevision,
  MicrodramaPublicationAttempt,
  MicrodramaPublicationCapabilityState,
  MicrodramaPublicationDispatchAdmission,
  MicrodramaPublicationEffectEvidence,
  MicrodramaPublicationIdempotencyRecord,
  MicrodramaPublicationIntent,
  MicrodramaPublicationTargetProfile,
  TikTokPostExportApprovalRevision,
} from "@mediaforge/domain";

export type UpsertPublicationTargetProfileInput = {
  readonly profile: MicrodramaPublicationTargetProfile;
};

export type RecordConsentRevisionInput = {
  readonly consent: CreatorContentConsentRevision;
};

export type RecordExportApprovalRevisionInput = {
  readonly exportApproval: TikTokPostExportApprovalRevision;
};

export type SavePublicationIntentInput = {
  readonly intent: MicrodramaPublicationIntent;
};

export type SavePublicationAttemptInput = {
  readonly attempt: MicrodramaPublicationAttempt;
};

export type SavePublicationEffectEvidenceInput = {
  readonly effect: MicrodramaPublicationEffectEvidence;
};

export type SavePublicationIdempotencyRecordInput = {
  readonly record: MicrodramaPublicationIdempotencyRecord;
};

export interface MicrodramaPublicationPort {
  migratePublication(): void;
  upsertTargetProfile(
    input: UpsertPublicationTargetProfileInput
  ): MicrodramaPublicationTargetProfile;
  getTargetProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationTargetProfile["provider"];
  }): MicrodramaPublicationTargetProfile | null;
  recordConsentRevision(
    input: RecordConsentRevisionInput
  ): CreatorContentConsentRevision;
  getConsentRevision(
    consentRevisionId: string
  ): CreatorContentConsentRevision | null;
  recordExportApprovalRevision(
    input: RecordExportApprovalRevisionInput
  ): TikTokPostExportApprovalRevision;
  getExportApprovalRevision(
    exportApprovalRevisionId: string
  ): TikTokPostExportApprovalRevision | null;
  saveIntent(input: SavePublicationIntentInput): MicrodramaPublicationIntent;
  getIntent(intentId: string): MicrodramaPublicationIntent | null;
  getIdempotencyRecord(
    idempotencyKey: string
  ): MicrodramaPublicationIdempotencyRecord | null;
  saveIdempotencyRecord(
    input: SavePublicationIdempotencyRecordInput
  ): MicrodramaPublicationIdempotencyRecord;
  saveAttempt(input: SavePublicationAttemptInput): MicrodramaPublicationAttempt;
  listAttemptsByIntent(intentId: string): readonly MicrodramaPublicationAttempt[];
  saveEffectEvidence(
    input: SavePublicationEffectEvidenceInput
  ): MicrodramaPublicationEffectEvidence;
  evaluateDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: MicrodramaPublicationCapabilityState;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): MicrodramaPublicationDispatchAdmission;
}

export class MicrodramaPublicationConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MicrodramaPublicationConflictError";
  }
}
