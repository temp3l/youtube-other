import {
  planTikTokAppDeveloperConfigurationRevision,
  projectTikTokAppAuditReadiness,
  recordTikTokProviderAuditEvidence,
  preparePublicationAttempt,
  planPublicationIntent,
  buildTikTokFileUploadTransferPlan,
  projectTikTokMetadataRevision,
} from "@mediaforge/domain";
import {
  InMemoryTikTokDirectPostPersistence,
  TikTokDirectPostService,
  FixtureTikTokDirectPostAdapter,
} from "@mediaforge/tiktok-publishing";
import { describe, expect, it } from "vitest";

import {
  requireTikTokDirectPostPreDispatchGate,
  runTikTokDirectPostPreDispatchGate,
  TikTokDirectPostWorkflowBlockedError,
} from "./tiktok-direct-post-dispatch.js";

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

function buildWorkflowPort() {
  const persistence = new InMemoryTikTokDirectPostPersistence();
  const service = new TikTokDirectPostService({
    port: persistence,
    adapter: new FixtureTikTokDirectPostAdapter(),
  });
  return {
    evaluateDispatchAdmission: (input) => service.evaluateDispatchAdmission(input),
  };
}

function buildContext() {
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
    consentRevisionId: "consent.rev.workflow",
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
    exportApprovalRevisionId: "export.approval.workflow",
    consentRevisionId: consent.consentRevisionId,
    creatorCapabilityEvidenceHash: capabilityHash,
    providerAccountId: targetProfile.providerAccountId,
    renderHash,
    artifactManifestHash: manifestHash,
    metadataRevisionId: "meta.rev.workflow",
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
    episodeId: "episode.workflow",
    episodeRevisionId: "rev.episode.workflow",
    locale: "en-US",
    renderHash,
    metadataRevisionId: "meta.rev.workflow",
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
    intentId: "intent.direct-post.workflow",
    targetProfile,
    binding,
    dispatchMode: "manual",
    idempotencyKey: "idempotency.direct-post.workflow",
    createdAt: evaluatedAt,
  });

  const approvedIntent = {
    ...intent,
    approvalState: "publication_approved" as const,
    boundExportApprovalRevisionId: exportApproval.exportApprovalRevisionId,
    state: "approved" as const,
  };

  const attempt = preparePublicationAttempt({
    attemptId: "attempt.direct-post.workflow",
    intent: approvedIntent,
    attemptFence: 1,
    createdAt: evaluatedAt,
  });

  const metadata = projectTikTokMetadataRevision({
    metadataRevisionId: "meta.rev.workflow",
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
      relativePath: "renders/en-US/workflow-final.mp4",
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
      accountFence: "fence.account.workflow",
      resolvedAt: evaluatedAt,
    },
    creatorInfo: {
      schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
      providerAccountId: targetProfile.providerAccountId,
      creatorOpenId: "tiktok.open-id.workflow",
      displayName: "Creator Workflow",
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
    configurationRevisionId: "tiktok.app.config.workflow",
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
    auditEvidenceId: "tiktok.app.audit.workflow",
    configurationRevisionId: configuration.configurationRevisionId,
    workspaceId: configuration.workspaceId,
    providerAppId: configuration.providerAppId,
    evidenceSource: "operator_canary_evidence",
    submissionState: "provider_approved",
    submissionReference: "provider.submission.workflow",
    resultEvidenceHash: auditResultHash,
    recordedBy: "operator.001",
    effectiveAt: evaluatedAt,
    recordedAt: evaluatedAt,
  });
  const auditReadiness = projectTikTokAppAuditReadiness({
    readinessProjectionId: "tiktok.app.readiness.workflow",
    configuration,
    auditEvidence,
    recordedAt: evaluatedAt,
  });

  return {
    correlationId: "corr.direct-post.workflow",
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
  };
}

describe("TikTok Direct Post workflow pre-dispatch gate", () => {
  it("blocks workflow dispatch without operator confirmation", () => {
    const port = buildWorkflowPort();
    const context = buildContext();
    const blocked = runTikTokDirectPostPreDispatchGate({
      port,
      context,
    });
    expect(blocked.admission.allowed).toBe(false);
    expect(blocked.admission.blockReason).toBe("manual_dispatch_required");
  });

  it("allows workflow dispatch after immutable fence recheck", () => {
    const port = buildWorkflowPort();
    const context = {
      ...buildContext(),
      operatorDispatchConfirmed: true,
    };
    const allowed = requireTikTokDirectPostPreDispatchGate({
      port,
      context,
    });
    expect(allowed.admission.allowed).toBe(true);
  });

  it("throws workflow blocked error for stale consent", () => {
    const port = buildWorkflowPort();
    const context = buildContext();
    const staleConsent = {
      ...context.consent,
      state: "revoked" as const,
      revokedAt: evaluatedAt,
    };
    expect(() =>
      requireTikTokDirectPostPreDispatchGate({
        port,
        context: {
          ...context,
          consent: staleConsent,
          operatorDispatchConfirmed: true,
        },
      })
    ).toThrow(TikTokDirectPostWorkflowBlockedError);
  });
});
