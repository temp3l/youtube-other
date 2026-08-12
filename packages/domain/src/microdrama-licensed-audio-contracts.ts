import { z } from "zod";

export const MICRODRAMA_LICENSED_AUDIO_SCHEMA_VERSION =
  "mediaforge.microdrama-licensed-audio.v1" as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const LICENSED_AUDIO_LAYER_KINDS = ["ambience", "sfx", "music"] as const;
export const licensedAudioLayerKindSchema = z.enum(LICENSED_AUDIO_LAYER_KINDS);
export type LicensedAudioLayerKind = z.infer<typeof licensedAudioLayerKindSchema>;

export const LICENSED_AUDIO_IMPORT_SOURCE_KINDS = [
  "imported-file",
  "stock-library",
  "creator-owned-library",
] as const;
export const licensedAudioImportSourceKindSchema = z.enum(
  LICENSED_AUDIO_IMPORT_SOURCE_KINDS
);
export type LicensedAudioImportSourceKind = z.infer<
  typeof licensedAudioImportSourceKindSchema
>;

export const LICENSED_AUDIO_RIGHTS_STATUSES = [
  "licensed",
  "creator-owned",
  "publisher-owned",
] as const;
export const licensedAudioRightsStatusSchema = z.enum(LICENSED_AUDIO_RIGHTS_STATUSES);
export type LicensedAudioRightsStatus = z.infer<typeof licensedAudioRightsStatusSchema>;

export const GENERATED_MUSIC_PROVIDER_IDS = [
  "suno",
  "udio",
  "stable-audio",
  "musicgen",
] as const;
export const generatedMusicProviderIdSchema = z.enum(GENERATED_MUSIC_PROVIDER_IDS);
export type GeneratedMusicProviderId = z.infer<typeof generatedMusicProviderIdSchema>;

export const licensedAudioAssetProvenanceSchema = z
  .object({
    sourceKind: licensedAudioImportSourceKindSchema,
    importReference: nonEmptyStringSchema,
    importedAt: isoDateTimeSchema,
    importedBy: nonEmptyStringSchema,
    originalFilename: nonEmptyStringSchema.optional(),
  })
  .strict();
export type LicensedAudioAssetProvenance = z.infer<
  typeof licensedAudioAssetProvenanceSchema
>;

export const licensedAudioRightsEvidenceSchema = z
  .object({
    status: licensedAudioRightsStatusSchema,
    licenseReference: nonEmptyStringSchema,
    rightsHolders: z.array(nonEmptyStringSchema).min(1),
    permittedTerritories: z.array(nonEmptyStringSchema).min(1),
    commercialUse: z.literal(true),
    termStartAt: isoDateTimeSchema.optional(),
    expiresAt: isoDateTimeSchema.optional(),
    attribution: nonEmptyStringSchema.optional(),
    approvalEvidenceHash: sha256Schema,
    approvedAt: isoDateTimeSchema,
    approvedBy: nonEmptyStringSchema,
  })
  .strict();
export type LicensedAudioRightsEvidence = z.infer<
  typeof licensedAudioRightsEvidenceSchema
>;

export const licensedAudioAssetRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_LICENSED_AUDIO_SCHEMA_VERSION),
    assetId: identifierSchema,
    layerKind: licensedAudioLayerKindSchema,
    assetHash: sha256Schema,
    mimeType: nonEmptyStringSchema,
    byteSize: z.number().int().positive(),
    storageUri: nonEmptyStringSchema,
    provenance: licensedAudioAssetProvenanceSchema,
    rights: licensedAudioRightsEvidenceSchema,
    recordedAt: isoDateTimeSchema,
    fingerprint: sha256Schema,
  })
  .strict();
export type LicensedAudioAssetRecord = z.infer<typeof licensedAudioAssetRecordSchema>;

export const licensedAudioLayerTrackEntrySchema = z
  .object({
    entryId: identifierSchema,
    assetId: identifierSchema,
    assetFingerprint: sha256Schema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    gainDb: z.number().min(-60).max(12).optional(),
    fadeInMs: z.number().int().nonnegative().optional(),
    fadeOutMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((value) => value.endMs > value.startMs, {
    message: "endMs must be > startMs",
  });
export type LicensedAudioLayerTrackEntry = z.infer<
  typeof licensedAudioLayerTrackEntrySchema
>;

export const licensedAudioLayerTracksSchema = z
  .object({
    ambience: z.array(licensedAudioLayerTrackEntrySchema),
    sfx: z.array(licensedAudioLayerTrackEntrySchema),
    music: z.array(licensedAudioLayerTrackEntrySchema),
  })
  .strict();
export type LicensedAudioLayerTracks = z.infer<typeof licensedAudioLayerTracksSchema>;

export const LICENSED_AUDIO_RIGHTS_FAILURE_CODES = [
  "RIGHTS_EXPIRED",
  "RIGHTS_NOT_STARTED",
  "TERRITORY_NOT_PERMITTED",
  "RIGHTS_STATUS_BLOCKED",
  "MISSING_APPROVAL",
  "MISSING_ASSET",
  "ASSET_FINGERPRINT_MISMATCH",
  "LAYER_KIND_MISMATCH",
  "GENERATED_MUSIC_UNSUPPORTED",
] as const;
export const licensedAudioRightsFailureCodeSchema = z.enum(
  LICENSED_AUDIO_RIGHTS_FAILURE_CODES
);
export type LicensedAudioRightsFailureCode = z.infer<
  typeof licensedAudioRightsFailureCodeSchema
>;

export const licensedAudioProductionBlockerSchema = z
  .object({
    code: licensedAudioRightsFailureCodeSchema,
    assetId: identifierSchema.optional(),
    entryId: identifierSchema.optional(),
    message: nonEmptyStringSchema,
  })
  .strict();
export type LicensedAudioProductionBlocker = z.infer<
  typeof licensedAudioProductionBlockerSchema
>;

export const licensedAudioProductionReadinessSchema = z
  .object({
    ready: z.boolean(),
    blockers: z.array(licensedAudioProductionBlockerSchema),
  })
  .strict();
export type LicensedAudioProductionReadiness = z.infer<
  typeof licensedAudioProductionReadinessSchema
>;
