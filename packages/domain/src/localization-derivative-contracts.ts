import { z } from "zod";

import {
  contentLocaleSchema,
  contentVariantSchema,
} from "./workflow-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/u);
const nonEmptyStringSchema = z.string().trim().min(1);

export const LOCALIZATION_DERIVATIVE_SCHEMA_VERSION =
  "mediaforge.localization-derivative.v1" as const;

export const LOCALIZATION_DERIVATIVE_STATUSES = [
  "pending",
  "in_progress",
  "ready",
  "blocked",
  "failed",
] as const;
export const localizationDerivativeStatusSchema = z.enum(
  LOCALIZATION_DERIVATIVE_STATUSES
);
export type LocalizationDerivativeStatus = z.infer<
  typeof localizationDerivativeStatusSchema
>;

export const localizationDerivativeReuseLinkSchema = z
  .object({
    assetId: identifierSchema,
    sha256: sha256Schema,
    languageIndependent: z.boolean(),
    role: nonEmptyStringSchema.max(80).optional(),
  })
  .strict();

export const localizationDerivativePartialStateSchema = z
  .object({
    stage: nonEmptyStringSchema.max(80),
    code: nonEmptyStringSchema.max(80),
    message: nonEmptyStringSchema.max(500),
    retryable: z.boolean(),
  })
  .strict();

export const localizationDerivativeRecordSchema = z
  .object({
    schemaVersion: z.literal(LOCALIZATION_DERIVATIVE_SCHEMA_VERSION),
    workspaceId: identifierSchema,
    projectId: identifierSchema,
    derivativeId: identifierSchema,
    rootEpisodeId: identifierSchema,
    derivativeEpisodeId: identifierSchema,
    targetLocale: contentLocaleSchema,
    contentVariant: contentVariantSchema,
    sourceEpisodeRevision: z.number().int().nonnegative(),
    sourceContentFingerprint: sha256Schema,
    derivativeRevision: z.number().int().nonnegative(),
    status: localizationDerivativeStatusSchema,
    localizedSlug: slugSchema,
    localizedTitle: nonEmptyStringSchema.max(200).optional(),
    reusedAssets: z.array(localizationDerivativeReuseLinkSchema).default([]),
    partialState: localizationDerivativePartialStateSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type LocalizationDerivativeRecord = z.infer<
  typeof localizationDerivativeRecordSchema
>;

export const localizationDerivativePageSchema = z
  .object({
    items: z.array(localizationDerivativeRecordSchema),
  })
  .strict();

export const localizationDerivativeCreateInputSchema = z
  .object({
    targetLocale: contentLocaleSchema,
    contentVariant: contentVariantSchema,
    localizedSlug: slugSchema,
    localizedTitle: nonEmptyStringSchema.max(200).optional(),
    reuseVisualAssets: z.boolean().default(true),
    idempotencyKey: identifierSchema.optional(),
  })
  .strict();
export type LocalizationDerivativeCreateInput = z.infer<
  typeof localizationDerivativeCreateInputSchema
>;

export const localizationPreflightInputSchema = z
  .object({
    targetLocale: contentLocaleSchema,
    contentVariant: contentVariantSchema,
    sourceLocale: contentLocaleSchema.optional(),
  })
  .strict();
export type LocalizationPreflightInput = z.infer<
  typeof localizationPreflightInputSchema
>;

export const localizationPreflightResultSchema = z
  .object({
    admitted: z.boolean(),
    rejections: z
      .array(
        z
          .object({
            code: nonEmptyStringSchema.max(80),
            message: nonEmptyStringSchema.max(500),
            field: nonEmptyStringSchema.max(80).optional(),
          })
          .strict()
      )
      .default([]),
  })
  .strict();
export type LocalizationPreflightResult = z.infer<
  typeof localizationPreflightResultSchema
>;

export const localizationComparisonSchema = z
  .object({
    schemaVersion: z.literal(LOCALIZATION_DERIVATIVE_SCHEMA_VERSION),
    derivativeId: identifierSchema,
    rootEpisodeId: identifierSchema,
    derivativeEpisodeId: identifierSchema,
    sourceEpisodeRevision: z.number().int().nonnegative(),
    currentSourceRevision: z.number().int().nonnegative(),
    sourceStale: z.boolean(),
    targetLocale: contentLocaleSchema,
    contentVariant: contentVariantSchema,
    reusedAssets: z.array(localizationDerivativeReuseLinkSchema).default([]),
    derivativeStatus: localizationDerivativeStatusSchema,
    derivativeRevision: z.number().int().nonnegative(),
  })
  .strict();
export type LocalizationComparison = z.infer<typeof localizationComparisonSchema>;
