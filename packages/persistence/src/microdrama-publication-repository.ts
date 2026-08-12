import type { DatabaseSync } from "node:sqlite";

import {
  evaluatePublicationDispatchAdmission,
  resolvePublicationCapability,
  type CreatorContentConsentRevision,
  type MicrodramaPublicationAttempt,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationEffectEvidence,
  type MicrodramaPublicationIdempotencyRecord,
  type MicrodramaPublicationIntent,
  type MicrodramaPublicationTargetProfile,
  type TikTokPostExportApprovalRevision,
  creatorContentConsentRevisionSchema,
  microdramaPublicationAttemptSchema,
  microdramaPublicationEffectEvidenceSchema,
  microdramaPublicationIdempotencyRecordSchema,
  microdramaPublicationIntentSchema,
  microdramaPublicationTargetProfileSchema,
  tikTokPostExportApprovalRevisionSchema,
} from "@mediaforge/domain";

import { FakeMicrodramaPublicationRepository } from "./microdrama-publication-fake-repository.js";
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
import {
  MICRODRAMA_PUBLICATION_SQLITE_MIGRATION,
  MICRODRAMA_PUBLICATION_SQLITE_MIGRATION_ID,
} from "./microdrama-publication-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

function parseProfile(row: { profile_json: string }): MicrodramaPublicationTargetProfile {
  return microdramaPublicationTargetProfileSchema.parse(JSON.parse(row.profile_json));
}

function parseConsent(row: { consent_json: string }): CreatorContentConsentRevision {
  return creatorContentConsentRevisionSchema.parse(JSON.parse(row.consent_json));
}

function parseExportApproval(row: {
  approval_json: string;
}): TikTokPostExportApprovalRevision {
  return tikTokPostExportApprovalRevisionSchema.parse(JSON.parse(row.approval_json));
}

function parseIntent(row: { intent_json: string }): MicrodramaPublicationIntent {
  return microdramaPublicationIntentSchema.parse(JSON.parse(row.intent_json));
}

function parseIdempotency(row: {
  record_json: string;
}): MicrodramaPublicationIdempotencyRecord {
  return microdramaPublicationIdempotencyRecordSchema.parse(JSON.parse(row.record_json));
}

function parseAttempt(row: { attempt_json: string }): MicrodramaPublicationAttempt {
  return microdramaPublicationAttemptSchema.parse(JSON.parse(row.attempt_json));
}

function parseEffect(row: { effect_json: string }): MicrodramaPublicationEffectEvidence {
  return microdramaPublicationEffectEvidenceSchema.parse(JSON.parse(row.effect_json));
}

export class MicrodramaPublicationRepository implements MicrodramaPublicationPort {
  private readonly fake = new FakeMicrodramaPublicationRepository();

  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migratePublication(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_PUBLICATION_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_PUBLICATION_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(MICRODRAMA_PUBLICATION_SQLITE_MIGRATION_ID, new Date().toISOString());
    }
    this.fake.migratePublication();
  }

  public upsertTargetProfile(
    input: UpsertPublicationTargetProfileInput
  ): MicrodramaPublicationTargetProfile {
    const profile = this.fake.upsertTargetProfile(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_target_profiles (
          profile_id, series_id, locale, provider, provider_account_id,
          credential_version, metadata_profile_id, schedule_profile_id,
          enabled, profile_json, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(series_id, locale, provider) DO UPDATE SET
          profile_id = excluded.profile_id,
          provider_account_id = excluded.provider_account_id,
          credential_version = excluded.credential_version,
          metadata_profile_id = excluded.metadata_profile_id,
          schedule_profile_id = excluded.schedule_profile_id,
          enabled = excluded.enabled,
          profile_json = excluded.profile_json,
          registered_at = excluded.registered_at`
      )
      .run(
        profile.profileId,
        profile.seriesId,
        profile.locale,
        profile.provider,
        profile.providerAccountId,
        profile.credentialVersion,
        profile.metadataProfileId,
        profile.scheduleProfileId,
        profile.enabled ? 1 : 0,
        JSON.stringify(profile),
        profile.registeredAt
      );
    return profile;
  }

  public getTargetProfile(input: {
    readonly seriesId: string;
    readonly locale: string;
    readonly provider: MicrodramaPublicationTargetProfile["provider"];
  }): MicrodramaPublicationTargetProfile | null {
    const row = this.sqlite.database
      .prepare(
        `SELECT profile_json FROM microdrama_publication_target_profiles
         WHERE series_id = ? AND locale = ? AND provider = ?`
      )
      .get(input.seriesId, input.locale, input.provider) as
      | { profile_json: string }
      | undefined;
    return row ? parseProfile(row) : null;
  }

  public recordConsentRevision(
    input: RecordConsentRevisionInput
  ): CreatorContentConsentRevision {
    const consent = this.fake.recordConsentRevision(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_creator_content_consent_revisions (
          consent_revision_id, subject_id, rightsholder_id, evidence_hash,
          evidence_source, permitted_provider, permitted_locale, permitted_territory,
          effective_at, expires_at, revoked_at, state, consent_json, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(consent_revision_id) DO UPDATE SET
          state = excluded.state,
          revoked_at = excluded.revoked_at,
          consent_json = excluded.consent_json`
      )
      .run(
        consent.consentRevisionId,
        consent.subjectId,
        consent.rightsholderId,
        consent.evidenceHash,
        consent.evidenceSource,
        consent.permittedProvider,
        consent.permittedLocale,
        consent.permittedTerritory,
        consent.effectiveAt,
        consent.expiresAt ?? null,
        consent.revokedAt ?? null,
        consent.state,
        JSON.stringify(consent),
        consent.recordedAt
      );
    return consent;
  }

  public getConsentRevision(
    consentRevisionId: string
  ): CreatorContentConsentRevision | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT consent_json FROM microdrama_creator_content_consent_revisions WHERE consent_revision_id = ?"
      )
      .get(consentRevisionId) as { consent_json: string } | undefined;
    return row ? parseConsent(row) : null;
  }

  public recordExportApprovalRevision(
    input: RecordExportApprovalRevisionInput
  ): TikTokPostExportApprovalRevision {
    const exportApproval = this.fake.recordExportApprovalRevision(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_tiktok_export_approval_revisions (
          export_approval_revision_id, consent_revision_id,
          creator_capability_evidence_hash, provider_account_id, render_hash,
          artifact_manifest_hash, metadata_revision_id, privacy,
          ai_content_declared, commercial_content_declared, operator_id,
          approved_at, state, approval_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(export_approval_revision_id) DO UPDATE SET
          state = excluded.state,
          approval_json = excluded.approval_json`
      )
      .run(
        exportApproval.exportApprovalRevisionId,
        exportApproval.consentRevisionId,
        exportApproval.creatorCapabilityEvidenceHash,
        exportApproval.providerAccountId,
        exportApproval.renderHash,
        exportApproval.artifactManifestHash,
        exportApproval.metadataRevisionId,
        exportApproval.privacy,
        exportApproval.aiContentDeclared ? 1 : 0,
        exportApproval.commercialContentDeclared ? 1 : 0,
        exportApproval.operatorId,
        exportApproval.approvedAt,
        exportApproval.state,
        JSON.stringify(exportApproval)
      );
    return exportApproval;
  }

  public getExportApprovalRevision(
    exportApprovalRevisionId: string
  ): TikTokPostExportApprovalRevision | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT approval_json FROM microdrama_tiktok_export_approval_revisions WHERE export_approval_revision_id = ?"
      )
      .get(exportApprovalRevisionId) as { approval_json: string } | undefined;
    return row ? parseExportApproval(row) : null;
  }

  public saveIntent(input: SavePublicationIntentInput): MicrodramaPublicationIntent {
    try {
      const intent = this.fake.saveIntent(input);
      this.sqlite.database
        .prepare(
          `INSERT INTO microdrama_publication_intents (
            intent_id, target_profile_id, provider, provider_account_id,
            idempotency_key, fingerprint, approval_state,
            bound_export_approval_revision_id, state, intent_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(intent_id) DO UPDATE SET
            approval_state = excluded.approval_state,
            bound_export_approval_revision_id = excluded.bound_export_approval_revision_id,
            state = excluded.state,
            updated_at = excluded.updated_at,
            intent_json = excluded.intent_json`
        )
        .run(
          intent.intentId,
          intent.targetProfileId,
          intent.binding.provider,
          intent.binding.providerAccountId,
          intent.idempotencyKey,
          intent.fingerprint,
          intent.approvalState,
          intent.boundExportApprovalRevisionId ?? null,
          intent.state,
          JSON.stringify(intent),
          intent.createdAt,
          intent.updatedAt
        );
      return intent;
    } catch (error) {
      if (error instanceof MicrodramaPublicationConflictError) {
        throw error;
      }
      throw error;
    }
  }

  public getIntent(intentId: string): MicrodramaPublicationIntent | null {
    const row = this.sqlite.database
      .prepare("SELECT intent_json FROM microdrama_publication_intents WHERE intent_id = ?")
      .get(intentId) as { intent_json: string } | undefined;
    return row ? parseIntent(row) : null;
  }

  public getIdempotencyRecord(
    idempotencyKey: string
  ): MicrodramaPublicationIdempotencyRecord | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT record_json FROM microdrama_publication_idempotency_records WHERE idempotency_key = ?"
      )
      .get(idempotencyKey) as { record_json: string } | undefined;
    return row ? parseIdempotency(row) : null;
  }

  public saveIdempotencyRecord(
    input: SavePublicationIdempotencyRecordInput
  ): MicrodramaPublicationIdempotencyRecord {
    const record = this.fake.saveIdempotencyRecord(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_idempotency_records (
          idempotency_key, fingerprint, intent_id, state, reserved_at, committed_at, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(idempotency_key) DO UPDATE SET
          state = excluded.state,
          committed_at = excluded.committed_at,
          record_json = excluded.record_json`
      )
      .run(
        record.idempotencyKey,
        record.fingerprint,
        record.intentId,
        record.state,
        record.reservedAt,
        record.committedAt ?? null,
        JSON.stringify(record)
      );
    return record;
  }

  public saveAttempt(input: SavePublicationAttemptInput): MicrodramaPublicationAttempt {
    const attempt = this.fake.saveAttempt(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_attempts (
          attempt_id, intent_id, attempt_fence, idempotency_key, state,
          provider_request_id, provider_correlation_id, provider_response_id,
          attempt_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(attempt_id) DO UPDATE SET
          state = excluded.state,
          provider_response_id = excluded.provider_response_id,
          updated_at = excluded.updated_at,
          attempt_json = excluded.attempt_json`
      )
      .run(
        attempt.attemptId,
        attempt.intentId,
        attempt.attemptFence,
        attempt.idempotencyKey,
        attempt.state,
        attempt.providerCorrelation.requestId ?? null,
        attempt.providerCorrelation.correlationId ?? null,
        attempt.providerCorrelation.responseId ?? null,
        JSON.stringify(attempt),
        attempt.createdAt,
        attempt.updatedAt
      );
    return attempt;
  }

  public listAttemptsByIntent(intentId: string): readonly MicrodramaPublicationAttempt[] {
    const rows = this.sqlite.database
      .prepare(
        "SELECT attempt_json FROM microdrama_publication_attempts WHERE intent_id = ? ORDER BY attempt_fence ASC"
      )
      .all(intentId) as Array<{ attempt_json: string }>;
    return rows.map(parseAttempt);
  }

  public saveEffectEvidence(
    input: SavePublicationEffectEvidenceInput
  ): MicrodramaPublicationEffectEvidence {
    const effect = this.fake.saveEffectEvidence(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_publication_effect_evidence (
          effect_id, attempt_id, intent_id, outcome_state,
          provider_request_id, provider_correlation_id, provider_response_id,
          rate_limit_state, retry_after, next_eligible_at, reconciliation_outcome,
          effect_json, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(effect_id) DO UPDATE SET
          outcome_state = excluded.outcome_state,
          provider_response_id = excluded.provider_response_id,
          reconciliation_outcome = excluded.reconciliation_outcome,
          effect_json = excluded.effect_json`
      )
      .run(
        effect.effectId,
        effect.attemptId,
        effect.intentId,
        effect.outcomeState,
        effect.providerCorrelation.requestId ?? null,
        effect.providerCorrelation.correlationId ?? null,
        effect.providerCorrelation.responseId ?? null,
        effect.rateLimitState,
        effect.retryAfter ?? null,
        effect.nextEligibleAt ?? null,
        effect.reconciliationOutcome ?? null,
        JSON.stringify(effect),
        effect.recordedAt
      );
    return effect;
  }

  public evaluateDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: MicrodramaPublicationCapabilityState;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }) {
    const intent = this.getIntent(input.intentId);
    if (!intent) {
      return this.fake.evaluateDispatchAdmission(input);
    }
    const targetProfile = this.getTargetProfile({
      seriesId: "unused",
      locale: intent.binding.locale,
      provider: intent.binding.provider,
    });
    const resolvedTarget =
      this.sqlite.database
        .prepare(
          "SELECT profile_json FROM microdrama_publication_target_profiles WHERE profile_id = ?"
        )
        .get(intent.targetProfileId) as { profile_json: string } | undefined;
    return evaluatePublicationDispatchAdmission({
      correlationId: input.correlationId,
      evaluatedAt: input.evaluatedAt,
      capabilityState: resolvePublicationCapability({
        state: input.capabilityState,
      }),
      targetProfile: resolvedTarget ? parseProfile(resolvedTarget) : targetProfile ?? undefined,
      intent,
      consent:
        this.getConsentRevision(intent.binding.consentRevisionId) ?? undefined,
      exportApproval:
        this.getExportApprovalRevision(intent.binding.exportApprovalRevisionId) ??
        undefined,
      idempotency: this.getIdempotencyRecord(intent.idempotencyKey) ?? undefined,
      operatorDispatchConfirmed: input.operatorDispatchConfirmed,
      scheduleConsentRecorded: input.scheduleConsentRecorded,
    });
  }
}
