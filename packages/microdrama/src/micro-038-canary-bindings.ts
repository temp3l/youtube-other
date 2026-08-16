import {
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_OAUTH_FIXTURE,
} from "./micro-050-canary-bindings.js";
import {
  MICRO_038_CANARY_EPISODE_ID,
  MICRO_038_CANARY_LOCALE,
  type Micro038RenderBinding,
} from "./micro-038-canary-micro-035-render-evidence.js";

export const MICRO_038_TASK_ID = "MICRO-038";

export { MICRO_038_CANARY_EPISODE_ID, MICRO_038_CANARY_LOCALE } from "./micro-038-canary-micro-035-render-evidence.js";

export const MICRO_038_CANARY_PRIVACY = "public" as const;

export const MICRO_038_CANARY_INTERACTION_SETTINGS = {
  allowComments: false,
  allowDuet: false,
  allowStitch: false,
} as const;

export const MICRO_038_CONSENT_REVISION_ID = "consent.micro-038.public-canary";
export const MICRO_038_EXPORT_APPROVAL_REVISION_ID =
  "export.approval.micro-038.public-canary";
export const MICRO_038_METADATA_REVISION_ID = "meta.rev.micro-038.public-canary";
export const MICRO_038_INTENT_ID = "intent.micro-038.public-canary";
export const MICRO_038_ATTEMPT_ID = "attempt.micro-038.public-canary";
export const MICRO_038_IDEMPOTENCY_KEY = "idempotency.micro-038.public-canary";

export function buildMicro038PublicationBindingProbe(input: {
  readonly renderBinding: Micro038RenderBinding;
  readonly episodeRevisionId: string;
  readonly creatorCapabilityEvidenceRevision: string;
  readonly approvalTimestamp: string;
}): {
  readonly providerAccountId: string;
  readonly creatorCapabilityEvidenceRevision: string;
  readonly episodeRevisionId: string;
  readonly locale: typeof MICRO_038_CANARY_LOCALE;
  readonly renderHash: string;
  readonly metadataRevision: string;
  readonly privacy: typeof MICRO_038_CANARY_PRIVACY;
  readonly interactionSettings: typeof MICRO_038_CANARY_INTERACTION_SETTINGS;
  readonly aiDeclaration: boolean;
  readonly commercialDeclaration: boolean;
  readonly consentRevision: string;
  readonly exportApprovalRevision: string;
  readonly approvalTimestamp: string;
} {
  return {
    providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    creatorCapabilityEvidenceRevision: input.creatorCapabilityEvidenceRevision,
    episodeRevisionId: input.episodeRevisionId,
    locale: MICRO_038_CANARY_LOCALE,
    renderHash: input.renderBinding.visualRenderHash,
    metadataRevision: MICRO_038_METADATA_REVISION_ID,
    privacy: MICRO_038_CANARY_PRIVACY,
    interactionSettings: { ...MICRO_038_CANARY_INTERACTION_SETTINGS },
    aiDeclaration: true,
    commercialDeclaration: false,
    consentRevision: MICRO_038_CONSENT_REVISION_ID,
    exportApprovalRevision: MICRO_038_EXPORT_APPROVAL_REVISION_ID,
    approvalTimestamp: input.approvalTimestamp,
  };
}

export const MICRO_038_TIKTOK_ACCOUNT_BINDINGS = {
  accountId: MICRO_050_OAUTH_FIXTURE.accountId,
  providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  episodeId: MICRO_038_CANARY_EPISODE_ID,
  locale: MICRO_038_CANARY_LOCALE,
} as const;
