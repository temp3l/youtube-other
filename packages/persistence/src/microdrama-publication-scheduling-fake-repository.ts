import {
  cancelPublicationSchedule,
  recordPublicationScheduleConsent,
  validateMicrodramaAudienceTimezoneProfile,
  validateMicrodramaPublicationScheduleConsentRecord,
  validateMicrodramaPublicationSchedulePolicy,
  validateMicrodramaPublicationScheduleRecord,
  type MicrodramaAudienceTimezoneProfile,
  type MicrodramaPublicationScheduleConsentRecord,
  type MicrodramaPublicationSchedulePolicy,
  type MicrodramaPublicationScheduleRecord,
  type TikTokAppAuditReadinessProjection,
} from "@mediaforge/domain";
import type { MicrodramaPublicationIntent } from "@mediaforge/domain";

import {
  type MicrodramaPublicationSchedulingPort,
  type SavePublicationScheduleConsentRecordInput,
  type SavePublicationSchedulePolicyInput,
  type SavePublicationScheduleRecordInput,
  type UpsertAudienceTimezoneProfileInput,
  MicrodramaPublicationSchedulingConflictError,
} from "./microdrama-publication-scheduling-port.js";

export class FakeMicrodramaPublicationSchedulingRepository
  implements MicrodramaPublicationSchedulingPort
{
  private readonly audienceProfiles = new Map<string, MicrodramaAudienceTimezoneProfile>();
  private readonly audienceProfileIndex = new Map<string, string>();
  private readonly policies = new Map<string, MicrodramaPublicationSchedulePolicy>();
  private readonly policyIndex = new Map<string, string>();
  private readonly schedules = new Map<string, MicrodramaPublicationScheduleRecord>();
  private readonly scheduleIndexByIntent = new Map<string, string>();
  private readonly consents = new Map<string, MicrodramaPublicationScheduleConsentRecord>();
  private readonly consentIndexBySchedule = new Map<string, string>();
  private readonly auditReadiness = new Map<string, TikTokAppAuditReadinessProjection>();
  private migrated = false;

  public migratePublicationScheduling(): void {
    this.migrated = true;
  }

  public upsertAudienceTimezoneProfile(
    input: UpsertAudienceTimezoneProfileInput
  ): MicrodramaAudienceTimezoneProfile {
    this.requireMigrated();
    const profile = validateMicrodramaAudienceTimezoneProfile(input.profile);
    this.audienceProfiles.set(profile.profileId, profile);
    this.audienceProfileIndex.set(
      this.audienceKey(profile.seriesId, profile.locale),
      profile.profileId
    );
    return profile;
  }

  public getAudienceTimezoneProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
  }): MicrodramaAudienceTimezoneProfile | null {
    const profileId = this.audienceProfileIndex.get(
      this.audienceKey(input.seriesId, input.locale)
    );
    return profileId ? (this.audienceProfiles.get(profileId) ?? null) : null;
  }

  public saveSchedulePolicy(
    input: SavePublicationSchedulePolicyInput
  ): MicrodramaPublicationSchedulePolicy {
    this.requireMigrated();
    const policy = validateMicrodramaPublicationSchedulePolicy(input.policy);
    this.policies.set(policy.policyId, policy);
    this.policyIndex.set(this.policyKey(policy), policy.policyId);
    return policy;
  }

  public getSchedulePolicy(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
    readonly providerAccountId: string;
  }): MicrodramaPublicationSchedulePolicy | null {
    const policyId = this.policyIndex.get(this.policyKey(input));
    return policyId ? (this.policies.get(policyId) ?? null) : null;
  }

  public saveScheduleRecord(
    input: SavePublicationScheduleRecordInput
  ): MicrodramaPublicationScheduleRecord {
    this.requireMigrated();
    const schedule = validateMicrodramaPublicationScheduleRecord(input.schedule);
    const existingPending = this.getPendingScheduleByIntent(schedule.intentId);
    if (
      existingPending &&
      existingPending.scheduleId !== schedule.scheduleId &&
      schedule.state === "pending"
    ) {
      throw new MicrodramaPublicationSchedulingConflictError(
        "Only one pending schedule may exist per intent."
      );
    }
    this.schedules.set(schedule.scheduleId, schedule);
    if (schedule.state === "pending") {
      this.scheduleIndexByIntent.set(schedule.intentId, schedule.scheduleId);
    } else {
      const indexed = this.scheduleIndexByIntent.get(schedule.intentId);
      if (indexed === schedule.scheduleId) {
        this.scheduleIndexByIntent.delete(schedule.intentId);
      }
    }
    return schedule;
  }

  public getScheduleRecord(
    scheduleId: string
  ): MicrodramaPublicationScheduleRecord | null {
    return this.schedules.get(scheduleId) ?? null;
  }

  public getPendingScheduleByIntent(
    intentId: string
  ): MicrodramaPublicationScheduleRecord | null {
    const scheduleId = this.scheduleIndexByIntent.get(intentId);
    if (!scheduleId) return null;
    const schedule = this.schedules.get(scheduleId);
    return schedule?.state === "pending" ? schedule : null;
  }

  public saveScheduleConsentRecord(
    input: SavePublicationScheduleConsentRecordInput
  ): MicrodramaPublicationScheduleConsentRecord {
    this.requireMigrated();
    const consent = validateMicrodramaPublicationScheduleConsentRecord(input.consent);
    if (this.consentIndexBySchedule.has(consent.scheduleId)) {
      throw new MicrodramaPublicationSchedulingConflictError(
        "Schedule consent is immutable once recorded."
      );
    }
    this.consents.set(consent.consentRecordId, consent);
    this.consentIndexBySchedule.set(consent.scheduleId, consent.consentRecordId);
    return consent;
  }

  public getScheduleConsentBySchedule(
    scheduleId: string
  ): MicrodramaPublicationScheduleConsentRecord | null {
    const consentId = this.consentIndexBySchedule.get(scheduleId);
    return consentId ? (this.consents.get(consentId) ?? null) : null;
  }

  public seedAuditReadinessProjection(
    readiness: TikTokAppAuditReadinessProjection
  ): TikTokAppAuditReadinessProjection {
    this.auditReadiness.set(readiness.readinessProjectionId, readiness);
    return readiness;
  }

  public getAuditReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null {
    return this.auditReadiness.get(readinessProjectionId) ?? null;
  }

  public cancelSchedule(input: {
    readonly scheduleId: string;
    readonly now: string;
  }): MicrodramaPublicationScheduleRecord {
    const schedule = this.getScheduleRecord(input.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found.");
    }
    const cancelled = cancelPublicationSchedule({ schedule, now: input.now });
    return this.saveScheduleRecord({ schedule: cancelled });
  }

  public recordConsentForSchedule(input: {
    readonly consentRecordId: string;
    readonly scheduleId: string;
    readonly intent: MicrodramaPublicationIntent;
    readonly operatorId: string;
    readonly consentedAt: string;
  }): MicrodramaPublicationScheduleConsentRecord {
    const schedule = this.getScheduleRecord(input.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found.");
    }
    const consent = recordPublicationScheduleConsent({
      consentRecordId: input.consentRecordId,
      schedule,
      intent: input.intent,
      operatorId: input.operatorId,
      consentedAt: input.consentedAt,
    });
    return this.saveScheduleConsentRecord({ consent });
  }

  private requireMigrated(): void {
    if (!this.migrated) {
      throw new Error("Publication scheduling repository is not migrated.");
    }
  }

  private audienceKey(seriesId: string, locale: string): string {
    return `${seriesId}:${locale.toLowerCase()}`;
  }

  private policyKey(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
    readonly providerAccountId: string;
  }): string {
    return `${input.seriesId}:${input.locale.toLowerCase()}:${input.provider}:${input.providerAccountId}`;
  }
}
