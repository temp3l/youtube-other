import type { DatabaseSync } from "node:sqlite";

import {
  tikTokAppAuditReadinessProjectionSchema,
  tikTokAppDeveloperConfigurationRevisionSchema,
  tikTokProviderAuditEvidenceRecordSchema,
  type TikTokAppAuditReadinessProjection,
  type TikTokAppDeveloperConfigurationRevision,
  type TikTokProviderAuditEvidenceRecord,
} from "@mediaforge/domain";

import { FakeMicrodramaTikTokAppAuditRepository } from "./microdrama-tiktok-app-audit-fake-repository.js";
import {
  type MicrodramaTikTokAppAuditPort,
  type RecordTikTokAppConfigurationRevisionInput,
  type RecordTikTokProviderAuditEvidenceInput,
  type SaveTikTokAppAuditReadinessProjectionInput,
} from "./microdrama-tiktok-app-audit-port.js";
import {
  MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION,
  MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION_ID,
} from "./microdrama-tiktok-app-audit-schema.js";

type SQLitePersistenceHost = {
  readonly database: DatabaseSync;
};

function parseConfiguration(row: {
  configuration_json: string;
}): TikTokAppDeveloperConfigurationRevision {
  return tikTokAppDeveloperConfigurationRevisionSchema.parse(
    JSON.parse(row.configuration_json)
  );
}

function parseAuditEvidence(row: {
  audit_json: string;
}): TikTokProviderAuditEvidenceRecord {
  return tikTokProviderAuditEvidenceRecordSchema.parse(JSON.parse(row.audit_json));
}

function parseReadiness(row: {
  readiness_json: string;
}): TikTokAppAuditReadinessProjection {
  return tikTokAppAuditReadinessProjectionSchema.parse(JSON.parse(row.readiness_json));
}

export class MicrodramaTikTokAppAuditRepository implements MicrodramaTikTokAppAuditPort {
  private readonly fake = new FakeMicrodramaTikTokAppAuditRepository();

  public constructor(private readonly sqlite: SQLitePersistenceHost) {}

  public migrateTikTokAppAudit(): void {
    const database = this.sqlite.database;
    database.exec(MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION);
    const applied = database
      .prepare(
        "SELECT migration_id FROM microdrama_schema_migrations WHERE migration_id = ?"
      )
      .get(MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION_ID) as
      | { migration_id: string }
      | undefined;
    if (!applied) {
      database
        .prepare(
          "INSERT INTO microdrama_schema_migrations (migration_id, applied_at) VALUES (?, ?)"
        )
        .run(
          MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION_ID,
          new Date().toISOString()
        );
    }
    this.fake.migrateTikTokAppAudit();
  }

  public recordConfigurationRevision(
    input: RecordTikTokAppConfigurationRevisionInput
  ): TikTokAppDeveloperConfigurationRevision {
    const configuration = this.fake.recordConfigurationRevision(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_tiktok_app_configuration_revisions (
          configuration_revision_id,
          workspace_id,
          provider_app_id,
          product,
          environment,
          app_credential_handle,
          effective_at,
          expires_at,
          revoked_at,
          state,
          configuration_json,
          recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(configuration_revision_id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          provider_app_id = excluded.provider_app_id,
          product = excluded.product,
          environment = excluded.environment,
          app_credential_handle = excluded.app_credential_handle,
          effective_at = excluded.effective_at,
          expires_at = excluded.expires_at,
          revoked_at = excluded.revoked_at,
          state = excluded.state,
          configuration_json = excluded.configuration_json,
          recorded_at = excluded.recorded_at`
      )
      .run(
        configuration.configurationRevisionId,
        configuration.workspaceId,
        configuration.providerAppId,
        configuration.product,
        configuration.environment,
        configuration.appCredentialHandle,
        configuration.effectiveAt,
        configuration.expiresAt ?? null,
        configuration.revokedAt ?? null,
        configuration.state,
        JSON.stringify(configuration),
        configuration.recordedAt
      );
    return configuration;
  }

  public getConfigurationRevision(
    configurationRevisionId: string
  ): TikTokAppDeveloperConfigurationRevision | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT configuration_json FROM microdrama_tiktok_app_configuration_revisions WHERE configuration_revision_id = ?"
      )
      .get(configurationRevisionId) as { configuration_json: string } | undefined;
    return row ? parseConfiguration(row) : null;
  }

  public getLatestConfigurationRevision(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppDeveloperConfigurationRevision | null {
    return this.fake.getLatestConfigurationRevision(input);
  }

  public recordProviderAuditEvidence(
    input: RecordTikTokProviderAuditEvidenceInput
  ): TikTokProviderAuditEvidenceRecord {
    const auditEvidence = this.fake.recordProviderAuditEvidence(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_tiktok_provider_audit_evidence (
          audit_evidence_id,
          workspace_id,
          provider_app_id,
          configuration_revision_id,
          evidence_source,
          submission_state,
          effective_at,
          expires_at,
          revoked_at,
          state,
          audit_json,
          recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(audit_evidence_id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          provider_app_id = excluded.provider_app_id,
          configuration_revision_id = excluded.configuration_revision_id,
          evidence_source = excluded.evidence_source,
          submission_state = excluded.submission_state,
          effective_at = excluded.effective_at,
          expires_at = excluded.expires_at,
          revoked_at = excluded.revoked_at,
          state = excluded.state,
          audit_json = excluded.audit_json,
          recorded_at = excluded.recorded_at`
      )
      .run(
        auditEvidence.auditEvidenceId,
        auditEvidence.workspaceId,
        auditEvidence.providerAppId,
        auditEvidence.configurationRevisionId,
        auditEvidence.evidenceSource,
        auditEvidence.submissionState,
        auditEvidence.effectiveAt,
        auditEvidence.expiresAt ?? null,
        auditEvidence.revokedAt ?? null,
        auditEvidence.state,
        JSON.stringify(auditEvidence),
        auditEvidence.recordedAt
      );
    return auditEvidence;
  }

  public getProviderAuditEvidence(
    auditEvidenceId: string
  ): TikTokProviderAuditEvidenceRecord | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT audit_json FROM microdrama_tiktok_provider_audit_evidence WHERE audit_evidence_id = ?"
      )
      .get(auditEvidenceId) as { audit_json: string } | undefined;
    return row ? parseAuditEvidence(row) : null;
  }

  public getLatestProviderAuditEvidence(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
    readonly configurationRevisionId: string;
  }): TikTokProviderAuditEvidenceRecord | null {
    return this.fake.getLatestProviderAuditEvidence(input);
  }

  public saveReadinessProjection(
    input: SaveTikTokAppAuditReadinessProjectionInput
  ): TikTokAppAuditReadinessProjection {
    const readiness = this.fake.saveReadinessProjection(input);
    this.sqlite.database
      .prepare(
        `INSERT INTO microdrama_tiktok_app_audit_readiness_projections (
          readiness_projection_id,
          workspace_id,
          provider_app_id,
          configuration_revision_id,
          audit_evidence_id,
          app_credential_handle,
          fingerprint,
          effective_at,
          expires_at,
          revoked_at,
          state,
          readiness_json,
          recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(readiness_projection_id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          provider_app_id = excluded.provider_app_id,
          configuration_revision_id = excluded.configuration_revision_id,
          audit_evidence_id = excluded.audit_evidence_id,
          app_credential_handle = excluded.app_credential_handle,
          fingerprint = excluded.fingerprint,
          effective_at = excluded.effective_at,
          expires_at = excluded.expires_at,
          revoked_at = excluded.revoked_at,
          state = excluded.state,
          readiness_json = excluded.readiness_json,
          recorded_at = excluded.recorded_at`
      )
      .run(
        readiness.readinessProjectionId,
        readiness.workspaceId,
        readiness.providerAppId,
        readiness.configurationRevisionId,
        readiness.auditEvidenceId,
        readiness.appCredentialHandle,
        readiness.fingerprint,
        readiness.effectiveAt,
        readiness.expiresAt ?? null,
        readiness.revokedAt ?? null,
        readiness.state,
        JSON.stringify(readiness),
        readiness.recordedAt
      );
    return readiness;
  }

  public getReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null {
    const row = this.sqlite.database
      .prepare(
        "SELECT readiness_json FROM microdrama_tiktok_app_audit_readiness_projections WHERE readiness_projection_id = ?"
      )
      .get(readinessProjectionId) as { readiness_json: string } | undefined;
    return row ? parseReadiness(row) : null;
  }

  public getLatestReadinessProjection(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppAuditReadinessProjection | null {
    return this.fake.getLatestReadinessProjection(input);
  }
}
