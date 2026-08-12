import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  evaluateConsentRevisionAdmission,
  evaluateExportApprovalAdmission,
  evaluateMicrodramaBudgetPreflight,
  publicationCapabilityAllowsDispatch,
  type CreatorContentConsentRevision,
  type MicrodramaBudgetPreflight,
  type MicrodramaBudgetProfile,
  type MicrodramaDispatchMode,
  type MicrodramaPreflightWorkItem,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationProvider,
  type MicrodramaInteractionSettings,
  type MicrodramaPublicationTargetProfile,
  type TikTokCreatorCapabilityState,
  type TikTokMetadataRevision,
  type TikTokPostExportApprovalRevision,
  type TrustGateDecision,
} from "@mediaforge/domain";

import {
  READINESS_EVIDENCE_SCHEMA_VERSION,
  type ReadinessEvidenceRecord,
  type ReadinessProjectionResult,
} from "./readiness-evidence-contracts.js";
import {
  defaultEvidenceBackedCheck,
  evaluateReadinessProjection,
  type ReadinessCheckDefinition,
} from "./readiness-evidence-evaluator.js";
import {
  VISUAL_RENDER_READINESS_CHECKS,
  visualRenderTargetRevisionHash,
  visualRenderTargetRevisionId,
  type VisualRenderReadinessBinding,
} from "./visual-render-readiness.js";

export const PUBLICATION_READINESS_SCHEMA_VERSION =
  "mediaforge.microdrama.publication-readiness.v1" as const;

export const PUBLICATION_READINESS_CHECKS = [
  { checkId: "publication.render", requiredEvidenceDomain: "visual_render" },
  { checkId: "publication.target" },
  { checkId: "publication.metadata" },
  { checkId: "publication.capability" },
  { checkId: "publication.consent" },
  { checkId: "publication.export" },
  { checkId: "publication.schedule" },
  { checkId: "publication.budget" },
  { checkId: "publication.trust" },
] as const satisfies readonly ReadinessCheckDefinition[];

export type PublicationReadinessBinding = {
  readonly episodeId: string;
  readonly episodeRevisionId: string;
  readonly locale: string;
  readonly provider: MicrodramaPublicationProvider;
  readonly targetProfileId: string;
  readonly providerAccountId: string;
  readonly credentialVersion: string;
  readonly metadataProfileId: string;
  readonly metadataRevisionId: string;
  readonly metadataContentHash: string;
  readonly scheduleProfileId: string;
  readonly dispatchMode: MicrodramaDispatchMode;
  readonly scheduledAt: string | null;
  readonly scheduleConsentRecorded: boolean;
  readonly consentRevisionId: string;
  readonly exportApprovalRevisionId: string;
  readonly renderHash: string;
  readonly artifactManifestHash: string;
  readonly visualRenderTargetRevisionId: string;
  readonly visualRenderTargetRevisionHash: string;
  readonly publicationCapabilityState: MicrodramaPublicationCapabilityState;
  readonly creatorCapabilityState: TikTokCreatorCapabilityState;
  readonly creatorCapabilityEvidenceHash: string;
  readonly privacy: "public" | "friends" | "private";
  readonly interactionSettings: MicrodramaInteractionSettings;
  readonly aiContentDeclared: boolean;
  readonly commercialContentDeclared: boolean;
};

export type PublicationReadinessInput = {
  readonly binding: PublicationReadinessBinding;
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
  readonly visualRenderBinding?: VisualRenderReadinessBinding;
};

export type PublicationReadinessFacet =
  | "render"
  | "target"
  | "metadata"
  | "capability"
  | "consent"
  | "export"
  | "schedule"
  | "budget"
  | "trust";

const INVALIDATION_BY_FACET: Readonly<
  Record<PublicationReadinessFacet, readonly string[]>
> = {
  render: ["publication.render"],
  target: ["publication.target", "publication.capability"],
  metadata: ["publication.metadata", "publication.export"],
  capability: ["publication.capability"],
  consent: ["publication.consent", "publication.export"],
  export: ["publication.export"],
  schedule: ["publication.schedule"],
  budget: ["publication.budget"],
  trust: ["publication.trust"],
};

export function publicationTargetRevisionId(
  binding: PublicationReadinessBinding
): string {
  return `rev.publication.${binding.episodeId.toLowerCase()}.${binding.locale.toLowerCase()}.${binding.targetProfileId}.${binding.metadataRevisionId}`;
}

export function publicationTargetRevisionHash(
  binding: PublicationReadinessBinding
): string {
  return computePayloadHash({
    schemaVersion: PUBLICATION_READINESS_SCHEMA_VERSION,
    episodeId: binding.episodeId,
    episodeRevisionId: binding.episodeRevisionId,
    locale: binding.locale,
    provider: binding.provider,
    targetProfileId: binding.targetProfileId,
    providerAccountId: binding.providerAccountId,
    credentialVersion: binding.credentialVersion,
    metadataProfileId: binding.metadataProfileId,
    metadataRevisionId: binding.metadataRevisionId,
    metadataContentHash: binding.metadataContentHash,
    scheduleProfileId: binding.scheduleProfileId,
    dispatchMode: binding.dispatchMode,
    scheduledAt: binding.scheduledAt,
    scheduleConsentRecorded: binding.scheduleConsentRecorded,
    consentRevisionId: binding.consentRevisionId,
    exportApprovalRevisionId: binding.exportApprovalRevisionId,
    renderHash: binding.renderHash,
    artifactManifestHash: binding.artifactManifestHash,
    visualRenderTargetRevisionId: binding.visualRenderTargetRevisionId,
    visualRenderTargetRevisionHash: binding.visualRenderTargetRevisionHash,
    publicationCapabilityState: binding.publicationCapabilityState,
    creatorCapabilityState: binding.creatorCapabilityState,
    creatorCapabilityEvidenceHash: binding.creatorCapabilityEvidenceHash,
    privacy: binding.privacy,
    interactionSettings: binding.interactionSettings,
    aiContentDeclared: binding.aiContentDeclared,
    commercialContentDeclared: binding.commercialContentDeclared,
  });
}

export function resolvePublicationReadinessBinding(input: {
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly metadataRevision: TikTokMetadataRevision;
  readonly episodeRevisionId: string;
  readonly visualRenderBinding: VisualRenderReadinessBinding;
  readonly consentRevisionId: string;
  readonly exportApprovalRevisionId: string;
  readonly renderHash: string;
  readonly artifactManifestHash: string;
  readonly dispatchMode: MicrodramaDispatchMode;
  readonly scheduledAt?: string | null;
  readonly scheduleConsentRecorded?: boolean;
  readonly publicationCapabilityState?: MicrodramaPublicationCapabilityState;
  readonly creatorCapabilityState?: TikTokCreatorCapabilityState;
  readonly creatorCapabilityEvidenceHash: string;
  readonly privacy: "public" | "friends" | "private";
  readonly interactionSettings: MicrodramaInteractionSettings;
  readonly aiContentDeclared: boolean;
  readonly commercialContentDeclared: boolean;
}): PublicationReadinessBinding {
  if (input.targetProfile.provider !== "tiktok") {
    throw new Error("Publication readiness currently requires a TikTok target profile.");
  }
  if (input.targetProfile.locale !== input.metadataRevision.locale) {
    throw new Error("Metadata locale does not match publication target profile.");
  }
  if (input.targetProfile.metadataProfileId !== input.metadataRevision.metadataProfileId) {
    throw new Error("Metadata profile does not match publication target profile.");
  }
  if (
    input.visualRenderBinding.episodeId.toLowerCase() !==
    input.metadataRevision.episodeId.toLowerCase()
  ) {
    throw new Error("Visual render episode does not match metadata episode.");
  }
  if (
    input.visualRenderBinding.locale.toLowerCase() !==
    input.metadataRevision.locale.toLowerCase()
  ) {
    throw new Error("Visual render locale does not match metadata locale.");
  }

  return {
    episodeId: input.metadataRevision.episodeId,
    episodeRevisionId: input.episodeRevisionId,
    locale: input.metadataRevision.locale,
    provider: input.targetProfile.provider,
    targetProfileId: input.targetProfile.profileId,
    providerAccountId: input.targetProfile.providerAccountId,
    credentialVersion: input.targetProfile.credentialVersion,
    metadataProfileId: input.targetProfile.metadataProfileId,
    metadataRevisionId: input.metadataRevision.metadataRevisionId,
    metadataContentHash: input.metadataRevision.contentHash,
    scheduleProfileId: input.targetProfile.scheduleProfileId,
    dispatchMode: input.dispatchMode,
    scheduledAt: input.scheduledAt ?? null,
    scheduleConsentRecorded: input.scheduleConsentRecorded ?? false,
    consentRevisionId: input.consentRevisionId,
    exportApprovalRevisionId: input.exportApprovalRevisionId,
    renderHash: input.renderHash,
    artifactManifestHash: input.artifactManifestHash,
    visualRenderTargetRevisionId: visualRenderTargetRevisionId(
      input.visualRenderBinding
    ),
    visualRenderTargetRevisionHash: visualRenderTargetRevisionHash(
      input.visualRenderBinding
    ),
    publicationCapabilityState:
      input.publicationCapabilityState ?? "private_canary",
    creatorCapabilityState: input.creatorCapabilityState ?? "available",
    creatorCapabilityEvidenceHash: input.creatorCapabilityEvidenceHash,
    privacy: input.privacy,
    interactionSettings: input.interactionSettings,
    aiContentDeclared: input.aiContentDeclared,
    commercialContentDeclared: input.commercialContentDeclared,
  };
}

export function validatePublicationBinding(input: {
  readonly binding: PublicationReadinessBinding;
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly metadataRevision: TikTokMetadataRevision;
  readonly visualRenderBinding: VisualRenderReadinessBinding;
}): string[] {
  const errors: string[] = [];
  if (input.targetProfile.profileId !== input.binding.targetProfileId) {
    errors.push("targetProfileId does not match target profile");
  }
  if (input.targetProfile.providerAccountId !== input.binding.providerAccountId) {
    errors.push("providerAccountId does not match target profile");
  }
  if (input.metadataRevision.metadataRevisionId !== input.binding.metadataRevisionId) {
    errors.push("metadataRevisionId does not match metadata revision");
  }
  if (input.metadataRevision.contentHash !== input.binding.metadataContentHash) {
    errors.push("metadataContentHash does not match metadata revision");
  }
  if (
    input.visualRenderBinding.episodeId.toLowerCase() !== input.binding.episodeId.toLowerCase()
  ) {
    errors.push("episodeId does not match visual render binding");
  }
  if (
    input.visualRenderBinding.locale.toLowerCase() !== input.binding.locale.toLowerCase()
  ) {
    errors.push("locale does not match visual render binding");
  }
  return errors;
}

export function buildPublicationBudgetWorkItem(input: {
  readonly binding: PublicationReadinessBinding;
  readonly estimatedCostMinor?: number;
}): MicrodramaPreflightWorkItem {
  return {
    taskId: "task.locale-publish",
    episodeId: input.binding.episodeId.toLowerCase(),
    locale: input.binding.locale,
    provider: input.binding.provider,
    assetType: "render",
    assetCostScope: "locale_metadata",
    revisionId: publicationTargetRevisionId(input.binding),
    estimatedCostMinor: input.estimatedCostMinor ?? 100,
  };
}

export function evaluatePublicationBudgetPreflight(input: {
  readonly binding: PublicationReadinessBinding;
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly estimatedCostMinor?: number;
}): MicrodramaBudgetPreflight {
  return evaluateMicrodramaBudgetPreflight({
    correlationId: input.correlationId,
    workItems: [
      buildPublicationBudgetWorkItem({
        binding: input.binding,
        ...(input.estimatedCostMinor !== undefined
          ? { estimatedCostMinor: input.estimatedCostMinor }
          : {}),
      }),
    ],
    profiles: input.profiles,
    commitments: [],
    evaluatedAt: input.evaluatedAt,
  });
}

export function publicationChecksInvalidatedByChange(
  facet: PublicationReadinessFacet
): readonly string[] {
  return INVALIDATION_BY_FACET[facet];
}

function findVisualRenderEvidence(
  evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>,
  checkId: string,
  boundRevisionId: string,
  boundRevisionHash: string
): ReadinessEvidenceRecord | undefined {
  return [...evidenceById.values()].find(
    (record) =>
      record.domain === "visual_render" &&
      record.checkId === checkId &&
      record.boundRevisionId === boundRevisionId &&
      record.boundRevisionHash === boundRevisionHash
  );
}

function visualRenderChainReady(input: {
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly visualRenderTargetRevisionId: string;
  readonly visualRenderTargetRevisionHash: string;
}): { readonly ready: boolean; readonly reason?: string } {
  for (const check of VISUAL_RENDER_READINESS_CHECKS) {
    const evidence = findVisualRenderEvidence(
      input.evidenceById,
      check.checkId,
      input.visualRenderTargetRevisionId,
      input.visualRenderTargetRevisionHash
    );
    if (!evidence) {
      return {
        ready: false,
        reason: `Missing visual render evidence for ${check.checkId}.`,
      };
    }
    if (evidence.status !== "ACTIVE") {
      return {
        ready: false,
        reason: `Visual render evidence ${evidence.evidenceId} is ${evidence.status.toLowerCase()}.`,
      };
    }
  }
  return { ready: true };
}

export function buildPublicationReadinessEvidenceRecords(input: {
  readonly binding: PublicationReadinessBinding;
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly consent: CreatorContentConsentRevision;
  readonly exportApproval: TikTokPostExportApprovalRevision;
  readonly visualRenderReady: boolean;
  readonly budgetPreflight: MicrodramaBudgetPreflight;
  readonly trustDecision: TrustGateDecision;
  readonly recordedAt: string;
}): ReadinessEvidenceRecord[] {
  const targetRevisionId = publicationTargetRevisionId(input.binding);
  const targetRevisionHash = publicationTargetRevisionHash(input.binding);
  const episodeKey = input.binding.episodeId.toLowerCase();
  const localeKey = input.binding.locale.toLowerCase();

  const consentAdmission = evaluateConsentRevisionAdmission({
    consent: input.consent,
    provider: input.binding.provider,
    locale: input.binding.locale,
    now: input.recordedAt,
  });
  const exportAdmission = evaluateExportApprovalAdmission({
    exportApproval: input.exportApproval,
    consentRevisionId: input.binding.consentRevisionId,
    binding: {
      provider: input.binding.provider,
      providerAccountId: input.binding.providerAccountId,
      credentialVersion: input.binding.credentialVersion,
      episodeId: input.binding.episodeId,
      episodeRevisionId: input.binding.episodeRevisionId,
      locale: input.binding.locale,
      renderHash: input.binding.renderHash,
      metadataRevisionId: input.binding.metadataRevisionId,
      consentRevisionId: input.binding.consentRevisionId,
      exportApprovalRevisionId: input.binding.exportApprovalRevisionId,
      privacy: input.binding.privacy,
      interactionSettings: input.binding.interactionSettings,
      aiContentDeclared: input.binding.aiContentDeclared,
      commercialContentDeclared: input.binding.commercialContentDeclared,
    },
    now: input.recordedAt,
  });

  const capabilityReady =
    publicationCapabilityAllowsDispatch(input.binding.publicationCapabilityState) &&
    input.binding.creatorCapabilityState !== "unavailable" &&
    input.binding.creatorCapabilityEvidenceHash.length === 64;

  const scheduleReady =
    input.binding.dispatchMode === "manual" ||
    (input.binding.scheduledAt !== null && input.binding.scheduleConsentRecorded);

  const base = {
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    domain: "publication" as const,
    boundRevisionId: targetRevisionId,
    boundRevisionHash: targetRevisionHash,
    recordedAt: input.recordedAt,
  };

  return [
    {
      ...base,
      evidenceId: `evidence.publication.render.${episodeKey}.${localeKey}`,
      checkId: "publication.render",
      status: input.visualRenderReady ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.target.${episodeKey}.${localeKey}`,
      checkId: "publication.target",
      status: input.targetProfile.enabled ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.metadata.${episodeKey}.${localeKey}`,
      checkId: "publication.metadata",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.capability.${episodeKey}.${localeKey}`,
      checkId: "publication.capability",
      status: capabilityReady ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.consent.${episodeKey}.${localeKey}`,
      checkId: "publication.consent",
      status: consentAdmission.allowed ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.export.${episodeKey}.${localeKey}`,
      checkId: "publication.export",
      status: exportAdmission.allowed ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.schedule.${episodeKey}.${localeKey}`,
      checkId: "publication.schedule",
      status: scheduleReady ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.budget.${episodeKey}.${localeKey}`,
      checkId: "publication.budget",
      status: input.budgetPreflight.allowed ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.publication.trust.${episodeKey}.${localeKey}`,
      checkId: "publication.trust",
      status: input.trustDecision.allowed ? "ACTIVE" : "STALE",
    },
  ];
}

export function evaluatePublicationReadiness(
  input: PublicationReadinessInput
): ReadinessProjectionResult {
  const targetRevisionId = publicationTargetRevisionId(input.binding);
  const targetRevisionHash = publicationTargetRevisionHash(input.binding);

  return evaluateReadinessProjection({
    domain: "publication",
    targetRevisionId,
    targetRevisionHash,
    projectedAt: input.projectedAt,
    checks: [...PUBLICATION_READINESS_CHECKS],
    evidenceById: input.evidenceById,
    evaluateCheck: (check, evidence) => {
      if (check.checkId === "publication.render") {
        const chain = visualRenderChainReady({
          evidenceById: input.evidenceById,
          visualRenderTargetRevisionId: input.binding.visualRenderTargetRevisionId,
          visualRenderTargetRevisionHash: input.binding.visualRenderTargetRevisionHash,
        });
        if (!chain.ready) {
          return {
            checkId: check.checkId,
            result: "FAIL",
            failureClass: "domain_blocked",
            reason:
              chain.reason ??
              "Visual render evidence chain is not ready for publication admission.",
          };
        }
        return defaultEvidenceBackedCheck(
          check,
          evidence,
          targetRevisionId,
          targetRevisionHash
        );
      }

      if (check.checkId === "publication.capability") {
        if (!publicationCapabilityAllowsDispatch(input.binding.publicationCapabilityState)) {
          return {
            checkId: check.checkId,
            result: "FAIL",
            failureClass: "domain_blocked",
            reason: `Publication capability ${input.binding.publicationCapabilityState} does not permit admission.`,
          };
        }
        if (input.binding.provider === "tiktok") {
          if (input.binding.creatorCapabilityState === "unavailable") {
            return {
              checkId: check.checkId,
              result: "FAIL",
              failureClass: "stale",
              reason:
                "TikTok creator posting capability is unavailable for the bound account.",
            };
          }
          if (input.binding.creatorCapabilityState === "restricted") {
            return {
              checkId: check.checkId,
              result: "FAIL",
              failureClass: "stale",
              reason:
                "TikTok creator posting capability is restricted for the bound account.",
            };
          }
        }
        return defaultEvidenceBackedCheck(
          check,
          evidence,
          targetRevisionId,
          targetRevisionHash
        );
      }

      if (check.checkId === "publication.schedule") {
        if (input.binding.dispatchMode === "preapproved_scheduled") {
          if (!input.binding.scheduledAt) {
            return {
              checkId: check.checkId,
              result: "FAIL",
              failureClass: "missing",
              reason: "PREAPPROVED_SCHEDULED requires a scheduledAt instant.",
            };
          }
          if (!input.binding.scheduleConsentRecorded) {
            return {
              checkId: check.checkId,
              result: "FAIL",
              failureClass: "missing",
              reason: "PREAPPROVED_SCHEDULED requires schedule-time consent evidence.",
            };
          }
        }
        return defaultEvidenceBackedCheck(
          check,
          evidence,
          targetRevisionId,
          targetRevisionHash
        );
      }

      return defaultEvidenceBackedCheck(
        check,
        evidence,
        targetRevisionId,
        targetRevisionHash
      );
    },
  });
}
