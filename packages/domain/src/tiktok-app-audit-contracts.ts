import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const TIKTOK_APP_AUDIT_SCHEMA_VERSION =
  "mediaforge.tiktok-app-audit.v1" as const;

export const TIKTOK_DEVELOPER_APP_PRODUCTS = [
  "login_kit",
  "content_posting_api",
] as const;
export const tikTokDeveloperAppProductSchema = z.enum(TIKTOK_DEVELOPER_APP_PRODUCTS);
export type TikTokDeveloperAppProduct = z.infer<
  typeof tikTokDeveloperAppProductSchema
>;

export const TIKTOK_APP_AUDIT_ENVIRONMENTS = ["sandbox", "production"] as const;
export const tikTokAppAuditEnvironmentSchema = z.enum(TIKTOK_APP_AUDIT_ENVIRONMENTS);
export type TikTokAppAuditEnvironment = z.infer<
  typeof tikTokAppAuditEnvironmentSchema
>;

export const TIKTOK_APP_CONFIGURATION_REVISION_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const tikTokAppConfigurationRevisionStateSchema = z.enum(
  TIKTOK_APP_CONFIGURATION_REVISION_STATES
);
export type TikTokAppConfigurationRevisionState = z.infer<
  typeof tikTokAppConfigurationRevisionStateSchema
>;

export const TIKTOK_PROVIDER_AUDIT_EVIDENCE_SOURCES = [
  "provider_portal_export",
  "operator_canary_evidence",
] as const;
export const tikTokProviderAuditEvidenceSourceSchema = z.enum(
  TIKTOK_PROVIDER_AUDIT_EVIDENCE_SOURCES
);
export type TikTokProviderAuditEvidenceSource = z.infer<
  typeof tikTokProviderAuditEvidenceSourceSchema
>;

export const TIKTOK_PROVIDER_AUDIT_SUBMISSION_STATES = [
  "not_submitted",
  "submitted",
  "provider_approved",
  "provider_rejected",
  "provider_pending",
] as const;
export const tikTokProviderAuditSubmissionStateSchema = z.enum(
  TIKTOK_PROVIDER_AUDIT_SUBMISSION_STATES
);
export type TikTokProviderAuditSubmissionState = z.infer<
  typeof tikTokProviderAuditSubmissionStateSchema
>;

export const TIKTOK_PROVIDER_AUDIT_EVIDENCE_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const tikTokProviderAuditEvidenceStateSchema = z.enum(
  TIKTOK_PROVIDER_AUDIT_EVIDENCE_STATES
);
export type TikTokProviderAuditEvidenceState = z.infer<
  typeof tikTokProviderAuditEvidenceStateSchema
>;

export const TIKTOK_APP_AUDIT_READINESS_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const tikTokAppAuditReadinessStateSchema = z.enum(
  TIKTOK_APP_AUDIT_READINESS_STATES
);
export type TikTokAppAuditReadinessState = z.infer<
  typeof tikTokAppAuditReadinessStateSchema
>;

export const TIKTOK_APP_AUDIT_OPERATION_KINDS = [
  "live_oauth",
  "creator_preflight",
  "direct_post",
] as const;
export const tikTokAppAuditOperationKindSchema = z.enum(
  TIKTOK_APP_AUDIT_OPERATION_KINDS
);
export type TikTokAppAuditOperationKind = z.infer<
  typeof tikTokAppAuditOperationKindSchema
>;

export const TIKTOK_APP_AUDIT_BLOCK_REASONS = [
  "configuration_missing",
  "configuration_revoked",
  "configuration_expired",
  "scope_mismatch",
  "login_kit_incomplete",
  "content_posting_unconfigured",
  "creator_export_ux_unreviewed",
  "consent_export_ux_unreviewed",
  "audit_evidence_missing",
  "audit_not_provider_evidenced",
  "audit_pending",
  "audit_rejected",
  "audit_expired",
  "audit_revoked",
  "readiness_revoked",
  "readiness_expired",
  "local_approval_fabrication_rejected",
  "public_posting_not_evidenced",
] as const;
export const tikTokAppAuditBlockReasonSchema = z.enum(TIKTOK_APP_AUDIT_BLOCK_REASONS);
export type TikTokAppAuditBlockReason = z.infer<typeof tikTokAppAuditBlockReasonSchema>;

export const tikTokLoginKitConfigurationSchema = z
  .object({
    callbackConfigHash: sha256Schema,
    redirectUriHashes: z.array(sha256Schema).min(1),
  })
  .strict();
export type TikTokLoginKitConfiguration = z.infer<
  typeof tikTokLoginKitConfigurationSchema
>;

export const tikTokContentPostingConfigurationSchema = z
  .object({
    configured: z.boolean(),
    configurationHash: sha256Schema,
  })
  .strict();
export type TikTokContentPostingConfiguration = z.infer<
  typeof tikTokContentPostingConfigurationSchema
>;

export const tikTokUxReviewEvidenceSchema = z
  .object({
    runbookVersion: nonEmptyStringSchema.max(80),
    reviewEvidenceHash: sha256Schema,
    reviewedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokUxReviewEvidence = z.infer<typeof tikTokUxReviewEvidenceSchema>;

export const tikTokAppDeveloperConfigurationRevisionSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_APP_AUDIT_SCHEMA_VERSION),
    configurationRevisionId: identifierSchema,
    workspaceId: identifierSchema,
    providerAppId: identifierSchema,
    product: tikTokDeveloperAppProductSchema,
    environment: tikTokAppAuditEnvironmentSchema,
    appCredentialHandle: identifierSchema,
    loginKit: tikTokLoginKitConfigurationSchema,
    requiredScopes: z.array(nonEmptyStringSchema).min(1),
    grantedScopes: z.array(nonEmptyStringSchema).min(1),
    contentPosting: tikTokContentPostingConfigurationSchema,
    creatorInfoExportUx: tikTokUxReviewEvidenceSchema,
    consentExportUx: tikTokUxReviewEvidenceSchema,
    effectiveAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
    state: tikTokAppConfigurationRevisionStateSchema,
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokAppDeveloperConfigurationRevision = z.infer<
  typeof tikTokAppDeveloperConfigurationRevisionSchema
>;

export const tikTokProviderAuditEvidenceRecordSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_APP_AUDIT_SCHEMA_VERSION),
    auditEvidenceId: identifierSchema,
    workspaceId: identifierSchema,
    providerAppId: identifierSchema,
    configurationRevisionId: identifierSchema,
    evidenceSource: tikTokProviderAuditEvidenceSourceSchema,
    submissionState: tikTokProviderAuditSubmissionStateSchema,
    submissionReference: identifierSchema.optional(),
    resultEvidenceHash: sha256Schema,
    recordedBy: identifierSchema,
    recordedAt: isoDateTimeSchema,
    effectiveAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
    state: tikTokProviderAuditEvidenceStateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.submissionState === "provider_approved" &&
      value.resultEvidenceHash.length !== 64
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resultEvidenceHash"],
        message: "Provider-approved audit evidence requires a result hash.",
      });
    }
    if (
      value.submissionState === "not_submitted" &&
      value.evidenceSource !== undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["submissionState"],
        message: "Provider audit evidence cannot remain not_submitted once recorded.",
      });
    }
  });
export type TikTokProviderAuditEvidenceRecord = z.infer<
  typeof tikTokProviderAuditEvidenceRecordSchema
>;

export const tikTokAppAuditGateAssessmentSchema = z
  .object({
    ready: z.boolean(),
    blockReasons: z.array(tikTokAppAuditBlockReasonSchema),
    permitsLiveOAuth: z.boolean(),
    permitsCreatorPreflight: z.boolean(),
    permitsDirectPost: z.boolean(),
    permitsPublicPosting: z.boolean(),
  })
  .strict();
export type TikTokAppAuditGateAssessment = z.infer<
  typeof tikTokAppAuditGateAssessmentSchema
>;

export const tikTokAppAuditReadinessProjectionSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_APP_AUDIT_SCHEMA_VERSION),
    readinessProjectionId: identifierSchema,
    workspaceId: identifierSchema,
    providerAppId: identifierSchema,
    configurationRevisionId: identifierSchema,
    auditEvidenceId: identifierSchema,
    appCredentialHandle: identifierSchema,
    fingerprint: sha256Schema,
    effectiveAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
    state: tikTokAppAuditReadinessStateSchema,
    recordedAt: isoDateTimeSchema,
    gateAssessment: tikTokAppAuditGateAssessmentSchema,
  })
  .strict();
export type TikTokAppAuditReadinessProjection = z.infer<
  typeof tikTokAppAuditReadinessProjectionSchema
>;

export const tikTokAppAuditOperationAdmissionSchema = z
  .object({
    allowed: z.boolean(),
    operation: tikTokAppAuditOperationKindSchema,
    readinessProjectionId: identifierSchema.optional(),
    blockReasons: z.array(tikTokAppAuditBlockReasonSchema),
  })
  .strict();
export type TikTokAppAuditOperationAdmission = z.infer<
  typeof tikTokAppAuditOperationAdmissionSchema
>;

export function validateTikTokAppDeveloperConfigurationRevision(
  value: unknown
): TikTokAppDeveloperConfigurationRevision {
  return tikTokAppDeveloperConfigurationRevisionSchema.parse(value);
}

export function validateTikTokProviderAuditEvidenceRecord(
  value: unknown
): TikTokProviderAuditEvidenceRecord {
  return tikTokProviderAuditEvidenceRecordSchema.parse(value);
}

export function validateTikTokAppAuditReadinessProjection(
  value: unknown
): TikTokAppAuditReadinessProjection {
  return tikTokAppAuditReadinessProjectionSchema.parse(value);
}
