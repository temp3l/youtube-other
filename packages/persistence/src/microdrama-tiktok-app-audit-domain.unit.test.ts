import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";

import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";
import { FakeMicrodramaTikTokAppAuditRepository } from "./microdrama-tiktok-app-audit-fake-repository.js";
import { MicrodramaTikTokAppAuditRepository } from "./microdrama-tiktok-app-audit-repository.js";
import { MICRODRAMA_SQLITE_MIGRATION } from "./microdrama-sqlite-schema.js";
import readyFixture from "../../tiktok-publishing/src/fixtures/tiktok-app-audit-ready.fixture.json" with {
  type: "json",
};

describe("microdrama tiktok app audit persistence", () => {
  it("persists configuration, audit evidence and readiness projections", () => {
    const fake = new FakeMicrodramaTikTokAppAuditRepository();
    fake.migrateTikTokAppAudit();
    const fakeService = new TikTokAppAuditApplicationService({ port: fake });
    const bundle = fakeService.recordReadinessBundle(readyFixture);
    expect(fake.getConfigurationRevision(bundle.configuration.configurationRevisionId))
      .not.toBeNull();
    expect(fake.getProviderAuditEvidence(bundle.auditEvidence.auditEvidenceId)).not.toBeNull();
    expect(fake.getReadinessProjection(bundle.readiness.readinessProjectionId)).not.toBeNull();
  });

  it("round-trips readiness evidence through sqlite", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(MICRODRAMA_SQLITE_MIGRATION);
    const repository = new MicrodramaTikTokAppAuditRepository({ database });
    repository.migrateTikTokAppAudit();
    const service = new TikTokAppAuditApplicationService({ port: repository });
    const bundle = service.recordReadinessBundle(readyFixture);
    expect(
      repository.getConfigurationRevision(bundle.configuration.configurationRevisionId)
        ?.configurationRevisionId
    ).toBe(bundle.configuration.configurationRevisionId);
    expect(
      repository.getProviderAuditEvidence(bundle.auditEvidence.auditEvidenceId)
        ?.auditEvidenceId
    ).toBe(bundle.auditEvidence.auditEvidenceId);
    expect(
      repository.getReadinessProjection(bundle.readiness.readinessProjectionId)?.fingerprint
    ).toBe(bundle.readiness.fingerprint);
  });
});
