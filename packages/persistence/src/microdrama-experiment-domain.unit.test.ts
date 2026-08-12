import { describe, expect, it } from "vitest";

import {
  evaluateExperimentFromObservations,
  fakeExperimentAssignment,
  fakeExperimentRevision,
  fakePerformanceObservationIdentity,
  fakeTikTokVideoCounters,
  ingestPerformanceObservation,
} from "@mediaforge/performance";

import { FakeMicrodramaExperimentRepository } from "./microdrama-experiment-fake-repository.js";
import { MicrodramaExperimentConflictError } from "./microdrama-experiment-port.js";

describe("microdrama experiment persistence", () => {
  it("persists experiment revisions, assignments and results with idempotent replay", () => {
    const repository = new FakeMicrodramaExperimentRepository();
    repository.migrateExperiments();

    const revision = fakeExperimentRevision();
    const assignment = fakeExperimentAssignment({ revision });
    const observation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.001",
      counters: fakeTikTokVideoCounters({ view_count: 75 }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.exp.persist",
    });
    const result = evaluateExperimentFromObservations({
      experimentRevision: revision,
      assignment,
      observations: [observation],
      idempotencyKey: "exp.result.persist",
    });

    repository.recordExperimentRevision({ revision });
    repository.recordExperimentAssignment({ assignment });
    repository.recordExperimentResult({ result });

    expect(repository.getExperimentRevision(revision.experimentRevisionId)).toEqual(
      revision
    );
    expect(
      repository.getExperimentAssignmentByIdempotencyKey(assignment.idempotencyKey)
    ).toEqual(assignment);
    expect(
      repository.getExperimentResultByIdempotencyKey(result.idempotencyKey)
    ).toEqual(result);
    expect(
      repository.listExperimentAssignments({
        experimentRevisionId: revision.experimentRevisionId,
      })
    ).toHaveLength(1);
    expect(
      repository.listExperimentResults({
        experimentRevisionId: revision.experimentRevisionId,
      })
    ).toHaveLength(1);
  });

  it("rejects conflicting assignment idempotency keys", () => {
    const repository = new FakeMicrodramaExperimentRepository();
    repository.migrateExperiments();

    const revision = fakeExperimentRevision();
    const first = fakeExperimentAssignment({
      revision,
      idempotencyKey: "exp.assign.conflict",
    });
    const conflicting = fakeExperimentAssignment({
      revision,
      binding: {
        ...first.binding,
        publicationRevision: 2,
      },
      idempotencyKey: "exp.assign.conflict",
    });

    repository.recordExperimentAssignment({ assignment: first });
    expect(() =>
      repository.recordExperimentAssignment({ assignment: conflicting })
    ).toThrow(MicrodramaExperimentConflictError);
  });

  it("retains observational causal-confidence records for cross-locale results", () => {
    const repository = new FakeMicrodramaExperimentRepository();
    repository.migrateExperiments();

    const revision = fakeExperimentRevision({ locales: ["en-US", "de-DE"] });
    const assignment = fakeExperimentAssignment({ revision });
    const enObservation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "en-US" }),
      providerVideoId: "tiktok.video.en",
      counters: fakeTikTokVideoCounters({ view_count: 40 }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.exp.en.persist",
    });
    const deObservation = ingestPerformanceObservation({
      identity: fakePerformanceObservationIdentity({ locale: "de-DE" }),
      providerVideoId: "tiktok.video.de",
      counters: fakeTikTokVideoCounters({ view_count: 55 }),
      observedAt: "2026-08-12T12:00:00.000Z",
      fetchedAt: "2026-08-12T12:00:00.000Z",
      idempotencyKey: "perf.exp.de.persist",
    });
    const result = evaluateExperimentFromObservations({
      experimentRevision: revision,
      assignment,
      observations: [enObservation, deObservation],
      idempotencyKey: "exp.result.observational.persist",
    });

    repository.recordExperimentRevision({ revision });
    repository.recordExperimentResult({ result });

    const stored = repository.getExperimentResult(result.resultId);
    expect(stored?.causalConfidence.kind).toBe("observational");
    expect(stored?.provenance.eligibility).toEqual(revision.eligibility);
    expect(stored?.metricDefinitions.length).toBeGreaterThan(0);
  });
});
