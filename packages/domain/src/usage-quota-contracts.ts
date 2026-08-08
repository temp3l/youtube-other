import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const USAGE_QUOTA_SCHEMA_VERSION =
  "mediaforge.usage-quota.v1" as const;

export const USAGE_DIMENSIONS = [
  "active_workflows",
  "storage_bytes",
  "batch_items",
  "active_batches",
  "publication_count",
  "active_publications",
  "provider_budget_minor",
  "principal_provider_budget_minor",
  "speech_characters",
] as const;
export const usageDimensionSchema = z.enum(USAGE_DIMENSIONS);
export type UsageDimension = z.infer<typeof usageDimensionSchema>;

export const RESERVATION_STATES = [
  "reserved",
  "settled",
  "released",
] as const;
export const reservationStateSchema = z.enum(RESERVATION_STATES);
export type ReservationState = z.infer<typeof reservationStateSchema>;

export const ESTIMATE_BASIS = [
  "configured_policy",
  "model_profile",
  "cache_reuse",
  "historical_median",
  "provider_free_fixture",
] as const;
export const estimateBasisSchema = z.enum(ESTIMATE_BASIS);
export type EstimateBasis = z.infer<typeof estimateBasisSchema>;

export const ESTIMATE_CONFIDENCE = ["advisory", "authoritative"] as const;
export const estimateConfidenceSchema = z.enum(ESTIMATE_CONFIDENCE);
export type EstimateConfidence = z.infer<typeof estimateConfidenceSchema>;

export const CACHE_REUSE_EFFECTS = [
  "none",
  "partial_reuse",
  "full_reuse",
] as const;
export const cacheReuseEffectSchema = z.enum(CACHE_REUSE_EFFECTS);
export type CacheReuseEffect = z.infer<typeof cacheReuseEffectSchema>;

export const PROVIDER_HEALTH_STATES = [
  "available",
  "degraded",
  "unavailable",
  "unconfigured",
  "unsupported",
] as const;
export const providerHealthStateSchema = z.enum(PROVIDER_HEALTH_STATES);
export type ProviderHealthState = z.infer<typeof providerHealthStateSchema>;

export const quotaLimitEnforcementSchema = z.enum(["hard", "soft"]);
export type QuotaLimitEnforcement = z.infer<typeof quotaLimitEnforcementSchema>;

export const usageEstimateSchema = z
  .object({
    schemaVersion: z.literal(USAGE_QUOTA_SCHEMA_VERSION),
    dimension: usageDimensionSchema,
    estimatedUnits: z.number().int().nonnegative(),
    billableUnits: z.number().int().nonnegative(),
    basis: estimateBasisSchema,
    confidence: estimateConfidenceSchema,
    cacheReuseEffect: cacheReuseEffectSchema,
    externalCostMinor: z.number().int().nonnegative(),
    projectedAt: isoDateTimeSchema,
  })
  .strict();
export type UsageEstimate = z.infer<typeof usageEstimateSchema>;

export const reservationAdmissionSchema = z
  .object({
    allowed: z.boolean(),
    warning: z.boolean(),
    enforcement: quotaLimitEnforcementSchema,
    remainingUnits: z.number().int().nonnegative(),
    reason: nonEmptyStringSchema.optional(),
  })
  .strict();
export type ReservationAdmission = z.infer<typeof reservationAdmissionSchema>;

export const reservationTransitionSchema = z
  .object({
    reservationId: identifierSchema,
    fromState: reservationStateSchema,
    toState: reservationStateSchema,
    reservedUnits: z.number().int().positive(),
    settledUnits: z.number().int().positive().optional(),
  })
  .strict();
export type ReservationTransition = z.infer<typeof reservationTransitionSchema>;

export const quotaDimensionStatusSchema = z
  .object({
    dimension: usageDimensionSchema,
    limitUnits: z.number().int().nonnegative(),
    reservedUnits: z.number().int().nonnegative(),
    settledUnits: z.number().int().nonnegative(),
    availableUnits: z.number().int().nonnegative(),
    enforcement: quotaLimitEnforcementSchema,
  })
  .strict();
export type QuotaDimensionStatus = z.infer<typeof quotaDimensionStatusSchema>;

export const providerHealthStatusSchema = z
  .object({
    schemaVersion: z.literal(USAGE_QUOTA_SCHEMA_VERSION),
    providerId: identifierSchema,
    scope: z.enum(["speech", "image", "render"]),
    state: providerHealthStateSchema,
    fallbackProviderId: identifierSchema.optional(),
    fallbackExplicit: z.boolean(),
    freshness: isoDateTimeSchema,
    message: nonEmptyStringSchema.optional(),
  })
  .strict();
export type ProviderHealthStatus = z.infer<typeof providerHealthStatusSchema>;

export const usageRecordFilterSchema = z
  .object({
    subjectId: identifierSchema.optional(),
    operation: nonEmptyStringSchema.optional(),
    unit: nonEmptyStringSchema.optional(),
    attemptId: identifierSchema.optional(),
    occurredAfter: isoDateTimeSchema.optional(),
    occurredBefore: isoDateTimeSchema.optional(),
  })
  .strict();
export type UsageRecordFilter = z.infer<typeof usageRecordFilterSchema>;
