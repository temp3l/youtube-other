import { createHash } from "node:crypto";

import {
  TIKTOK_APP_AUDIT_SCHEMA_VERSION,
  type TikTokAppAuditBlockReason,
  type TikTokAppAuditGateAssessment,
  type TikTokAppAuditOperationAdmission,
  type TikTokAppAuditOperationKind,
  type TikTokAppAuditReadinessProjection,
  type TikTokAppDeveloperConfigurationRevision,
  type TikTokProviderAuditEvidenceRecord,
  tikTokAppAuditGateAssessmentSchema,
  tikTokAppAuditOperationAdmissionSchema,
  tikTokAppAuditReadinessProjectionSchema,
  tikTokAppDeveloperConfigurationRevisionSchema,
  tikTokProviderAuditEvidenceRecordSchema,
} from "./tiktok-app-audit-contracts.js";

const FORBIDDEN_LOCAL_APPROVAL_FIELDS = [
  "providerApproved",
  "providerApprovalClaimed",
  "publicPostingEnabled",
  "auditApproved",
] as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("TikTok app audit domain cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("TikTok app audit domain contains an unsupported value.");
}

export function buildTikTokAppCredentialHandle(input: {
  readonly workspaceId: string;
  readonly providerAppId: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.workspaceId}:${input.providerAppId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `tiktok.app.${digest}`;
}

export function rejectLocalProviderApprovalFabrication(
  value: Record<string, unknown>
): { readonly allowed: boolean; readonly message?: string } {
  for (const field of FORBIDDEN_LOCAL_APPROVAL_FIELDS) {
    if (field in value) {
      return {
        allowed: false,
        message:
          "Local TikTok app configuration cannot fabricate provider audit approval or public-posting capability.",
      };
    }
  }
  return { allowed: true };
}

export function planTikTokAppDeveloperConfigurationRevision(input: {
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
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly recordedAt: string;
}): TikTokAppDeveloperConfigurationRevision {
  const fabrication = rejectLocalProviderApprovalFabrication(
    input as unknown as Record<string, unknown>
  );
  if (!fabrication.allowed) {
    throw new Error(fabrication.message);
  }
  const granted = [...new Set(input.grantedScopes.map((scope) => scope.trim()))].sort();
  const required = [...new Set(input.requiredScopes.map((scope) => scope.trim()))].sort();
  if (!required.every((scope) => granted.includes(scope))) {
    throw new Error("Granted TikTok scopes must cover every required scope.");
  }
  return tikTokAppDeveloperConfigurationRevisionSchema.parse({
    schemaVersion: TIKTOK_APP_AUDIT_SCHEMA_VERSION,
    configurationRevisionId: input.configurationRevisionId,
    workspaceId: input.workspaceId,
    providerAppId: input.providerAppId,
    product: input.product,
    environment: input.environment,
    appCredentialHandle: buildTikTokAppCredentialHandle({
      workspaceId: input.workspaceId,
      providerAppId: input.providerAppId,
    }),
    loginKit: input.loginKit,
    requiredScopes: required,
    grantedScopes: granted,
    contentPosting: input.contentPosting,
    creatorInfoExportUx: input.creatorInfoExportUx,
    consentExportUx: input.consentExportUx,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    state: "active",
    recordedAt: input.recordedAt,
  });
}

export function recordTikTokProviderAuditEvidence(input: {
  readonly auditEvidenceId: string;
  readonly workspaceId: string;
  readonly providerAppId: string;
  readonly configurationRevisionId: string;
  readonly evidenceSource: TikTokProviderAuditEvidenceRecord["evidenceSource"];
  readonly submissionState: Exclude<
    TikTokProviderAuditEvidenceRecord["submissionState"],
    "not_submitted"
  >;
  readonly submissionReference?: string;
  readonly resultEvidenceHash: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
}): TikTokProviderAuditEvidenceRecord {
  return tikTokProviderAuditEvidenceRecordSchema.parse({
    schemaVersion: TIKTOK_APP_AUDIT_SCHEMA_VERSION,
    auditEvidenceId: input.auditEvidenceId,
    workspaceId: input.workspaceId,
    providerAppId: input.providerAppId,
    configurationRevisionId: input.configurationRevisionId,
    evidenceSource: input.evidenceSource,
    submissionState: input.submissionState,
    submissionReference: input.submissionReference,
    resultEvidenceHash: input.resultEvidenceHash,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    state: "active",
  });
}

export function computeTikTokAppAuditFingerprint(input: {
  readonly configurationRevisionId: string;
  readonly auditEvidenceId: string;
  readonly appCredentialHandle: string;
  readonly effectiveAt: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        configurationRevisionId: input.configurationRevisionId,
        auditEvidenceId: input.auditEvidenceId,
        appCredentialHandle: input.appCredentialHandle,
        effectiveAt: input.effectiveAt,
      })
    )
    .digest("hex");
}

function evaluateConfigurationAdmission(input: {
  readonly configuration: TikTokAppDeveloperConfigurationRevision;
  readonly now: string;
}): readonly TikTokAppAuditBlockReason[] {
  const reasons: TikTokAppAuditBlockReason[] = [];
  const nowMs = Date.parse(input.now);
  if (input.configuration.state === "revoked") {
    reasons.push("configuration_revoked");
  }
  if (input.configuration.state === "expired") {
    reasons.push("configuration_expired");
  }
  if (Date.parse(input.configuration.effectiveAt) > nowMs) {
    reasons.push("configuration_missing");
  }
  if (
    input.configuration.expiresAt !== undefined &&
    Date.parse(input.configuration.expiresAt) <= nowMs
  ) {
    reasons.push("configuration_expired");
  }
  if (
    input.configuration.revokedAt !== undefined &&
    Date.parse(input.configuration.revokedAt) <= nowMs
  ) {
    reasons.push("configuration_revoked");
  }
  if (
    !input.configuration.requiredScopes.every((scope) =>
      input.configuration.grantedScopes.includes(scope)
    )
  ) {
    reasons.push("scope_mismatch");
  }
  if (
    input.configuration.loginKit.redirectUriHashes.length === 0 ||
    input.configuration.loginKit.callbackConfigHash.length !== 64
  ) {
    reasons.push("login_kit_incomplete");
  }
  if (!input.configuration.contentPosting.configured) {
    reasons.push("content_posting_unconfigured");
  }
  if (input.configuration.creatorInfoExportUx.reviewEvidenceHash.length !== 64) {
    reasons.push("creator_export_ux_unreviewed");
  }
  if (input.configuration.consentExportUx.reviewEvidenceHash.length !== 64) {
    reasons.push("consent_export_ux_unreviewed");
  }
  return reasons;
}

function evaluateAuditEvidenceAdmission(input: {
  readonly auditEvidence: TikTokProviderAuditEvidenceRecord | null;
  readonly configurationRevisionId: string;
  readonly now: string;
}): readonly TikTokAppAuditBlockReason[] {
  const reasons: TikTokAppAuditBlockReason[] = [];
  if (!input.auditEvidence) {
    reasons.push("audit_evidence_missing");
    return reasons;
  }
  const nowMs = Date.parse(input.now);
  if (input.auditEvidence.state === "revoked") {
    reasons.push("audit_revoked");
  }
  if (input.auditEvidence.state === "expired") {
    reasons.push("audit_expired");
  }
  if (
    input.auditEvidence.expiresAt !== undefined &&
    Date.parse(input.auditEvidence.expiresAt) <= nowMs
  ) {
    reasons.push("audit_expired");
  }
  if (
    input.auditEvidence.revokedAt !== undefined &&
    Date.parse(input.auditEvidence.revokedAt) <= nowMs
  ) {
    reasons.push("audit_revoked");
  }
  if (
    input.auditEvidence.configurationRevisionId !== input.configurationRevisionId
  ) {
    reasons.push("audit_evidence_missing");
  }
  if (input.auditEvidence.submissionState === "provider_pending") {
    reasons.push("audit_pending");
  }
  if (input.auditEvidence.submissionState === "provider_rejected") {
    reasons.push("audit_rejected");
  }
  if (input.auditEvidence.submissionState === "submitted") {
    reasons.push("audit_pending");
  }
  if (input.auditEvidence.submissionState !== "provider_approved") {
    reasons.push("audit_not_provider_evidenced");
  }
  return reasons;
}

export function evaluateTikTokAppAuditGate(input: {
  readonly configuration: TikTokAppDeveloperConfigurationRevision;
  readonly auditEvidence: TikTokProviderAuditEvidenceRecord | null;
  readonly now: string;
}): TikTokAppAuditGateAssessment {
  const blockReasons = [
    ...evaluateConfigurationAdmission({
      configuration: input.configuration,
      now: input.now,
    }),
    ...evaluateAuditEvidenceAdmission({
      auditEvidence: input.auditEvidence,
      configurationRevisionId: input.configuration.configurationRevisionId,
      now: input.now,
    }),
  ];
  const uniqueReasons = [...new Set(blockReasons)];
  const ready = uniqueReasons.length === 0;
  return tikTokAppAuditGateAssessmentSchema.parse({
    ready,
    blockReasons: uniqueReasons,
    permitsLiveOAuth: ready,
    permitsCreatorPreflight: ready,
    permitsDirectPost: ready,
    permitsPublicPosting: false,
  });
}

export function projectTikTokAppAuditReadiness(input: {
  readonly readinessProjectionId: string;
  readonly configuration: TikTokAppDeveloperConfigurationRevision;
  readonly auditEvidence: TikTokProviderAuditEvidenceRecord;
  readonly recordedAt: string;
}): TikTokAppAuditReadinessProjection {
  if (
    input.auditEvidence.configurationRevisionId !==
    input.configuration.configurationRevisionId
  ) {
    throw new Error("TikTok app audit readiness requires matching configuration revision.");
  }
  const gateAssessment = evaluateTikTokAppAuditGate({
    configuration: input.configuration,
    auditEvidence: input.auditEvidence,
    now: input.recordedAt,
  });
  const effectiveAt =
    Date.parse(input.configuration.effectiveAt) >
    Date.parse(input.auditEvidence.effectiveAt)
      ? input.configuration.effectiveAt
      : input.auditEvidence.effectiveAt;
  const expiresAt = [input.configuration.expiresAt, input.auditEvidence.expiresAt]
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
  return tikTokAppAuditReadinessProjectionSchema.parse({
    schemaVersion: TIKTOK_APP_AUDIT_SCHEMA_VERSION,
    readinessProjectionId: input.readinessProjectionId,
    workspaceId: input.configuration.workspaceId,
    providerAppId: input.configuration.providerAppId,
    configurationRevisionId: input.configuration.configurationRevisionId,
    auditEvidenceId: input.auditEvidence.auditEvidenceId,
    appCredentialHandle: input.configuration.appCredentialHandle,
    fingerprint: computeTikTokAppAuditFingerprint({
      configurationRevisionId: input.configuration.configurationRevisionId,
      auditEvidenceId: input.auditEvidence.auditEvidenceId,
      appCredentialHandle: input.configuration.appCredentialHandle,
      effectiveAt,
    }),
    effectiveAt,
    expiresAt,
    state: "active",
    recordedAt: input.recordedAt,
    gateAssessment,
  });
}

export function evaluateTikTokAppAuditOperationAdmission(input: {
  readonly operation: TikTokAppAuditOperationKind;
  readonly readiness: TikTokAppAuditReadinessProjection | null;
  readonly now: string;
}): TikTokAppAuditOperationAdmission {
  const blockReasons: TikTokAppAuditBlockReason[] = [];
  if (!input.readiness) {
    blockReasons.push("configuration_missing", "audit_evidence_missing");
    return tikTokAppAuditOperationAdmissionSchema.parse({
      allowed: false,
      operation: input.operation,
      blockReasons,
    });
  }
  const nowMs = Date.parse(input.now);
  if (input.readiness.state === "revoked") {
    blockReasons.push("readiness_revoked");
  }
  if (input.readiness.state === "expired") {
    blockReasons.push("readiness_expired");
  }
  if (
    input.readiness.expiresAt !== undefined &&
    Date.parse(input.readiness.expiresAt) <= nowMs
  ) {
    blockReasons.push("readiness_expired");
  }
  if (
    input.readiness.revokedAt !== undefined &&
    Date.parse(input.readiness.revokedAt) <= nowMs
  ) {
    blockReasons.push("readiness_revoked");
  }
  blockReasons.push(...input.readiness.gateAssessment.blockReasons);
  const uniqueReasons = [...new Set(blockReasons)];
  const permitsOperation =
    input.operation === "live_oauth"
      ? input.readiness.gateAssessment.permitsLiveOAuth
      : input.operation === "creator_preflight"
        ? input.readiness.gateAssessment.permitsCreatorPreflight
        : input.readiness.gateAssessment.permitsDirectPost;
  return tikTokAppAuditOperationAdmissionSchema.parse({
    allowed: uniqueReasons.length === 0 && permitsOperation,
    operation: input.operation,
    readinessProjectionId: input.readiness.readinessProjectionId,
    blockReasons: uniqueReasons,
  });
}
