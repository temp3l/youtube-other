import { z } from "zod";

import {
  quotaLimitEnforcementSchema,
  reservationStateSchema,
} from "./usage-quota-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const MICRODRAMA_BUDGET_SCHEMA_VERSION =
  "mediaforge.microdrama-budget.v1" as const;

export const MICRODRAMA_BUDGET_SCOPE_KINDS = [
  "task",
  "provider",
  "episode",
  "locale",
  "series",
] as const;
export const microdramaBudgetScopeKindSchema = z.enum(
  MICRODRAMA_BUDGET_SCOPE_KINDS
);
export type MicrodramaBudgetScopeKind = z.infer<
  typeof microdramaBudgetScopeKindSchema
>;

export const MICRODRAMA_ASSET_COST_SCOPES = [
  "shared_visual",
  "locale_tts",
  "locale_render",
  "locale_subtitle",
  "locale_metadata",
] as const;
export const microdramaAssetCostScopeSchema = z.enum(
  MICRODRAMA_ASSET_COST_SCOPES
);
export type MicrodramaAssetCostScope = z.infer<
  typeof microdramaAssetCostScopeSchema
>;

export const MICRODRAMA_ASSET_TYPES = [
  "image",
  "video",
  "tts",
  "render",
  "alignment",
  "subtitle",
] as const;
export const microdramaAssetTypeSchema = z.enum(MICRODRAMA_ASSET_TYPES);
export type MicrodramaAssetType = z.infer<typeof microdramaAssetTypeSchema>;

export const MICRODRAMA_CACHE_STATUSES = ["hit", "miss", "disabled"] as const;
export const microdramaCacheStatusSchema = z.enum(MICRODRAMA_CACHE_STATUSES);
export type MicrodramaCacheStatus = z.infer<typeof microdramaCacheStatusSchema>;

export const MICRODRAMA_PREFLIGHT_BLOCK_REASONS = [
  "budget_profile_missing",
  "budget_exceeded",
  "reservation_unavailable",
] as const;
export const microdramaPreflightBlockReasonSchema = z.enum(
  MICRODRAMA_PREFLIGHT_BLOCK_REASONS
);
export type MicrodramaPreflightBlockReason = z.infer<
  typeof microdramaPreflightBlockReasonSchema
>;

export const microdramaBudgetProfileSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_BUDGET_SCHEMA_VERSION),
    profileId: identifierSchema,
    scopeKind: microdramaBudgetScopeKindSchema,
    scopeId: identifierSchema,
    limitMinor: z.number().int().nonnegative(),
    enforcement: quotaLimitEnforcementSchema,
    registeredAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaBudgetProfile = z.infer<
  typeof microdramaBudgetProfileSchema
>;

export const microdramaBudgetReservationSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_BUDGET_SCHEMA_VERSION),
    reservationId: identifierSchema,
    profileId: identifierSchema,
    revisionId: identifierSchema,
    episodeId: identifierSchema,
    locale: nonEmptyStringSchema.optional(),
    provider: identifierSchema.optional(),
    taskId: identifierSchema.optional(),
    reservedMinor: z.number().int().positive(),
    settledMinor: z.number().int().nonnegative().optional(),
    state: reservationStateSchema,
    correlationId: identifierSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaBudgetReservation = z.infer<
  typeof microdramaBudgetReservationSchema
>;

export const microdramaCostAttributionSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_BUDGET_SCHEMA_VERSION),
    attributionId: identifierSchema,
    episodeId: identifierSchema,
    locale: nonEmptyStringSchema.optional(),
    provider: identifierSchema,
    assetType: microdramaAssetTypeSchema,
    assetCostScope: microdramaAssetCostScopeSchema,
    revisionId: identifierSchema,
    reservationId: identifierSchema,
    costMinor: z.number().int().nonnegative(),
    cacheStatus: microdramaCacheStatusSchema,
    retryCount: z.number().int().nonnegative(),
    correlationId: identifierSchema,
    requestId: identifierSchema,
    recordedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const localeRequired =
      value.assetCostScope !== "shared_visual" &&
      !value.locale;
    if (localeRequired) {
      ctx.addIssue({
        code: "custom",
        path: ["locale"],
        message: "Locale-scoped costs require a locale.",
      });
    }
    if (value.assetCostScope === "shared_visual" && value.locale !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["locale"],
        message: "Shared visual costs must not include locale.",
      });
    }
  });
export type MicrodramaCostAttribution = z.infer<
  typeof microdramaCostAttributionSchema
>;

export const microdramaPreflightWorkItemSchema = z
  .object({
    taskId: identifierSchema,
    episodeId: identifierSchema,
    locale: nonEmptyStringSchema.optional(),
    provider: identifierSchema,
    assetType: microdramaAssetTypeSchema,
    assetCostScope: microdramaAssetCostScopeSchema,
    revisionId: identifierSchema,
    estimatedCostMinor: z.number().int().nonnegative(),
  })
  .strict();
export type MicrodramaPreflightWorkItem = z.infer<
  typeof microdramaPreflightWorkItemSchema
>;

export const microdramaBudgetPreflightSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_BUDGET_SCHEMA_VERSION),
    correlationId: identifierSchema,
    allowed: z.boolean(),
    blockReason: microdramaPreflightBlockReasonSchema.optional(),
    message: nonEmptyStringSchema.optional(),
    reservations: z.array(microdramaBudgetReservationSchema),
    evaluatedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaBudgetPreflight = z.infer<
  typeof microdramaBudgetPreflightSchema
>;

export function normalizeMicrodramaScopeId(scopeId: string): string {
  return scopeId.toLowerCase().replaceAll(/[^a-z0-9._-]/gu, "-");
}

export function validateMicrodramaBudgetProfile(
  value: unknown
): MicrodramaBudgetProfile {
  return microdramaBudgetProfileSchema.parse(value);
}

export function validateMicrodramaCostAttribution(
  value: unknown
): MicrodramaCostAttribution {
  return microdramaCostAttributionSchema.parse(value);
}
