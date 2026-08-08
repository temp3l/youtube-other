import { z } from "zod";

import { resolvedConfigFingerprintSchema } from "./production-state-contracts.js";
import {
  approvalGateSchema,
  artifactRenderProfileSchema,
  contentLocaleSchema,
  contentProfileIdSchema,
  contentVariantSchema,
  type ContentLocale,
  type ContentProfileId,
  type ContentVariant,
} from "./workflow-contracts.js";

export const CAPABILITY_CONFIGURATION_SCHEMA_VERSION =
  "mediaforge.capability.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const CONFIGURATION_LAYERS = [
  "platform",
  "tenant",
  "channel",
  "genre",
  "episode",
  "pinned_revision",
] as const;
export const configurationLayerSchema = z.enum(CONFIGURATION_LAYERS);
export type ConfigurationLayer = z.infer<typeof configurationLayerSchema>;

export const CONFIGURATION_FIELD_KEYS = [
  "profileId",
  "supportedLocales",
  "defaultLocale",
  "supportedVariants",
  "approvalMode",
  "publicationMode",
  "renderProfile",
  "voiceProfileVersionId",
  "requiredReviewGates",
] as const;
export const configurationFieldKeySchema = z.enum(CONFIGURATION_FIELD_KEYS);
export type ConfigurationFieldKey = z.infer<typeof configurationFieldKeySchema>;

export const publicationCapabilitySchema = z.enum(["none", "private_first"]);
export type PublicationCapability = z.infer<typeof publicationCapabilitySchema>;

export const approvalModeSchema = z.enum(["required", "automatic"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

export const configurationFieldProvenanceSchema = z
  .object({
    field: configurationFieldKeySchema,
    layer: configurationLayerSchema,
    layerRevision: z.number().int().nonnegative().optional(),
    layerId: identifierSchema.optional(),
  })
  .strict();
export type ConfigurationFieldProvenance = z.infer<
  typeof configurationFieldProvenanceSchema
>;

export const tenantConfigurableFieldSchema = z.enum([
  "supportedLocales",
  "defaultLocale",
  "approvalMode",
  "publicationMode",
  "renderProfile",
  "requiredReviewGates",
]);
export type TenantConfigurableField = z.infer<
  typeof tenantConfigurableFieldSchema
>;

export const TENANT_CONFIGURABLE_FIELDS: readonly TenantConfigurableField[] = [
  "supportedLocales",
  "defaultLocale",
  "approvalMode",
  "publicationMode",
  "renderProfile",
  "requiredReviewGates",
];

export const tenantSettingsSchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    revision: z.number().int().nonnegative(),
    entitledProfiles: z.array(contentProfileIdSchema).min(1),
    profileLocaleOverrides: z
      .partialRecord(
        contentProfileIdSchema,
        z.array(contentLocaleSchema).min(1)
      )
      .optional(),
    approvalMode: approvalModeSchema.optional(),
    publicationMode: publicationCapabilitySchema.optional(),
    renderProfile: artifactRenderProfileSchema.optional(),
    requiredReviewGates: z.array(approvalGateSchema).min(1).optional(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const genreConfigurationSchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    profileId: contentProfileIdSchema,
    revision: z.number().int().nonnegative(),
    supportedLocales: z.array(contentLocaleSchema).min(1).optional(),
    defaultLocale: contentLocaleSchema.optional(),
    approvalMode: approvalModeSchema.optional(),
    publicationMode: publicationCapabilitySchema.optional(),
    renderProfile: artifactRenderProfileSchema.optional(),
    requiredReviewGates: z.array(approvalGateSchema).min(1).optional(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type GenreConfiguration = z.infer<typeof genreConfigurationSchema>;

export const episodeConfigurationOverrideSchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    episodeId: identifierSchema,
    revision: z.number().int().nonnegative(),
    defaultLocale: contentLocaleSchema.optional(),
    supportedVariants: z.array(contentVariantSchema).min(1).optional(),
    approvalMode: approvalModeSchema.optional(),
    publicationMode: publicationCapabilitySchema.optional(),
    renderProfile: artifactRenderProfileSchema.optional(),
    voiceProfileVersionId: identifierSchema.optional(),
    requiredReviewGates: z.array(approvalGateSchema).min(1).optional(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type EpisodeConfigurationOverride = z.infer<
  typeof episodeConfigurationOverrideSchema
>;

export const resolvedProductionConfigurationSchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    profileId: contentProfileIdSchema,
    supportedLocales: z.array(contentLocaleSchema).min(1),
    defaultLocale: contentLocaleSchema,
    supportedVariants: z.array(contentVariantSchema).min(1),
    approvalMode: approvalModeSchema,
    publicationMode: publicationCapabilitySchema,
    renderProfile: artifactRenderProfileSchema,
    voiceProfileVersionId: identifierSchema.optional(),
    requiredReviewGates: z.array(approvalGateSchema).min(1),
    configurationRevision: z.number().int().nonnegative(),
    capabilityVersion: sha256Schema,
    fingerprint: resolvedConfigFingerprintSchema,
    provenance: z.array(configurationFieldProvenanceSchema).min(1),
    resolvedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.supportedLocales.includes(value.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "Default locale must be included in supported locales.",
      });
    }
  });
export type ResolvedProductionConfiguration = z.infer<
  typeof resolvedProductionConfigurationSchema
>;

export const CAPABILITY_REJECTION_CODES = [
  "profile_not_entitled",
  "locale_not_supported",
  "variant_not_supported",
  "voice_incompatible",
  "render_not_supported",
  "publication_not_enabled",
  "entitlement_missing",
  "approval_mode_not_supported",
  "configuration_invalid",
  "capability_version_stale",
  "pinned_configuration_mismatch",
] as const;
export const capabilityRejectionCodeSchema = z.enum(CAPABILITY_REJECTION_CODES);
export type CapabilityRejectionCode = z.infer<
  typeof capabilityRejectionCodeSchema
>;

export const capabilityRejectionSchema = z
  .object({
    code: capabilityRejectionCodeSchema,
    message: nonEmptyStringSchema,
    field: configurationFieldKeySchema.optional(),
    entitlement: nonEmptyStringSchema.optional(),
    requestedValue: z.string().optional(),
  })
  .strict();
export type CapabilityRejection = z.infer<typeof capabilityRejectionSchema>;

export const profileCapabilityCellSchema = z
  .object({
    profileId: contentProfileIdSchema,
    locales: z.array(contentLocaleSchema).min(1),
    variants: z.array(contentVariantSchema).min(1),
    renderProfiles: z.array(artifactRenderProfileSchema).min(1),
    publicationModes: z.array(publicationCapabilitySchema).min(1),
    approvalModes: z.array(approvalModeSchema).min(1),
  })
  .strict();
export type ProfileCapabilityCell = z.infer<typeof profileCapabilityCellSchema>;

export const capabilityRegistrySchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    capabilityVersion: sha256Schema,
    entitledProfiles: z.array(contentProfileIdSchema).min(1),
    cells: z.array(profileCapabilityCellSchema).min(1),
    tenantConfigurableFields: z.array(tenantConfigurableFieldSchema).min(1),
    generatedAt: isoDateTimeSchema,
  })
  .strict();
export type CapabilityRegistry = z.infer<typeof capabilityRegistrySchema>;

export const localeAdmissionSelectionSchema = z
  .object({
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
  })
  .strict();
export type LocaleAdmissionSelection = z.infer<
  typeof localeAdmissionSelectionSchema
>;

export const productionCapabilityAdmissionRequestSchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    profileId: contentProfileIdSchema,
    episodeRevision: z.number().int().nonnegative(),
    selections: z.array(localeAdmissionSelectionSchema).min(1).max(20),
    approvalMode: approvalModeSchema,
    publicationMode: publicationCapabilitySchema,
    renderProfile: artifactRenderProfileSchema.optional(),
    voiceProfileVersionId: identifierSchema.optional(),
    capabilityVersion: sha256Schema.optional(),
    pinnedFingerprint: resolvedConfigFingerprintSchema.optional(),
  })
  .strict();
export type ProductionCapabilityAdmissionRequest = z.infer<
  typeof productionCapabilityAdmissionRequestSchema
>;

export const productionCapabilityAdmissionResultSchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_CONFIGURATION_SCHEMA_VERSION),
    admitted: z.boolean(),
    capabilityVersion: sha256Schema,
    rejections: z.array(capabilityRejectionSchema),
    resolvedConfiguration: resolvedProductionConfigurationSchema.optional(),
    evaluatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.admitted && !value.resolvedConfiguration) {
      ctx.addIssue({
        code: "custom",
        path: ["resolvedConfiguration"],
        message: "Admitted capability evaluations must include resolved configuration.",
      });
    }
    if (!value.admitted && value.rejections.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rejections"],
        message: "Rejected capability evaluations must include typed reasons.",
      });
    }
  });
export type ProductionCapabilityAdmissionResult = z.infer<
  typeof productionCapabilityAdmissionResultSchema
>;

export interface CapabilityResolutionContext {
  readonly profileId: ContentProfileId;
  readonly tenant: TenantSettings;
  readonly genre?: GenreConfiguration;
  readonly episode?: EpisodeConfigurationOverride;
  readonly pinnedConfiguration?: ResolvedProductionConfiguration;
  readonly voiceCompatibility?: Readonly<
    Partial<Record<ContentLocale, readonly string[]>>
  >;
  readonly resolvedAt: string;
}
