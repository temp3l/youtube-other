import { z } from "zod";

export const VISUAL_ASSET_REGISTRY_SCHEMA_VERSION =
  "mediaforge.visual-asset-registry.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const VISUAL_REGISTRY_ENTRY_KINDS = [
  "character",
  "appearance",
  "location",
  "prop",
  "reference",
] as const;
export const visualRegistryEntryKindSchema = z.enum(VISUAL_REGISTRY_ENTRY_KINDS);
export type VisualRegistryEntryKind = z.infer<typeof visualRegistryEntryKindSchema>;

export const VISUAL_REGISTRY_REVISION_STATUSES = [
  "DRAFT",
  "VALIDATED",
  "QA_APPROVED",
  "ACCEPTED",
  "SUPERSEDED",
  "REJECTED",
] as const;
export const visualRegistryRevisionStatusSchema = z.enum(
  VISUAL_REGISTRY_REVISION_STATUSES
);
export type VisualRegistryRevisionStatus = z.infer<
  typeof visualRegistryRevisionStatusSchema
>;

export const VISUAL_REGISTRY_BCP47_LOCALES = [
  "en-US",
  "de-DE",
  "es-ES",
  "pt-BR",
] as const;
export const visualRegistryBcp47LocaleSchema = z.enum(VISUAL_REGISTRY_BCP47_LOCALES);
export type VisualRegistryBcp47Locale = z.infer<
  typeof visualRegistryBcp47LocaleSchema
>;

export const visualRegistryLocaleVariantReasonSchema = z
  .object({
    locale: visualRegistryBcp47LocaleSchema,
    reason: nonEmptyStringSchema,
  })
  .strict();
export type VisualRegistryLocaleVariantReason = z.infer<
  typeof visualRegistryLocaleVariantReasonSchema
>;

export const VISUAL_REGISTRY_REFERENCE_ROLES = [
  "portrait",
  "front",
  "three_quarter_left",
  "three_quarter_right",
  "side",
  "full_body",
  "expression",
  "establishing",
  "detail",
  "reference",
] as const;
export const visualRegistryReferenceRoleSchema = z.enum(VISUAL_REGISTRY_REFERENCE_ROLES);
export type VisualRegistryReferenceRole = z.infer<
  typeof visualRegistryReferenceRoleSchema
>;

export const hashAddressedReferenceAssetSchema = z
  .object({
    artifactHash: sha256Schema,
    mimeType: nonEmptyStringSchema,
    byteSize: z.number().int().nonnegative(),
    storageUri: nonEmptyStringSchema,
    role: visualRegistryReferenceRoleSchema,
  })
  .strict();
export type HashAddressedReferenceAsset = z.infer<
  typeof hashAddressedReferenceAssetSchema
>;

export const characterRegistryPayloadSchema = z
  .object({
    displayName: nonEmptyStringSchema,
    characterId: identifierSchema,
  })
  .strict();
export type CharacterRegistryPayload = z.infer<typeof characterRegistryPayloadSchema>;

export const appearanceRegistryPayloadSchema = z
  .object({
    characterEntryId: identifierSchema,
    wardrobeEntryId: identifierSchema.optional(),
    description: nonEmptyStringSchema,
  })
  .strict();
export type AppearanceRegistryPayload = z.infer<typeof appearanceRegistryPayloadSchema>;

export const locationRegistryPayloadSchema = z
  .object({
    displayName: nonEmptyStringSchema,
    settingKind: z.enum(["interior", "exterior", "virtual", "abstract"]),
  })
  .strict();
export type LocationRegistryPayload = z.infer<typeof locationRegistryPayloadSchema>;

export const propRegistryPayloadSchema = z
  .object({
    displayName: nonEmptyStringSchema,
    narrativeRole: nonEmptyStringSchema.optional(),
  })
  .strict();
export type PropRegistryPayload = z.infer<typeof propRegistryPayloadSchema>;

export const referenceRegistryPayloadSchema = z
  .object({
    label: nonEmptyStringSchema,
    linkedEntryId: identifierSchema.optional(),
    linkedEntryKind: visualRegistryEntryKindSchema.optional(),
  })
  .strict();
export type ReferenceRegistryPayload = z.infer<typeof referenceRegistryPayloadSchema>;

export const visualRegistryProvenanceSchema = z
  .object({
    sourceKind: z.enum(["import", "approval", "manual"]),
  })
  .strict();
export type VisualRegistryProvenance = z.infer<typeof visualRegistryProvenanceSchema>;

export const visualRegistryRevisionEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(VISUAL_ASSET_REGISTRY_SCHEMA_VERSION),
    revisionId: identifierSchema,
    seriesId: identifierSchema,
    entryId: identifierSchema,
    entryKind: visualRegistryEntryKindSchema,
    revisionNumber: z.number().int().positive(),
    status: visualRegistryRevisionStatusSchema,
    payload: z.unknown(),
    contentHash: sha256Schema,
    parentRevisionIds: z.array(identifierSchema).default([]),
    referenceAssets: z.array(hashAddressedReferenceAssetSchema).default([]),
    localeVariant: visualRegistryLocaleVariantReasonSchema.optional(),
    provenance: visualRegistryProvenanceSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type VisualRegistryRevisionEnvelope = z.infer<
  typeof visualRegistryRevisionEnvelopeSchema
>;

export const shotVisualRegistryReferenceSchema = z
  .object({
    entryId: identifierSchema,
    entryKind: visualRegistryEntryKindSchema,
    revisionId: identifierSchema,
  })
  .strict();
export type ShotVisualRegistryReference = z.infer<
  typeof shotVisualRegistryReferenceSchema
>;

export const resolvedVisualRegistryReferenceSchema = z
  .object({
    reference: shotVisualRegistryReferenceSchema,
    revision: visualRegistryRevisionEnvelopeSchema,
    localeVariantReason: visualRegistryLocaleVariantReasonSchema.optional(),
  })
  .strict();
export type ResolvedVisualRegistryReference = z.infer<
  typeof resolvedVisualRegistryReferenceSchema
>;

export const visualContinuityResolutionSchema = z
  .object({
    seriesId: identifierSchema,
    locale: visualRegistryBcp47LocaleSchema.optional(),
    resolvedReferences: z.array(resolvedVisualRegistryReferenceSchema),
  })
  .strict();
export type VisualContinuityResolution = z.infer<
  typeof visualContinuityResolutionSchema
>;

export type VisualAssetRegistryReadPort = {
  getRevision(revisionId: string): VisualRegistryRevisionEnvelope | null;
  getAcceptedRevision(
    seriesId: string,
    entryId: string,
    entryKind: VisualRegistryEntryKind
  ): VisualRegistryRevisionEnvelope | null;
};

export function validateVisualRegistryRevisionEnvelope(
  value: unknown
): VisualRegistryRevisionEnvelope {
  return visualRegistryRevisionEnvelopeSchema.parse(value);
}

export function validateShotVisualRegistryReference(
  value: unknown
): ShotVisualRegistryReference {
  return shotVisualRegistryReferenceSchema.parse(value);
}
