import type {
  TikTokAppAuditReadinessProjection,
  TikTokAppDeveloperConfigurationRevision,
  TikTokProviderAuditEvidenceRecord,
} from "@mediaforge/domain";

export type RecordTikTokAppConfigurationRevisionInput = {
  readonly configuration: TikTokAppDeveloperConfigurationRevision;
};

export type RecordTikTokProviderAuditEvidenceInput = {
  readonly auditEvidence: TikTokProviderAuditEvidenceRecord;
};

export type SaveTikTokAppAuditReadinessProjectionInput = {
  readonly readiness: TikTokAppAuditReadinessProjection;
};

export interface MicrodramaTikTokAppAuditPort {
  migrateTikTokAppAudit(): void;
  recordConfigurationRevision(
    input: RecordTikTokAppConfigurationRevisionInput
  ): TikTokAppDeveloperConfigurationRevision;
  getConfigurationRevision(
    configurationRevisionId: string
  ): TikTokAppDeveloperConfigurationRevision | null;
  getLatestConfigurationRevision(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppDeveloperConfigurationRevision | null;
  recordProviderAuditEvidence(
    input: RecordTikTokProviderAuditEvidenceInput
  ): TikTokProviderAuditEvidenceRecord;
  getProviderAuditEvidence(
    auditEvidenceId: string
  ): TikTokProviderAuditEvidenceRecord | null;
  getLatestProviderAuditEvidence(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
    readonly configurationRevisionId: string;
  }): TikTokProviderAuditEvidenceRecord | null;
  saveReadinessProjection(
    input: SaveTikTokAppAuditReadinessProjectionInput
  ): TikTokAppAuditReadinessProjection;
  getReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null;
  getLatestReadinessProjection(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppAuditReadinessProjection | null;
}
