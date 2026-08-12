import {
  validateTikTokAppAuditReadinessProjection,
  validateTikTokAppDeveloperConfigurationRevision,
  validateTikTokProviderAuditEvidenceRecord,
  type TikTokAppAuditReadinessProjection,
  type TikTokAppDeveloperConfigurationRevision,
  type TikTokProviderAuditEvidenceRecord,
} from "@mediaforge/domain";

import {
  type MicrodramaTikTokAppAuditPort,
  type RecordTikTokAppConfigurationRevisionInput,
  type RecordTikTokProviderAuditEvidenceInput,
  type SaveTikTokAppAuditReadinessProjectionInput,
} from "./microdrama-tiktok-app-audit-port.js";

export class FakeMicrodramaTikTokAppAuditRepository
  implements MicrodramaTikTokAppAuditPort
{
  private readonly configurations = new Map<
    string,
    TikTokAppDeveloperConfigurationRevision
  >();
  private readonly configurationIndex = new Map<string, string[]>();
  private readonly auditEvidence = new Map<string, TikTokProviderAuditEvidenceRecord>();
  private readonly auditIndex = new Map<string, string[]>();
  private readonly readinessProjections = new Map<
    string,
    TikTokAppAuditReadinessProjection
  >();
  private readonly readinessIndex = new Map<string, string[]>();
  private migrated = false;

  public migrateTikTokAppAudit(): void {
    this.migrated = true;
  }

  public recordConfigurationRevision(
    input: RecordTikTokAppConfigurationRevisionInput
  ): TikTokAppDeveloperConfigurationRevision {
    this.requireMigrated();
    const configuration = validateTikTokAppDeveloperConfigurationRevision(
      input.configuration
    );
    this.configurations.set(configuration.configurationRevisionId, configuration);
    const key = this.workspaceAppKey(
      configuration.workspaceId,
      configuration.providerAppId
    );
    const revisions = [...(this.configurationIndex.get(key) ?? [])];
    revisions.push(configuration.configurationRevisionId);
    this.configurationIndex.set(key, revisions);
    return configuration;
  }

  public getConfigurationRevision(
    configurationRevisionId: string
  ): TikTokAppDeveloperConfigurationRevision | null {
    return this.configurations.get(configurationRevisionId) ?? null;
  }

  public getLatestConfigurationRevision(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppDeveloperConfigurationRevision | null {
    const revisions = this.configurationIndex.get(
      this.workspaceAppKey(input.workspaceId, input.providerAppId)
    );
    if (!revisions || revisions.length === 0) return null;
    return (
      [...revisions]
        .map((revisionId) => this.configurations.get(revisionId))
        .filter((revision): revision is TikTokAppDeveloperConfigurationRevision =>
          revision !== undefined
        )
        .sort(
          (left, right) =>
            Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
        )[0] ?? null
    );
  }

  public recordProviderAuditEvidence(
    input: RecordTikTokProviderAuditEvidenceInput
  ): TikTokProviderAuditEvidenceRecord {
    this.requireMigrated();
    const auditEvidence = validateTikTokProviderAuditEvidenceRecord(
      input.auditEvidence
    );
    this.auditEvidence.set(auditEvidence.auditEvidenceId, auditEvidence);
    const key = this.auditKey(
      auditEvidence.workspaceId,
      auditEvidence.providerAppId,
      auditEvidence.configurationRevisionId
    );
    const records = [...(this.auditIndex.get(key) ?? [])];
    records.push(auditEvidence.auditEvidenceId);
    this.auditIndex.set(key, records);
    return auditEvidence;
  }

  public getProviderAuditEvidence(
    auditEvidenceId: string
  ): TikTokProviderAuditEvidenceRecord | null {
    return this.auditEvidence.get(auditEvidenceId) ?? null;
  }

  public getLatestProviderAuditEvidence(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
    readonly configurationRevisionId: string;
  }): TikTokProviderAuditEvidenceRecord | null {
    const records = this.auditIndex.get(
      this.auditKey(
        input.workspaceId,
        input.providerAppId,
        input.configurationRevisionId
      )
    );
    if (!records || records.length === 0) return null;
    return (
      [...records]
        .map((auditEvidenceId) => this.auditEvidence.get(auditEvidenceId))
        .filter((record): record is TikTokProviderAuditEvidenceRecord =>
          record !== undefined
        )
        .sort(
          (left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
        )[0] ?? null
    );
  }

  public saveReadinessProjection(
    input: SaveTikTokAppAuditReadinessProjectionInput
  ): TikTokAppAuditReadinessProjection {
    this.requireMigrated();
    const readiness = validateTikTokAppAuditReadinessProjection(input.readiness);
    this.readinessProjections.set(readiness.readinessProjectionId, readiness);
    const key = this.workspaceAppKey(readiness.workspaceId, readiness.providerAppId);
    const projections = [...(this.readinessIndex.get(key) ?? [])];
    projections.push(readiness.readinessProjectionId);
    this.readinessIndex.set(key, projections);
    return readiness;
  }

  public getReadinessProjection(
    readinessProjectionId: string
  ): TikTokAppAuditReadinessProjection | null {
    return this.readinessProjections.get(readinessProjectionId) ?? null;
  }

  public getLatestReadinessProjection(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppAuditReadinessProjection | null {
    const projections = this.readinessIndex.get(
      this.workspaceAppKey(input.workspaceId, input.providerAppId)
    );
    if (!projections || projections.length === 0) return null;
    return (
      [...projections]
        .map((projectionId) => this.readinessProjections.get(projectionId))
        .filter((projection): projection is TikTokAppAuditReadinessProjection =>
          projection !== undefined
        )
        .sort(
          (left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
        )[0] ?? null
    );
  }

  private workspaceAppKey(workspaceId: string, providerAppId: string): string {
    return `${workspaceId}:${providerAppId}`;
  }

  private auditKey(
    workspaceId: string,
    providerAppId: string,
    configurationRevisionId: string
  ): string {
    return `${workspaceId}:${providerAppId}:${configurationRevisionId}`;
  }

  private requireMigrated(): void {
    if (!this.migrated) {
      throw new Error("TikTok app audit persistence has not been migrated.");
    }
  }
}
