import { describe, expect, it } from "vitest";

import {
  planTikTokAppDeveloperConfigurationRevision,
  projectTikTokAppAuditReadiness,
  recordTikTokProviderAuditEvidence,
} from "./tiktok-app-audit-lifecycle.js";
import { preparePublicationAttempt, planPublicationIntent } from "./microdrama-publication-lifecycle.js";
import { buildTikTokFileUploadTransferPlan } from "./tiktok-transfer-lifecycle.js";
import { projectTikTokMetadataRevision } from "./tiktok-metadata-lifecycle.js";
import {
  applyTikTokDirectPostInitResponse,
  applyTikTokDirectPostThrottle,
  buildTikTokDirectPostInitRequest,
  evaluateTikTokDirectPostDispatchAdmission,
  evaluateTikTokDirectPostRateLimitAdmission,
  planTikTokDirectPostPreparedEffect,
} from "./tiktok-direct-post-lifecycle.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const renderHash = "a".repeat(64);
const manifestHash = "b".repeat(64);
const evidenceHash = "c".repeat(64);
const capabilityHash = "d".repeat(64);
const uxHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const callbackHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const redirectHash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const contentPostingHash =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const auditResultHash =
  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const testConstraints = {
  minChunkBytes: 100,
  maxChunkBytes: 500,
  preferredChunkBytes: 250,
} as const;

function buildAuditReadiness() {
  const configuration = planTikTokAppDeveloperConfigurationRevision({
    configurationRevisionId: "tiktok.app.config.direct-post",
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
  const auditEvidence = recordTikTokProviderAuditEvidence({
    auditEvidenceId: "tiktok.app.audit.direct-post",
    configurationRevisionId: configuration.configurationRevisionId,
    workspaceId: configuration.workspaceId,
    providerAppId: configuration.providerAppId,
    evidenceSource: "operator_canary_evidence",
    submissionState: "provider_approved",
    submissionReference: "provider.submission.direct-post",
    resultEvidenceHash: auditResultHash,
    recordedBy: "operator.001",
    effectiveAt: evaluatedAt,
    recordedAt: evaluatedAt,
  });
  return projectTikTokAppAuditReadiness({
    readinessProjectionId: "tiktok.app.readiness.direct-post",
    configuration,
    auditEvidence,
    recordedAt: evaluatedAt,
  });
}

function buildFixture() {
  const targetProfile = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    profileId: "profile.series001.en-us.tiktok",
    seriesId: "series.001",
    locale: "en-US",
    provider: "tiktok" as const,
    providerAccountId: "tiktok.account.001",
    credentialVersion: "cred.v1",
    metadataProfileId: "meta.profile.en-us",
    scheduleProfileId: "schedule.profile.en-us",
    enabled: true,
    registeredAt: evaluatedAt,
  };

  const consent = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    consentRevisionId: "consent.rev.001",
    subjectId: "creator.001",
    rightsholderId: "rightsholder.001",
    evidenceHash,
    evidenceSource: "operator-attestation",
    permittedMedia: ["video"] as const,
    permittedUse: ["publish"] as const,
    permittedLocale: "en-US",
    permittedProvider: "tiktok" as const,
    permittedTerritory: "US",
    effectiveAt: "2026-08-12T00:00:00.000Z",
    state: "active" as const,
    recordedAt: evaluatedAt,
  };

  const exportApproval = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    exportApprovalRevisionId: "export.approval.001",
    consentRevisionId: consent.consentRevisionId,
    creatorCapabilityEvidenceHash: capabilityHash,
    providerAccountId: targetProfile.providerAccountId,
    renderHash,
    artifactManifestHash: manifestHash,
    metadataRevisionId: "meta.rev.001",
    privacy: "private" as const,
    interactionSettings: {
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    },
    aiContentDeclared: true,
    commercialContentDeclared: false,
    operatorId: "operator.001",
    approvedAt: evaluatedAt,
    state: "active" as const,
  };

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

  const intent = planPublicationIntent({
    intentId: "intent.direct-post.001",
    targetProfile,
    binding,
    dispatchMode: "manual",
    idempotencyKey: "idempotency.direct-post.001",
    createdAt: evaluatedAt,
  });

  const approvedIntent = {
    ...intent,
    approvalState: "publication_approved" as const,
    boundExportApprovalRevisionId: exportApproval.exportApprovalRevisionId,
    state: "approved" as const,
  };

  const attempt = preparePublicationAttempt({
    attemptId: "attempt.direct-post.001",
    intent: approvedIntent,
    attemptFence: 1,
    createdAt: evaluatedAt,
    providerCorrelation: {
      requestId: "provider.request.001",
      correlationId: "provider.correlation.001",
    },
  });

  const metadata = projectTikTokMetadataRevision({
    metadataRevisionId: "meta.rev.001",
    revision: 1,
    episodeId: binding.episodeId,
    episodeRevisionId: binding.episodeRevisionId,
    locale: "en-US",
    metadataProfileId: "meta.profile.en-us",
    metadataProfileVersion: 1,
    editorial: {
      caption: "Episode caption",
      hashtags: ["#microdrama"],
      ctaLabel: "Watch more",
    },
    providerPolicy: {
      privacy: binding.privacy,
      interactionSettings: binding.interactionSettings,
    },
    mediaProvenance: {
      syntheticVoiceUsed: true,
      syntheticVisualsUsed: false,
      sponsoredContent: false,
      paidPartnership: false,
    },
    createdAt: evaluatedAt,
  });

  const transferPlan = buildTikTokFileUploadTransferPlan({
    source: {
      relativePath: "renders/en-US/e001-final.mp4",
      mimeType: "video/mp4",
      byteLength: 725,
      contentHash: renderHash,
    },
    constraints: testConstraints,
    plannedAt: evaluatedAt,
  });

  const creatorPreflight = {
    schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
    resolution: {
      schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
      seriesId: targetProfile.seriesId,
      locale: targetProfile.locale,
      targetProfile,
      accountFence: "fence.account.001",
      resolvedAt: evaluatedAt,
    },
    creatorInfo: {
      schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
      providerAccountId: targetProfile.providerAccountId,
      creatorOpenId: "tiktok.open-id.001",
      displayName: "Creator One",
      postingCapability: "available" as const,
      directPostEnabled: true,
      maxVideoDurationSeconds: 600,
      privacyLevelOptions: ["public", "private"],
      fetchedAt: evaluatedAt,
      responseHash: "f".repeat(64),
    },
    cacheHit: false,
    checkedAt: evaluatedAt,
  };

  return {
    targetProfile,
    consent,
    exportApproval,
    binding,
    approvedIntent,
    attempt,
    metadata,
    transferPlan,
    creatorPreflight,
    auditReadiness: buildAuditReadiness(),
  };
}

describe("tiktok direct post lifecycle", () => {
  it("builds immutable init requests with provider correlation fields", () => {
    const fixture = buildFixture();
    const initRequest = buildTikTokDirectPostInitRequest({
      initRequestId: "init.request.001",
      attempt: fixture.attempt,
      transferPlan: fixture.transferPlan,
      metadata: fixture.metadata,
      accountFence: fixture.creatorPreflight.resolution.accountFence,
      preparedAt: evaluatedAt,
    });
    expect(initRequest.transferPlanId).toBe(fixture.transferPlan.transferPlanId);
    expect(initRequest.metadataContentHash).toBe(fixture.metadata.contentHash);
    expect(initRequest.accountFence).toBe("fence.account.001");

    const prepared = planTikTokDirectPostPreparedEffect({
      effectId: "effect.001",
      initRequest,
      providerCorrelation: fixture.attempt.providerCorrelation,
      recordedAt: evaluatedAt,
    });
    expect(prepared.state).toBe("prepared");
    expect(prepared.providerCorrelation.requestId).toBe("provider.request.001");
  });

  it("rechecks account, approval, consent, audit and capability fences before dispatch", () => {
    const fixture = buildFixture();
    const blocked = evaluateTikTokDirectPostDispatchAdmission({
      correlationId: "corr.blocked",
      evaluatedAt,
      capabilityState: "private_canary",
      targetProfile: fixture.targetProfile,
      intent: fixture.approvedIntent,
      attempt: fixture.attempt,
      consent: fixture.consent,
      exportApproval: fixture.exportApproval,
      metadata: fixture.metadata,
      transferPlan: fixture.transferPlan,
      appAuditReadiness: fixture.auditReadiness,
      creatorPreflight: fixture.creatorPreflight,
      observedAccountBinding: {
        providerAccountId: fixture.targetProfile.providerAccountId,
        credentialVersion: fixture.targetProfile.credentialVersion,
      },
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockReason).toBe("manual_dispatch_required");

    const allowed = evaluateTikTokDirectPostDispatchAdmission({
      correlationId: "corr.allowed",
      evaluatedAt,
      capabilityState: "private_canary",
      targetProfile: fixture.targetProfile,
      intent: fixture.approvedIntent,
      attempt: fixture.attempt,
      consent: fixture.consent,
      exportApproval: fixture.exportApproval,
      metadata: fixture.metadata,
      transferPlan: fixture.transferPlan,
      appAuditReadiness: fixture.auditReadiness,
      creatorPreflight: fixture.creatorPreflight,
      observedAccountBinding: {
        providerAccountId: fixture.targetProfile.providerAccountId,
        credentialVersion: fixture.targetProfile.credentialVersion,
      },
      operatorDispatchConfirmed: true,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("pauses throttled dispatch without weakening idempotency fences", () => {
    const fixture = buildFixture();
    const initRequest = buildTikTokDirectPostInitRequest({
      initRequestId: "init.request.throttle",
      attempt: fixture.attempt,
      transferPlan: fixture.transferPlan,
      metadata: fixture.metadata,
      accountFence: fixture.creatorPreflight.resolution.accountFence,
      preparedAt: evaluatedAt,
    });
    const throttled = applyTikTokDirectPostThrottle({
      effect: planTikTokDirectPostPreparedEffect({
        effectId: "effect.throttle",
        initRequest,
        recordedAt: evaluatedAt,
      }),
      throttleEvidence: {
        schemaVersion: "mediaforge.tiktok-direct-post.v1",
        retryAfterSeconds: 120,
        retryAfter: "2026-08-12T12:02:00.000Z",
        nextEligibleAt: "2026-08-12T12:02:00.000Z",
        providerCorrelation: {
          requestId: "provider.request.throttle",
        },
        recordedAt: evaluatedAt,
      },
    });
    expect(throttled.state).toBe("throttled");
    expect(
      evaluateTikTokDirectPostRateLimitAdmission({
        effect: throttled,
        now: evaluatedAt,
      }).allowed
    ).toBe(false);

    const admission = evaluateTikTokDirectPostDispatchAdmission({
      correlationId: "corr.throttle",
      evaluatedAt,
      capabilityState: "private_canary",
      targetProfile: fixture.targetProfile,
      intent: fixture.approvedIntent,
      attempt: fixture.attempt,
      consent: fixture.consent,
      exportApproval: fixture.exportApproval,
      metadata: fixture.metadata,
      transferPlan: fixture.transferPlan,
      appAuditReadiness: fixture.auditReadiness,
      creatorPreflight: fixture.creatorPreflight,
      observedAccountBinding: {
        providerAccountId: fixture.targetProfile.providerAccountId,
        credentialVersion: fixture.targetProfile.credentialVersion,
      },
      existingEffect: throttled,
      operatorDispatchConfirmed: true,
    });
    expect(admission.allowed).toBe(false);
    expect(admission.blockReason).toBe("rate_limited");
  });

  it("records init response correlation without mutating prepared binding", () => {
    const fixture = buildFixture();
    const initRequest = buildTikTokDirectPostInitRequest({
      initRequestId: "init.request.response",
      attempt: fixture.attempt,
      transferPlan: fixture.transferPlan,
      metadata: fixture.metadata,
      accountFence: fixture.creatorPreflight.resolution.accountFence,
      preparedAt: evaluatedAt,
    });
    const prepared = planTikTokDirectPostPreparedEffect({
      effectId: "effect.response",
      initRequest,
      recordedAt: evaluatedAt,
    });
    const dispatched = applyTikTokDirectPostInitResponse({
      effect: prepared,
      initResponse: {
        schemaVersion: "mediaforge.tiktok-direct-post.v1",
        initRequestId: initRequest.initRequestId,
        publishId: "tiktok.publish.001",
        providerCorrelation: {
          responseId: "provider.response.001",
        },
        receivedAt: evaluatedAt,
      },
      updatedAt: evaluatedAt,
    });
    expect(dispatched.state).toBe("init_dispatched");
    expect(dispatched.initRequest.binding.renderHash).toBe(fixture.binding.renderHash);
    expect(dispatched.providerCorrelation.responseId).toBe("provider.response.001");
  });
});
