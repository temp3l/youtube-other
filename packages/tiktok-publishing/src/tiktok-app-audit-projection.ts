import {
  planTikTokAppDeveloperConfigurationRevision,
  projectTikTokAppAuditReadiness,
  recordTikTokProviderAuditEvidence,
  rejectLocalProviderApprovalFabrication,
  type TikTokAppAuditReadinessProjection,
  type TikTokAppDeveloperConfigurationRevision,
  type TikTokProviderAuditEvidenceRecord,
} from "@mediaforge/domain";

export type ProjectTikTokAppAuditReadinessBundleInput = {
  readonly readinessProjectionId: string;
  readonly configurationRevisionId: string;
  readonly workspaceId: string;
  readonly providerAppId: string;
  readonly product: TikTokAppDeveloperConfigurationRevision["product"];
  readonly environment: TikTokAppDeveloperConfigurationRevision["environment"];
  readonly loginKit: TikTokAppDeveloperConfigurationRevision["loginKit"];
  readonly requiredScopes: readonly string[];
  readonly grantedScopes: readonly string[];
  readonly contentPosting: TikTokAppDeveloperConfigurationRevision["contentPosting"];
  readonly creatorInfoExportUx: TikTokAppDeveloperConfigurationRevision["creatorInfoExportUx"];
  readonly consentExportUx: TikTokAppDeveloperConfigurationRevision["consentExportUx"];
  readonly configurationEffectiveAt: string;
  readonly configurationExpiresAt?: string;
  readonly auditEvidenceId: string;
  readonly auditEvidenceSource: TikTokProviderAuditEvidenceRecord["evidenceSource"];
  readonly auditSubmissionState: Exclude<
    TikTokProviderAuditEvidenceRecord["submissionState"],
    "not_submitted"
  >;
  readonly auditSubmissionReference?: string;
  readonly auditResultEvidenceHash: string;
  readonly auditRecordedBy: string;
  readonly auditEffectiveAt: string;
  readonly auditExpiresAt?: string;
  readonly recordedAt: string;
};

export type ProjectTikTokAppAuditReadinessBundleResult = {
  readonly configuration: TikTokAppDeveloperConfigurationRevision;
  readonly auditEvidence: TikTokProviderAuditEvidenceRecord;
  readonly readiness: TikTokAppAuditReadinessProjection;
};

export function projectTikTokAppAuditReadinessBundle(
  input: ProjectTikTokAppAuditReadinessBundleInput
): ProjectTikTokAppAuditReadinessBundleResult {
  const fabrication = rejectLocalProviderApprovalFabrication(
    input as unknown as Record<string, unknown>
  );
  if (!fabrication.allowed) {
    throw new Error(fabrication.message);
  }
  const configuration = planTikTokAppDeveloperConfigurationRevision({
    configurationRevisionId: input.configurationRevisionId,
    workspaceId: input.workspaceId,
    providerAppId: input.providerAppId,
    product: input.product,
    environment: input.environment,
    loginKit: input.loginKit,
    requiredScopes: input.requiredScopes,
    grantedScopes: input.grantedScopes,
    contentPosting: input.contentPosting,
    creatorInfoExportUx: input.creatorInfoExportUx,
    consentExportUx: input.consentExportUx,
    effectiveAt: input.configurationEffectiveAt,
    expiresAt: input.configurationExpiresAt,
    recordedAt: input.recordedAt,
  });
  const auditEvidence = recordTikTokProviderAuditEvidence({
    auditEvidenceId: input.auditEvidenceId,
    workspaceId: input.workspaceId,
    providerAppId: input.providerAppId,
    configurationRevisionId: configuration.configurationRevisionId,
    evidenceSource: input.auditEvidenceSource,
    submissionState: input.auditSubmissionState,
    submissionReference: input.auditSubmissionReference,
    resultEvidenceHash: input.auditResultEvidenceHash,
    recordedBy: input.auditRecordedBy,
    recordedAt: input.recordedAt,
    effectiveAt: input.auditEffectiveAt,
    expiresAt: input.auditExpiresAt,
  });
  const readiness = projectTikTokAppAuditReadiness({
    readinessProjectionId: input.readinessProjectionId,
    configuration,
    auditEvidence,
    recordedAt: input.recordedAt,
  });
  return { configuration, auditEvidence, readiness };
}
