import { createHash } from "node:crypto";

import {
  type MicrodramaExperimentAssignment,
  type MicrodramaExperimentAssignmentBinding,
  type MicrodramaExperimentCandidate,
  type MicrodramaExperimentCausalConfidence,
  type MicrodramaExperimentEligibility,
  type MicrodramaExperimentResult,
  type MicrodramaExperimentResultMetricDefinition,
  type MicrodramaExperimentRevision,
  microdramaExperimentAssignmentSchema,
  microdramaExperimentResultSchema,
  microdramaExperimentRevisionSchema,
} from "./microdrama-experiment-contracts.js";
import type { MicrodramaPublicationProvider } from "./microdrama-publication-contracts.js";
import type { MicrodramaPerformanceObservationWindow } from "./microdrama-performance-contracts.js";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Experiment record cannot contain a non-finite number.");
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
  throw new Error("Experiment record contains an unsupported value.");
}

export function computeExperimentRevisionFingerprint(input: {
  readonly experimentId: string;
  readonly revisionNumber: number;
  readonly seriesId: string;
  readonly hypothesis: string;
  readonly controlledVariable: string;
  readonly control: MicrodramaExperimentCandidate;
  readonly candidates: readonly MicrodramaExperimentCandidate[];
  readonly eligibility: MicrodramaExperimentEligibility;
  readonly observationWindow: MicrodramaPerformanceObservationWindow;
  readonly stoppingRule: string;
  readonly recordedAt: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        experimentId: input.experimentId,
        revisionNumber: input.revisionNumber,
        seriesId: input.seriesId,
        hypothesis: input.hypothesis,
        controlledVariable: input.controlledVariable,
        control: input.control,
        candidates: input.candidates,
        eligibility: input.eligibility,
        observationWindow: input.observationWindow,
        stoppingRule: input.stoppingRule,
        recordedAt: input.recordedAt,
      }),
      "utf8"
    )
    .digest("hex");
}

export function planExperimentRevision(input: {
  readonly experimentId: string;
  readonly revisionNumber: number;
  readonly seriesId: string;
  readonly hypothesis: string;
  readonly controlledVariable: string;
  readonly control: MicrodramaExperimentCandidate;
  readonly candidates: readonly MicrodramaExperimentCandidate[];
  readonly eligibility: MicrodramaExperimentEligibility;
  readonly observationWindow: MicrodramaPerformanceObservationWindow;
  readonly stoppingRule: string;
  readonly recordedAt: string;
}): MicrodramaExperimentRevision {
  const fingerprint = computeExperimentRevisionFingerprint(input);
  return microdramaExperimentRevisionSchema.parse({
    schemaVersion: "mediaforge.microdrama-experiment.v1",
    experimentRevisionId: `exp-rev-${fingerprint.slice(0, 16)}`,
    ...input,
    fingerprint,
  });
}

export function computeExperimentAssignmentFingerprint(input: {
  readonly experimentId: string;
  readonly experimentRevisionId: string;
  readonly candidateId: string;
  readonly binding: MicrodramaExperimentAssignmentBinding;
  readonly assignedAt: string;
  readonly idempotencyKey: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        experimentId: input.experimentId,
        experimentRevisionId: input.experimentRevisionId,
        candidateId: input.candidateId,
        binding: input.binding,
        assignedAt: input.assignedAt,
        idempotencyKey: input.idempotencyKey,
      }),
      "utf8"
    )
    .digest("hex");
}

export function planExperimentAssignment(input: {
  readonly experimentId: string;
  readonly experimentRevisionId: string;
  readonly candidateId: string;
  readonly binding: MicrodramaExperimentAssignmentBinding;
  readonly assignedAt: string;
  readonly idempotencyKey: string;
}): MicrodramaExperimentAssignment {
  const fingerprint = computeExperimentAssignmentFingerprint(input);
  return microdramaExperimentAssignmentSchema.parse({
    schemaVersion: "mediaforge.microdrama-experiment.v1",
    assignmentId: `exp-asg-${fingerprint.slice(0, 16)}`,
    ...input,
    fingerprint,
  });
}

export type ClassifyExperimentCausalConfidenceInput = {
  readonly experimentRevision: MicrodramaExperimentRevision;
  readonly assignment?: MicrodramaExperimentAssignment;
  readonly observationLocales: readonly string[];
  readonly providers: readonly MicrodramaPublicationProvider[];
};

export function classifyExperimentCausalConfidence(
  input: ClassifyExperimentCausalConfidenceInput
): MicrodramaExperimentCausalConfidence {
  const uniqueLocales = [...new Set(input.observationLocales)];
  const uniqueProviders = [...new Set(input.providers)];

  if (!input.assignment) {
    return {
      kind: "observational",
      rationale:
        "No controlled assignment binds the compared publication revisions.",
      limitationCodes: ["missing_assignment"],
    };
  }

  if (uniqueLocales.length > 1) {
    return {
      kind: "observational",
      rationale:
        "Cross-locale comparisons remain observational without isolated controlled assignment per locale.",
      limitationCodes: ["cross_locale_comparison"],
    };
  }

  if (uniqueProviders.length > 1) {
    return {
      kind: "observational",
      rationale:
        "Cross-provider comparisons are not controlled by a single assignment binding.",
      limitationCodes: ["cross_provider_comparison"],
    };
  }

  if (
    input.assignment.experimentRevisionId !==
    input.experimentRevision.experimentRevisionId
  ) {
    return {
      kind: "observational",
      rationale: "Assignment does not match the experiment revision under test.",
      limitationCodes: ["uncontrolled_variables"],
    };
  }

  const locale = uniqueLocales[0]!;
  if (!input.experimentRevision.eligibility.locales.includes(locale)) {
    return {
      kind: "observational",
      rationale: "Observed locale is outside experiment eligibility.",
      limitationCodes: ["uncontrolled_variables"],
    };
  }

  const provider = uniqueProviders[0]!;
  if (!input.experimentRevision.eligibility.providers.includes(provider)) {
    return {
      kind: "observational",
      rationale: "Observed provider is outside experiment eligibility.",
      limitationCodes: ["uncontrolled_variables"],
    };
  }

  return {
    kind: "controlled",
    rationale:
      "Valid assignment binds one candidate within eligible locale and provider scope.",
    assignmentId: input.assignment.assignmentId,
    experimentRevisionId: input.experimentRevision.experimentRevisionId,
  };
}

export function computeExperimentResultFingerprint(input: {
  readonly experimentId: string;
  readonly provenance: MicrodramaExperimentResult["provenance"];
  readonly metricDefinitions: readonly MicrodramaExperimentResultMetricDefinition[];
  readonly limitations: readonly string[];
  readonly causalConfidence: MicrodramaExperimentCausalConfidence;
  readonly comparisonSummary?: string;
  readonly recordedAt: string;
  readonly idempotencyKey: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        experimentId: input.experimentId,
        provenance: input.provenance,
        metricDefinitions: input.metricDefinitions,
        limitations: input.limitations,
        causalConfidence: input.causalConfidence,
        comparisonSummary: input.comparisonSummary,
        recordedAt: input.recordedAt,
        idempotencyKey: input.idempotencyKey,
      }),
      "utf8"
    )
    .digest("hex");
}

export function planExperimentResult(input: {
  readonly experimentId: string;
  readonly experimentRevision: MicrodramaExperimentRevision;
  readonly assignment?: MicrodramaExperimentAssignment;
  readonly observationIds: readonly string[];
  readonly observationLocales: readonly string[];
  readonly providers: readonly MicrodramaPublicationProvider[];
  readonly metricDefinitions: readonly MicrodramaExperimentResultMetricDefinition[];
  readonly limitations?: readonly string[];
  readonly comparisonSummary?: string;
  readonly recordedAt: string;
  readonly idempotencyKey: string;
}): MicrodramaExperimentResult {
  const causalConfidence = classifyExperimentCausalConfidence({
    experimentRevision: input.experimentRevision,
    assignment: input.assignment,
    observationLocales: input.observationLocales,
    providers: input.providers,
  });
  const limitations = [
    ...(input.limitations ?? []),
    ...(causalConfidence.kind === "observational"
      ? [
          "Observed evidence does not support causal inference beyond the recorded limitations.",
        ]
      : []),
  ];
  const provenance = {
    experimentRevisionId: input.experimentRevision.experimentRevisionId,
    assignmentId: input.assignment?.assignmentId,
    observationIds: input.observationIds,
    eligibility: input.experimentRevision.eligibility,
    observationWindow: input.experimentRevision.observationWindow,
  };
  const fingerprint = computeExperimentResultFingerprint({
    experimentId: input.experimentId,
    provenance,
    metricDefinitions: input.metricDefinitions,
    limitations,
    causalConfidence,
    comparisonSummary: input.comparisonSummary,
    recordedAt: input.recordedAt,
    idempotencyKey: input.idempotencyKey,
  });

  return microdramaExperimentResultSchema.parse({
    schemaVersion: "mediaforge.microdrama-experiment.v1",
    resultId: `exp-res-${fingerprint.slice(0, 16)}`,
    experimentId: input.experimentId,
    provenance,
    metricDefinitions: input.metricDefinitions,
    limitations,
    causalConfidence,
    comparisonSummary: input.comparisonSummary,
    recordedAt: input.recordedAt,
    idempotencyKey: input.idempotencyKey,
    fingerprint,
  });
}
