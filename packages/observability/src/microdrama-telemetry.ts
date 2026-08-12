import { z } from "zod";

import {
  microdramaAssetTypeSchema,
  microdramaCacheStatusSchema,
  MICRODRAMA_BUDGET_SCHEMA_VERSION,
} from "@mediaforge/domain";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const MICRODRAMA_TELEMETRY_SCHEMA_VERSION =
  "mediaforge.microdrama-telemetry.v1" as const;

export const MICRODRAMA_BOUNDED_METRIC_NAMES = [
  "provider_attempt_count",
  "provider_retry_count",
  "cache_hit_count",
  "cache_miss_count",
  "estimated_cost_minor",
  "settled_cost_minor",
  "duration_ms",
] as const;

export const microdramaBoundedMetricNameSchema = z.enum(
  MICRODRAMA_BOUNDED_METRIC_NAMES
);
export type MicrodramaBoundedMetricName = z.infer<
  typeof microdramaBoundedMetricNameSchema
>;

export const microdramaTelemetryContextSchema = z
  .object({
    correlationId: identifierSchema,
    requestId: identifierSchema,
    revisionId: identifierSchema,
    episodeId: identifierSchema,
    locale: z.string().min(2).max(16).optional(),
    provider: identifierSchema.optional(),
    assetType: microdramaAssetTypeSchema.optional(),
    taskId: identifierSchema.optional(),
  })
  .strict();
export type MicrodramaTelemetryContext = z.infer<
  typeof microdramaTelemetryContextSchema
>;

export const microdramaBoundedMetricSchema = z
  .object({
    name: microdramaBoundedMetricNameSchema,
    value: z.number().finite().nonnegative(),
  })
  .strict();
export type MicrodramaBoundedMetric = z.infer<
  typeof microdramaBoundedMetricSchema
>;

export const microdramaTelemetryRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_TELEMETRY_SCHEMA_VERSION),
    context: microdramaTelemetryContextSchema,
    cacheStatus: microdramaCacheStatusSchema,
    retryCount: z.number().int().nonnegative(),
    metrics: z.array(microdramaBoundedMetricSchema).max(16),
    evidence: z.record(z.string(), z.unknown()),
    recordedAt: isoDateTimeSchema,
  })
  .strict();
export type MicrodramaTelemetryRecord = z.infer<
  typeof microdramaTelemetryRecordSchema
>;

const ALWAYS_REDACTED = new Set([
  "apikey",
  "authorization",
  "cookie",
  "password",
  "secret",
  "signedurl",
  "accesstoken",
  "refreshtoken",
  "token",
]);

function normalizedKey(value: string): string {
  return value.replaceAll(/[-_.]/gu, "").toLowerCase();
}

export function redactMicrodramaTelemetryEvidence(
  value: unknown
): Record<string, unknown> {
  const visit = (candidate: unknown): unknown => {
    if (typeof candidate === "string") {
      return candidate.length > 256 ? "[REDACTED_LARGE_STRING]" : candidate;
    }
    if (Array.isArray(candidate)) {
      return candidate.slice(0, 16).map(visit);
    }
    if (candidate === null || typeof candidate !== "object") {
      return candidate;
    }
    return Object.fromEntries(
      Object.entries(candidate)
        .slice(0, 32)
        .map(([key, item]) => [
          key,
          ALWAYS_REDACTED.has(normalizedKey(key)) ? "[REDACTED]" : visit(item),
        ])
    );
  };
  const redacted = visit(value);
  return typeof redacted === "object" && redacted !== null && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {};
}

export function buildMicrodramaTelemetryRecord(input: {
  readonly context: MicrodramaTelemetryContext;
  readonly cacheStatus: MicrodramaTelemetryRecord["cacheStatus"];
  readonly retryCount: number;
  readonly durationMs: number;
  readonly estimatedCostMinor: number;
  readonly settledCostMinor?: number;
  readonly evidence: unknown;
  readonly recordedAt: string;
}): MicrodramaTelemetryRecord {
  const metrics: MicrodramaBoundedMetric[] = [
    { name: "duration_ms", value: input.durationMs },
    { name: "estimated_cost_minor", value: input.estimatedCostMinor },
    { name: "provider_retry_count", value: input.retryCount },
    {
      name: input.cacheStatus === "hit" ? "cache_hit_count" : "cache_miss_count",
      value: 1,
    },
    { name: "provider_attempt_count", value: input.retryCount + 1 },
  ];
  if (input.settledCostMinor !== undefined) {
    metrics.push({
      name: "settled_cost_minor",
      value: input.settledCostMinor,
    });
  }

  return microdramaTelemetryRecordSchema.parse({
    schemaVersion: MICRODRAMA_TELEMETRY_SCHEMA_VERSION,
    context: input.context,
    cacheStatus: input.cacheStatus,
    retryCount: input.retryCount,
    metrics,
    evidence: redactMicrodramaTelemetryEvidence(input.evidence),
    recordedAt: input.recordedAt,
  });
}

export function toMicrodramaLogFields(
  record: MicrodramaTelemetryRecord
): Record<string, string | number> {
  return {
    correlationId: record.context.correlationId,
    requestId: record.context.requestId,
    revisionId: record.context.revisionId,
    episodeId: record.context.episodeId,
    locale: record.context.locale ?? "",
    provider: record.context.provider ?? "",
    assetType: record.context.assetType ?? "",
    cacheStatus: record.cacheStatus,
    retryCount: record.retryCount,
    schemaVersion: record.schemaVersion,
  };
}

export function toMicrodramaTraceAttributes(
  record: MicrodramaTelemetryRecord
): Record<string, string | number> {
  const fields = toMicrodramaLogFields(record);
  for (const metric of record.metrics) {
    fields[`metric.${metric.name}`] = metric.value;
  }
  return fields;
}
