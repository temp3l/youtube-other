import type { DatabaseSync } from "node:sqlite";

import {
  microdramaAudienceTimezoneProfileSchema,
  microdramaPublicationScheduleConsentRecordSchema,
  microdramaPublicationSchedulePolicySchema,
  microdramaPublicationScheduleRecordSchema,
  tikTokAppAuditReadinessProjectionSchema,
  type MicrodramaAudienceTimezoneProfile,
  type MicrodramaPublicationScheduleConsentRecord,
  type MicrodramaPublicationSchedulePolicy,
  type MicrodramaPublicationScheduleRecord,
  type TikTokAppAuditReadinessProjection,
} from "@mediaforge/domain";

import { FakeMicrodramaPublicationSchedulingRepository } from "./microdrama-publication-scheduling-fake-repository.js";
import {
  type MicrodramaPublicationSchedulingPort,
  type SavePublicationScheduleConsentRecordInput,
  type SavePublicationSchedulePolicyInput,
  type SavePublicationScheduleRecordInput,
  type UpsertAudienceTimezoneProfileInput,
} from "./microdrama-publication-scheduling-port.js";
import {
  MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION,
  MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION_ID,
} from "./microdrama-publication-scheduling-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

function parseAudienceProfile(row: {
  profile_json: string;
}): MicrodramaAudienceTimezoneProfile {
  return microdramaAudienceTimezoneProfileSchema.parse(JSON.parse(row.profile_json));
}

function parsePolicy(row: { policy_json: string }): MicrodramaPublicationSchedulePolicy {
  return microdramaPublicationSchedulePolicySchema.parse(JSON.parse(row.policy_json));
}

function parseSchedule(row: { schedule_json: string }): MicrodramaPublicationScheduleRecord {
  return microdramaPublicationScheduleRecordSchema.parse(JSON.parse(row.schedule_json));
}

function parseConsent(row: {
  consent_json: string;
}): MicrodramaPublicationScheduleConsentRecord {
  return microdramaPublicationScheduleConsentRecordSchema.parse(
    JSON.parse(row.consent_json)
  );
}

function parseAuditReadiness(row: {
  readiness_json: string;
}): TikTokAppAuditReadinessProjection {
  return tikTokAppAuditReadinessProjectionSchema.parse(JSON.parse(row.readiness_json));
}

export class MicrodramaPublicationSchedulingRepository
  implements MicrodramaPublicationSchedulingPort
{
  private readonly fake = new FakeMicrodramaPublicationSchedulingRepository();

  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migratePublicationScheduling(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(
          MICRODRAMA_PUBLICATION_SCHEDULING_SQLITE_MIGRATION_ID,
          new Date().toISOString()
        );
    }
    this.fake.migratePublicationScheduling();
  }

  public upsertAudienceTimezoneProfile(
    input: UpsertAudienceTimezoneProfileInput
  ): MicrodramaAudienceTimezoneProfile {
    const profile = this.fake.upsertAudienceTimezoneProfile(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_audience_timezone_profiles (
          profile_id, series_id, locale, audience_timezone, profile_json, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET
          series_id = excluded.series_id,
          locale = excluded.locale,
          audience_timezone = excluded.audience_timezone,
          profile_json = excluded.profile_json,
          registered_at = excluded.registered_at`
      )
      .run(
        profile.profileId,
        profile.seriesId,
        profile.locale,
        profile.audienceTimezone,
        JSON.stringify(profile),
        profile.registeredAt
      );
    return profile;
  }

  public getAudienceTimezoneProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
  }): MicrodramaAudienceTimezoneProfile | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT profile_json
         FROM microdrama_audience_timezone_profiles
         WHERE series_id = ? AND lower(locale) = lower(?)`
      )
      .get(input.seriesId, input.locale) as { profile_json: string } | undefined;
    return row ? parseAudienceProfile(row) : null;
  }

  public saveSchedulePolicy(
    input: SavePublicationSchedulePolicyInput
  ): MicrodramaPublicationSchedulePolicy {
    const policy = this.fake.saveSchedulePolicy(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_schedule_policies (
          policy_id, series_id, provider, locale, provider_account_id,
          manual_dispatch_enabled, preapproved_scheduled_enabled,
          tiktok_audit_readiness_projection_id, max_schedule_horizon_hours,
          policy_json, registered_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(policy_id) DO UPDATE SET
          manual_dispatch_enabled = excluded.manual_dispatch_enabled,
          preapproved_scheduled_enabled = excluded.preapproved_scheduled_enabled,
          tiktok_audit_readiness_projection_id = excluded.tiktok_audit_readiness_projection_id,
          max_schedule_horizon_hours = excluded.max_schedule_horizon_hours,
          policy_json = excluded.policy_json,
          updated_at = excluded.updated_at`
      )
      .run(
        policy.policyId,
        policy.seriesId,
        policy.provider,
        policy.locale,
        policy.providerAccountId,
        policy.manualDispatchEnabled ? 1 : 0,
        policy.preapprovedScheduledEnabled ? 1 : 0,
        policy.tiktokAuditReadinessProjectionId ?? null,
        policy.maxScheduleHorizonHours,
        JSON.stringify(policy),
        policy.registeredAt,
        policy.updatedAt
      );
    return policy;
  }

  public getSchedulePolicy(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationSchedulePolicy["provider"];
    readonly providerAccountId: string;
  }): MicrodramaPublicationSchedulePolicy | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT policy_json
         FROM microdrama_publication_schedule_policies
         WHERE series_id = ?
           AND lower(locale) = lower(?)
           AND provider = ?
           AND provider_account_id = ?`
      )
      .get(
        input.seriesId,
        input.locale,
        input.provider,
        input.providerAccountId
      ) as { policy_json: string } | undefined;
    return row ? parsePolicy(row) : null;
  }

  public saveScheduleRecord(
    input: SavePublicationScheduleRecordInput
  ): MicrodramaPublicationScheduleRecord {
    const schedule = this.fake.saveScheduleRecord(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_schedule_records (
          schedule_id, intent_id, dispatch_mode, audience_timezone_profile_id,
          audience_timezone, local_scheduled_at, scheduled_at_utc,
          intent_fingerprint, consent_fence_hash, state, schedule_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(schedule_id) DO UPDATE SET
          state = excluded.state,
          schedule_json = excluded.schedule_json,
          updated_at = excluded.updated_at`
      )
      .run(
        schedule.scheduleId,
        schedule.intentId,
        schedule.dispatchMode,
        schedule.audienceTimezoneProfileId,
        schedule.audienceTimezone,
        schedule.localScheduledAt,
        schedule.scheduledAtUtc,
        schedule.intentFingerprint,
        schedule.consentFenceHash,
        schedule.state,
        JSON.stringify(schedule),
        schedule.createdAt,
        schedule.updatedAt
      );
    return schedule;
  }

  public getScheduleRecord(
    scheduleId: string
  ): MicrodramaPublicationScheduleRecord | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT schedule_json
         FROM microdrama_publication_schedule_records
         WHERE schedule_id = ?`
      )
      .get(scheduleId) as { schedule_json: string } | undefined;
    return row ? parseSchedule(row) : null;
  }

  public getPendingScheduleByIntent(
    intentId: string
  ): MicrodramaPublicationScheduleRecord | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT schedule_json
         FROM microdrama_publication_schedule_records
         WHERE intent_id = ? AND state = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(intentId) as { schedule_json: string } | undefined;
    return row ? parseSchedule(row) : null;
  }

  public saveScheduleConsentRecord(
    input: SavePublicationScheduleConsentRecordInput
  ): MicrodramaPublicationScheduleConsentRecord {
    const consent = this.fake.saveScheduleConsentRecord(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_schedule_consent_records (
          consent_record_id, schedule_id, intent_id, operator_id,
          intent_fingerprint, consent_fence_hash, dispatch_mode,
          consent_json, consented_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        consent.consentRecordId,
        consent.scheduleId,
        consent.intentId,
        consent.operatorId,
        consent.intentFingerprint,
        consent.consentFenceHash,
        consent.dispatchMode,
        JSON.stringify(consent),
        consent.consentedAt
      );
    return consent;
  }

  public getScheduleConsentBySchedule(
    scheduleId: string
  ): MicrodramaPublicationScheduleConsentRecord | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT consent_json
         FROM microdrama_publication_schedule_consent_records
         WHERE schedule_id = ?`
      )
      .get(scheduleId) as { consent_json: string } | undefined;
    return row ? parseConsent(row) : null;
  }

  public getAuditReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT readiness_json
         FROM microdrama_tiktok_app_audit_readiness_projections
         WHERE readiness_projection_id = ?`
      )
      .get(readinessProjectionId) as { readiness_json: string } | undefined;
    return row ? parseAuditReadiness(row) : null;
  }
}
