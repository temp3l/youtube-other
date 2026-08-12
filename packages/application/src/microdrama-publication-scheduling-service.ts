import {
  cancelPublicationSchedule,
  defaultPublicationSchedulePolicy,
  evaluateScheduledDispatchAdmission,
  planPublicationScheduleRecord,
  recordPublicationScheduleConsent,
  type MicrodramaAudienceTimezoneProfile,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationScheduleConsentRecord,
  type MicrodramaPublicationSchedulePolicy,
  type MicrodramaPublicationScheduleRecord,
  type MicrodramaPublicationSchedulingAdmission,
  type TikTokAppAuditReadinessProjection,
} from "@mediaforge/domain";

export type MicrodramaPublicationSchedulingApplicationPort = {
  migratePublicationScheduling(): void;
  upsertAudienceTimezoneProfile(input: {
    readonly profile: MicrodramaAudienceTimezoneProfile;
  }): MicrodramaAudienceTimezoneProfile;
  getAudienceTimezoneProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
  }): MicrodramaAudienceTimezoneProfile | null;
  saveSchedulePolicy(input: {
    readonly policy: MicrodramaPublicationSchedulePolicy;
  }): MicrodramaPublicationSchedulePolicy;
  getSchedulePolicy(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
    readonly providerAccountId: string;
  }): MicrodramaPublicationSchedulePolicy | null;
  saveScheduleRecord(input: {
    readonly schedule: MicrodramaPublicationScheduleRecord;
  }): MicrodramaPublicationScheduleRecord;
  getScheduleRecord(scheduleId: string): MicrodramaPublicationScheduleRecord | null;
  getPendingScheduleByIntent(
    intentId: string
  ): MicrodramaPublicationScheduleRecord | null;
  saveScheduleConsentRecord(input: {
    readonly consent: MicrodramaPublicationScheduleConsentRecord;
  }): MicrodramaPublicationScheduleConsentRecord;
  getScheduleConsentBySchedule(
    scheduleId: string
  ): MicrodramaPublicationScheduleConsentRecord | null;
  getAuditReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null;
};

export type MicrodramaPublicationSchedulingServiceInput = {
  readonly port: MicrodramaPublicationSchedulingApplicationPort;
};

export class MicrodramaPublicationSchedulingBlockedError extends Error {
  public constructor(
    public readonly admission: MicrodramaPublicationSchedulingAdmission
  ) {
    super(admission.message ?? "Microdrama publication scheduling blocked.");
    this.name = "MicrodramaPublicationSchedulingBlockedError";
  }
}

export class MicrodramaPublicationSchedulingService {
  public constructor(private readonly input: MicrodramaPublicationSchedulingServiceInput) {}

  public migrate(): void {
    this.input.port.migratePublicationScheduling();
  }

  public registerAudienceTimezoneProfile(input: {
    readonly profile: MicrodramaAudienceTimezoneProfile;
  }): MicrodramaAudienceTimezoneProfile {
    return this.input.port.upsertAudienceTimezoneProfile({ profile: input.profile });
  }

  public registerSchedulePolicy(input: {
    readonly policy: MicrodramaPublicationSchedulePolicy;
  }): MicrodramaPublicationSchedulePolicy {
    return this.input.port.saveSchedulePolicy({ policy: input.policy });
  }

  public ensureDefaultSchedulePolicy(input: {
    readonly policyId: string;
    readonly seriesId: string;
    readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
    readonly locale: string;
    readonly providerAccountId: string;
    readonly registeredAt: string;
  }): MicrodramaPublicationSchedulePolicy {
    const existing = this.input.port.getSchedulePolicy({
      seriesId: input.seriesId,
      locale: input.locale,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    });
    if (existing) return existing;
    return this.input.port.saveSchedulePolicy({
      policy: defaultPublicationSchedulePolicy(input),
    });
  }

  public scheduleIntent(input: {
    readonly scheduleId: string;
    readonly intent: MicrodramaPublicationIntent;
    readonly seriesId: string;
    readonly locale: string;
    readonly localScheduledAt: string;
    readonly now: string;
  }): {
    readonly schedule: MicrodramaPublicationScheduleRecord;
    readonly audienceProfile: MicrodramaAudienceTimezoneProfile;
  } {
    const audienceProfile = this.input.port.getAudienceTimezoneProfile({
      seriesId: input.seriesId,
      locale: input.locale,
    });
    if (!audienceProfile) {
      throw new Error("AUDIENCE_TIMEZONE_PROFILE_MISSING");
    }
    const policy =
      this.input.port.getSchedulePolicy({
        seriesId: input.seriesId,
        locale: input.locale,
        provider: input.intent.binding.provider,
        providerAccountId: input.intent.binding.providerAccountId,
      }) ??
      this.ensureDefaultSchedulePolicy({
        policyId: `policy.${input.seriesId}.${input.locale.toLowerCase()}.${input.intent.binding.provider}`,
        seriesId: input.seriesId,
        provider: input.intent.binding.provider,
        locale: input.locale,
        providerAccountId: input.intent.binding.providerAccountId,
        registeredAt: input.now,
      });
    const schedule = planPublicationScheduleRecord({
      scheduleId: input.scheduleId,
      intent: input.intent,
      audienceProfile,
      localScheduledAt: input.localScheduledAt,
      now: input.now,
      maxScheduleHorizonHours: policy.maxScheduleHorizonHours,
    });
    return {
      schedule: this.input.port.saveScheduleRecord({ schedule }),
      audienceProfile,
    };
  }

  public recordScheduleConsent(input: {
    readonly consentRecordId: string;
    readonly scheduleId: string;
    readonly intent: MicrodramaPublicationIntent;
    readonly operatorId: string;
    readonly consentedAt: string;
  }): MicrodramaPublicationScheduleConsentRecord {
    const schedule = this.input.port.getScheduleRecord(input.scheduleId);
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
    return this.input.port.saveScheduleConsentRecord({ consent });
  }

  public cancelSchedule(input: {
    readonly scheduleId: string;
    readonly now: string;
  }): MicrodramaPublicationScheduleRecord {
    const schedule = this.input.port.getScheduleRecord(input.scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found.");
    }
    const cancelled = cancelPublicationSchedule({ schedule, now: input.now });
    return this.input.port.saveScheduleRecord({ schedule: cancelled });
  }

  public evaluateDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intent: MicrodramaPublicationIntent;
    readonly seriesId: string;
    readonly operatorDispatchConfirmed?: boolean;
  }): MicrodramaPublicationSchedulingAdmission {
    const schedule =
      this.input.port.getPendingScheduleByIntent(input.intent.intentId) ?? undefined;
    const consent = schedule
      ? (this.input.port.getScheduleConsentBySchedule(schedule.scheduleId) ?? undefined)
      : undefined;
    const policy =
      this.input.port.getSchedulePolicy({
        seriesId: input.seriesId,
        locale: input.intent.binding.locale,
        provider: input.intent.binding.provider,
        providerAccountId: input.intent.binding.providerAccountId,
      }) ?? undefined;
    const auditReadiness = policy?.tiktokAuditReadinessProjectionId
      ? this.input.port.getAuditReadinessProjection(
          policy.tiktokAuditReadinessProjectionId
        )
      : null;
    return evaluateScheduledDispatchAdmission({
      correlationId: input.correlationId,
      evaluatedAt: input.evaluatedAt,
      dispatchMode: input.intent.dispatchMode,
      schedule,
      consent,
      intent: input.intent,
      policy,
      auditReadiness,
      operatorDispatchConfirmed: input.operatorDispatchConfirmed,
    });
  }

  public requireDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intent: MicrodramaPublicationIntent;
    readonly seriesId: string;
    readonly operatorDispatchConfirmed?: boolean;
  }): MicrodramaPublicationSchedulingAdmission {
    const admission = this.evaluateDispatchAdmission(input);
    if (!admission.allowed) {
      throw new MicrodramaPublicationSchedulingBlockedError(admission);
    }
    return admission;
  }
}
