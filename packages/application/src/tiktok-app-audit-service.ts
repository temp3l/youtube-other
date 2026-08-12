import {
  evaluateTikTokAppAuditOperationAdmission,
  type TikTokAppAuditOperationAdmission,
  type TikTokAppAuditOperationKind,
  type TikTokAppAuditReadinessProjection,
  type TikTokAppDeveloperConfigurationRevision,
  type TikTokProviderAuditEvidenceRecord,
} from "@mediaforge/domain";
import {
  projectTikTokAppAuditReadinessBundle,
  type ProjectTikTokAppAuditReadinessBundleInput,
  type ProjectTikTokAppAuditReadinessBundleResult,
} from "@mediaforge/tiktok-publishing";

export type TikTokAppAuditApplicationPort = {
  migrateTikTokAppAudit(): void;
  recordConfigurationRevision(input: {
    readonly configuration: TikTokAppDeveloperConfigurationRevision;
  }): TikTokAppDeveloperConfigurationRevision;
  recordProviderAuditEvidence(input: {
    readonly auditEvidence: TikTokProviderAuditEvidenceRecord;
  }): TikTokProviderAuditEvidenceRecord;
  saveReadinessProjection(input: {
    readonly readiness: TikTokAppAuditReadinessProjection;
  }): TikTokAppAuditReadinessProjection;
  getLatestReadinessProjection(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppAuditReadinessProjection | null;
};

export type TikTokAppAuditApplicationServiceInput = {
  readonly port: TikTokAppAuditApplicationPort;
};

export class TikTokAppAuditApplicationService {
  public constructor(private readonly input: TikTokAppAuditApplicationServiceInput) {}

  public migrate(): void {
    this.input.port.migrateTikTokAppAudit();
  }

  public recordReadinessBundle(
    input: ProjectTikTokAppAuditReadinessBundleInput
  ): ProjectTikTokAppAuditReadinessBundleResult {
    const bundle = projectTikTokAppAuditReadinessBundle(input);
    this.input.port.recordConfigurationRevision({
      configuration: bundle.configuration,
    });
    this.input.port.recordProviderAuditEvidence({
      auditEvidence: bundle.auditEvidence,
    });
    this.input.port.saveReadinessProjection({
      readiness: bundle.readiness,
    });
    return bundle;
  }

  public getLatestReadiness(input: {
    readonly workspaceId: string;
    readonly providerAppId: string;
  }): TikTokAppAuditReadinessProjection | null {
    return this.input.port.getLatestReadinessProjection(input);
  }

  public evaluateOperationAdmission(input: {
    readonly operation: TikTokAppAuditOperationKind;
    readonly workspaceId: string;
    readonly providerAppId: string;
    readonly now: string;
  }): TikTokAppAuditOperationAdmission {
    const readiness = this.input.port.getLatestReadinessProjection({
      workspaceId: input.workspaceId,
      providerAppId: input.providerAppId,
    });
    return evaluateTikTokAppAuditOperationAdmission({
      operation: input.operation,
      readiness,
      now: input.now,
    });
  }
}
