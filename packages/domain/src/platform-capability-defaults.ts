import type {
  ArtifactRenderProfile,
  ApprovalGate,
  ContentLocale,
  ContentProfileId,
} from "./workflow-contracts.js";
import { APPROVAL_GATES } from "./workflow-contracts.js";

export interface PlatformProfileCapabilityDefaults {
  readonly supportedLocales: readonly ContentLocale[];
  readonly defaultLocale: ContentLocale;
  readonly supportedVariants: readonly ["full", "short"];
  readonly approvalMode: "required";
  readonly publicationMode: "none";
  readonly renderProfile: ArtifactRenderProfile;
  readonly requiredReviewGates: readonly ApprovalGate[];
}

export const PLATFORM_PROFILE_CAPABILITY_DEFAULTS: Readonly<
  Record<ContentProfileId, PlatformProfileCapabilityDefaults>
> = {
  "dark-truth": {
    supportedLocales: ["en"],
    defaultLocale: "en",
    supportedVariants: ["full", "short"],
    approvalMode: "required",
    publicationMode: "none",
    renderProfile: "youtube",
    requiredReviewGates: APPROVAL_GATES,
  },
  "mathematics-education": {
    supportedLocales: ["en"],
    defaultLocale: "en",
    supportedVariants: ["full", "short"],
    approvalMode: "required",
    publicationMode: "none",
    renderProfile: "educational",
    requiredReviewGates: APPROVAL_GATES,
  },
  "strategic-reinvention": {
    supportedLocales: ["it", "en", "de", "es", "fr"],
    defaultLocale: "it",
    supportedVariants: ["full", "short"],
    approvalMode: "required",
    publicationMode: "none",
    renderProfile: "youtube",
    requiredReviewGates: APPROVAL_GATES,
  },
  history: {
    supportedLocales: ["en", "de", "fr"],
    defaultLocale: "en",
    supportedVariants: ["full", "short"],
    approvalMode: "required",
    publicationMode: "none",
    renderProfile: "youtube",
    requiredReviewGates: APPROVAL_GATES,
  },
};

export const PLATFORM_CAPABILITY_REGISTRY_REVISION = 1;
