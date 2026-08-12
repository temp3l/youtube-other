import { createHash } from "node:crypto";

import {
  MICRODRAMA_PERFORMANCE_METRIC_KINDS,
  MICRODRAMA_PERFORMANCE_NORMALIZATION_VERSION,
  type MicrodramaPerformanceMetricKind,
  type MicrodramaPerformanceMetricValue,
  type MicrodramaPerformanceNormalizedMetrics,
  type MicrodramaPerformanceRawObservation,
  microdramaPerformanceNormalizedMetricsSchema,
} from "./microdrama-performance-contracts.js";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Performance normalization cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Performance normalization contains an unsupported value.");
}

export function computePerformanceRawPayloadSha256(
  counters: Readonly<Record<string, unknown>>
): string {
  return createHash("sha256").update(canonicalJson(counters), "utf8").digest("hex");
}

function unavailable(): MicrodramaPerformanceMetricValue {
  return { status: "unavailable" };
}

function available(value: number): MicrodramaPerformanceMetricValue {
  if (!Number.isFinite(value) || value < 0) {
    return unavailable();
  }
  return { status: "available", value };
}

function readNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function readCounter(
  counters: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): MicrodramaPerformanceMetricValue {
  for (const key of keys) {
    const value = readNonNegativeNumber(counters[key]);
    if (value !== null) {
      return available(value);
    }
  }
  return unavailable();
}

function readExplicitRate(
  counters: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): MicrodramaPerformanceMetricValue {
  for (const key of keys) {
    if (!(key in counters)) {
      continue;
    }
    const value = readNonNegativeNumber(counters[key]);
    if (value === null) {
      continue;
    }
    if (value > 1) {
      return available(value / 100);
    }
    return available(value);
  }
  return unavailable();
}

const BASIC_COUNTER_KEYS: Readonly<
  Record<"views" | "likes" | "comments" | "shares" | "follows", readonly string[]>
> = {
  views: ["view_count", "views", "play_count"],
  likes: ["like_count", "likes"],
  comments: ["comment_count", "comments"],
  shares: ["share_count", "shares"],
  follows: ["follow_count", "follows", "subscriber_gain"],
};

const WATCH_TIME_KEYS = [
  "watch_time_seconds",
  "total_watch_time_seconds",
  "average_view_duration_seconds",
] as const;

const COMPLETION_RATE_KEYS = [
  "completion_rate",
  "average_view_percentage",
  "video_completion_rate",
] as const;

const RETENTION_RATE_KEYS = [
  "retention_rate",
  "audience_retention_rate",
] as const;

const CONTINUATION_RATE_KEYS = ["continuation_rate"] as const;
const SESSION_DEPTH_KEYS = ["session_depth", "average_session_depth"] as const;

function normalizeMetric(
  kind: MicrodramaPerformanceMetricKind,
  counters: Readonly<Record<string, unknown>>
): MicrodramaPerformanceMetricValue {
  switch (kind) {
    case "views":
    case "likes":
    case "comments":
    case "shares":
    case "follows":
      return readCounter(counters, BASIC_COUNTER_KEYS[kind]);
    case "watch_time_seconds":
      return readCounter(counters, WATCH_TIME_KEYS);
    case "completion_rate":
      return readExplicitRate(counters, COMPLETION_RATE_KEYS);
    case "retention_rate":
      return readExplicitRate(counters, RETENTION_RATE_KEYS);
    case "continuation_rate":
      return readExplicitRate(counters, CONTINUATION_RATE_KEYS);
    case "session_depth":
      return readCounter(counters, SESSION_DEPTH_KEYS);
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function normalizeProviderPerformanceCounters(input: {
  readonly counters: Readonly<Record<string, unknown>>;
}): MicrodramaPerformanceNormalizedMetrics {
  const metrics = Object.fromEntries(
    MICRODRAMA_PERFORMANCE_METRIC_KINDS.map((kind) => [
      kind,
      normalizeMetric(kind, input.counters),
    ])
  ) as Record<MicrodramaPerformanceMetricKind, MicrodramaPerformanceMetricValue>;

  return microdramaPerformanceNormalizedMetricsSchema.parse({
    normalizationVersion: MICRODRAMA_PERFORMANCE_NORMALIZATION_VERSION,
    metrics,
  });
}

export function buildPerformanceRawObservation(input: {
  readonly provider: MicrodramaPerformanceRawObservation["provider"];
  readonly providerAccountId: string;
  readonly providerVideoId: string;
  readonly fetchedAt: string;
  readonly counters: Readonly<Record<string, unknown>>;
}): MicrodramaPerformanceRawObservation {
  const payloadSha256 = computePerformanceRawPayloadSha256(input.counters);
  return {
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerVideoId: input.providerVideoId,
    fetchedAt: input.fetchedAt,
    payloadSha256,
    counters: { ...input.counters },
  };
}
