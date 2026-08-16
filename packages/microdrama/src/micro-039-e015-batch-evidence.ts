import { readFileSync } from "node:fs";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY } from "./micro-036-bounded-batch-execute.js";
import { MICRO_038_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY } from "./micro-038-tiktok-public-publication-canary-execute.js";
import { MICRO_039_E014_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY } from "./micro-039-e014-bounded-progressive-batch-execute.js";
import { MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY } from "./micro-042-tiktok-public-video-read-canary-execute.js";

export const DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-036-batch-execution-evidence.json";
export const DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-038-canary-execution-evidence.json";
export const DEFAULT_MICRO_039_E014_BATCH_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-039-e014-batch-execution-evidence.json";
export const DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-042-canary-execution-evidence.json";

export type Micro039E015UpstreamEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly taskId?: string;
  readonly publicationCalls?: number;
  readonly externalCalls?: number;
  readonly observationId?: string | null;
  readonly providerVideoId?: string | null;
  readonly episodes?: readonly unknown[];
  readonly episodeRange?: {
    readonly startEpisodeId?: string;
    readonly endEpisodeId?: string;
  };
};

function loadJsonEvidence(path: string): Micro039E015UpstreamEvidence | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Micro039E015UpstreamEvidence;
    return parsed.status ? parsed : null;
  } catch {
    return null;
  }
}

function loadProjectionEvidence(
  repository: MicrodramaSQLiteRepository,
  key: string
): Micro039E015UpstreamEvidence | null {
  const stored = repository.getProjection(key);
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro039E015UpstreamEvidence & {
    blockers?: readonly string[];
  };
  const status =
    projection.status ??
    ((projection.blockers?.length ?? 0) === 0 ? "DONE" : "BLOCKED");
  return { ...projection, status };
}

export function loadMicro036BatchEvidenceForMicro039E015(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro039E015UpstreamEvidence | null {
  if (input.repository) {
    const fromProjection = loadProjectionEvidence(
      input.repository,
      MICRO_036_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadJsonEvidence(input.jsonFilePath);
  }
  return null;
}

export function loadMicro038PublicEvidenceForMicro039E015(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro039E015UpstreamEvidence | null {
  if (input.repository) {
    const fromProjection = loadProjectionEvidence(
      input.repository,
      MICRO_038_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadJsonEvidence(input.jsonFilePath);
  }
  return null;
}

export function loadMicro039E014BatchEvidenceForMicro039E015(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro039E015UpstreamEvidence | null {
  if (input.repository) {
    const fromProjection = loadProjectionEvidence(
      input.repository,
      MICRO_039_E014_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadJsonEvidence(input.jsonFilePath);
  }
  return null;
}

export function loadMicro042ReadEvidenceForMicro039E015(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro039E015UpstreamEvidence | null {
  if (input.repository) {
    const fromProjection = loadProjectionEvidence(
      input.repository,
      MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadJsonEvidence(input.jsonFilePath);
  }
  return null;
}

export function micro036EvidenceProvesBatchDone(
  evidence: Micro039E015UpstreamEvidence | null
): boolean {
  return evidence?.status === "DONE";
}

export function micro038EvidenceProvesPublicDone(
  evidence: Micro039E015UpstreamEvidence | null
): boolean {
  const receipt =
    (evidence as { receiptPublicVideoId?: string | null } | null)
      ?.receiptPublicVideoId ?? evidence?.providerVideoId;
  return (
    evidence?.status === "DONE" &&
    (evidence.publicationCalls ?? 0) === 1 &&
    Boolean(receipt)
  );
}

export function micro039E014EvidenceProvesProgressiveDone(
  evidence: Micro039E015UpstreamEvidence | null
): boolean {
  if (evidence?.status !== "DONE") {
    return false;
  }
  const episodes = evidence.episodes ?? [];
  const hasE014 = episodes.some((entry) => {
    const episodeId =
      typeof entry === "object" &&
      entry !== null &&
      "episodeId" in entry &&
      typeof (entry as { episodeId?: unknown }).episodeId === "string"
        ? (entry as { episodeId: string }).episodeId.toUpperCase()
        : null;
    return episodeId === "E014";
  });
  const rangeIsE014 =
    evidence.episodeRange?.startEpisodeId?.toLowerCase() === "e014" &&
    evidence.episodeRange?.endEpisodeId?.toLowerCase() === "e014";
  return hasE014 || rangeIsE014 || (evidence.publicationCalls ?? 0) === 1;
}

export function micro042EvidenceProvesReadDone(
  evidence: Micro039E015UpstreamEvidence | null
): boolean {
  return (
    evidence?.status === "DONE" &&
    (evidence.publicationCalls ?? 0) === 0 &&
    (evidence.externalCalls ?? 0) >= 1
  );
}

export function seedUpstreamEvidenceProjection(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly projectionKey: string;
  readonly jsonFilePath: string;
  readonly updatedAt: string;
}): boolean {
  const evidence = loadJsonEvidence(input.jsonFilePath);
  if (!evidence || evidence.status !== "DONE") {
    return false;
  }
  input.repository.replaceProjection({
    projectionKey: input.projectionKey,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.updatedAt,
  });
  return true;
}

export function computeUpstreamEvidenceContentHash(
  scope: string,
  evidence: Micro039E015UpstreamEvidence | null
): string | null {
  if (!evidence || evidence.status !== "DONE") {
    return null;
  }
  return computePayloadHash({
    scope,
    status: evidence.status,
    publicationCalls: evidence.publicationCalls ?? 0,
    externalCalls: evidence.externalCalls ?? 0,
    observationId: evidence.observationId ?? null,
  });
}
