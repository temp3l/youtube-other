import crypto from "node:crypto";

import {
  CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
  type ApprovalMode,
  type CapabilityRegistry,
  type ConfigurationFieldKey,
  type ConfigurationFieldProvenance,
  type CapabilityResolutionContext,
  type ResolvedProductionConfiguration,
  resolvedProductionConfigurationSchema,
  type TenantSettings,
  type PublicationCapability,
} from "./capability-configuration-contracts.js";
import { resolvedConfigFingerprintSchema } from "./production-state-contracts.js";
import {
  PLATFORM_CAPABILITY_REGISTRY_REVISION,
  PLATFORM_PROFILE_CAPABILITY_DEFAULTS,
} from "./platform-capability-defaults.js";
import type {
  ArtifactRenderProfile,
  ContentLocale,
  ContentProfileId,
  ContentVariant,
  ApprovalGate,
} from "./workflow-contracts.js";

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function intersectLocales(
  base: readonly ContentLocale[],
  override: readonly ContentLocale[] | undefined
): ContentLocale[] {
  if (!override) return [...base];
  const allowed = new Set(base);
  return override.filter((locale) => allowed.has(locale));
}

function pickField<T>(
  key: ConfigurationFieldKey,
  layers: ReadonlyArray<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: T;
  }>
): { readonly value: T; readonly provenance: ConfigurationFieldProvenance } {
  const selected = layers[0];
  if (!selected) {
    throw new Error(`Configuration field ${key} has no resolution layers.`);
  }
  return {
    value: selected.value,
    provenance: {
      field: key,
      layer: selected.layer,
      layerRevision: selected.revision,
      layerId: selected.layerId,
    },
  };
}

export function computeResolvedConfigurationFingerprint(
  configuration: Pick<
    ResolvedProductionConfiguration,
    | "profileId"
    | "supportedLocales"
    | "defaultLocale"
    | "supportedVariants"
    | "approvalMode"
    | "publicationMode"
    | "renderProfile"
    | "voiceProfileVersionId"
    | "requiredReviewGates"
    | "configurationRevision"
  >
): ResolvedProductionConfiguration["fingerprint"] {
  return resolvedConfigFingerprintSchema.parse(
    digest({
      profileId: configuration.profileId,
      supportedLocales: configuration.supportedLocales,
      defaultLocale: configuration.defaultLocale,
      supportedVariants: configuration.supportedVariants,
      approvalMode: configuration.approvalMode,
      publicationMode: configuration.publicationMode,
      renderProfile: configuration.renderProfile,
      voiceProfileVersionId: configuration.voiceProfileVersionId ?? null,
      requiredReviewGates: configuration.requiredReviewGates,
      configurationRevision: configuration.configurationRevision,
    })
  );
}

export function computeCapabilityVersion(input: {
  readonly platformRevision: number;
  readonly tenant: TenantSettings;
  readonly genreRevision?: number;
  readonly episodeRevision?: number;
  readonly profileId: ContentProfileId;
}): string {
  return digest({
    platformRevision: input.platformRevision,
    tenantRevision: input.tenant.revision,
    genreRevision: input.genreRevision ?? null,
    episodeRevision: input.episodeRevision ?? null,
    profileId: input.profileId,
    entitledProfiles: input.tenant.entitledProfiles,
  });
}

export function resolveProductionConfiguration(
  context: CapabilityResolutionContext
): ResolvedProductionConfiguration {
  if (context.pinnedConfiguration) {
    return context.pinnedConfiguration;
  }

  const platform = PLATFORM_PROFILE_CAPABILITY_DEFAULTS[context.profileId];
  const platformLocales = [...platform.supportedLocales];
  const tenantOverride = context.tenant.profileLocaleOverrides?.[context.profileId];
  const tenantLocales = tenantOverride
    ? intersectLocales(platformLocales, tenantOverride)
    : platformLocales;

  let supportedLocales = tenantLocales;
  let supportedLocalesProvenance: ConfigurationFieldProvenance = {
    field: "supportedLocales",
    layer: tenantOverride ? "tenant" : "platform",
    layerRevision: tenantOverride
      ? context.tenant.revision
      : PLATFORM_CAPABILITY_REGISTRY_REVISION,
  };

  if (context.genre?.supportedLocales) {
    supportedLocales = intersectLocales(
      supportedLocales,
      context.genre.supportedLocales
    );
    supportedLocalesProvenance = {
      field: "supportedLocales",
      layer: "genre",
      layerRevision: context.genre.revision,
    };
  }

  if (supportedLocales.length === 0) {
    throw new Error("Configuration resolution produced no supported locales.");
  }

  const supportedLocalesPick = {
    value: supportedLocales,
    provenance: supportedLocalesProvenance,
  };

  const defaultLocaleLayers: Array<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: ContentLocale;
  }> = [];
  const tenantOverrideLocale =
    context.tenant.profileLocaleOverrides?.[context.profileId]?.[0];
  const genreDefaultLocale = context.genre?.defaultLocale;
  if (context.episode?.defaultLocale) {
    defaultLocaleLayers.push({
      layer: "episode",
      revision: context.episode.revision,
      layerId: context.episode.episodeId,
      value: context.episode.defaultLocale,
    });
  } else if (genreDefaultLocale) {
    defaultLocaleLayers.push({
      layer: "genre",
      revision: context.genre!.revision,
      value: genreDefaultLocale,
    });
  } else if (tenantOverrideLocale) {
    defaultLocaleLayers.push({
      layer: "tenant",
      revision: context.tenant.revision,
      value: tenantOverrideLocale,
    });
  }
  defaultLocaleLayers.push({
    layer: "platform",
    revision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    value: platform.defaultLocale,
  });
  const defaultLocalePick = pickField("defaultLocale", defaultLocaleLayers);
  let defaultLocale = defaultLocalePick.value;
  if (!supportedLocalesPick.value.includes(defaultLocale)) {
    const fallbackLocale = supportedLocalesPick.value[0];
    if (!fallbackLocale) {
      throw new Error("Configuration resolution produced no default locale.");
    }
    defaultLocale = fallbackLocale;
  }

  const supportedVariantsLayers: Array<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: ContentVariant[];
  }> = [];
  if (context.episode?.supportedVariants) {
    supportedVariantsLayers.push({
      layer: "episode",
      revision: context.episode.revision,
      layerId: context.episode.episodeId,
      value: [...context.episode.supportedVariants],
    });
  }
  supportedVariantsLayers.push({
    layer: "platform",
    revision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    value: [...platform.supportedVariants],
  });
  const supportedVariantsPick = pickField(
    "supportedVariants",
    supportedVariantsLayers
  );

  const approvalModeLayers: Array<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: ApprovalMode;
  }> = [];
  if (context.episode?.approvalMode) {
    approvalModeLayers.push({
      layer: "episode",
      revision: context.episode.revision,
      layerId: context.episode.episodeId,
      value: context.episode.approvalMode,
    });
  } else if (context.genre?.approvalMode) {
    approvalModeLayers.push({
      layer: "genre",
      revision: context.genre.revision,
      value: context.genre.approvalMode,
    });
  } else if (context.tenant.approvalMode) {
    approvalModeLayers.push({
      layer: "tenant",
      revision: context.tenant.revision,
      value: context.tenant.approvalMode,
    });
  }
  approvalModeLayers.push({
    layer: "platform",
    revision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    value: platform.approvalMode,
  });
  const approvalModePick = pickField("approvalMode", approvalModeLayers);

  const publicationModeLayers: Array<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: PublicationCapability;
  }> = [];
  if (context.episode?.publicationMode) {
    publicationModeLayers.push({
      layer: "episode",
      revision: context.episode.revision,
      layerId: context.episode.episodeId,
      value: context.episode.publicationMode,
    });
  } else if (context.genre?.publicationMode) {
    publicationModeLayers.push({
      layer: "genre",
      revision: context.genre.revision,
      value: context.genre.publicationMode,
    });
  } else if (context.tenant.publicationMode) {
    publicationModeLayers.push({
      layer: "tenant",
      revision: context.tenant.revision,
      value: context.tenant.publicationMode,
    });
  }
  publicationModeLayers.push({
    layer: "platform",
    revision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    value: platform.publicationMode,
  });
  const publicationModePick = pickField("publicationMode", publicationModeLayers);

  const renderProfileLayers: Array<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: ArtifactRenderProfile;
  }> = [];
  if (context.episode?.renderProfile) {
    renderProfileLayers.push({
      layer: "episode",
      revision: context.episode.revision,
      layerId: context.episode.episodeId,
      value: context.episode.renderProfile,
    });
  } else if (context.genre?.renderProfile) {
    renderProfileLayers.push({
      layer: "genre",
      revision: context.genre.revision,
      value: context.genre.renderProfile,
    });
  } else if (context.tenant.renderProfile) {
    renderProfileLayers.push({
      layer: "tenant",
      revision: context.tenant.revision,
      value: context.tenant.renderProfile,
    });
  }
  renderProfileLayers.push({
    layer: "platform",
    revision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    value: platform.renderProfile,
  });
  const renderProfilePick = pickField("renderProfile", renderProfileLayers);

  const requiredReviewGatesLayers: Array<{
    layer: ConfigurationFieldProvenance["layer"];
    revision?: number;
    layerId?: string;
    value: ApprovalGate[];
  }> = [];
  if (context.episode?.requiredReviewGates) {
    requiredReviewGatesLayers.push({
      layer: "episode",
      revision: context.episode.revision,
      layerId: context.episode.episodeId,
      value: [...context.episode.requiredReviewGates],
    });
  } else if (context.genre?.requiredReviewGates) {
    requiredReviewGatesLayers.push({
      layer: "genre",
      revision: context.genre.revision,
      value: [...context.genre.requiredReviewGates],
    });
  } else if (context.tenant.requiredReviewGates) {
    requiredReviewGatesLayers.push({
      layer: "tenant",
      revision: context.tenant.revision,
      value: [...context.tenant.requiredReviewGates],
    });
  }
  requiredReviewGatesLayers.push({
    layer: "platform",
    revision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    value: [...platform.requiredReviewGates],
  });
  const requiredReviewGatesPick = pickField(
    "requiredReviewGates",
    requiredReviewGatesLayers
  );

  const voiceProfileVersionId = context.episode?.voiceProfileVersionId;
  const voiceProvenance: ConfigurationFieldProvenance | undefined = voiceProfileVersionId
    ? {
        field: "voiceProfileVersionId",
        layer: "episode",
        ...(context.episode?.revision !== undefined
          ? { layerRevision: context.episode.revision }
          : {}),
        ...(context.episode?.episodeId
          ? { layerId: context.episode.episodeId }
          : {}),
      }
    : undefined;

  const configurationRevision =
    context.episode?.revision ??
    context.genre?.revision ??
    context.tenant.revision;

  const capabilityVersion = computeCapabilityVersion({
    platformRevision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
    tenant: context.tenant,
    profileId: context.profileId,
    ...(context.genre ? { genreRevision: context.genre.revision } : {}),
    ...(context.episode ? { episodeRevision: context.episode.revision } : {}),
  });

  const provenance: ConfigurationFieldProvenance[] = [
    {
      field: "profileId",
      layer: "tenant",
      layerRevision: context.tenant.revision,
    },
    supportedLocalesPick.provenance,
    defaultLocalePick.provenance,
    supportedVariantsPick.provenance,
    approvalModePick.provenance,
    publicationModePick.provenance,
    renderProfilePick.provenance,
    requiredReviewGatesPick.provenance,
  ];
  if (voiceProvenance) provenance.push(voiceProvenance);

  const resolved = {
    schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
    profileId: context.profileId,
    supportedLocales: supportedLocalesPick.value,
    defaultLocale,
    supportedVariants: supportedVariantsPick.value,
    approvalMode: approvalModePick.value,
    publicationMode: publicationModePick.value,
    renderProfile: renderProfilePick.value,
    voiceProfileVersionId,
    requiredReviewGates: requiredReviewGatesPick.value,
    configurationRevision,
    capabilityVersion,
    fingerprint: computeResolvedConfigurationFingerprint({
      profileId: context.profileId,
      supportedLocales: supportedLocalesPick.value,
      defaultLocale,
      supportedVariants: supportedVariantsPick.value,
      approvalMode: approvalModePick.value,
      publicationMode: publicationModePick.value,
      renderProfile: renderProfilePick.value,
      voiceProfileVersionId,
      requiredReviewGates: requiredReviewGatesPick.value,
      configurationRevision,
    }),
    provenance,
    resolvedAt: context.resolvedAt,
  };

  return resolvedProductionConfigurationSchema.parse(resolved);
}

export function buildCapabilityRegistry(
  tenant: TenantSettings,
  resolvedAt: string
): CapabilityRegistry {
  const cells = tenant.entitledProfiles.map((profileId) => {
    const resolved = resolveProductionConfiguration({
      profileId,
      tenant,
      resolvedAt,
    });
    return {
      profileId,
      locales: resolved.supportedLocales,
      variants: resolved.supportedVariants,
      renderProfiles: [resolved.renderProfile],
      publicationModes: [resolved.publicationMode],
      approvalModes: [resolved.approvalMode],
    };
  });

  const capabilityVersion = digest({
    tenantRevision: tenant.revision,
    entitledProfiles: tenant.entitledProfiles,
    cells,
    platformRevision: PLATFORM_CAPABILITY_REGISTRY_REVISION,
  });

  return {
    schemaVersion: CAPABILITY_CONFIGURATION_SCHEMA_VERSION,
    capabilityVersion,
    entitledProfiles: [...tenant.entitledProfiles],
    cells,
    tenantConfigurableFields: [
      "supportedLocales",
      "defaultLocale",
      "approvalMode",
      "publicationMode",
      "renderProfile",
      "requiredReviewGates",
    ],
    generatedAt: resolvedAt,
  };
}
