import { describe, expect, it } from "vitest";

import {
  buildTikTokAppCredentialHandle,
  evaluateTikTokAppAuditGate,
  evaluateTikTokAppAuditOperationAdmission,
  planTikTokAppDeveloperConfigurationRevision,
  projectTikTokAppAuditReadiness,
  recordTikTokProviderAuditEvidence,
  rejectLocalProviderApprovalFabrication,
} from "./tiktok-app-audit-lifecycle.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const uxHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const callbackHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const redirectHash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const contentPostingHash =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const auditResultHash =
  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function buildConfiguration() {
  return planTikTokAppDeveloperConfigurationRevision({
    configurationRevisionId: "tiktok.app.config.001",
    workspaceId: "workspace.microdrama.001",
    providerAppId: "tiktok.app.fixture.001",
    product: "content_posting_api",
    environment: "sandbox",
    loginKit: {
      callbackConfigHash: callbackHash,
      redirectUriHashes: [redirectHash],
    },
    requiredScopes: ["user.info.basic", "video.publish"],
    grantedScopes: ["user.info.basic", "video.publish"],
    contentPosting: {
      configured: true,
      configurationHash: contentPostingHash,
    },
    creatorInfoExportUx: {
      runbookVersion: "tiktok-app-audit-readiness.v1",
      reviewEvidenceHash: uxHash,
      reviewedAt: evaluatedAt,
    },
    consentExportUx: {
      runbookVersion: "tiktok-app-audit-readiness.v1",
      reviewEvidenceHash: uxHash,
      reviewedAt: evaluatedAt,
    },
    effectiveAt: evaluatedAt,
    recordedAt: evaluatedAt,
  });
}

describe("tiktok app audit lifecycle", () => {
  it("rejects local fabrication of provider approval fields", () => {
    expect(
      rejectLocalProviderApprovalFabrication({
        providerApproved: true,
      }).allowed
    ).toBe(false);
    expect(() =>
      planTikTokAppDeveloperConfigurationRevision({
        ...buildConfiguration(),
        configurationRevisionId: "tiktok.app.config.fabricated",
      } as never)
    ).not.toThrow();
  });

  it("requires granted scopes to cover required scopes", () => {
    expect(() =>
      planTikTokAppDeveloperConfigurationRevision({
        configurationRevisionId: "tiktok.app.config.scope-mismatch",
        workspaceId: "workspace.microdrama.001",
        providerAppId: "tiktok.app.fixture.001",
        product: "login_kit",
        environment: "sandbox",
        loginKit: {
          callbackConfigHash: callbackHash,
          redirectUriHashes: [redirectHash],
        },
        requiredScopes: ["user.info.basic", "video.publish"],
        grantedScopes: ["user.info.basic"],
        contentPosting: {
          configured: false,
          configurationHash: contentPostingHash,
        },
        creatorInfoExportUx: {
          runbookVersion: "tiktok-app-audit-readiness.v1",
          reviewEvidenceHash: uxHash,
          reviewedAt: evaluatedAt,
        },
        consentExportUx: {
          runbookVersion: "tiktok-app-audit-readiness.v1",
          reviewEvidenceHash: uxHash,
          reviewedAt: evaluatedAt,
        },
        effectiveAt: evaluatedAt,
        recordedAt: evaluatedAt,
      })
    ).toThrow(/required scope/i);
  });

  it("blocks operations until provider-evidenced audit approval exists", () => {
    const configuration = buildConfiguration();
    const blocked = evaluateTikTokAppAuditGate({
      configuration,
      auditEvidence: null,
      now: evaluatedAt,
    });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockReasons).toContain("audit_evidence_missing");
    expect(blocked.permitsPublicPosting).toBe(false);

    const pendingAudit = recordTikTokProviderAuditEvidence({
      auditEvidenceId: "tiktok.app.audit.pending",
      workspaceId: configuration.workspaceId,
      providerAppId: configuration.providerAppId,
      configurationRevisionId: configuration.configurationRevisionId,
      evidenceSource: "provider_portal_export",
      submissionState: "provider_pending",
      resultEvidenceHash: auditResultHash,
      recordedBy: "operator.001",
      recordedAt: evaluatedAt,
      effectiveAt: evaluatedAt,
    });
    const pending = evaluateTikTokAppAuditGate({
      configuration,
      auditEvidence: pendingAudit,
      now: evaluatedAt,
    });
    expect(pending.ready).toBe(false);
    expect(pending.blockReasons).toContain("audit_pending");
  });

  it("permits bounded operations only with active provider-approved audit evidence", () => {
    const configuration = buildConfiguration();
    const auditEvidence = recordTikTokProviderAuditEvidence({
      auditEvidenceId: "tiktok.app.audit.001",
      workspaceId: configuration.workspaceId,
      providerAppId: configuration.providerAppId,
      configurationRevisionId: configuration.configurationRevisionId,
      evidenceSource: "operator_canary_evidence",
      submissionState: "provider_approved",
      submissionReference: "provider.submission.fixture.001",
      resultEvidenceHash: auditResultHash,
      recordedBy: "operator.001",
      recordedAt: evaluatedAt,
      effectiveAt: evaluatedAt,
    });
    const readiness = projectTikTokAppAuditReadiness({
      readinessProjectionId: "tiktok.app.readiness.001",
      configuration,
      auditEvidence,
      recordedAt: evaluatedAt,
    });
    expect(readiness.gateAssessment.ready).toBe(true);
    expect(readiness.appCredentialHandle).toBe(
      buildTikTokAppCredentialHandle({
        workspaceId: configuration.workspaceId,
        providerAppId: configuration.providerAppId,
      })
    );
    expect(
      evaluateTikTokAppAuditOperationAdmission({
        operation: "live_oauth",
        readiness,
        now: evaluatedAt,
      }).allowed
    ).toBe(true);
    expect(
      evaluateTikTokAppAuditOperationAdmission({
        operation: "direct_post",
        readiness,
        now: evaluatedAt,
      }).allowed
    ).toBe(true);
    expect(readiness.gateAssessment.permitsPublicPosting).toBe(false);
  });
});
