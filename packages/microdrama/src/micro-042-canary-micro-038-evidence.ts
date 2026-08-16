import { readFileSync } from "node:fs";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_038_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY } from "./micro-038-tiktok-public-publication-canary-execute.js";
import {
  MICRO_042_CANARY_PROVIDER_VIDEO_ID,
  MICRO_042_CANARY_PUBLICATION_ID,
} from "./micro-042-canary-bindings.js";

export const DEFAULT_MICRO_038_EXECUTION_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-038-canary-execution-evidence.json";

export type Micro038PublicCanaryExecutionEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly taskId?: string;
  readonly publicationCalls?: number;
  readonly publishId?: string | null;
  readonly receiptPublicVideoId?: string | null;
  readonly intentId?: string;
  readonly visualRenderHash?: string;
  readonly bindingProbe?: {
    readonly episodeRevisionId?: string;
    readonly locale?: string;
    readonly renderHash?: string;
    readonly metadataRevision?: string;
    readonly providerAccountId?: string;
  };
  readonly evidenceProjectionKey?: string;
  readonly executedAt?: string;
};

export function loadMicro038PublicCanaryExecutionEvidenceFromProjection(
  repository: MicrodramaSQLiteRepository
): Micro038PublicCanaryExecutionEvidence | null {
  const stored = repository.getProjection(
    MICRO_038_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro038PublicCanaryExecutionEvidence & {
    blockers?: readonly string[];
  };
  const status =
    projection.status ??
    ((projection.blockers?.length ?? 0) === 0 && projection.publicationCalls === 1
      ? "DONE"
      : "BLOCKED");
  return {
    ...projection,
    status,
    evidenceProjectionKey: MICRO_038_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

export function loadMicro038PublicCanaryExecutionEvidenceFromJson(
  jsonFilePath: string
): Micro038PublicCanaryExecutionEvidence | null {
  try {
    const parsed = JSON.parse(
      readFileSync(jsonFilePath, "utf8")
    ) as Micro038PublicCanaryExecutionEvidence;
    if (!parsed.status) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadMicro038PublicCanaryExecutionEvidence(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro038PublicCanaryExecutionEvidence | null {
  if (input.repository) {
    const fromProjection = loadMicro038PublicCanaryExecutionEvidenceFromProjection(
      input.repository
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadMicro038PublicCanaryExecutionEvidenceFromJson(input.jsonFilePath);
  }
  return null;
}

export function micro038EvidenceProvesPublicCanaryDone(
  evidence: Micro038PublicCanaryExecutionEvidence | null
): boolean {
  return (
    evidence?.status === "DONE" &&
    (evidence.publicationCalls ?? 0) === 1 &&
    Boolean(evidence.publishId) &&
    evidence.receiptPublicVideoId === MICRO_042_CANARY_PROVIDER_VIDEO_ID
  );
}

export function resolveMicro042PublicationIdFromEvidence(
  evidence: Micro038PublicCanaryExecutionEvidence | null
): string {
  return evidence?.intentId ?? MICRO_042_CANARY_PUBLICATION_ID;
}

export function computeMicro038EvidenceContentHashForMicro042(
  evidence: Micro038PublicCanaryExecutionEvidence | null
): string | null {
  if (!evidence || evidence.status !== "DONE") {
    return null;
  }
  return computePayloadHash({
    scope: "micro-042.micro-038-evidence.v1",
    publishId: evidence.publishId,
    receiptPublicVideoId: evidence.receiptPublicVideoId,
    publicationCalls: evidence.publicationCalls,
  });
}
