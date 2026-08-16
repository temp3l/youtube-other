import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";
import { MicrodramaPublicationService } from "../../application/src/microdrama-publication-service.js";
import {
  FakeMicrodramaPublicationRepository,
  MicrodramaSQLiteRepository,
  MicrodramaTikTokAppAuditRepository,
  createPersistence,
} from "@mediaforge/persistence";

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
import {
  buildMicro037OperatorAuthorizationRecord,
  computeMicro037AuthorizationRevisionId,
  loadMicro037OperatorAuthorization,
  persistMicro037OperatorAuthorization,
} from "./micro-037-canary-authorization-persistence.js";
import { loadMicro050CanaryExecutionEvidence } from "./micro-037-canary-micro-050-evidence.js";
import {
  resolveMicro037RenderBindingFromCanaryEvidence,
  type Micro037RenderBinding,
} from "./micro-037-canary-micro-035-render-evidence.js";
import {
  computeMicro037RenderEvidenceContentHash,
  evaluateMicro037TikTokPrivatePublicationCanaryPreflight,
  MICRO_037_AUDIT_PROBE,
  MICRO_037_METADATA_CONTENT_HASH,
} from "./micro-037-tiktok-private-publication-canary-preflight.js";
import { defaultMicro050PublicationTargetFromEvidence } from "./micro-037-canary-micro-050-evidence.js";

export type Micro037BoundedPublicationCanaryAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly micro050EvidenceJsonPath?: string;
  readonly micro035EvidenceJsonPath?: string;
  readonly micro034EvidenceJsonPath?: string;
};

export type Micro037BoundedPublicationCanaryAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly operatorAuthorizationId: string | null;
  readonly renderBinding: Micro037RenderBinding | null;
  readonly preflightAllowed: boolean;
};

function buildPublicationFixtures(input: {
  readonly evaluatedAt: string;
  readonly bindingProbe: ReturnType<typeof buildMicro037PublicationBindingProbe>;
  readonly creatorCapabilityEvidenceRevision: string;
}) {
  const evidenceHash = "c".repeat(64);
  const manifestHash = "b".repeat(64);
  const consent = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    consentRevisionId: MICRO_037_CONSENT_REVISION_ID,
    subjectId: "creator.micro-037",
    rightsholderId: "rightsholder.micro-037",
    evidenceHash,
    evidenceSource: "operator-attestation",
    permittedMedia: ["video"] as const,
    permittedUse: ["publish"] as const,
    permittedLocale: "en-US",
    permittedProvider: "tiktok" as const,
    permittedTerritory: "US",
    effectiveAt: "2026-08-12T00:00:00.000Z",
    state: "active" as const,
    recordedAt: input.evaluatedAt,
  };
  const exportApproval = {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    exportApprovalRevisionId: MICRO_037_EXPORT_APPROVAL_REVISION_ID,
    consentRevisionId: consent.consentRevisionId,
    creatorCapabilityEvidenceHash: input.creatorCapabilityEvidenceRevision,
    providerAccountId: input.bindingProbe.providerAccountId,
    renderHash: input.bindingProbe.renderHash,
    artifactManifestHash: manifestHash,
    metadataRevisionId: input.bindingProbe.metadataRevision,
    privacy: input.bindingProbe.privacy,
    interactionSettings: input.bindingProbe.interactionSettings,
    aiContentDeclared: input.bindingProbe.aiDeclaration,
    commercialContentDeclared: input.bindingProbe.commercialDeclaration,
    operatorId: "operator.microdrama",
    approvedAt: input.evaluatedAt,
    state: "active" as const,
  };
  return { consent, exportApproval, evidenceHash, manifestHash };
}

export async function prepareMicro037BoundedPublicationCanaryAuthorization(
  input: Micro037BoundedPublicationCanaryAuthorizationPreparationInput
): Promise<Micro037BoundedPublicationCanaryAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const auditRepository = new MicrodramaTikTokAppAuditRepository(sqlite);
  auditRepository.migrateTikTokAppAudit();
  const auditService = new TikTokAppAuditApplicationService({ port: auditRepository });
  const auditBundle = auditService.recordReadinessBundle(MICRO_037_AUDIT_PROBE.fixture);
  const appAuditReadiness = auditBundle.readiness;

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

  const episodeRevisionId =
    renderBinding?.scriptRevisionId ?? `rev.script.en-us.${MICRO_037_TASK_ID.toLowerCase()}.e001`;

  const bindingProbe =
    renderBinding && micro050Evidence?.creatorCapabilityEvidenceRevision
      ? buildMicro037PublicationBindingProbe({
          renderBinding,
          episodeRevisionId,
          creatorCapabilityEvidenceRevision:
            micro050Evidence.creatorCapabilityEvidenceRevision,
          approvalTimestamp: input.preparedAt,
        })
      : null;

  const publicationRepository = new FakeMicrodramaPublicationRepository();
  publicationRepository.migratePublication();
  const publicationService = new MicrodramaPublicationService({
    port: publicationRepository,
    capabilityState: "private_canary",
  });

  if (micro050Evidence && renderBinding && bindingProbe) {
    const targetProfile = publicationService.registerTargetProfile({
      profile: defaultMicro050PublicationTargetFromEvidence(
        micro050Evidence,
        input.preparedAt
      ),
    });
    const fixtures = buildPublicationFixtures({
      evaluatedAt: input.preparedAt,
      bindingProbe,
      creatorCapabilityEvidenceRevision:
        micro050Evidence.creatorCapabilityEvidenceRevision!,
    });
    publicationService.registerConsentRevision({ consent: fixtures.consent });
    publicationService.registerExportApprovalRevision({
      exportApproval: fixtures.exportApproval,
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
      createdAt: input.preparedAt,
    });
    publicationService.approveIntent({
      intentId: MICRO_037_INTENT_ID,
      exportApproval: fixtures.exportApproval,
      consent: fixtures.consent,
      now: input.preparedAt,
    });
  }

  if (blockers.length === 0 && renderBinding && micro050Evidence) {
    persistMicro037OperatorAuthorization({
      repository: microdramaRepository,
      record: buildMicro037OperatorAuthorizationRecord({
        renderBinding,
        episodeRevisionId,
        creatorCapabilityEvidenceRevision:
          micro050Evidence.creatorCapabilityEvidenceRevision!,
        operatorId,
        authorizedAt: input.preparedAt,
      }),
    });
  }

  const loadedOperatorAuthorization = loadMicro037OperatorAuthorization(microdramaRepository);
  const finalPreflight =
    renderBinding && bindingProbe
      ? evaluateMicro037TikTokPrivatePublicationCanaryPreflight({
          evaluatedAt: input.preparedAt,
          operatorAuthorization: loadedOperatorAuthorization ?? undefined,
          renderBinding,
          episodeRevisionId,
          micro050Evidence,
          appAuditReadiness,
          consent: publicationRepository.getConsentRevision(MICRO_037_CONSENT_REVISION_ID),
          exportApproval:
            publicationRepository.getExportApprovalRevision(
              MICRO_037_EXPORT_APPROVAL_REVISION_ID
            ),
        })
      : null;

  const preflightAllowed =
    blockers.length === 0 && finalPreflight?.preflight.allowed === true;

  if (!preflightAllowed && blockers.length === 0) {
    blockers.push(...(finalPreflight?.preflight.blockReasons ?? ["PREFLIGHT_BLOCKED"]));
    for (const gate of finalPreflight?.preflight.readinessGates ?? []) {
      if (!gate.ok) {
        blockers.push(`GATE_${gate.gate}${gate.message ? `:${gate.message}` : ""}`);
      }
    }
  }

  return {
    status: preflightAllowed ? "READY_FOR_EXPLICIT_EXECUTE" : "BLOCKED",
    blockers,
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    renderBinding,
    preflightAllowed,
  };
}

export function micro037AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro037BoundedPublicationCanaryAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_037_TASK_ID,
    status: input.preparation.status,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro037AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    renderBinding: input.preparation.renderBinding,
    preflightAllowed: input.preparation.preflightAllowed,
    blockers: input.preparation.blockers,
    metadataContentHash: MICRO_037_METADATA_CONTENT_HASH,
    renderEvidenceContentHash: input.preparation.renderBinding
      ? computeMicro037RenderEvidenceContentHash(input.preparation.renderBinding)
      : null,
  };
}
