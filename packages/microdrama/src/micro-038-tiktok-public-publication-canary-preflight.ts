import type {
  CreatorContentConsentRevision,
  MicrodramaCanaryPreflightResult,
  MicrodramaOperatorAuthorizationRecord,
  TikTokAppAuditReadinessProjection,
  TikTokPostExportApprovalRevision,
} from "@mediaforge/domain";
import {
  evaluateExactPublicationIntentCanaryPreflight,
  evaluatePublicationDispatchAdmission,
  evaluateTikTokAppAuditOperationAdmission,
  publicationCapabilityAllowsDispatch,
  resolvePublicationCapability,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  MICRO_050_AUDIT_READY_FIXTURE,
  MICRO_050_CANARY_PROVIDER_APP_ID,
  MICRO_050_CANARY_WORKSPACE_ID,
} from "./micro-050-canary-bindings.js";
import {
  buildMicro038PublicationBindingProbe,
  MICRO_038_CANARY_EPISODE_ID,
  MICRO_038_CANARY_PRIVACY,
  MICRO_038_METADATA_REVISION_ID,
  MICRO_038_TASK_ID,
} from "./micro-038-canary-bindings.js";
import type { Micro038RenderBinding } from "./micro-038-canary-micro-035-render-evidence.js";
import {
  micro050EvidenceProvesActiveAccount,
  type Micro050CanaryExecutionEvidence,
} from "./micro-038-canary-micro-050-evidence.js";
import {
  computeMicro037EvidenceContentHashForMicro038,
  micro037EvidenceProvesPrivateCanaryDone,
  type Micro037CanaryExecutionEvidence,
} from "./micro-038-canary-micro-037-evidence.js";

export type Micro038TikTokPublicPublicationCanaryPreflightInput = {
  readonly evaluatedAt: string;
  readonly operatorAuthorization?: MicrodramaOperatorAuthorizationRecord;
  readonly renderBinding: Micro038RenderBinding;
  readonly episodeRevisionId: string;
  readonly micro050Evidence?: Micro050CanaryExecutionEvidence | null;
  readonly micro037Evidence?: Micro037CanaryExecutionEvidence | null;
  readonly appAuditReadiness?: TikTokAppAuditReadinessProjection | null;
  readonly consent?: CreatorContentConsentRevision;
  readonly exportApproval?: TikTokPostExportApprovalRevision;
};

export type Micro038TikTokPublicPublicationCanaryPreflightResult = {
  readonly preflight: MicrodramaCanaryPreflightResult;
  readonly bindingProbe: ReturnType<typeof buildMicro038PublicationBindingProbe>;
};

export function evaluateMicro038TikTokPublicPublicationCanaryPreflight(
  input: Micro038TikTokPublicPublicationCanaryPreflightInput
): Micro038TikTokPublicPublicationCanaryPreflightResult {
  const capabilityState = resolvePublicationCapability({
    state: "public_canary",
  });
  const bindingProbe =
    input.operatorAuthorization &&
    "approvalTimestamp" in input.operatorAuthorization.bindings
      ? input.operatorAuthorization.bindings
      : buildMicro038PublicationBindingProbe({
          renderBinding: input.renderBinding,
          episodeRevisionId: input.episodeRevisionId,
          creatorCapabilityEvidenceRevision:
            input.micro050Evidence?.creatorCapabilityEvidenceRevision ??
            "missing.creator.capability",
          approvalTimestamp: input.evaluatedAt,
        });

  const renderReady =
    input.renderBinding.visualRenderHash.length === 64 &&
    input.renderBinding.renderOutputPath.length > 0;

  const auditAdmission = evaluateTikTokAppAuditOperationAdmission({
    operation: "direct_post",
    readiness: input.appAuditReadiness ?? null,
    now: input.evaluatedAt,
  });

  const publicationAdmission =
    input.consent && input.exportApproval
      ? evaluatePublicationDispatchAdmission({
          correlationId: "corr.micro-038.preflight",
          evaluatedAt: input.evaluatedAt,
          capabilityState,
          targetProfile: {
            schemaVersion: "mediaforge.microdrama-publication.v1",
            profileId: "profile.micro-038.public-canary",
            seriesId: "seven-minutes-ahead",
            locale: bindingProbe.locale,
            provider: "tiktok",
            providerAccountId: bindingProbe.providerAccountId,
            credentialVersion:
              input.micro050Evidence?.refreshedCredentialVersionId ?? "cred.missing",
            metadataProfileId: "meta.profile.en-us",
            scheduleProfileId: "schedule.profile.en-us",
            enabled: true,
            registeredAt: input.evaluatedAt,
          },
          intent: {
            schemaVersion: "mediaforge.microdrama-publication.v1",
            intentId: "intent.micro-038.preflight",
            targetProfileId: "profile.micro-038.public-canary",
            binding: {
              provider: "tiktok",
              providerAccountId: bindingProbe.providerAccountId,
              credentialVersion:
                input.micro050Evidence?.refreshedCredentialVersionId ?? "cred.missing",
              episodeId: MICRO_038_CANARY_EPISODE_ID.toLowerCase(),
              episodeRevisionId: bindingProbe.episodeRevisionId,
              locale: bindingProbe.locale,
              renderHash: bindingProbe.renderHash,
              metadataRevisionId: bindingProbe.metadataRevision,
              consentRevisionId: bindingProbe.consentRevision,
              exportApprovalRevisionId: bindingProbe.exportApprovalRevision,
              privacy: MICRO_038_CANARY_PRIVACY,
              interactionSettings: bindingProbe.interactionSettings,
              aiContentDeclared: bindingProbe.aiDeclaration,
              commercialContentDeclared: bindingProbe.commercialDeclaration,
            },
            dispatchMode: "manual",
            idempotencyKey: "idempotency.micro-038.preflight",
            approvalState: "publication_approved",
            boundExportApprovalRevisionId: bindingProbe.exportApprovalRevision,
            state: "approved",
            createdAt: input.evaluatedAt,
          },
          consent: input.consent,
          exportApproval: input.exportApproval,
          operatorDispatchConfirmed: true,
        })
      : { allowed: false, message: "Publication consent/export missing." };

  const readinessGates = [
    {
      gate: "VISUAL_RENDER_READY",
      ok: renderReady,
      ...(renderReady ? {} : { message: "Render binding missing or invalid." }),
    },
    {
      gate: "PUBLICATION_READY",
      ok: renderReady && publicationAdmission.allowed,
      ...(renderReady && publicationAdmission.allowed
        ? {}
        : { message: "Publication readiness blocked." }),
    },
    {
      gate: "PUBLICATION_APPROVED",
      ok: publicationAdmission.allowed,
      ...(publicationAdmission.allowed
        ? {}
        : { message: publicationAdmission.message ?? "Publication not approved." }),
    },
    {
      gate: "TIKTOK_APP_AUDIT_READY",
      ok: auditAdmission.allowed,
      ...(auditAdmission.allowed
        ? {}
        : { message: auditAdmission.message ?? "TikTok app audit blocked." }),
    },
    {
      gate: "TIKTOK_OAUTH_CREATOR_INFO_READY",
      ok: micro050EvidenceProvesActiveAccount(input.micro050Evidence),
      ...(micro050EvidenceProvesActiveAccount(input.micro050Evidence)
        ? {}
        : { message: "MICRO-050 evidence missing or stale." }),
    },
    {
      gate: "TIKTOK_EXACT_POST_CONSENT",
      ok: input.consent?.state === "active",
      ...(input.consent?.state === "active"
        ? {}
        : { message: "Exact post consent missing or revoked." }),
    },
    {
      gate: "TIKTOK_PUBLIC_POSTING_ENABLED",
      ok:
        capabilityState === "public_canary" &&
        publicationCapabilityAllowsDispatch(capabilityState) &&
        bindingProbe.privacy === "public" &&
        micro037EvidenceProvesPrivateCanaryDone(input.micro037Evidence ?? null),
      ...(capabilityState === "public_canary" &&
      publicationCapabilityAllowsDispatch(capabilityState) &&
      bindingProbe.privacy === "public" &&
      micro037EvidenceProvesPrivateCanaryDone(input.micro037Evidence ?? null)
        ? {}
        : {
            message:
              "Public posting requires public_canary capability, public privacy, and MICRO-037 private canary evidence.",
          }),
    },
  ];

  const preflight = evaluateExactPublicationIntentCanaryPreflight({
    taskId: MICRO_038_TASK_ID,
    operatorAuthorization: input.operatorAuthorization,
    readinessGates,
    bindingProbe,
    permittedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: false,
      publicationCallsAllowed: true,
    },
    requestedCallPolicy: {
      externalCallsAllowed: true,
      paidCallsAllowed: false,
      publicationCallsAllowed: true,
    },
    evaluatedAt: input.evaluatedAt,
  });

  return { preflight, bindingProbe };
}

export function computeMicro038RenderEvidenceContentHash(
  renderBinding: Micro038RenderBinding
): string {
  return computePayloadHash({
    scope: "micro-038.render-evidence.v1",
    locale: renderBinding.locale,
    episodeId: renderBinding.episodeId,
    renderOutputPath: renderBinding.renderOutputPath,
    visualRenderHash: renderBinding.visualRenderHash,
    evidenceSource: renderBinding.evidenceSource,
  });
}

export function computeMicro050EvidenceContentHashForMicro038(
  evidence: Micro050CanaryExecutionEvidence | null
): string | null {
  if (!evidence || evidence.status !== "DONE") {
    return null;
  }
  return computePayloadHash({
    scope: "micro-038.micro-050-evidence.v1",
    providerAccountId: evidence.providerAccountId,
    refreshedCredentialVersionId: evidence.refreshedCredentialVersionId,
    creatorCapabilityEvidenceRevision: evidence.creatorCapabilityEvidenceRevision,
    grantedScopes: evidence.grantedScopes,
  });
}

export { computeMicro037EvidenceContentHashForMicro038 };

export const MICRO_038_AUDIT_PROBE = {
  workspaceId: MICRO_050_CANARY_WORKSPACE_ID,
  providerAppId: MICRO_050_CANARY_PROVIDER_APP_ID,
  fixture: MICRO_050_AUDIT_READY_FIXTURE,
} as const;

export const MICRO_038_METADATA_CONTENT_HASH = computePayloadHash({
  scope: "micro-038.metadata.v1",
  metadataRevisionId: MICRO_038_METADATA_REVISION_ID,
  locale: "en-US",
  episodeId: MICRO_038_CANARY_EPISODE_ID,
});
