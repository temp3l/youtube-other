import { readFileSync } from "node:fs";

import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  type Micro033BoundedTtsCanaryExecuteResult,
  type Micro033EpisodeCanaryTimingEvidence,
} from "./micro-033-bounded-tts-canary-execute.js";
import type { FakeSelectedAudioFixture } from "./locale-tts-segmentation.js";

export const DEFAULT_MICRO_033_EXECUTION_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-033-canary-execution-evidence.json";

export type Micro033CanaryExecutionEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly episodes: readonly Micro033EpisodeCanaryTimingEvidence[];
  readonly executedAt?: string;
  readonly preparationFingerprint?: string;
  readonly evidenceProjectionKey?: string;
};

export function mapMicro033EpisodeToSelectedAudioFixture(
  episode: Micro033EpisodeCanaryTimingEvidence
): FakeSelectedAudioFixture {
  const segmentDurationsMs = [...episode.segmentDurationsMs];
  const segmentTotalMs = segmentDurationsMs.reduce((sum, durationMs) => sum + durationMs, 0);
  return {
    kind: "fake-measured-audio",
    totalDurationMs:
      segmentTotalMs > 0 ? segmentTotalMs : episode.measuredDurationMs,
    segmentDurationsMs,
  };
}

export function extractMicro033AudioRevisionIds(
  evidence: Micro033CanaryExecutionEvidence
): readonly string[] {
  return evidence.episodes.map((episode) => episode.alignmentRevisionId);
}

export function loadMicro033CanaryExecutionEvidenceFromProjection(
  repository: MicrodramaSQLiteRepository
): Micro033CanaryExecutionEvidence | null {
  const stored = repository.getProjection(
    MICRO_033_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro033BoundedTtsCanaryExecuteResult & {
    readonly episodes?: Micro033EpisodeCanaryTimingEvidence[];
    readonly status?: "DONE" | "BLOCKED";
  };
  const episodes = projection.episodes ?? [];
  const status =
    projection.status ??
    (episodes.length > 0 && (projection.blockers?.length ?? 0) === 0
      ? "DONE"
      : "BLOCKED");
  return {
    status,
    episodes,
    executedAt: (projection as { executedAt?: string }).executedAt,
    preparationFingerprint: (projection as { preparationFingerprint?: string })
      .preparationFingerprint,
    evidenceProjectionKey: projection.evidenceProjectionKey,
  };
}

export function loadMicro033CanaryExecutionEvidenceFromJson(
  jsonFilePath: string
): Micro033CanaryExecutionEvidence | null {
  try {
    const parsed = JSON.parse(readFileSync(jsonFilePath, "utf8")) as {
      status?: "DONE" | "BLOCKED";
      episodes?: Micro033EpisodeCanaryTimingEvidence[];
      executedAt?: string;
      preparationFingerprint?: string;
      evidenceProjectionKey?: string;
    };
    if (!parsed.status || !parsed.episodes) {
      return null;
    }
    return {
      status: parsed.status,
      episodes: parsed.episodes,
      ...(parsed.executedAt ? { executedAt: parsed.executedAt } : {}),
      ...(parsed.preparationFingerprint
        ? { preparationFingerprint: parsed.preparationFingerprint }
        : {}),
      ...(parsed.evidenceProjectionKey
        ? { evidenceProjectionKey: parsed.evidenceProjectionKey }
        : {}),
    };
  } catch {
    return null;
  }
}

export function loadMicro033CanaryExecutionEvidence(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro033CanaryExecutionEvidence | null {
  if (input.repository) {
    const fromProjection = loadMicro033CanaryExecutionEvidenceFromProjection(
      input.repository
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadMicro033CanaryExecutionEvidenceFromJson(input.jsonFilePath);
  }
  return null;
}

export function computeMicro033EvidenceContentHash(
  evidence: Micro033CanaryExecutionEvidence
): string {
  return JSON.stringify({
    scope: "micro-034.micro-033-evidence.v1",
    status: evidence.status,
    audioRevisionIds: extractMicro033AudioRevisionIds(evidence),
    episodes: evidence.episodes.map((episode) => ({
      episodeId: episode.episodeId,
      scriptRevisionId: episode.scriptRevisionId,
      measuredDurationMs: episode.measuredDurationMs,
      narrationAudioSha256: episode.narrationAudioSha256,
    })),
  });
}
