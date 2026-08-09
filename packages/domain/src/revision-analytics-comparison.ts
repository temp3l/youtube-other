import { z } from "zod";

import {
  immutablePlanHash,
  revisionAnalyticsObservationSchema,
  type RevisionAnalyticsObservation,
} from "./genre-production-intelligence.js";
import {
  contentProfileIdSchema,
  normalizeContentProfileId,
} from "./workflow-contracts.js";

const identifier = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

const cohortInputSchema = z.strictObject({
  observation: revisionAnalyticsObservationSchema,
  format: z.enum(["full", "short"]),
});

export const revisionAnalyticsComparisonSchema = z.strictObject({
  schemaVersion: z.literal("revision-analytics-comparison.v1"),
  comparisonId: z.string().regex(/^analytics-comparison-[a-f0-9]{16}$/u),
  contentProfileId: contentProfileIdSchema,
  episodeId: identifier,
  metric: identifier,
  comparisonDimensions: z.array(z.enum(["locale", "format"])).min(1).max(2),
  interpretation: z.literal("observational-non-causal"),
  immutableObservationBindings: z.array(z.strictObject({
    observationId: identifier,
    publicationId: identifier,
    publicationRevision: z.number().int().nonnegative(),
    editionRevisionId: identifier,
    locale: z.enum(["en", "de", "es", "fr", "pt", "it"]),
    format: z.enum(["full", "short"]),
    observedAt: z.iso.datetime({ offset: true }),
    configurationRevision: identifier,
    dependencyIdentity: z.record(identifier, sha256),
    provenanceSha256: sha256,
    observationFingerprint: sha256,
  })).min(2),
  cohorts: z.array(z.strictObject({
    locale: z.enum(["en", "de", "es", "fr", "pt", "it"]),
    format: z.enum(["full", "short"]),
    observationId: identifier,
    value: z.number().finite().nonnegative(),
  })).min(2),
  effectiveConfigurationHash: sha256,
  dependencyIdentity: z.record(identifier, sha256).refine(
    (value) => Object.keys(value).length >= 1 && Object.keys(value).length <= 100,
    "Comparison dependency identity requires 1 to 100 entries.",
  ),
  provenance: z.strictObject({
    source: z.literal("immutable-revision-analytics-observations"),
    observationSetHash: sha256,
  }),
  reuseRationale: z.enum(["new-comparison", "content-hash-match"]),
  regenerationRationale: z.enum(["new-comparison", "observations-changed", "configuration-changed", "dependency-changed"]),
  profileMutationEnabled: z.literal(false),
  providerDispatchEnabled: z.literal(false),
  fingerprint: sha256,
});
export type RevisionAnalyticsComparison = z.infer<typeof revisionAnalyticsComparisonSchema>;

export interface CompareRevisionAnalyticsInput {
  readonly contentProfileId: string;
  readonly episodeId: string;
  readonly metric: string;
  readonly comparisonDimensions: readonly ("locale" | "format")[];
  readonly cohorts: readonly z.infer<typeof cohortInputSchema>[];
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly previousComparison?: RevisionAnalyticsComparison;
}

function observationFingerprint(observation: RevisionAnalyticsObservation): string {
  const { regenerationRationale: _regenerationRationale, ...identity } = observation;
  return immutablePlanHash(identity);
}

/**
 * Builds a descriptive comparison only. Cohort labels are supplied as reviewed
 * format metadata; the observation contract intentionally does not infer a
 * format from an opaque edition revision. No outcome implies causation.
 */
export function compareRevisionAnalytics(input: CompareRevisionAnalyticsInput): { readonly comparison: RevisionAnalyticsComparison; readonly reused: boolean } {
  const contentProfileId = normalizeContentProfileId(input.contentProfileId);
  const dimensions = [...new Set(input.comparisonDimensions)].sort();
  if (dimensions.length === 0) throw new Error("ANALYTICS_COMPARISON_DIMENSION_REQUIRED");
  const cohorts = input.cohorts.map((candidate) => cohortInputSchema.parse(candidate));
  if (cohorts.length < 2) throw new Error("ANALYTICS_COMPARISON_COHORTS_REQUIRED");
  if (cohorts.some(({ observation }) => observation.contentProfileId !== contentProfileId || observation.episodeId !== input.episodeId)) {
    throw new Error("ANALYTICS_COMPARISON_IDENTITY_MISMATCH");
  }
  if (cohorts.some(({ observation }) => observation.metrics[input.metric] === undefined)) {
    throw new Error("ANALYTICS_COMPARISON_METRIC_MISSING");
  }
  const cohortKeys = cohorts.map(({ observation, format }) => dimensions.map((dimension) => dimension === "locale" ? observation.locale : format).join(":"));
  if (new Set(cohortKeys).size < 2) throw new Error("ANALYTICS_COMPARISON_COHORTS_INDISTINCT");
  const bindings = cohorts.map(({ observation, format }) => ({
    observationId: observation.observationId,
    publicationId: observation.publicationId,
    publicationRevision: observation.publicationRevision,
    editionRevisionId: observation.editionRevisionId,
    locale: observation.locale,
    format,
    observedAt: observation.observedAt,
    configurationRevision: observation.configurationRevision,
    dependencyIdentity: observation.dependencyIdentity,
    provenanceSha256: observation.provenanceSha256,
    observationFingerprint: observationFingerprint(observation),
  })).sort((left, right) => left.observationId.localeCompare(right.observationId));
  const material = {
    schemaVersion: "revision-analytics-comparison.v1" as const,
    contentProfileId,
    episodeId: input.episodeId,
    metric: input.metric,
    comparisonDimensions: dimensions,
    interpretation: "observational-non-causal" as const,
    immutableObservationBindings: bindings,
    cohorts: cohorts.map(({ observation, format }) => ({ locale: observation.locale, format, observationId: observation.observationId, value: observation.metrics[input.metric]! })).sort((left, right) => left.observationId.localeCompare(right.observationId)),
    effectiveConfigurationHash: sha256.parse(input.effectiveConfigurationHash),
    dependencyIdentity: input.dependencyIdentity,
    provenance: {
      source: "immutable-revision-analytics-observations" as const,
      observationSetHash: immutablePlanHash(bindings),
    },
  };
  const fingerprint = immutablePlanHash(material);
  const reused = input.previousComparison?.fingerprint === fingerprint;
  return {
    comparison: revisionAnalyticsComparisonSchema.parse({
      ...material,
      comparisonId: `analytics-comparison-${fingerprint.slice(0, 16)}`,
      reuseRationale: reused ? "content-hash-match" : "new-comparison",
      regenerationRationale: "new-comparison",
      profileMutationEnabled: false,
      providerDispatchEnabled: false,
      fingerprint,
    }),
    reused,
  };
}
