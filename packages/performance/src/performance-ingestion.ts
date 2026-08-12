import {
  buildPerformanceRawObservation,
  planPerformanceObservation,
  type MicrodramaPerformanceBaselineAnnotation,
  type MicrodramaPerformanceObservation,
  type MicrodramaPerformanceObservationIdentity,
} from "@mediaforge/domain";

export type IngestPerformanceObservationInput = {
  readonly identity: MicrodramaPerformanceObservationIdentity;
  readonly providerVideoId: string;
  readonly counters: Readonly<Record<string, unknown>>;
  readonly baseline?: MicrodramaPerformanceBaselineAnnotation;
  readonly observedAt: string;
  readonly fetchedAt: string;
  readonly idempotencyKey: string;
};

export function ingestPerformanceObservation(
  input: IngestPerformanceObservationInput
): MicrodramaPerformanceObservation {
  const raw = buildPerformanceRawObservation({
    provider: input.identity.provider,
    providerAccountId: input.identity.providerAccountId,
    providerVideoId: input.providerVideoId,
    fetchedAt: input.fetchedAt,
    counters: input.counters,
  });

  return planPerformanceObservation({
    identity: input.identity,
    raw,
    baseline: input.baseline,
    observedAt: input.observedAt,
    idempotencyKey: input.idempotencyKey,
  });
}
