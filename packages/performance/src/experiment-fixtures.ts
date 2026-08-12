import type {
  MicrodramaExperimentAssignmentBinding,
  MicrodramaExperimentRevision,
} from "@mediaforge/domain";

import {
  planExperimentAssignment,
  planExperimentRevision,
} from "@mediaforge/domain";

export function fakeExperimentRevision(input?: {
  readonly locales?: readonly string[];
  readonly providers?: MicrodramaExperimentRevision["eligibility"]["providers"];
}): MicrodramaExperimentRevision {
  return planExperimentRevision({
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
      locales: [...(input?.locales ?? ["en-US"])],
      providers: [...(input?.providers ?? ["tiktok"])],
      minimumObservationWindowHours: 24,
    },
    observationWindow: {
      windowStart: "2026-08-12T00:00:00.000Z",
      windowEnd: "2026-08-12T23:59:59.000Z",
    },
    stoppingRule: "Stop after 500 eligible views or 72 hours.",
    recordedAt: "2026-08-12T10:00:00.000Z",
  });
}

export function fakeExperimentAssignmentBinding(input?: {
  readonly locale?: string;
  readonly provider?: MicrodramaExperimentAssignmentBinding["provider"];
  readonly publicationRevision?: number;
}): MicrodramaExperimentAssignmentBinding {
  const provider = input?.provider ?? "tiktok";
  return {
    seriesId: "series.001",
    episodeId: "episode.001",
    episodeRevisionId: "episode.rev.001",
    locale: input?.locale ?? "en-US",
    provider,
    providerAccountId:
      provider === "tiktok" ? "tiktok.account.001" : "youtube.channel.001",
    publicationId: "intent.001",
    publicationRevision: input?.publicationRevision ?? 1,
    renderHash: "a".repeat(64),
    metadataRevisionId: "meta.rev.001",
  };
}

export function fakeExperimentAssignment(input?: {
  readonly revision?: MicrodramaExperimentRevision;
  readonly binding?: MicrodramaExperimentAssignmentBinding;
  readonly idempotencyKey?: string;
}) {
  const revision = input?.revision ?? fakeExperimentRevision();
  return planExperimentAssignment({
    experimentId: revision.experimentId,
    experimentRevisionId: revision.experimentRevisionId,
    candidateId: "candidate.short",
    binding: input?.binding ?? fakeExperimentAssignmentBinding(),
    assignedAt: "2026-08-12T11:00:00.000Z",
    idempotencyKey: input?.idempotencyKey ?? "exp.assign.fixture",
  });
}
