import { describe, expect, it } from "vitest";

import {
  evaluateExperimentFromObservations,
  fakeExperimentAssignment,
  fakeExperimentRevision,
  fakePerformanceObservationIdentity,
  fakeTikTokVideoCounters,
  ingestPerformanceObservation,
} from "@mediaforge/performance";

describe("experiment evaluation", () => {
  it("records controlled results with metric definitions, assignment and limitations", () => {
    const revision = fakeExperimentRevision();
    const assignment = fakeExperimentAssignment({ revision });
    const observation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.001",
      counters: fakeTikTokVideoCounters({
        view_count: 120,
        like_count: 8,
      }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.exp.controlled",
    });

    const result = evaluateExperimentFromObservations({
      experimentRevision: revision,
      assignment,
      observations: [observation],
      idempotencyKey: "exp.result.controlled",
    });

    expect(result.causalConfidence.kind).toBe("controlled");
    expect(result.provenance.assignmentId).toBe(assignment.assignmentId);
    expect(result.metricDefinitions).toEqual([
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
    ]);
    expect(result.provenance.observationWindow).toEqual(revision.observationWindow);
    expect(result.limitations).toContain(
      "Result compares normalized observations only; missing metrics remain unavailable."
    );
  });

  it("labels uncontrolled cross-locale comparisons as observational", () => {
    const revision = fakeExperimentRevision({ locales: ["en-US", "de-DE"] });
    const assignment = fakeExperimentAssignment({ revision });
    const enObservation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.en",
      counters: fakeTikTokVideoCounters({ view_count: 90 }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.exp.en",
    });
    const deObservation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "de-DE" }),
      providerVideoId: "tiktok.video.de",
      counters: fakeTikTokVideoCounters({ view_count: 110 }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.exp.de",
    });

    const result = evaluateExperimentFromObservations({
      experimentRevision: revision,
      assignment,
      observations: [enObservation, deObservation],
      idempotencyKey: "exp.result.observational",
    });

    expect(result.causalConfidence).toEqual({
      kind: "observational",
      rationale:
        "Cross-locale comparisons remain observational without isolated controlled assignment per locale.",
      limitationCodes: ["cross_locale_comparison"],
    });
    expect(result.provenance.observationIds).toEqual([
      enObservation.observationId,
      deObservation.observationId,
    ]);
  });
});
