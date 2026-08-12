import { z } from "zod";

import { microdramaInteractionSettingsSchema } from "./microdrama-publication-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const TIKTOK_METADATA_SCHEMA_VERSION =
  "mediaforge.tiktok-metadata.v1" as const;

export const TIKTOK_METADATA_BCP47_LOCALES = [
  "en-US",
  "de-DE",
  "es-ES",
  "pt-BR",
] as const;
export const tikTokMetadataLocaleSchema = z.enum(TIKTOK_METADATA_BCP47_LOCALES);
export type TikTokMetadataLocale = z.infer<typeof tikTokMetadataLocaleSchema>;

export const tikTokMediaProvenanceSchema = z
  .object({
    syntheticVoiceUsed: z.boolean(),
    syntheticVisualsUsed: z.boolean(),
    sponsoredContent: z.boolean(),
    paidPartnership: z.boolean(),
  })
  .strict();
export type TikTokMediaProvenance = z.infer<typeof tikTokMediaProvenanceSchema>;

export const tikTokLocaleEditorialMetadataSchema = z
  .object({
    caption: nonEmptyStringSchema.max(2200),
    hashtags: z
      .array(z.string().regex(/^#[A-Za-z0-9_]+$/u))
      .min(1)
      .max(30),
    ctaLabel: nonEmptyStringSchema.max(100),
    ctaUrl: z.string().url().optional(),
    coverText: nonEmptyStringSchema.max(100).optional(),
  })
  .strict();
export type TikTokLocaleEditorialMetadata = z.infer<
  typeof tikTokLocaleEditorialMetadataSchema
>;

export const tikTokLocaleProviderPolicySchema = z
  .object({
    privacy: z.enum(["public", "friends", "private"]),
    interactionSettings: microdramaInteractionSettingsSchema,
  })
  .strict();
export type TikTokLocaleProviderPolicy = z.infer<
  typeof tikTokLocaleProviderPolicySchema
>;

export const tikTokDisclosureDeclarationsSchema = z
  .object({
    aiContentDeclared: z.boolean(),
    commercialContentDeclared: z.boolean(),
    derivationSource: z.literal("media_provenance"),
    provenanceHash: sha256Schema,
  })
  .strict();
export type TikTokDisclosureDeclarations = z.infer<
  typeof tikTokDisclosureDeclarationsSchema
>;

export const tikTokMetadataRevisionSchema = z
  .object({
    schemaVersion: z.literal(TIKTOK_METADATA_SCHEMA_VERSION),
    metadataRevisionId: identifierSchema,
    revision: z.number().int().nonnegative(),
    episodeId: identifierSchema,
    episodeRevisionId: identifierSchema,
    locale: tikTokMetadataLocaleSchema,
    provider: z.literal("tiktok"),
    metadataProfileId: identifierSchema,
    metadataProfileVersion: z.number().int().positive(),
    editorial: tikTokLocaleEditorialMetadataSchema,
    providerPolicy: tikTokLocaleProviderPolicySchema,
    mediaProvenance: tikTokMediaProvenanceSchema,
    disclosure: tikTokDisclosureDeclarationsSchema,
    contentHash: sha256Schema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type TikTokMetadataRevision = z.infer<typeof tikTokMetadataRevisionSchema>;

export function validateTikTokMetadataRevision(
  value: unknown
): TikTokMetadataRevision {
  return tikTokMetadataRevisionSchema.parse(value);
}
