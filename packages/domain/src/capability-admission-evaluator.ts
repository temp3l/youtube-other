import {
  CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
  type CapabilityRejection,
  type CapabilityResolutionContext,
  type ProductionCapabilityAdmissionRequest,
  type ProductionCapabilityAdmissionResult,
  productionCapabilityAdmissionResultSchema,
} from "./capability-configuration-contracts.js";
import {
  computeCapabilityVersion,
  resolveProductionConfiguration,
} from "./capability-configuration-resolver.js";
import { PLATFORM_CAPABILITY_REGISTRY_REVISION } from "./platform-capability-defaults.js";

export function evaluateProductionCapabilityAdmission(input: {
  readonly context: CapabilityResolutionContext;
  readonly request: ProductionCapabilityAdmissionRequest;
  readonly evaluatedAt: string;
}): ProductionCapabilityAdmissionResult {
  const rejections: CapabilityRejection[] = [];
  const { context, request, evaluatedAt } = input;

  if (!context.tenant.entitledProfiles.includes(request.profileId)) {
    rejections.push({
      code: "profile_not_entitled",
      message: "The workspace is not entitled to this production profile.",
      field: "profileId",
      entitlement: request.profileId,
      requestedValue: request.profileId,
    });
  }

  const currentCapabilityVersion = computeCapabilityVersion({
    platformRevision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    tenant: context.tenant,
    profileId: request.profileId,
    ...(context.genre ? { genreRevision: context.genre.revision } : {}),
    ...(context.episode ? { episodeRevision: context.episode.revision } : {}),
  });

  if (
    request.capabilityVersion &&
    request.capabilityVersion !== currentCapabilityVersion
  ) {
    rejections.push({
      code: "capability_version_stale",
      message:
        "Capability metadata is stale. Refresh capabilities before admitting workflow work.",
      field: "profileId",
    });
  }

  const resolvedConfiguration = resolveProductionConfiguration(context);

  if (
    request.pinnedFingerprint &&
    request.pinnedFingerprint !== resolvedConfiguration.fingerprint
  ) {
    rejections.push({
      code: "pinned_configuration_mismatch",
      message:
        "Pinned production revision configuration does not match the current resolved configuration.",
    });
  }

  if (![resolvedConfiguration.approvalMode].includes(request.approvalMode)) {
    rejections.push({
      code: "approval_mode_not_supported",
      message: "The requested approval mode is not supported for this profile.",
      field: "approvalMode",
      requestedValue: request.approvalMode,
    });
  }

  if (request.publicationMode !== "none") {
    if (resolvedConfiguration.publicationMode === "none") {
      rejections.push({
        code: "publication_not_enabled",
        message: "Publication is disabled for this workspace.",
        field: "publicationMode",
        entitlement: "publication",
        requestedValue: request.publicationMode,
      });
    }
  }

  const renderProfile = request.renderProfile ?? resolvedConfiguration.renderProfile;
  if (renderProfile !== resolvedConfiguration.renderProfile) {
    rejections.push({
      code: "render_not_supported",
      message: "The requested render profile is not supported for this configuration.",
      field: "renderProfile",
      requestedValue: renderProfile,
    });
  }

  for (const selection of request.selections) {
    if (!resolvedConfiguration.supportedLocales.includes(selection.locale)) {
      rejections.push({
        code: "locale_not_supported",
        message: `Locale ${selection.locale} is not supported for this profile.`,
        field: "supportedLocales",
        requestedValue: selection.locale,
      });
    }
    if (!resolvedConfiguration.supportedVariants.includes(selection.variant)) {
      rejections.push({
        code: "variant_not_supported",
        message: `Variant ${selection.variant} is not supported for this profile.`,
        field: "supportedVariants",
        requestedValue: selection.variant,
      });
    }
  }

  const voiceVersion =
    request.voiceProfileVersionId ?? resolvedConfiguration.voiceProfileVersionId;
  if (voiceVersion && context.voiceCompatibility) {
    for (const selection of request.selections) {
      const compatible = context.voiceCompatibility[selection.locale];
      if (compatible && !compatible.includes(voiceVersion)) {
        rejections.push({
          code: "voice_incompatible",
          message: `Voice profile version ${voiceVersion} is not compatible with locale ${selection.locale}.`,
          field: "voiceProfileVersionId",
          requestedValue: voiceVersion,
        });
      }
    }
  }

  const admitted = rejections.length === 0;

  return productionCapabilityAdmissionResultSchema.parse({
    schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
    admitted,
    capabilityVersion: currentCapabilityVersion,
    rejections,
    resolvedConfiguration: admitted ? resolvedConfiguration : undefined,
    evaluatedAt,
  });
}
