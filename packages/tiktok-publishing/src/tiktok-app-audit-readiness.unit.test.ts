import { describe, expect, it } from "vitest";

import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";
import { FakeMicrodramaTikTokAppAuditRepository } from "../../persistence/src/microdrama-tiktok-app-audit-fake-repository.js";
import readyFixture from "./fixtures/tiktok-app-audit-ready.fixture.json" with {
  type: "json",
};
import pendingFixture from "./fixtures/tiktok-app-audit-pending.fixture.json" with {
  type: "json",
};

describe("tiktok app audit readiness", () => {
  it("blocks live oauth, creator preflight and direct post without provider-approved audit evidence", () => {
    const repository = new FakeMicrodramaTikTokAppAuditRepository();
    repository.migrateTikTokAppAudit();
    const service = new TikTokAppAuditApplicationService({ port: repository });
    const bundle = service.recordReadinessBundle(pendingFixture);
    expect(bundle.readiness.gateAssessment.ready).toBe(false);
    expect(bundle.readiness.gateAssessment.blockReasons).toContain("audit_pending");
    for (const operation of [
      "live_oauth",
      "creator_preflight",
      "direct_post",
    ] as const) {
      expect(
        service.evaluateOperationAdmission({
          operation,
          workspaceId: pendingFixture.workspaceId,
          providerAppId: pendingFixture.providerAppId,
          now: pendingFixture.recordedAt,
        }).allowed
      ).toBe(false);
    }
    expect(bundle.readiness.gateAssessment.permitsPublicPosting).toBe(false);
  });

  it("records immutable readiness with opaque app credential handles only", () => {
    const repository = new FakeMicrodramaTikTokAppAuditRepository();
    repository.migrateTikTokAppAudit();
    const service = new TikTokAppAuditApplicationService({ port: repository });
    const bundle = service.recordReadinessBundle(readyFixture);
    expect(bundle.readiness.appCredentialHandle).toMatch(/^tiktok\.app\./);
    expect(bundle.readiness.appCredentialHandle).not.toContain("secret");
    expect(bundle.readiness.fingerprint).toHaveLength(64);
    expect(bundle.readiness.gateAssessment.ready).toBe(true);
    expect(
      service.evaluateOperationAdmission({
        operation: "live_oauth",
        workspaceId: readyFixture.workspaceId,
        providerAppId: readyFixture.providerAppId,
        now: readyFixture.recordedAt,
      }).allowed
    ).toBe(true);
    expect(bundle.readiness.gateAssessment.permitsPublicPosting).toBe(false);
  });

  it("rejects local configuration that tries to claim provider approval", () => {
    const repository = new FakeMicrodramaTikTokAppAuditRepository();
    repository.migrateTikTokAppAudit();
    const service = new TikTokAppAuditApplicationService({ port: repository });
    expect(() =>
      service.recordReadinessBundle({
        ...readyFixture,
        readinessProjectionId: "tiktok.app.readiness.fabricated",
        configurationRevisionId: "tiktok.app.config.fabricated",
        auditEvidenceId: "tiktok.app.audit.fabricated",
        auditSubmissionState: "provider_approved",
        auditResultEvidenceHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        providerApproved: true,
      } as never)
    ).toThrow();
  });
});
