import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import {
  MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  type Micro034BoundedVisualCanaryExecuteResult,
  type Micro034EpisodeVisualCanaryEvidence,
} from "./micro-034-bounded-visual-canary-execute.js";
import { MICRO_035_SHARED_VISUAL_REVISION_IDS } from "./micro-035-canary-bindings.js";

export const DEFAULT_MICRO_034_EXECUTION_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-034-canary-execution-evidence.json";

export type Micro034CanaryExecutionEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly episodes: readonly Micro034EpisodeVisualCanaryEvidence[];
  readonly executedAt?: string;
  readonly outputRoot?: string;
  readonly preparationFingerprint?: string;
  readonly evidenceProjectionKey?: string;
  readonly sharedVisualRevisionIds?: readonly string[];
};

export type Micro034SharedVisualPathsByEpisode = Record<
  string,
  Record<string, string>
>;

export function extractMicro034SharedVisualRevisionIds(
  evidence: Micro034CanaryExecutionEvidence
): readonly string[] {
  return evidence.episodes.map(
    (episode) =>
      episode.visualRenderHash ??
      MICRO_035_SHARED_VISUAL_REVISION_IDS[
        episode.episodeId as keyof typeof MICRO_035_SHARED_VISUAL_REVISION_IDS
      ]
  );
}

export function extractSharedVisualPathsFromMicro034Artifacts(input: {
  readonly outputRoot: string;
}): Micro034SharedVisualPathsByEpisode {
  const result: Micro034SharedVisualPathsByEpisode = {};
  for (const episodeId of ["E001", "E002", "E003"] as const) {
    const visualsDir = path.join(
      input.outputRoot,
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

export function loadMicro034CanaryExecutionEvidenceFromProjection(
  repository: MicrodramaSQLiteRepository
): Micro034CanaryExecutionEvidence | null {
  const stored = repository.getProjection(
    MICRO_034_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro034BoundedVisualCanaryExecuteResult & {
    readonly episodes?: Micro034EpisodeVisualCanaryEvidence[];
    readonly status?: "DONE" | "BLOCKED";
    readonly outputRoot?: string;
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
    ...(projection.outputRoot ? { outputRoot: projection.outputRoot } : {}),
    executedAt: (projection as { executedAt?: string }).executedAt,
    preparationFingerprint: (projection as { preparationFingerprint?: string })
      .preparationFingerprint,
    evidenceProjectionKey: projection.evidenceProjectionKey,
    sharedVisualRevisionIds: extractMicro034SharedVisualRevisionIds({
      status,
      episodes,
    }),
  };
}

export function loadMicro034CanaryExecutionEvidenceFromJson(
  jsonFilePath: string
): Micro034CanaryExecutionEvidence | null {
  try {
    const parsed = JSON.parse(readFileSync(jsonFilePath, "utf8")) as {
      status?: "DONE" | "BLOCKED";
      episodes?: Micro034EpisodeVisualCanaryEvidence[];
      executedAt?: string;
      outputRoot?: string;
      preparationFingerprint?: string;
      evidenceProjectionKey?: string;
    };
    if (!parsed.status || !parsed.episodes) {
      return null;
    }
    const evidence: Micro034CanaryExecutionEvidence = {
      status: parsed.status,
      episodes: parsed.episodes,
      ...(parsed.executedAt ? { executedAt: parsed.executedAt } : {}),
      ...(parsed.outputRoot ? { outputRoot: parsed.outputRoot } : {}),
      ...(parsed.preparationFingerprint
        ? { preparationFingerprint: parsed.preparationFingerprint }
        : {}),
      ...(parsed.evidenceProjectionKey
        ? { evidenceProjectionKey: parsed.evidenceProjectionKey }
        : {}),
    };
    return {
      ...evidence,
      sharedVisualRevisionIds: extractMicro034SharedVisualRevisionIds(evidence),
    };
  } catch {
    return null;
  }
}

export function loadMicro034CanaryExecutionEvidence(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro034CanaryExecutionEvidence | null {
  if (input.repository) {
    const fromProjection = loadMicro034CanaryExecutionEvidenceFromProjection(
      input.repository
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadMicro034CanaryExecutionEvidenceFromJson(input.jsonFilePath);
  }
  return null;
}

export function computeMicro034EvidenceContentHash(
  evidence: Micro034CanaryExecutionEvidence
): string {
  return JSON.stringify({
    scope: "micro-035.micro-034-evidence.v1",
    status: evidence.status,
    sharedVisualRevisionIds: extractMicro034SharedVisualRevisionIds(evidence),
    episodes: evidence.episodes.map((episode) => ({
      episodeId: episode.episodeId,
      visualRenderHash: episode.visualRenderHash,
      scriptRevisionId: episode.scriptRevisionId,
    })),
  });
}

export function resolveMicro034SharedVisualPaths(input: {
  readonly evidence: Micro034CanaryExecutionEvidence;
  readonly micro034OutputRoot?: string;
}): Micro034SharedVisualPathsByEpisode {
  const outputRoot =
    input.micro034OutputRoot ??
    input.evidence.outputRoot ??
    path.resolve(
      import.meta.dirname,
      "../../../.artifacts/microdrama/micro-034-canary"
    );
  return extractSharedVisualPathsFromMicro034Artifacts({ outputRoot });
}
