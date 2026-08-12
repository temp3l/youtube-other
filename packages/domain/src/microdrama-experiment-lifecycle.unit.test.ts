import { describe, expect, it } from "vitest";

import {
  classifyExperimentCausalConfidence,
  planExperimentAssignment,
  planExperimentResult,
  planExperimentRevision,
} from "./microdrama-experiment-lifecycle.js";

const baseRevisionInput = {
  experimentId: "experiment.hook.001",
  revisionNumber: 1,
  seriesId: "series.001",
  hypothesis: "Shorter cold-open hooks increase completion within 24 hours.",
  controlledVariable: "cold_open_duration_seconds",
  control: {
    candidateId: "control.standard",
    label: "Standard cold open",
    description: "Existing 12-second cold open pattern.",
  },
  candidates: [
    {
      candidateId: "candidate.short",
      label: "Short cold open",
      description: "8-second cold open variant.",
    },
  ],
  eligibility: {
    locales: ["en-US"],
    providers: ["tiktok" as const],
    minimumObservationWindowHours: 24,
  },
  observationWindow: {
    windowStart: "2026-08-12T00:00:00.000Z",
    windowEnd: "2026-08-12T23:59:59.000Z",
  },
  stoppingRule: "Stop after 500 eligible views or 72 hours.",
  recordedAt: "2026-08-12T10:00:00.000Z",
};

describe("microdrama experiment lifecycle", () => {
  it("plans revision-linked experiment assignments with deterministic fingerprints", () => {
    const revision = planExperimentRevision(baseRevisionInput);
    const assignment = planExperimentAssignment({
      experimentId: revision.experimentId,
      experimentRevisionId: revision.experimentRevisionId,
      candidateId: "candidate.short",
      binding: {
        seriesId: "series.001",
        episodeId: "episode.001",
        episodeRevisionId: "episode.rev.001",
        locale: "en-US",
        provider: "tiktok",
        providerAccountId: "tiktok.account.001",
        publicationId: "intent.001",
        publicationRevision: 1,
        renderHash: "a".repeat(64),
        metadataRevisionId: "meta.rev.001",
      },
      assignedAt: "2026-08-12T11:00:00.000Z",
      idempotencyKey: "exp.assign.001",
    });

    expect(revision.experimentRevisionId).toMatch(/^exp-rev-[a-f0-9]{16}$/u);
    expect(assignment.experimentRevisionId).toBe(revision.experimentRevisionId);
    expect(assignment.assignmentId).toMatch(/^exp-asg-[a-f0-9]{16}$/u);
  });

  it("labels uncontrolled cross-locale comparisons as observational", () => {
    const revision = planExperimentRevision(baseRevisionInput);
    const assignment = planExperimentAssignment({
      experimentId: revision.experimentId,
      experimentRevisionId: revision.experimentRevisionId,
      candidateId: "candidate.short",
      binding: {
        seriesId: "series.001",
        episodeId: "episode.001",
        episodeRevisionId: "episode.rev.001",
        locale: "en-US",
        provider: "tiktok",
        providerAccountId: "tiktok.account.001",
        publicationId: "intent.001",
        publicationRevision: 1,
        renderHash: "a".repeat(64),
        metadataRevisionId: "meta.rev.001",
      },
      assignedAt: "2026-08-12T11:00:00.000Z",
      idempotencyKey: "exp.assign.cross-locale",
    });

    const result = planExperimentResult({
      experimentId: revision.experimentId,
      experimentRevision: revision,
      assignment,
      observationIds: ["perf-obs-en", "perf-obs-de"],
      observationLocales: ["en-US", "de-DE"],
      providers: ["tiktok"],
      metricDefinitions: [
        {
          metricKind: "completion_rate",
          label: "24h completion rate",
          source: "normalized_observation",
        },
      ],
      recordedAt: "2026-08-13T10:00:00.000Z",
      idempotencyKey: "exp.result.cross-locale",
    });

    expect(result.causalConfidence).toEqual({
      kind: "observational",
      rationale:
        "Cross-locale comparisons remain observational without isolated controlled assignment per locale.",
      limitationCodes: ["cross_locale_comparison"],
    });
    expect(result.provenance.eligibility).toEqual(revision.eligibility);
    expect(result.provenance.observationWindow).toEqual(revision.observationWindow);
    expect(result.limitations).toContain(
      "Observed evidence does not support causal inference beyond the recorded limitations."
    );
  });

  it("retains controlled classification when assignment and locale scope match", () => {
    const revision = planExperimentRevision(baseRevisionInput);
    const assignment = planExperimentAssignment({
      experimentId: revision.experimentId,
      experimentRevisionId: revision.experimentRevisionId,
      candidateId: "candidate.short",
      binding: {
        seriesId: "series.001",
        episodeId: "episode.001",
        episodeRevisionId: "episode.rev.001",
        locale: "en-US",
        provider: "tiktok",
        providerAccountId: "tiktok.account.001",
        publicationId: "intent.001",
        publicationRevision: 1,
        renderHash: "a".repeat(64),
        metadataRevisionId: "meta.rev.001",
      },
      assignedAt: "2026-08-12T11:00:00.000Z",
      idempotencyKey: "exp.assign.controlled",
    });

    const confidence = classifyExperimentCausalConfidence({
      experimentRevision: revision,
      assignment,
      observationLocales: ["en-US"],
      providers: ["tiktok"],
    });

    expect(confidence.kind).toBe("controlled");
    if (confidence.kind === "controlled") {
      expect(confidence.assignmentId).toBe(assignment.assignmentId);
      expect(confidence.experimentRevisionId).toBe(revision.experimentRevisionId);
    }
  });
});
