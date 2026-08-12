import {
  planTikTokAppDeveloperConfigurationRevision,
  projectTikTokAppAuditReadiness,
  recordTikTokProviderAuditEvidence,
  preparePublicationAttempt,
  planPublicationIntent,
  buildTikTokFileUploadTransferPlan,
  projectTikTokMetadataRevision,
} from "@mediaforge/domain";
import { describe, expect, it } from "vitest";

import { InMemoryTikTokDirectPostPersistence } from "./in-memory-tiktok-direct-post-persistence.js";
import {
  FixtureTikTokDirectPostAdapter,
  ThrottlingTikTokDirectPostAdapter,
} from "./tiktok-direct-post-fake-adapter.js";
import {
  TikTokDirectPostBlockedError,
  TikTokDirectPostService,
} from "./tiktok-direct-post-service.js";

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

function buildDispatchContext() {
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
    intentId: "intent.direct-post.dispatch",
    targetProfile,
    binding,
    dispatchMode: "manual",
    idempotencyKey: "idempotency.direct-post.dispatch",
    createdAt: evaluatedAt,
  });

  const approvedIntent = {
    ...intent,
    approvalState: "publication_approved" as const,
    boundExportApprovalRevisionId: exportApproval.exportApprovalRevisionId,
    state: "approved" as const,
  };

  const attempt = preparePublicationAttempt({
    attemptId: "attempt.direct-post.dispatch",
    intent: approvedIntent,
    attemptFence: 1,
    createdAt: evaluatedAt,
    providerCorrelation: {
      requestId: "provider.request.dispatch",
      correlationId: "provider.correlation.dispatch",
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
      accountFence: "fence.account.dispatch",
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

  const configuration = planTikTokAppDeveloperConfigurationRevision({
    configurationRevisionId: "tiktok.app.config.dispatch",
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
    auditEvidenceId: "tiktok.app.audit.dispatch",
    configurationRevisionId: configuration.configurationRevisionId,
    workspaceId: configuration.workspaceId,
    providerAppId: configuration.providerAppId,
    evidenceSource: "operator_canary_evidence",
    submissionState: "provider_approved",
    submissionReference: "provider.submission.dispatch",
    resultEvidenceHash: auditResultHash,
    recordedBy: "operator.001",
    effectiveAt: evaluatedAt,
    recordedAt: evaluatedAt,
  });
  const auditReadiness = projectTikTokAppAuditReadiness({
    readinessProjectionId: "tiktok.app.readiness.dispatch",
    configuration,
    auditEvidence,
    recordedAt: evaluatedAt,
  });

  return {
    correlationId: "corr.direct-post.dispatch",
    evaluatedAt,
    capabilityState: "private_canary" as const,
    targetProfile,
    intent: approvedIntent,
    attempt,
    consent,
    exportApproval,
    metadata,
    transferPlan,
    appAuditReadiness: auditReadiness,
    creatorPreflight,
    observedAccountBinding: {
      providerAccountId: targetProfile.providerAccountId,
      credentialVersion: targetProfile.credentialVersion,
    },
    operatorDispatchConfirmed: true,
  };
}

describe("TikTok Direct Post fake adapter dispatch", () => {
  it("dispatches init through the fake adapter and commits idempotency once", async () => {
    const persistence = new InMemoryTikTokDirectPostPersistence();
    const adapter = new FixtureTikTokDirectPostAdapter();
    const service = new TikTokDirectPostService({ port: persistence, adapter });
    const context = buildDispatchContext();

    const first = await service.dispatchInit({
      ...context,
      effectId: "effect.dispatch.001",
      initRequestId: "init.request.dispatch.001",
      accountFence: context.creatorPreflight.resolution.accountFence,
      preparedAt: evaluatedAt,
      dispatchedAt: evaluatedAt,
    });

    expect(first.effect?.state).toBe("init_dispatched");
    expect(first.adapterResult?.kind).toBe("initialized");
    expect(adapter.calls).toHaveLength(1);
    expect(
      persistence.getIdempotencyRecord(context.intent.idempotencyKey)?.state
    ).toBe("committed");

    const second = await service.dispatchInit({
      ...context,
      effectId: "effect.dispatch.002",
      initRequestId: "init.request.dispatch.002",
      accountFence: context.creatorPreflight.resolution.accountFence,
      preparedAt: evaluatedAt,
      dispatchedAt: evaluatedAt,
    });
    expect(second.reusedExistingEffect).toBe(true);
    expect(adapter.calls).toHaveLength(1);
    expect(second.effect?.effectId).toBe("effect.dispatch.001");
  });

  it("pauses throttled dispatch without creating a second semantic effect", async () => {
    const persistence = new InMemoryTikTokDirectPostPersistence();
    const adapter = new ThrottlingTikTokDirectPostAdapter({
      retryAfterSeconds: 90,
      retryAfter: "2026-08-12T12:01:30.000Z",
      nextEligibleAt: "2026-08-12T12:01:30.000Z",
    });
    const service = new TikTokDirectPostService({ port: persistence, adapter });
    const context = buildDispatchContext();

    const throttled = await service.dispatchInit({
      ...context,
      effectId: "effect.throttle.001",
      initRequestId: "init.request.throttle.001",
      accountFence: context.creatorPreflight.resolution.accountFence,
      preparedAt: evaluatedAt,
      dispatchedAt: evaluatedAt,
    });
    expect(throttled.effect?.state).toBe("throttled");
    expect(
      persistence.getIdempotencyRecord(context.intent.idempotencyKey)?.state
    ).toBe("reserved");

    const blocked = service.evaluateDispatchAdmission(context);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockReason).toBe("rate_limited");
  });

  it("blocks dispatch when account binding changes before fake adapter call", async () => {
    const persistence = new InMemoryTikTokDirectPostPersistence();
    const adapter = new FixtureTikTokDirectPostAdapter();
    const service = new TikTokDirectPostService({ port: persistence, adapter });
    const context = buildDispatchContext();

    await expect(
      service.dispatchInit({
        ...context,
        observedAccountBinding: {
          providerAccountId: context.targetProfile.providerAccountId,
          credentialVersion: "cred.v2",
        },
        effectId: "effect.binding.001",
        initRequestId: "init.request.binding.001",
        accountFence: context.creatorPreflight.resolution.accountFence,
        preparedAt: evaluatedAt,
        dispatchedAt: evaluatedAt,
      })
    ).rejects.toBeInstanceOf(TikTokDirectPostBlockedError);
    expect(adapter.calls).toHaveLength(0);
  });
});
