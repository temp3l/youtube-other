import type { MicrodramaPerformanceObservation } from "@mediaforge/domain";
import { planExperimentResult, type MicrodramaExperimentAssignment, type MicrodramaExperimentRevision } from "@mediaforge/domain";

export function evaluateExperimentFromObservations(input: {
  readonly experimentRevision: MicrodramaExperimentRevision;
  readonly assignment?: MicrodramaExperimentAssignment;
  readonly observations: readonly MicrodramaPerformanceObservation[];
  readonly idempotencyKey: string;
  readonly recordedAt?: string;
}) {
  return planExperimentResult({
    experimentId: input.experimentRevision.experimentId,
    experimentRevision: input.experimentRevision,
    assignment: input.assignment,
    observationIds: input.observations.map(
      (observation) => observation.observationId
    ),
    observationLocales: input.observations.map(
      (observation) => observation.identity.locale
    ),
    providers: input.observations.map(
      (observation) => observation.identity.provider
    ),
    metricDefinitions: [
      {
        metricKind: "views",
        label: "Eligible views in observation window",
        source: "normalized_observation",
      },
      {
        metricKind: "completion_rate",
        label: "Window completion rate",
        source: "normalized_observation",
      },
    ],
    limitations: [
      "Result compares normalized observations only; missing metrics remain unavailable.",
    ],
    recordedAt: input.recordedAt ?? "2026-08-13T10:00:00.000Z",
    idempotencyKey: input.idempotencyKey,
  });
}
