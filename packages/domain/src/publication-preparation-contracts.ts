import { z } from "zod";

import { contentLocaleSchema } from "./workflow-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const PUBLICATION_PREPARATION_SCHEMA_VERSION =
  "mediaforge.publication-preparation.v1" as const;

export const PUBLISHING_CHANNEL_CONNECTION_STATUSES = [
  "disconnected",
  "connecting",
  "connected",
  "reauthorize_required",
  "degraded",
] as const;
export const publishingChannelConnectionStatusSchema = z.enum(
  PUBLISHING_CHANNEL_CONNECTION_STATUSES
);
export type PublishingChannelConnectionStatus = z.infer<
  typeof publishingChannelConnectionStatusSchema
>;

export const publicationVisibilitySchema = z.enum([
  "private",
  "unlisted",
  "public",
]);
export type PublicationVisibility = z.infer<typeof publicationVisibilitySchema>;

export const publicationArtifactBindingSchema = z
  .object({
    assetId: identifierSchema,
    role: nonEmptyStringSchema.max(80),
    contentHash: sha256Schema,
  })
  .strict();

export const publicationMetadataInputSchema = z
  .object({
    title: nonEmptyStringSchema.max(200),
    description: nonEmptyStringSchema.max(5000),
    tags: z.array(nonEmptyStringSchema.max(80)).max(50).default([]),
    defaultAudioLanguage: contentLocaleSchema,
    thumbnailAssetId: identifierSchema,
    thumbnailHash: sha256Schema,
    captionAssetId: identifierSchema.optional(),
    captionHash: sha256Schema.optional(),
  })
  .strict();
export type PublicationMetadataInput = z.infer<
  typeof publicationMetadataInputSchema
>;

export const publicationMetadataRevisionSchema = z
  .object({
    schemaVersion: z.literal(PUBLICATION_PREPARATION_SCHEMA_VERSION),
    metadataRevisionId: identifierSchema,
    revision: z.number().int().nonnegative(),
    contentHash: sha256Schema,
    metadata: publicationMetadataInputSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type PublicationMetadataRevision = z.infer<
  typeof publicationMetadataRevisionSchema
>;

export const publishingChannelRecordSchema = z
  .object({
    schemaVersion: z.literal(PUBLICATION_PREPARATION_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    channelId: identifierSchema,
    displayName: nonEmptyStringSchema.max(200),
    providerChannelId: nonEmptyStringSchema.max(200).optional(),
    connectionStatus: publishingChannelConnectionStatusSchema,
    credentialVersion: identifierSchema.optional(),
    defaultVisibility: publicationVisibilitySchema.optional(),
    defaultLocale: contentLocaleSchema.optional(),
    supportedLocales: z.array(contentLocaleSchema).default([]),
    revision: z.number().int().nonnegative(),
    authorizationExpiresAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type PublishingChannelRecord = z.infer<
  typeof publishingChannelRecordSchema
>;

export const publishingChannelPageSchema = z
  .object({
    items: z.array(publishingChannelRecordSchema),
  })
  .strict();

export const channelConnectBeginResultSchema = z
  .object({
    sessionId: identifierSchema,
    authorizationUrl: z.string().url(),
    expiresAt: isoDateTimeSchema,
  })
  .strict();

export const publicationSchedulePolicySchema = z
  .object({
    maxScheduleHorizonHours: z.number().int().positive(),
    defaultTimezone: nonEmptyStringSchema.max(80),
  })
  .strict();

export const publicationPreflightInputSchema = z
  .object({
    episodeId: identifierSchema.optional(),
    channelId: identifierSchema,
    visibility: publicationVisibilitySchema,
    scheduledAt: isoDateTimeSchema.nullable().optional(),
    scheduleTimezone: nonEmptyStringSchema.max(80).optional(),
    playlistIds: z.array(identifierSchema).max(20).default([]),
    approvalId: identifierSchema,
    approvalRevision: z.number().int().nonnegative(),
    approvalArtifactHash: sha256Schema,
    assetHash: sha256Schema,
    artifactBindings: z.array(publicationArtifactBindingSchema).min(1),
    metadata: publicationMetadataInputSchema,
    captionsRequired: z.boolean().default(false),
    publishReady: z.boolean(),
    renderStatus: z.enum(["none", "pending", "succeeded", "failed"]),
    requiredReviewGates: z.array(nonEmptyStringSchema.max(80)).default([]),
    activeApprovals: z
      .array(
        z
          .object({
            approvalId: identifierSchema,
            gate: nonEmptyStringSchema.max(80).optional(),
            state: z.enum(["active", "rejected", "revoked"]),
            boundFingerprint: sha256Schema.optional(),
          })
          .strict()
      )
      .default([]),
    validationStatuses: z
      .array(z.enum(["passed", "failed", "pending", "unknown"]))
      .default([]),
    channelConnectionStatus: publishingChannelConnectionStatusSchema,
    currentEpisodeRevision: z.number().int().nonnegative().optional(),
    boundEpisodeRevision: z.number().int().nonnegative().optional(),
    schedulePolicy: publicationSchedulePolicySchema.nullable(),
  })
  .strict();
export type PublicationPreflightInput = z.infer<
  typeof publicationPreflightInputSchema
>;

export const publicationPreflightRejectionSchema = z
  .object({
    code: nonEmptyStringSchema.max(80),
    message: nonEmptyStringSchema.max(500),
    field: nonEmptyStringSchema.max(80).optional(),
  })
  .strict();

export const publicationPreflightResultSchema = z
  .object({
    admitted: z.boolean(),
    rejections: z.array(publicationPreflightRejectionSchema).default([]),
    metadataContentHash: sha256Schema.optional(),
  })
  .strict();
export type PublicationPreflightResult = z.infer<
  typeof publicationPreflightResultSchema
>;

export const publicationPrepareInputSchema = publicationPreflightInputSchema
  .extend({
    idempotencyKey: identifierSchema.optional(),
  })
  .strict();
export type PublicationPrepareInput = z.infer<
  typeof publicationPrepareInputSchema
>;

export const publicationScheduleUpdateInputSchema = z
  .object({
    scheduledAt: isoDateTimeSchema.nullable(),
    scheduleTimezone: nonEmptyStringSchema.max(80).optional(),
  })
  .strict();
