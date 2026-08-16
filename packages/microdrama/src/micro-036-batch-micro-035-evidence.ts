import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  type Micro035BoundedMultilingualCanaryExecuteResult,
  type Micro035EpisodeMultilingualCanaryEvidence,
} from "./micro-035-bounded-multilingual-canary-execute.js";

export const DEFAULT_MICRO_035_EXECUTION_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-035-canary-execution-evidence.json";

export type Micro035CanaryExecutionEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly episodes: readonly Micro035EpisodeMultilingualCanaryEvidence[];
  readonly executedAt?: string;
  readonly outputRoot?: string;
  readonly preparationFingerprint?: string;
  readonly evidenceProjectionKey?: string;
};

export type Micro036BatchSharedVisualPathsByEpisode = Record<
  string,
  Record<string, string>
>;

export function computeMicro035EvidenceContentHash(
  evidence: Micro035CanaryExecutionEvidence
): string {
  return computePayloadHash({
    status: evidence.status,
    episodeCount: evidence.episodes.length,
    episodes: evidence.episodes.map((episode) => ({
      locale: episode.locale,
      episodeId: episode.episodeId,
      visualRenderHash: episode.visualRenderHash,
    })),
  });
}

export function loadMicro035CanaryExecutionEvidenceFromProjection(
  repository: MicrodramaSQLiteRepository
): Micro035CanaryExecutionEvidence | null {
  const stored = repository.getProjection(
    MICRO_035_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro035BoundedMultilingualCanaryExecuteResult & {
    readonly episodes?: Micro035EpisodeMultilingualCanaryEvidence[];
    readonly status?: "DONE" | "BLOCKED";
    readonly outputRoot?: string;
    readonly executedAt?: string;
    readonly preparationFingerprint?: string;
    readonly evidenceProjectionKey?: string;
    readonly blockers?: readonly string[];
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
    executedAt: projection.executedAt,
    outputRoot: projection.outputRoot,
    preparationFingerprint: projection.preparationFingerprint,
    evidenceProjectionKey: projection.evidenceProjectionKey,
  };
}

export function loadMicro035CanaryExecutionEvidence(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro035CanaryExecutionEvidence | null {
  if (input.repository) {
    const fromProjection = loadMicro035CanaryExecutionEvidenceFromProjection(
      input.repository
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath && existsSync(input.jsonFilePath)) {
    const parsed = JSON.parse(readFileSync(input.jsonFilePath, "utf8")) as
      | Micro035BoundedMultilingualCanaryExecuteResult
      | Micro035CanaryExecutionEvidence;
    const episodes = parsed.episodes ?? [];
    const status =
      parsed.status ??
      (episodes.length > 0 ? "DONE" : "BLOCKED");
    return {
      status,
      episodes,
      executedAt: "executedAt" in parsed ? parsed.executedAt : undefined,
      outputRoot: parsed.outputRoot,
      preparationFingerprint:
        "preparationFingerprint" in parsed ? parsed.preparationFingerprint : undefined,
      evidenceProjectionKey:
        "evidenceProjectionKey" in parsed ? parsed.evidenceProjectionKey : undefined,
    };
  }
  return null;
}

export function extractSharedVisualPathsFromBatchEnArtifacts(input: {
  readonly batchOutputRoot: string;
  readonly episodeIds: readonly string[];
}): Micro036BatchSharedVisualPathsByEpisode {
  const result: Micro036BatchSharedVisualPathsByEpisode = {};
  for (const episodeId of input.episodeIds) {
    const visualsDir = path.join(
      input.batchOutputRoot,
      "en-us",
      episodeId.toLowerCase(),
      "visuals"
    );
    const plates: Record<string, string> = {};
    if (existsSync(visualsDir)) {
      for (const fileName of readdirSync(visualsDir)) {
        if (!fileName.endsWith(".png")) {
          continue;
        }
        const semanticId = fileName.replace(/\.png$/u, "");
        plates[semanticId] = path.join(visualsDir, fileName);
      }
    }
    result[episodeId] = plates;
  }
  return result;
}

export function resolveMicro036BatchSharedVisualPaths(input: {
  readonly batchOutputRoot: string;
  readonly episodeIds: readonly string[];
}): Micro036BatchSharedVisualPathsByEpisode {
  return extractSharedVisualPathsFromBatchEnArtifacts(input);
}
