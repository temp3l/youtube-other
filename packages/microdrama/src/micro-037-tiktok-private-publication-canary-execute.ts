import { existsSync, readFileSync } from "node:fs";

import {
  buildTikTokDirectPostEffectReferenceFromRecord,
  buildTikTokFileUploadTransferPlan,
  preparePublicationAttempt,
  projectTikTokMetadataRevision,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  FakeMicrodramaPublicationRepository,
  FakeMicrodramaTikTokAppAuditRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import {
  FixtureTikTokCreatorInfoAdapter,
  FixtureTikTokDirectPostAdapter,
  FixtureTikTokPublishStatusAdapter,
  InMemoryTikTokCreatorInfoCache,
  InMemoryTikTokDirectPostPersistence,
  TikTokCreatorPreflightService,
  TikTokDirectPostService,
} from "@mediaforge/tiktok-publishing";

import { MicrodramaPublicationService } from "../../application/src/microdrama-publication-service.js";
import { TikTokDirectPostApplicationService } from "../../application/src/tiktok-direct-post-service.js";
import { TikTokStatusReconciliationApplicationService } from "../../application/src/tiktok-status-reconciliation-service.js";
import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";

import {
  MICRO_037_ATTEMPT_ID,
  MICRO_037_CONSENT_REVISION_ID,
  MICRO_037_EXPORT_APPROVAL_REVISION_ID,
  MICRO_037_IDEMPOTENCY_KEY,
  MICRO_037_INTENT_ID,
  MICRO_037_METADATA_REVISION_ID,
  MICRO_037_TASK_ID,
  buildMicro037PublicationBindingProbe,
} from "./micro-037-canary-bindings.js";
import { loadMicro037OperatorAuthorization } from "./micro-037-canary-authorization-persistence.js";
import {
  buildMicro037ExplicitExecuteAuthorizationRecord,
  computeMicro037PreparationFingerprint,
  loadMicro037ExplicitExecuteAuthorization,
  persistMicro037ExplicitExecuteAuthorization,
  summarizeMicro037PreparationForFingerprint,
} from "./micro-037-explicit-execute-authorization.js";
import {
  defaultMicro050PublicationTargetFromEvidence,
  loadMicro050CanaryExecutionEvidence,
} from "./micro-037-canary-micro-050-evidence.js";
import { resolveMicro037RenderBindingFromCanaryEvidence } from "./micro-037-canary-micro-035-render-evidence.js";
import {
  computeMicro037RenderEvidenceContentHash,
  computeMicro050EvidenceContentHashForMicro037,
  evaluateMicro037TikTokPrivatePublicationCanaryPreflight,
  MICRO_037_AUDIT_PROBE,
  MICRO_037_METADATA_CONTENT_HASH,
} from "./micro-037-tiktok-private-publication-canary-preflight.js";

export const MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.canary-execution-evidence.MICRO-037";

export type Micro037TikTokPublicationPorts = {
  readonly publicationRepository: FakeMicrodramaPublicationRepository;
  readonly directPostPersistence: InMemoryTikTokDirectPostPersistence;
  readonly directPostAdapter: FixtureTikTokDirectPostAdapter;
  readonly auditRepository: FakeMicrodramaTikTokAppAuditRepository;
};

export function createMicro037TikTokPublicationPorts(): Micro037TikTokPublicationPorts {
  const publicationRepository = new FakeMicrodramaPublicationRepository();
  publicationRepository.migratePublication();
  const auditRepository = new FakeMicrodramaTikTokAppAuditRepository();
  auditRepository.migrateTikTokAppAudit();
  return {
    publicationRepository,
    directPostPersistence: new InMemoryTikTokDirectPostPersistence(),
    directPostAdapter: new FixtureTikTokDirectPostAdapter("tiktok.publish.micro-037"),
    auditRepository,
  };
}

export type Micro037AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly ports: Micro037TikTokPublicationPorts;
  readonly micro050EvidenceJsonPath?: string;
  readonly micro035EvidenceJsonPath?: string;
  readonly micro034EvidenceJsonPath?: string;
};

export type Micro037AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

export type Micro037TikTokPrivatePublicationCanaryExecuteInput = {
  readonly dbPath: string;
  readonly executedAt: string;
  readonly operatorId?: string;
  readonly ports: Micro037TikTokPublicationPorts;
  readonly micro050EvidenceJsonPath?: string;
  readonly micro035EvidenceJsonPath?: string;
  readonly micro034EvidenceJsonPath?: string;
};

export type Micro037TikTokPrivatePublicationCanaryExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly publicationCalls: number;
  readonly publishId: string | null;
  readonly receiptPublicVideoId: string | null;
  readonly evidenceProjectionKey: string;
};

function buildCreatorSnapshot(providerAccountId: string, fetchedAt: string) {
  return {
    schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
    providerAccountId,
    creatorOpenId: providerAccountId,
    displayName: "Fixture Creator",
    postingCapability: "available" as const,
    directPostEnabled: true,
    maxVideoDurationSeconds: 600,
    privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
    fetchedAt,
    responseHash: "f".repeat(64),
  };
}

export async function authorizeMicro037BoundedPublicationCanaryExplicitExecute(
  input: Micro037AuthorizeExplicitExecuteInput
): Promise<Micro037AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro037OperatorAuthorization(microdramaRepository);
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  const micro050Evidence = loadMicro050CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro050EvidenceJsonPath
      ? { jsonFilePath: input.micro050EvidenceJsonPath }
      : {}),
  });
  const renderBinding = resolveMicro037RenderBindingFromCanaryEvidence({
    repository: microdramaRepository,
    ...(input.micro035EvidenceJsonPath
      ? { micro035EvidenceJsonPath: input.micro035EvidenceJsonPath }
      : {}),
    ...(input.micro034EvidenceJsonPath
      ? { micro034EvidenceJsonPath: input.micro034EvidenceJsonPath }
      : {}),
  });

  if (!micro050Evidence || micro050Evidence.status !== "DONE") {
    blockers.push("MICRO_050_EVIDENCE_MISSING");
  }
  if (!renderBinding) {
    blockers.push("MICRO_035_RENDER_EVIDENCE_MISSING");
  }

  const auditService = new TikTokAppAuditApplicationService({
    port: input.ports.auditRepository,
  });
  if (!auditService.getLatestReadiness(MICRO_037_AUDIT_PROBE)) {
    auditService.recordReadinessBundle(MICRO_037_AUDIT_PROBE.fixture);
  }
  const appAuditReadiness = auditService.getLatestReadiness(MICRO_037_AUDIT_PROBE);

  const publicationService = new MicrodramaPublicationService({
    port: input.ports.publicationRepository,
    capabilityState: "private_canary",
  });

  const episodeRevisionId =
    renderBinding?.scriptRevisionId ?? "rev.script.en-us.micro-037.e001";
  const bindingProbe =
    operatorAuthorization && "approvalTimestamp" in operatorAuthorization.bindings
      ? operatorAuthorization.bindings
      : renderBinding && micro050Evidence?.creatorCapabilityEvidenceRevision
        ? buildMicro037PublicationBindingProbe({
            renderBinding,
            episodeRevisionId,
            creatorCapabilityEvidenceRevision:
              micro050Evidence.creatorCapabilityEvidenceRevision,
            approvalTimestamp: input.authorizedAt,
          })
        : null;

  let consent: ReturnType<MicrodramaPublicationService["registerConsentRevision"]> | undefined;
  let exportApproval:
    | ReturnType<MicrodramaPublicationService["registerExportApprovalRevision"]>
    | undefined;

  if (micro050Evidence && bindingProbe) {
    const targetProfile = publicationService.registerTargetProfile({
      profile: defaultMicro050PublicationTargetFromEvidence(
        micro050Evidence,
        input.authorizedAt
      ),
    });
    const evidenceHash = "c".repeat(64);
    const manifestHash = "b".repeat(64);
    consent = publicationService.registerConsentRevision({
      consent: {
        schemaVersion: "mediaforge.microdrama-publication.v1",
        consentRevisionId: MICRO_037_CONSENT_REVISION_ID,
        subjectId: "creator.micro-037",
        rightsholderId: "rightsholder.micro-037",
        evidenceHash,
        evidenceSource: "operator-attestation",
        permittedMedia: ["video"],
        permittedUse: ["publish"],
        permittedLocale: "en-US",
        permittedProvider: "tiktok",
        permittedTerritory: "US",
        effectiveAt: "2026-08-12T00:00:00.000Z",
        state: "active",
        recordedAt: input.authorizedAt,
      },
    });
    exportApproval = publicationService.registerExportApprovalRevision({
      exportApproval: {
        schemaVersion: "mediaforge.microdrama-publication.v1",
        exportApprovalRevisionId: MICRO_037_EXPORT_APPROVAL_REVISION_ID,
        consentRevisionId: consent.consentRevisionId,
        creatorCapabilityEvidenceHash: bindingProbe.creatorCapabilityEvidenceRevision,
        providerAccountId: bindingProbe.providerAccountId,
        renderHash: bindingProbe.renderHash,
        artifactManifestHash: manifestHash,
        metadataRevisionId: bindingProbe.metadataRevision,
        privacy: bindingProbe.privacy,
        interactionSettings: bindingProbe.interactionSettings,
        aiContentDeclared: bindingProbe.aiDeclaration,
        commercialContentDeclared: bindingProbe.commercialDeclaration,
        operatorId,
        approvedAt: input.authorizedAt,
        state: "active",
      },
    });
    publicationService.createIntent({
      intentId: MICRO_037_INTENT_ID,
      targetProfile,
      binding: {
        provider: "tiktok",
        providerAccountId: bindingProbe.providerAccountId,
        credentialVersion: targetProfile.credentialVersion,
        episodeId: "e001",
        episodeRevisionId: bindingProbe.episodeRevisionId,
        locale: bindingProbe.locale,
        renderHash: bindingProbe.renderHash,
        metadataRevisionId: bindingProbe.metadataRevision,
        consentRevisionId: bindingProbe.consentRevision,
        exportApprovalRevisionId: bindingProbe.exportApprovalRevision,
        privacy: bindingProbe.privacy,
        interactionSettings: bindingProbe.interactionSettings,
        aiContentDeclared: bindingProbe.aiDeclaration,
        commercialContentDeclared: bindingProbe.commercialDeclaration,
      },
      dispatchMode: "manual",
      idempotencyKey: MICRO_037_IDEMPOTENCY_KEY,
      createdAt: input.authorizedAt,
    });
    publicationService.approveIntent({
      intentId: MICRO_037_INTENT_ID,
      exportApproval,
      consent,
      now: input.authorizedAt,
    });
  }

  const preflight =
    renderBinding && bindingProbe
      ? evaluateMicro037TikTokPrivatePublicationCanaryPreflight({
          evaluatedAt: input.authorizedAt,
          operatorAuthorization: operatorAuthorization ?? undefined,
          renderBinding,
          episodeRevisionId,
          micro050Evidence,
          appAuditReadiness,
          consent,
          exportApproval,
        })
      : null;

  if (!preflight?.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  if (blockers.length > 0 || !bindingProbe || !renderBinding) {
    return {
      status: "BLOCKED",
      blockers,
      authorizationId: null,
      preparationFingerprint: null,
    };
  }

  const preparationSummary = summarizeMicro037PreparationForFingerprint(
    microdramaRepository,
    {
      micro050EvidenceContentHash:
        computeMicro050EvidenceContentHashForMicro037(micro050Evidence),
      micro035EvidenceContentHash: computeMicro037RenderEvidenceContentHash(
        renderBinding
      ),
      renderHash: bindingProbe.renderHash,
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro037PreparationFingerprint(
    preparationSummary
  );

  const record = buildMicro037ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    binds: {
      providerAccountId: bindingProbe.providerAccountId,
      creatorCapabilityEvidenceRevision: bindingProbe.creatorCapabilityEvidenceRevision,
      episodeRevisionId: bindingProbe.episodeRevisionId,
      locale: bindingProbe.locale,
      renderHash: bindingProbe.renderHash,
      metadataRevision: bindingProbe.metadataRevision,
      privacy: "private",
      consentRevision: bindingProbe.consentRevision,
      exportApprovalRevision: bindingProbe.exportApprovalRevision,
    },
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro037ExplicitExecuteAuthorization({
    repository: microdramaRepository,
    record,
  });

  return {
    status: "AUTHORIZED",
    blockers: [],
    authorizationId: record.authorizationId,
    preparationFingerprint,
  };
}

export async function executeMicro037TikTokPrivatePublicationCanary(
  input: Micro037TikTokPrivatePublicationCanaryExecuteInput
): Promise<Micro037TikTokPrivatePublicationCanaryExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const executeAuthorization = loadMicro037ExplicitExecuteAuthorization(microdramaRepository);
  const operatorAuthorization = loadMicro037OperatorAuthorization(microdramaRepository);
  if (!executeAuthorization) {
    blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  }
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  const micro050Evidence = loadMicro050CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro050EvidenceJsonPath
      ? { jsonFilePath: input.micro050EvidenceJsonPath }
      : {}),
  });
  const renderBinding = resolveMicro037RenderBindingFromCanaryEvidence({
    repository: microdramaRepository,
    ...(input.micro035EvidenceJsonPath
      ? { micro035EvidenceJsonPath: input.micro035EvidenceJsonPath }
      : {}),
    ...(input.micro034EvidenceJsonPath
      ? { micro034EvidenceJsonPath: input.micro034EvidenceJsonPath }
      : {}),
  });

  if (!micro050Evidence || micro050Evidence.status !== "DONE") {
    blockers.push("MICRO_050_EVIDENCE_MISSING");
  }
  if (!renderBinding) {
    blockers.push("MICRO_035_RENDER_EVIDENCE_MISSING");
  }

  const auditService = new TikTokAppAuditApplicationService({
    port: input.ports.auditRepository,
  });
  if (!auditService.getLatestReadiness(MICRO_037_AUDIT_PROBE)) {
    auditService.recordReadinessBundle(MICRO_037_AUDIT_PROBE.fixture);
  }
  const appAuditReadiness = auditService.getLatestReadiness(MICRO_037_AUDIT_PROBE);

  const episodeRevisionId =
    renderBinding?.scriptRevisionId ?? "rev.script.en-us.micro-037.e001";
  const bindingProbe =
    operatorAuthorization && "approvalTimestamp" in operatorAuthorization.bindings
      ? operatorAuthorization.bindings
      : renderBinding && micro050Evidence?.creatorCapabilityEvidenceRevision
        ? buildMicro037PublicationBindingProbe({
            renderBinding,
            episodeRevisionId,
            creatorCapabilityEvidenceRevision:
              micro050Evidence.creatorCapabilityEvidenceRevision,
            approvalTimestamp: input.executedAt,
          })
        : null;

  const preparationSummary = summarizeMicro037PreparationForFingerprint(
    microdramaRepository,
    {
      micro050EvidenceContentHash:
        computeMicro050EvidenceContentHashForMicro037(micro050Evidence),
      micro035EvidenceContentHash: renderBinding
        ? computeMicro037RenderEvidenceContentHash(renderBinding)
        : null,
      renderHash: bindingProbe?.renderHash ?? "",
      bindingProbe: bindingProbe ?? {},
    }
  );
  const preparationFingerprint = computeMicro037PreparationFingerprint(
    preparationSummary
  );

  if (
    executeAuthorization &&
    executeAuthorization.preparationFingerprint !== preparationFingerprint
  ) {
    blockers.push("EXPLICIT_EXECUTE_PREPARATION_STALE");
  }

  if (blockers.length > 0 || !bindingProbe || !renderBinding || !micro050Evidence) {
    return {
      status: "BLOCKED",
      blockers,
      publicationCalls: 0,
      publishId: null,
      receiptPublicVideoId: null,
      evidenceProjectionKey: MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const publicationService = new MicrodramaPublicationService({
    port: input.ports.publicationRepository,
    capabilityState: "private_canary",
  });

  const targetProfile = publicationService.registerTargetProfile({
    profile: defaultMicro050PublicationTargetFromEvidence(
      micro050Evidence,
      input.executedAt
    ),
  });

  const evidenceHash = "c".repeat(64);
  const manifestHash = "b".repeat(64);
  const consent = publicationService.registerConsentRevision({
    consent: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      consentRevisionId: MICRO_037_CONSENT_REVISION_ID,
      subjectId: "creator.micro-037",
      rightsholderId: "rightsholder.micro-037",
      evidenceHash,
      evidenceSource: "operator-attestation",
      permittedMedia: ["video"],
      permittedUse: ["publish"],
      permittedLocale: "en-US",
      permittedProvider: "tiktok",
      permittedTerritory: "US",
      effectiveAt: "2026-08-12T00:00:00.000Z",
      state: "active",
      recordedAt: input.executedAt,
    },
  });
  const exportApproval = publicationService.registerExportApprovalRevision({
    exportApproval: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      exportApprovalRevisionId: MICRO_037_EXPORT_APPROVAL_REVISION_ID,
      consentRevisionId: consent.consentRevisionId,
      creatorCapabilityEvidenceHash: bindingProbe.creatorCapabilityEvidenceRevision,
      providerAccountId: bindingProbe.providerAccountId,
      renderHash: bindingProbe.renderHash,
      artifactManifestHash: manifestHash,
      metadataRevisionId: bindingProbe.metadataRevision,
      privacy: bindingProbe.privacy,
      interactionSettings: bindingProbe.interactionSettings,
      aiContentDeclared: bindingProbe.aiDeclaration,
      commercialContentDeclared: bindingProbe.commercialDeclaration,
      operatorId,
      approvedAt: input.executedAt,
      state: "active",
    },
  });

  const intentBinding = {
    provider: "tiktok" as const,
    providerAccountId: bindingProbe.providerAccountId,
    credentialVersion: targetProfile.credentialVersion,
    episodeId: "e001",
    episodeRevisionId: bindingProbe.episodeRevisionId,
    locale: bindingProbe.locale,
    renderHash: bindingProbe.renderHash,
    metadataRevisionId: bindingProbe.metadataRevision,
    consentRevisionId: bindingProbe.consentRevision,
    exportApprovalRevisionId: bindingProbe.exportApprovalRevision,
    privacy: bindingProbe.privacy,
    interactionSettings: bindingProbe.interactionSettings,
    aiContentDeclared: bindingProbe.aiDeclaration,
    commercialContentDeclared: bindingProbe.commercialDeclaration,
  };

  publicationService.createIntent({
    intentId: MICRO_037_INTENT_ID,
    targetProfile,
    binding: intentBinding,
    dispatchMode: "manual",
    idempotencyKey: MICRO_037_IDEMPOTENCY_KEY,
    createdAt: input.executedAt,
  });
  const approvedIntent = publicationService.approveIntent({
    intentId: MICRO_037_INTENT_ID,
    exportApproval,
    consent,
    now: input.executedAt,
  });

  const attempt = preparePublicationAttempt({
    attemptId: MICRO_037_ATTEMPT_ID,
    intent: approvedIntent,
    attemptFence: 1,
    createdAt: input.executedAt,
  });

  const renderByteLength = existsSync(renderBinding.renderOutputPath)
    ? readFileSync(renderBinding.renderOutputPath).byteLength
    : 725;

  const transferPlan = buildTikTokFileUploadTransferPlan({
    source: {
      relativePath: renderBinding.renderOutputPath,
      mimeType: "video/mp4",
      byteLength: renderByteLength,
      contentHash: bindingProbe.renderHash,
    },
    constraints: {
      minChunkBytes: 100,
      maxChunkBytes: 500,
      preferredChunkBytes: 250,
    },
    plannedAt: input.executedAt,
  });

  const metadata = projectTikTokMetadataRevision({
    metadataRevisionId: MICRO_037_METADATA_REVISION_ID,
    revision: 1,
    episodeId: "e001",
    episodeRevisionId: bindingProbe.episodeRevisionId,
    locale: bindingProbe.locale,
    metadataProfileId: targetProfile.metadataProfileId,
    metadataProfileVersion: 1,
    editorial: {
      caption: "Micro-037 private canary",
      hashtags: ["#microdrama"],
      ctaLabel: "Watch",
    },
    providerPolicy: {
      privacy: bindingProbe.privacy,
      interactionSettings: bindingProbe.interactionSettings,
    },
    mediaProvenance: {
      syntheticVoiceUsed: true,
      syntheticVisualsUsed: false,
      sponsoredContent: false,
      paidPartnership: false,
    },
    createdAt: input.executedAt,
  });

  const creatorPreflightService = new TikTokCreatorPreflightService({
    cache: new InMemoryTikTokCreatorInfoCache(),
    adapter: new FixtureTikTokCreatorInfoAdapter(
      buildCreatorSnapshot(bindingProbe.providerAccountId, input.executedAt)
    ),
  });
  const creatorPreflight = await creatorPreflightService.runPreflight({
    seriesId: targetProfile.seriesId,
    locale: targetProfile.locale,
    targetProfile,
    checkedAt: input.executedAt,
  });

  const directPostService = new TikTokDirectPostService({
    port: input.ports.directPostPersistence,
    adapter: input.ports.directPostAdapter,
  });
  const directPostApplication = new TikTokDirectPostApplicationService({
    port: directPostService,
  });

  const dispatchContext = {
    correlationId: "corr.micro-037.private-canary",
    evaluatedAt: input.executedAt,
    capabilityState: "private_canary" as const,
    targetProfile,
    intent: approvedIntent,
    attempt,
    consent,
    exportApproval,
    metadata,
    transferPlan,
    appAuditReadiness,
    creatorPreflight,
    observedAccountBinding: {
      providerAccountId: bindingProbe.providerAccountId,
      credentialVersion: targetProfile.credentialVersion,
    },
    operatorDispatchConfirmed: true,
    effectId: "effect.micro-037.private-canary",
    initRequestId: "init.request.micro-037",
    accountFence: creatorPreflight.resolution.accountFence,
    preparedAt: input.executedAt,
    dispatchedAt: input.executedAt,
  };

  const admission = directPostApplication.evaluateDispatchAdmission(dispatchContext);
  if (!admission.allowed) {
    return {
      status: "BLOCKED",
      blockers: ["DISPATCH_ADMISSION_BLOCKED"],
      publicationCalls: 0,
      publishId: null,
      receiptPublicVideoId: null,
      evidenceProjectionKey: MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const dispatchResult = await directPostApplication.dispatchInit(dispatchContext);
  const publicationCalls = input.ports.directPostAdapter.calls.length;

  const dispatchEffect = dispatchResult.effect;
  const publishId = dispatchEffect?.initResponse?.publishId ?? null;

  let receiptPublicVideoId: string | null = null;
  let reconciliationEvidence: unknown = null;

  if (dispatchEffect && publishId) {
    const uncertainEffectReference = buildTikTokDirectPostEffectReferenceFromRecord({
      effect: dispatchEffect,
      dispatchOutcome: "outcome_uncertain",
      recordedAt: input.executedAt,
    });
    const reconciliationService = new TikTokStatusReconciliationApplicationService({
      adapter: new FixtureTikTokPublishStatusAdapter(
        new Map([
          [
            publishId,
            [
              {
                kind: "status",
                providerStatus: "PUBLISH_COMPLETE",
                publicVideoId: "video.micro-037.private",
              },
            ],
          ],
        ])
      ),
      port: {
        getUncertainEffect: (effectId) =>
          effectId === uncertainEffectReference.effectId
            ? uncertainEffectReference
            : null,
        saveReconciliationEvidence: ({ evidence }) => {
          reconciliationEvidence = evidence;
          return evidence;
        },
        savePublicationReceipt: ({ receipt }) => {
          receiptPublicVideoId = receipt.publicVideoId ?? null;
          return receipt;
        },
      },
    });

    const reconciliation = await reconciliationService.reconcileUncertainEffect({
      effectId: uncertainEffectReference.effectId,
      pollAttempt: 1,
      reconciledAt: input.executedAt,
    });
    receiptPublicVideoId =
      reconciliation.receipt?.publicVideoId ?? receiptPublicVideoId;
  }

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-037-canary-execution-evidence.v1",
    taskId: MICRO_037_TASK_ID,
    status: "DONE",
    executedAt: input.executedAt,
    operatorId,
    preparationFingerprint,
    intentId: MICRO_037_INTENT_ID,
    attemptId: MICRO_037_ATTEMPT_ID,
    publishId,
    receiptPublicVideoId,
    publicationCalls,
    renderOutputPath: renderBinding.renderOutputPath,
    visualRenderHash: renderBinding.visualRenderHash,
    metadataContentHash: MICRO_037_METADATA_CONTENT_HASH,
    micro050EvidenceContentHash:
      computeMicro050EvidenceContentHashForMicro037(micro050Evidence),
    micro035RenderEvidenceContentHash: computeMicro037RenderEvidenceContentHash(
      renderBinding
    ),
    bindingProbe,
    dispatchEffectState: dispatchResult.effect?.state ?? null,
    reconciliationEvidence,
    externalCalls: {
      publication: publicationCalls,
      reconciliation: publishId ? 1 : 0,
    },
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    publicationCalls,
    publishId,
    receiptPublicVideoId,
    evidenceProjectionKey: MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}
