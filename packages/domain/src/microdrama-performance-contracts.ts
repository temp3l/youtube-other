import { z } from "zod";

import { microdramaPublicationProviderSchema } from "./microdrama-publication-contracts.js";

export const MICRODRAMA_PERFORMANCE_SCHEMA_VERSION =
  "mediaforge.microdrama-performance.v1" as const;

export const MICRODRAMA_PERFORMANCE_NORMALIZATION_VERSION = "v1" as const;

export const MICRODRAMA_PERFORMANCE_METRIC_KINDS = [
  "views",
  "likes",
  "comments",
  "shares",
  "watch_time_seconds",
  "completion_rate",
  "retention_rate",
  "follows",
  "continuation_rate",
  "session_depth",
] as const;

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const sha256Schema = z.string().regex(sha256Pattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const microdramaPerformanceMetricKindSchema = z.enum(
  MICRODRAMA_PERFORMANCE_METRIC_KINDS
);
export type MicrodramaPerformanceMetricKind = z.infer<
  typeof microdramaPerformanceMetricKindSchema
>;

export const microdramaPerformanceMetricValueSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("available"),
        value: z.number().finite().nonnegative(),
      })
      .strict(),
    z.object({ status: z.literal("unavailable") }).strict(),
  ]
);
export type MicrodramaPerformanceMetricValue = z.infer<
  typeof microdramaPerformanceMetricValueSchema
>;

export const microdramaPerformanceObservationWindowSchema = z
  .object({
    windowStart: isoDateTimeSchema,
    windowEnd: isoDateTimeSchema,
  })
  .strict()
  .refine(
    (value) => Date.parse(value.windowEnd) >= Date.parse(value.windowStart),
    "Observation window end must be on or after window start."
  );
export type MicrodramaPerformanceObservationWindow = z.infer<
  typeof microdramaPerformanceObservationWindowSchema
>;

export const microdramaPerformanceObservationIdentitySchema = z
  .object({
    seriesId: identifierSchema,
    episodeId: identifierSchema,
    episodeRevisionId: identifierSchema,
    locale: nonEmptyStringSchema,
    provider: microdramaPublicationProviderSchema,
    providerAccountId: identifierSchema,
    publicationId: identifierSchema,
    publicationRevision: z.number().int().nonnegative(),
    renderHash: sha256Schema,
    metadataRevisionId: identifierSchema,
    observationWindow: microdramaPerformanceObservationWindowSchema,
  })
  .strict();
export type MicrodramaPerformanceObservationIdentity = z.infer<
  typeof microdramaPerformanceObservationIdentitySchema
>;

export const microdramaPerformanceBaselineAnnotationSchema = z
  .object({
    accountBaselineHash: sha256Schema.optional(),
    audienceContextHash: sha256Schema.optional(),
    publishTimeContextHash: sha256Schema.optional(),
    experimentContextHash: sha256Schema.optional(),
  })
  .strict();
export type MicrodramaPerformanceBaselineAnnotation = z.infer<
  typeof microdramaPerformanceBaselineAnnotationSchema
>;

export const microdramaPerformanceRawObservationSchema = z
  .object({
    provider: microdramaPublicationProviderSchema,
    providerAccountId: identifierSchema,
    providerVideoId: identifierSchema,
    fetchedAt: isoDateTimeSchema,
    payloadSha256: sha256Schema,
    counters: z.record(nonEmptyStringSchema, z.unknown()),
  })
  .strict();
export type MicrodramaPerformanceRawObservation = z.infer<
  typeof microdramaPerformanceRawObservationSchema
>;

export const microdramaPerformanceNormalizedMetricsSchema = z
  .object({
    normalizationVersion: z.literal(MICRODRAMA_PERFORMANCE_NORMALIZATION_VERSION),
    metrics: z.record(
      microdramaPerformanceMetricKindSchema,
      microdramaPerformanceMetricValueSchema
    ),
  })
  .strict();
export type MicrodramaPerformanceNormalizedMetrics = z.infer<
  typeof microdramaPerformanceNormalizedMetricsSchema
>;

export const microdramaPerformanceObservationSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_PERFORMANCE_SCHEMA_VERSION),
    observationId: identifierSchema,
    identity: microdramaPerformanceObservationIdentitySchema,
    raw: microdramaPerformanceRawObservationSchema,
    normalized: microdramaPerformanceNormalizedMetricsSchema,
    baseline: microdramaPerformanceBaselineAnnotationSchema,
    observedAt: isoDateTimeSchema,
    idempotencyKey: identifierSchema,
    fingerprint: sha256Schema,
    providerDispatchEnabled: z.literal(false),
    regenerationRationale: z.enum(["new-observation", "idempotent-replay"]),
  })
  .strict();
export type MicrodramaPerformanceObservation = z.infer<
  typeof microdramaPerformanceObservationSchema
>;

export function validateMicrodramaPerformanceObservation(
  input: unknown
): MicrodramaPerformanceObservation {
  return microdramaPerformanceObservationSchema.parse(input);
}
