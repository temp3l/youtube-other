import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";

import { MicrodramaPublicationSchedulingService } from "../../application/src/microdrama-publication-scheduling-service.js";
import { planPublicationIntent } from "@mediaforge/domain";
import { FakeMicrodramaPublicationRepository } from "./microdrama-publication-fake-repository.js";
import { FakeMicrodramaPublicationSchedulingRepository } from "./microdrama-publication-scheduling-fake-repository.js";
import { MicrodramaPublicationSchedulingRepository } from "./microdrama-publication-scheduling-repository.js";
import { MICRODRAMA_SQLITE_MIGRATION } from "./microdrama-sqlite-schema.js";
import { MICRODRAMA_PUBLICATION_SQLITE_MIGRATION } from "./microdrama-publication-schema.js";
import { MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION } from "./microdrama-tiktok-app-audit-schema.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const scheduledUtc = "2026-08-15T14:00:00.000Z";
const localScheduledAt = "2026-08-15T10:00:00-04:00";
const renderHash = "a".repeat(64);
const manifestHash = "b".repeat(64);
const evidenceHash = "c".repeat(64);
const capabilityHash = "d".repeat(64);

function createPublicationFixture() {
  const publicationRepository = new FakeMicrodramaPublicationRepository();
  publicationRepository.migratePublication();

  const targetProfile = publicationRepository.upsertTargetProfile({
    profile: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      profileId: "profile.series001.en-us.tiktok",
      seriesId: "series.001",
      locale: "en-US",
      provider: "tiktok",
      providerAccountId: "tiktok.account.001",
      credentialVersion: "cred.v1",
      metadataProfileId: "meta.profile.en-us",
      scheduleProfileId: "schedule.profile.en-us",
      enabled: true,
      registeredAt: evaluatedAt,
    },
  });

  const consent = publicationRepository.recordConsentRevision({
    consent: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      consentRevisionId: "consent.rev.001",
      subjectId: "creator.001",
      rightsholderId: "rightsholder.001",
      evidenceHash,
      evidenceSource: "operator-attestation",
      permittedMedia: ["video"],
      permittedUse: ["publish"],
      permittedLocale: "en-US",
      permittedProvider: "tiktok",
      permittedTerritory: "US",
      effectiveAt: "2026-08-12T00:00:00.000Z",
      state: "active",
      recordedAt: evaluatedAt,
    },
  });

  const exportApproval = publicationRepository.recordExportApprovalRevision({
    exportApproval: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      exportApprovalRevisionId: "export.approval.001",
      consentRevisionId: consent.consentRevisionId,
      creatorCapabilityEvidenceHash: capabilityHash,
      providerAccountId: targetProfile.providerAccountId,
      renderHash,
      artifactManifestHash: manifestHash,
      metadataRevisionId: "meta.rev.001",
      privacy: "private",
      interactionSettings: {
        allowComments: false,
        allowDuet: false,
        allowStitch: false,
      },
      aiContentDeclared: true,
      commercialContentDeclared: false,
      operatorId: "operator.001",
      approvedAt: evaluatedAt,
      state: "active",
    },
  });

  const binding = {
    provider: "tiktok" as const,
    providerAccountId: targetProfile.providerAccountId,
    credentialVersion: targetProfile.credentialVersion,
    episodeId: "episode.001",
    episodeRevisionId: "rev.episode.001",
    locale: "en-US",
    renderHash,
    metadataRevisionId: "meta.rev.001",
    consentRevisionId: consent.consentRevisionId,
    exportApprovalRevisionId: exportApproval.exportApprovalRevisionId,
    privacy: "private" as const,
    interactionSettings: {
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    },
    aiContentDeclared: true,
    commercialContentDeclared: false,
  };

  return {
    publicationRepository,
    targetProfile,
    consent,
    exportApproval,
    binding,
  };
}

describe("microdrama publication scheduling persistence", () => {
  it("schedules, records consent, cancels, and gates dispatch without providers", () => {
    const { publicationRepository, targetProfile, consent, exportApproval, binding } =
      createPublicationFixture();
    const schedulingRepository = new FakeMicrodramaPublicationSchedulingRepository();
    schedulingRepository.migratePublicationScheduling();
    const service = new MicrodramaPublicationSchedulingService({
      port: schedulingRepository,
    });

    service.registerAudienceTimezoneProfile({
      profile: {
        schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
        profileId: "audience.series001.en-us",
        seriesId: "series.001",
        locale: "en-US",
        audienceTimezone: "America/New_York",
        registeredAt: evaluatedAt,
      },
    });

    const approved = publicationRepository.planAndApproveIntent({
      intentId: "intent.schedule.001",
      targetProfile,
      binding,
      dispatchMode: "preapproved_scheduled",
      idempotencyKey: "idempotency.schedule.001",
      exportApproval,
      consent,
      createdAt: evaluatedAt,
    });
    const scheduledIntent = publicationRepository.saveIntent({
      intent: {
        ...approved,
        scheduledAt: scheduledUtc,
      },
    });

    const { schedule } = service.scheduleIntent({
      scheduleId: "schedule.001",
      intent: scheduledIntent,
      seriesId: "series.001",
      locale: "en-US",
      localScheduledAt,
      now: evaluatedAt,
    });
    expect(schedule.scheduledAtUtc).toBe(scheduledUtc);
    expect(schedule.audienceTimezone).toBe("America/New_York");

    service.recordScheduleConsent({
      consentRecordId: "schedule.consent.001",
      scheduleId: schedule.scheduleId,
      intent: scheduledIntent,
      operatorId: "operator.001",
      consentedAt: evaluatedAt,
    });

    schedulingRepository.seedAuditReadinessProjection({
      schemaVersion: "mediaforge.tiktok-app-audit.v1",
      readinessProjectionId: "tiktok.readiness.001",
      workspaceId: "workspace.001",
      providerAppId: "tiktok.app.001",
      configurationRevisionId: "config.rev.001",
      auditEvidenceId: "audit.evidence.001",
      appCredentialHandle: "tiktok.app.handle",
      fingerprint: "e".repeat(64),
      effectiveAt: "2026-08-12T00:00:00.000Z",
      state: "active",
      recordedAt: evaluatedAt,
      gateAssessment: {
        ready: true,
        blockReasons: [],
        permitsLiveOAuth: true,
        permitsCreatorPreflight: true,
        permitsDirectPost: true,
        permitsPublicPosting: false,
      },
    });
    service.registerSchedulePolicy({
      policy: {
        schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
        policyId: "policy.001",
        seriesId: "series.001",
        provider: "tiktok",
        locale: "en-US",
        providerAccountId: "tiktok.account.001",
        manualDispatchEnabled: true,
        preapprovedScheduledEnabled: true,
        tiktokAuditReadinessProjectionId: "tiktok.readiness.001",
        maxScheduleHorizonHours: 168,
        registeredAt: evaluatedAt,
        updatedAt: evaluatedAt,
      },
    });

    const blockedWithoutEnablement = new MicrodramaPublicationSchedulingService({
      port: (() => {
        const repo = new FakeMicrodramaPublicationSchedulingRepository();
        repo.migratePublicationScheduling();
        repo.upsertAudienceTimezoneProfile({
          profile: {
            schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
            profileId: "audience.series001.en-us",
            seriesId: "series.001",
            locale: "en-US",
            audienceTimezone: "America/New_York",
            registeredAt: evaluatedAt,
          },
        });
        repo.saveScheduleRecord({ schedule });
        repo.saveScheduleConsentRecord({
          consent: schedulingRepository.getScheduleConsentBySchedule(
            schedule.scheduleId
          )!,
        });
        return repo;
      })(),
    });
    expect(
      blockedWithoutEnablement.evaluateDispatchAdmission({
        correlationId: "corr.disabled",
        evaluatedAt: "2026-08-15T13:59:00.000Z",
        intent: scheduledIntent,
        seriesId: "series.001",
      }).blockReason
    ).toBe("preapproved_scheduled_disabled");

    const allowed = service.evaluateDispatchAdmission({
      correlationId: "corr.allowed",
      evaluatedAt: "2026-08-15T13:59:00.000Z",
      intent: scheduledIntent,
      seriesId: "series.001",
    });
    expect(allowed.allowed).toBe(true);

    const cancelled = service.cancelSchedule({
      scheduleId: schedule.scheduleId,
      now: "2026-08-15T13:58:00.000Z",
    });
    expect(cancelled.state).toBe("cancelled");
    expect(
      service.evaluateDispatchAdmission({
        correlationId: "corr.cancelled",
        evaluatedAt: "2026-08-15T13:59:00.000Z",
        intent: scheduledIntent,
        seriesId: "series.001",
      }).blockReason
    ).toBe("schedule_consent_missing");
  });

  it("round-trips scheduling records through sqlite", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(MICRODRAMA_SQLITE_MIGRATION);
    database.exec(MICRODRAMA_PUBLICATION_SQLITE_MIGRATION);
    database.exec(MICRODRAMA_TIKTOK_APP_AUDIT_SQLITE_MIGRATION);
    const repository = new MicrodramaPublicationSchedulingRepository({ database });
    repository.migratePublicationScheduling();
    const service = new MicrodramaPublicationSchedulingService({ port: repository });

    service.registerAudienceTimezoneProfile({
      profile: {
        schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
        profileId: "audience.series001.en-us",
        seriesId: "series.001",
        locale: "en-US",
        audienceTimezone: "America/New_York",
        registeredAt: evaluatedAt,
      },
    });

    const intent = planPublicationIntent({
      intentId: "intent.sqlite.001",
      targetProfile: {
        schemaVersion: "mediaforge.microdrama-publication.v1",
        profileId: "profile.series001.en-us.tiktok",
        seriesId: "series.001",
        locale: "en-US",
        provider: "tiktok",
        providerAccountId: "tiktok.account.001",
        credentialVersion: "cred.v1",
        metadataProfileId: "meta.profile.en-us",
        scheduleProfileId: "schedule.profile.en-us",
        enabled: true,
        registeredAt: evaluatedAt,
      },
      binding: createPublicationFixture().binding,
      dispatchMode: "preapproved_scheduled",
      scheduledAt: scheduledUtc,
      idempotencyKey: "idempotency.sqlite.001",
      createdAt: evaluatedAt,
    });

    const { schedule } = service.scheduleIntent({
      scheduleId: "schedule.sqlite.001",
      intent,
      seriesId: "series.001",
      locale: "en-US",
      localScheduledAt,
      now: evaluatedAt,
    });
    expect(repository.getScheduleRecord(schedule.scheduleId)?.scheduledAtUtc).toBe(
      scheduledUtc
    );
    expect(
      repository.getAudienceTimezoneProfile({
        seriesId: "series.001",
        locale: "en-US",
      })?.audienceTimezone
    ).toBe("America/New_York");
  });
});
