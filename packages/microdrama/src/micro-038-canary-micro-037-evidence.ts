import { readFileSync } from "node:fs";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY } from "./micro-037-tiktok-private-publication-canary-execute.js";

export const DEFAULT_MICRO_037_EXECUTION_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-037-canary-execution-evidence.json";

export type Micro037CanaryExecutionEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly taskId?: string;
  readonly publicationCalls?: number;
  readonly publishId?: string | null;
  readonly receiptPublicVideoId?: string | null;
  readonly evidenceProjectionKey?: string;
  readonly executedAt?: string;
};

export function loadMicro037CanaryExecutionEvidenceFromProjection(
  repository: MicrodramaSQLiteRepository
): Micro037CanaryExecutionEvidence | null {
  const stored = repository.getProjection(
    MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro037CanaryExecutionEvidence & {
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
    evidenceProjectionKey: MICRO_037_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

export function loadMicro037CanaryExecutionEvidenceFromJson(
  jsonFilePath: string
): Micro037CanaryExecutionEvidence | null {
  try {
    const parsed = JSON.parse(
      readFileSync(jsonFilePath, "utf8")
    ) as Micro037CanaryExecutionEvidence;
    if (!parsed.status) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadMicro037CanaryExecutionEvidence(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly jsonFilePath?: string;
}): Micro037CanaryExecutionEvidence | null {
  if (input.repository) {
    const fromProjection = loadMicro037CanaryExecutionEvidenceFromProjection(
      input.repository
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadMicro037CanaryExecutionEvidenceFromJson(input.jsonFilePath);
  }
  return null;
}

export function micro037EvidenceProvesPrivateCanaryDone(
  evidence: Micro037CanaryExecutionEvidence | null
): boolean {
  return (
    evidence?.status === "DONE" &&
    (evidence.publicationCalls ?? 0) === 1 &&
    Boolean(evidence.publishId) &&
    Boolean(evidence.receiptPublicVideoId)
  );
}

export function computeMicro037EvidenceContentHashForMicro038(
  evidence: Micro037CanaryExecutionEvidence | null
): string | null {
  if (!evidence || evidence.status !== "DONE") {
    return null;
  }
  return computePayloadHash({
    scope: "micro-038.micro-037-evidence.v1",
    publishId: evidence.publishId,
    receiptPublicVideoId: evidence.receiptPublicVideoId,
    publicationCalls: evidence.publicationCalls,
  });
}
