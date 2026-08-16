import {
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_OAUTH_FIXTURE,
} from "./micro-050-canary-bindings.js";
import {
  MICRO_037_CANARY_EPISODE_ID,
  MICRO_037_CANARY_LOCALE,
  type Micro037RenderBinding,
} from "./micro-037-canary-micro-035-render-evidence.js";

export const MICRO_037_TASK_ID = "MICRO-037";

export { MICRO_037_CANARY_EPISODE_ID, MICRO_037_CANARY_LOCALE } from "./micro-037-canary-micro-035-render-evidence.js";

export const MICRO_037_CANARY_PRIVACY = "private" as const;

export const MICRO_037_CANARY_INTERACTION_SETTINGS = {
  allowComments: false,
  allowDuet: false,
  allowStitch: false,
} as const;

export const MICRO_037_CONSENT_REVISION_ID = "consent.micro-037.private-canary";
export const MICRO_037_EXPORT_APPROVAL_REVISION_ID =
  "export.approval.micro-037.private-canary";
export const MICRO_037_METADATA_REVISION_ID = "meta.rev.micro-037.private-canary";
export const MICRO_037_INTENT_ID = "intent.micro-037.private-canary";
export const MICRO_037_ATTEMPT_ID = "attempt.micro-037.private-canary";
export const MICRO_037_IDEMPOTENCY_KEY = "idempotency.micro-037.private-canary";

export function buildMicro037PublicationBindingProbe(input: {
  readonly renderBinding: Micro037RenderBinding;
  readonly episodeRevisionId: string;
  readonly creatorCapabilityEvidenceRevision: string;
  readonly approvalTimestamp: string;
}): {
  readonly providerAccountId: string;
  readonly creatorCapabilityEvidenceRevision: string;
  readonly episodeRevisionId: string;
  readonly locale: typeof MICRO_037_CANARY_LOCALE;
  readonly renderHash: string;
  readonly metadataRevision: string;
  readonly privacy: typeof MICRO_037_CANARY_PRIVACY;
  readonly interactionSettings: typeof MICRO_037_CANARY_INTERACTION_SETTINGS;
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
    locale: MICRO_037_CANARY_LOCALE,
    renderHash: input.renderBinding.visualRenderHash,
    metadataRevision: MICRO_037_METADATA_REVISION_ID,
    privacy: MICRO_037_CANARY_PRIVACY,
    interactionSettings: { ...MICRO_037_CANARY_INTERACTION_SETTINGS },
    aiDeclaration: true,
    commercialDeclaration: false,
    consentRevision: MICRO_037_CONSENT_REVISION_ID,
    exportApprovalRevision: MICRO_037_EXPORT_APPROVAL_REVISION_ID,
    approvalTimestamp: input.approvalTimestamp,
  };
}

export const MICRO_037_TIKTOK_ACCOUNT_BINDINGS = {
  accountId: MICRO_050_OAUTH_FIXTURE.accountId,
  providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  episodeId: MICRO_037_CANARY_EPISODE_ID,
  locale: MICRO_037_CANARY_LOCALE,
} as const;
