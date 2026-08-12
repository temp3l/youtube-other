import { describe, expect, it } from "vitest";

import {
  evaluateIdempotencyAdmission,
  evaluateRetryAdmission,
  rejectPublicationBypassCommand,
  resolvePublicationCapability,
} from "@mediaforge/domain";
import {
  evaluateMicrodramaPublicationCapabilityAdmission,
  MicrodramaPublicationService,
} from "../../application/src/microdrama-publication-service.js";
import {
  requireMicrodramaPublicationDispatchGate,
  runMicrodramaPublicationDispatchGate,
} from "../../workflow-engine/src/microdrama-publication-dispatch.js";
import { FakeMicrodramaPublicationRepository } from "./microdrama-publication-fake-repository.js";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const renderHash = "a".repeat(64);
const manifestHash = "b".repeat(64);
const evidenceHash = "c".repeat(64);
const capabilityHash = "d".repeat(64);

function createFixture() {
  const repository = new FakeMicrodramaPublicationRepository();
  repository.migratePublication();

  const targetProfile = repository.upsertTargetProfile({
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

  const consent = repository.recordConsentRevision({
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

  const exportApproval = repository.recordExportApprovalRevision({
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

  const service = new MicrodramaPublicationService({ port: repository });

  return {
    repository,
    service,
    targetProfile,
    consent,
    exportApproval,
    binding,
  };
}

describe("microdrama publication domain", () => {
  it("defaults publication capability off", () => {
    expect(resolvePublicationCapability()).toBe("disabled");
    expect(evaluateMicrodramaPublicationCapabilityAdmission({}).allowed).toBe(false);
  });

  it("binds immutable intent identity and exact export approval", () => {
    const { repository, service, targetProfile, consent, exportApproval, binding } =
      createFixture();

    const draft = service.createIntent({
      intentId: "intent.001",
      targetProfile,
      binding,
      dispatchMode: "manual",
      idempotencyKey: "idempotency.001",
      createdAt: evaluatedAt,
    });
    expect(draft.state).toBe("draft");
    expect(draft.approvalState).toBe("pending");

    const approved = service.approveIntent({
      intentId: draft.intentId,
      exportApproval,
      consent,
      now: evaluatedAt,
    });
    expect(approved.approvalState).toBe("publication_approved");
    expect(approved.boundExportApprovalRevisionId).toBe(
      exportApproval.exportApprovalRevisionId
    );
    expect(approved.state).toBe("approved");

    expect(() =>
      repository.saveIntent({
        intent: {
          ...approved,
          binding: {
            ...approved.binding,
            renderHash: "f".repeat(64),
          },
        },
      })
    ).toThrow(/immutable/i);
  });

  it("requires PUBLICATION_APPROVED and operator confirmation before dispatch", () => {
    const { repository, service, targetProfile, consent, exportApproval, binding } =
      createFixture();

    const approved = repository.planAndApproveIntent({
      intentId: "intent.dispatch",
      targetProfile,
      binding,
      dispatchMode: "manual",
      idempotencyKey: "idempotency.dispatch",
      exportApproval,
      consent,
      createdAt: evaluatedAt,
    });

    const blocked = runMicrodramaPublicationDispatchGate({
      port: repository,
      correlationId: "corr.dispatch.blocked",
      evaluatedAt,
      intentId: approved.intentId,
      capabilityState: "private_canary",
    });
    expect(blocked.admission.allowed).toBe(false);
    expect(blocked.admission.blockReason).toBe("manual_dispatch_required");

    const allowed = requireMicrodramaPublicationDispatchGate({
      port: repository,
      correlationId: "corr.dispatch.allowed",
      evaluatedAt,
      intentId: approved.intentId,
      capabilityState: "private_canary",
      operatorDispatchConfirmed: true,
    });
    expect(allowed.admission.allowed).toBe(true);
    expect(allowed.intent?.boundExportApprovalRevisionId).toBe(
      exportApproval.exportApprovalRevisionId
    );

    expect(
      service.rejectBypass({ command: "force", intentId: approved.intentId }).allowed
    ).toBe(false);
  });

  it("tracks provider correlation IDs, attempt fences and idempotency state", () => {
    const { repository, targetProfile, consent, exportApproval, binding } =
      createFixture();

    const approved = repository.planAndApproveIntent({
      intentId: "intent.attempt",
      targetProfile,
      binding,
      dispatchMode: "manual",
      idempotencyKey: "idempotency.attempt",
      exportApproval,
      consent,
      createdAt: evaluatedAt,
    });

    const { attempt } = repository.prepareApprovedAttempt({
      attemptId: "attempt.001",
      intentId: approved.intentId,
      attemptFence: 1,
      now: evaluatedAt,
      providerRequestId: "provider.request.001",
      providerCorrelationId: "provider.correlation.001",
    });
    expect(attempt.attemptFence).toBe(1);
    expect(attempt.providerCorrelation.requestId).toBe("provider.request.001");
    expect(attempt.providerCorrelation.correlationId).toBe("provider.correlation.001");

    const effect = repository.recordAttemptEffect({
      effectId: "effect.001",
      attempt,
      outcomeState: "outcome_uncertain",
      providerResponseId: "provider.response.001",
      recordedAt: evaluatedAt,
    });
    expect(effect.providerCorrelation.responseId).toBe("provider.response.001");

    const idempotency = evaluateIdempotencyAdmission({
      idempotencyKey: approved.idempotencyKey,
      fingerprint: approved.fingerprint,
      existing: repository.getIdempotencyRecord(approved.idempotencyKey) ?? undefined,
    });
    expect(idempotency.allowed).toBe(true);
    expect(idempotency.nextState).toBe("reserved");

    repository.commitAttemptIdempotency({
      idempotencyKey: approved.idempotencyKey,
      committedAt: evaluatedAt,
    });
    const committed = repository.getIdempotencyRecord(approved.idempotencyKey);
    expect(committed?.state).toBe("committed");

    const uncertainIntent = {
      ...approved,
      state: "outcome_uncertain" as const,
    };
    expect(
      evaluateRetryAdmission({
        intentState: uncertainIntent.state,
        attemptState: "outcome_uncertain",
        outcomeState: effect.outcomeState,
      }).allowed
    ).toBe(false);
    expect(
      rejectPublicationBypassCommand({
        command: "retry",
        intent: uncertainIntent,
      }).allowed
    ).toBe(false);
  });

  it("rejects idempotency conflicts and stale export approvals", () => {
    const { repository, targetProfile, consent, exportApproval, binding } =
      createFixture();

    repository.planAndApproveIntent({
      intentId: "intent.first",
      targetProfile,
      binding,
      dispatchMode: "manual",
      idempotencyKey: "idempotency.shared",
      exportApproval,
      consent,
      createdAt: evaluatedAt,
    });

    const conflictingFingerprint = evaluateIdempotencyAdmission({
      idempotencyKey: "idempotency.shared",
      fingerprint: "e".repeat(64),
      existing: repository.getIdempotencyRecord("idempotency.shared") ?? undefined,
    });
    expect(conflictingFingerprint.allowed).toBe(false);
    expect(conflictingFingerprint.reason).toBe("idempotency_conflict");

    repository.recordConsentRevision({
      consent: {
        ...consent,
        state: "revoked",
        revokedAt: evaluatedAt,
      },
    });

    const admission = repository.evaluateDispatchAdmission({
      correlationId: "corr.stale",
      evaluatedAt,
      intentId: "intent.first",
      capabilityState: "private_canary",
      operatorDispatchConfirmed: true,
    });
    expect(admission.allowed).toBe(false);
    expect(admission.blockReason).toBe("consent_stale");
  });
});
