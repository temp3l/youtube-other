import { describe, expect, it } from "vitest";

import {
  computeScheduleConsentFence,
  evaluatePreapprovedScheduledEnablement,
  evaluateScheduleFenceRevalidation,
  evaluateScheduledDispatchAdmission,
  planPublicationScheduleRecord,
  recordPublicationScheduleConsent,
  resolveScheduledUtcInstant,
} from "./microdrama-publication-scheduling-lifecycle.js";
import { planPublicationIntent } from "./microdrama-publication-lifecycle.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const scheduledUtc = "2026-08-15T14:00:00.000Z";
const localScheduledAt = "2026-08-15T10:00:00-04:00";
const renderHash = "a".repeat(64);

function createBinding() {
  return {
    provider: "tiktok" as const,
    providerAccountId: "tiktok.account.001",
    credentialVersion: "cred.v1",
    episodeId: "episode.001",
    episodeRevisionId: "rev.episode.001",
    locale: "en-US",
    renderHash,
    metadataRevisionId: "meta.rev.001",
    consentRevisionId: "consent.rev.001",
    exportApprovalRevisionId: "export.approval.001",
    privacy: "private" as const,
    interactionSettings: {
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    },
    aiContentDeclared: true,
    commercialContentDeclared: false,
  };
}

function createScheduledIntent() {
  return planPublicationIntent({
    intentId: "intent.schedule.001",
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
    binding: createBinding(),
    dispatchMode: "preapproved_scheduled",
    scheduledAt: scheduledUtc,
    idempotencyKey: "idempotency.schedule.001",
    createdAt: evaluatedAt,
  });
}

describe("microdrama publication scheduling lifecycle", () => {
  it("persists UTC instants from explicit local offset without inferring timezone from locale", () => {
    expect(
      resolveScheduledUtcInstant({
        localScheduledAt,
        audienceTimezone: "America/New_York",
      })
    ).toBe(scheduledUtc);
    expect(() =>
      resolveScheduledUtcInstant({
        localScheduledAt: "2026-08-15T10:00:00",
        audienceTimezone: "America/New_York",
      })
    ).toThrow(/offset/i);
  });

  it("requires MANUAL dispatch-time operator confirmation", () => {
    const intent = {
      ...createScheduledIntent(),
      dispatchMode: "manual" as const,
      scheduledAt: null,
    };
    const blocked = evaluateScheduledDispatchAdmission({
      correlationId: "corr.manual.blocked",
      evaluatedAt,
      dispatchMode: "manual",
      intent,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockReason).toBe("manual_dispatch_required");

    const allowed = evaluateScheduledDispatchAdmission({
      correlationId: "corr.manual.allowed",
      evaluatedAt,
      dispatchMode: "manual",
      intent,
      operatorDispatchConfirmed: true,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("keeps PREAPPROVED_SCHEDULED disabled until audit evidence and explicit enablement exist", () => {
    const enablement = evaluatePreapprovedScheduledEnablement({
      policy: {
        schemaVersion: "mediaforge.microdrama-publication-scheduling.v1",
        policyId: "policy.001",
        seriesId: "series.001",
        provider: "tiktok",
        locale: "en-US",
        providerAccountId: "tiktok.account.001",
        manualDispatchEnabled: true,
        preapprovedScheduledEnabled: false,
        maxScheduleHorizonHours: 168,
        registeredAt: evaluatedAt,
        updatedAt: evaluatedAt,
      },
      now: evaluatedAt,
    });
    expect(enablement.allowed).toBe(false);
    expect(enablement.reason).toBe("preapproved_scheduled_disabled");
  });

  it("allows PREAPPROVED_SCHEDULED dispatch after schedule-time consent without a fresh click", () => {
    const intent = {
      ...createScheduledIntent(),
      approvalState: "publication_approved" as const,
      boundExportApprovalRevisionId: "export.approval.001",
      state: "approved" as const,
    };
    const audienceProfile = {
      schemaVersion: "mediaforge.microdrama-publication-scheduling.v1" as const,
      profileId: "audience.series001.en-us",
      seriesId: "series.001",
      locale: "en-US",
      audienceTimezone: "America/New_York",
      registeredAt: evaluatedAt,
    };
    const schedule = planPublicationScheduleRecord({
      scheduleId: "schedule.001",
      intent,
      audienceProfile,
      localScheduledAt,
      now: evaluatedAt,
      maxScheduleHorizonHours: 168,
    });
    const consent = recordPublicationScheduleConsent({
      consentRecordId: "schedule.consent.001",
      schedule,
      intent,
      operatorId: "operator.001",
      consentedAt: evaluatedAt,
    });
    const policy = {
      schemaVersion: "mediaforge.microdrama-publication-scheduling.v1" as const,
      policyId: "policy.001",
      seriesId: "series.001",
      provider: "tiktok" as const,
      locale: "en-US",
      providerAccountId: "tiktok.account.001",
      manualDispatchEnabled: true,
      preapprovedScheduledEnabled: true,
      tiktokAuditReadinessProjectionId: "tiktok.readiness.001",
      maxScheduleHorizonHours: 168,
      registeredAt: evaluatedAt,
      updatedAt: evaluatedAt,
    };
    const auditReadiness = {
      schemaVersion: "mediaforge.tiktok-app-audit.v1" as const,
      readinessProjectionId: "tiktok.readiness.001",
      workspaceId: "workspace.001",
      providerAppId: "tiktok.app.001",
      configurationRevisionId: "config.rev.001",
      auditEvidenceId: "audit.evidence.001",
      appCredentialHandle: "tiktok.app.handle",
      fingerprint: "e".repeat(64),
      effectiveAt: "2026-08-12T00:00:00.000Z",
      state: "active" as const,
      recordedAt: evaluatedAt,
      gateAssessment: {
        ready: true,
        blockReasons: [],
        permitsLiveOAuth: true,
        permitsCreatorPreflight: true,
        permitsDirectPost: true,
        permitsPublicPosting: false,
      },
    };
    const allowed = evaluateScheduledDispatchAdmission({
      correlationId: "corr.preapproved.allowed",
      evaluatedAt: "2026-08-15T13:59:00.000Z",
      dispatchMode: "preapproved_scheduled",
      schedule,
      consent,
      intent,
      policy,
      auditReadiness,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("blocks PREAPPROVED_SCHEDULED dispatch when any consent fence changes", () => {
    const intent = {
      ...createScheduledIntent(),
      approvalState: "publication_approved" as const,
      boundExportApprovalRevisionId: "export.approval.001",
      state: "approved" as const,
    };
    const audienceProfile = {
      schemaVersion: "mediaforge.microdrama-publication-scheduling.v1" as const,
      profileId: "audience.series001.en-us",
      seriesId: "series.001",
      locale: "en-US",
      audienceTimezone: "America/New_York",
      registeredAt: evaluatedAt,
    };
    const schedule = planPublicationScheduleRecord({
      scheduleId: "schedule.002",
      intent,
      audienceProfile,
      localScheduledAt,
      now: evaluatedAt,
      maxScheduleHorizonHours: 168,
    });
    const consent = recordPublicationScheduleConsent({
      consentRecordId: "schedule.consent.002",
      schedule,
      intent,
      operatorId: "operator.001",
      consentedAt: evaluatedAt,
    });
    const changedIntent = {
      ...intent,
      binding: {
        ...intent.binding,
        privacy: "public" as const,
      },
    };
    const fence = evaluateScheduleFenceRevalidation({
      schedule,
      consent,
      intent: changedIntent,
    });
    expect(fence.allowed).toBe(false);
    expect(fence.reason).toBe("schedule_fence_changed");
    expect(
      computeScheduleConsentFence({
        binding: intent.binding,
        boundExportApprovalRevisionId: intent.boundExportApprovalRevisionId,
        credentialVersion: intent.binding.credentialVersion,
      })
    ).not.toBe(
      computeScheduleConsentFence({
        binding: changedIntent.binding,
        boundExportApprovalRevisionId: changedIntent.boundExportApprovalRevisionId,
        credentialVersion: changedIntent.binding.credentialVersion,
      })
    );
  });
});
