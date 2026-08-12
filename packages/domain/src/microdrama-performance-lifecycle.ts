import { createHash } from "node:crypto";

import {
  type MicrodramaPerformanceBaselineAnnotation,
  type MicrodramaPerformanceObservation,
  type MicrodramaPerformanceObservationIdentity,
  type MicrodramaPerformanceRawObservation,
  microdramaPerformanceBaselineAnnotationSchema,
  microdramaPerformanceObservationSchema,
} from "./microdrama-performance-contracts.js";
import { normalizeProviderPerformanceCounters } from "./microdrama-performance-normalization.js";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Performance observation cannot contain a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Performance observation contains an unsupported value.");
}

export function computePerformanceObservationFingerprint(input: {
  readonly identity: MicrodramaPerformanceObservationIdentity;
  readonly raw: MicrodramaPerformanceRawObservation;
  readonly baseline: MicrodramaPerformanceBaselineAnnotation;
  readonly observedAt: string;
  readonly idempotencyKey: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        identity: input.identity,
        raw: input.raw,
        baseline: input.baseline,
        observedAt: input.observedAt,
        idempotencyKey: input.idempotencyKey,
      }),
      "utf8"
    )
    .digest("hex");
}

export function planPerformanceObservation(input: {
  readonly identity: MicrodramaPerformanceObservationIdentity;
  readonly raw: MicrodramaPerformanceRawObservation;
  readonly baseline?: MicrodramaPerformanceBaselineAnnotation;
  readonly observedAt: string;
  readonly idempotencyKey: string;
}): MicrodramaPerformanceObservation {
  const baseline = microdramaPerformanceBaselineAnnotationSchema.parse(
    input.baseline ?? {}
  );
  const normalized = normalizeProviderPerformanceCounters({
    counters: input.raw.counters,
  });
  const fingerprint = computePerformanceObservationFingerprint({
    identity: input.identity,
    raw: input.raw,
    baseline,
    observedAt: input.observedAt,
    idempotencyKey: input.idempotencyKey,
  });

  return microdramaPerformanceObservationSchema.parse({
    schemaVersion: "mediaforge.microdrama-performance.v1",
    observationId: `perf-obs-${fingerprint.slice(0, 16)}`,
    identity: input.identity,
    raw: input.raw,
    normalized,
    baseline,
    observedAt: input.observedAt,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
    providerDispatchEnabled: false,
    regenerationRationale: "new-observation",
  });
}

export function markPerformanceObservationReplay(
  observation: MicrodramaPerformanceObservation
): MicrodramaPerformanceObservation {
  return microdramaPerformanceObservationSchema.parse({
    ...observation,
    regenerationRationale: "idempotent-replay",
  });
}
