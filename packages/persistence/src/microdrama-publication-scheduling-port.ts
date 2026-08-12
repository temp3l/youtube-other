import type {
  MicrodramaAudienceTimezoneProfile,
  MicrodramaPublicationScheduleConsentRecord,
  MicrodramaPublicationSchedulePolicy,
  MicrodramaPublicationScheduleRecord,
  TikTokAppAuditReadinessProjection,
} from "@mediaforge/domain";

export type UpsertAudienceTimezoneProfileInput = {
  readonly profile: MicrodramaAudienceTimezoneProfile;
};

export type SavePublicationSchedulePolicyInput = {
  readonly policy: MicrodramaPublicationSchedulePolicy;
};

export type SavePublicationScheduleRecordInput = {
  readonly schedule: MicrodramaPublicationScheduleRecord;
};

export type SavePublicationScheduleConsentRecordInput = {
  readonly consent: MicrodramaPublicationScheduleConsentRecord;
};

export interface MicrodramaPublicationSchedulingPort {
  migratePublicationScheduling(): void;
  upsertAudienceTimezoneProfile(
    input: UpsertAudienceTimezoneProfileInput
  ): MicrodramaAudienceTimezoneProfile;
  getAudienceTimezoneProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
  }): MicrodramaAudienceTimezoneProfile | null;
  saveSchedulePolicy(
    input: SavePublicationSchedulePolicyInput
  ): MicrodramaPublicationSchedulePolicy;
  getSchedulePolicy(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
    readonly providerAccountId: string;
  }): MicrodramaPublicationSchedulePolicy | null;
  saveScheduleRecord(
    input: SavePublicationScheduleRecordInput
  ): MicrodramaPublicationScheduleRecord;
  getScheduleRecord(scheduleId: string): MicrodramaPublicationScheduleRecord | null;
  getPendingScheduleByIntent(
    intentId: string
  ): MicrodramaPublicationScheduleRecord | null;
  saveScheduleConsentRecord(
    input: SavePublicationScheduleConsentRecordInput
  ): MicrodramaPublicationScheduleConsentRecord;
  getScheduleConsentBySchedule(
    scheduleId: string
  ): MicrodramaPublicationScheduleConsentRecord | null;
  getAuditReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null;
}

export class MicrodramaPublicationSchedulingConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MicrodramaPublicationSchedulingConflictError";
  }
}
