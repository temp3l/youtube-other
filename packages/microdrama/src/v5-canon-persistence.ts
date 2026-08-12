import fs from "node:fs";
import path from "node:path";

import {
  computePayloadHash,
  narrativeRevisionIdSchema,
  type NarrativeRevisionEnvelope,
  type NarrativeRevisionId,
} from "@mediaforge/narrative-core";

import type { V5CanonAdmissionBundle } from "./v5-canon-admission-contracts.js";
import {
  buildCanonAdmissionProjection,
  buildSeriesBibleRevisionEnvelope,
} from "./v5-canon-admission.js";
import { readSeriesStateForAdmission } from "./v5-canon-admission-io.js";

const CANON_PROJECTION_KEY = "canon.import.v5-remediated";

export type V5CanonAdmissionRepository = {
  appendNarrativeRevision(input: {
    envelope: NarrativeRevisionEnvelope;
  }): NarrativeRevisionEnvelope;
  registerArtifactReference(input: {
    artifactHash: string;
    mimeType: string;
    byteSize: number;
    storageUri: string;
    provenance: unknown;
    recordedAt: string;
  }): unknown;
  replaceProjection(input: {
    projectionKey: string;
    projection: unknown;
    contentHash: string;
    updatedAt: string;
  }): unknown;
  getProjection(projectionKey: string): { projection: unknown } | null;
  getNarrativeRevision(
    revisionId: NarrativeRevisionId
  ): NarrativeRevisionEnvelope | null;
  getArtifactReference(artifactHash: string): unknown;
};

export function persistV5CanonAdmission(
  repository: V5CanonAdmissionRepository,
  bundle: V5CanonAdmissionBundle
): void {
  const seriesState = readSeriesStateForAdmission(bundle.seriesImport.sourceRoot);
  const seriesBibleEnvelope = buildSeriesBibleRevisionEnvelope(bundle, seriesState);
  repository.appendNarrativeRevision({ envelope: seriesBibleEnvelope });

  for (const script of bundle.admittedScripts) {
    const absolutePath = path.join(
      bundle.seriesImport.sourceRoot,
      script.scriptRelativePath
    );
    const stat = fs.statSync(absolutePath);
    repository.registerArtifactReference({
      artifactHash: script.contentHash,
      mimeType: "text/markdown",
      byteSize: stat.size,
      storageUri: absolutePath,
      provenance: script.provenance,
      recordedAt: bundle.admittedAt,
    });
  }

  const projection = buildCanonAdmissionProjection(bundle);
  repository.replaceProjection({
    projectionKey: CANON_PROJECTION_KEY,
    projection,
    contentHash: computePayloadHash(projection),
    updatedAt: bundle.admittedAt,
  });
}

export function replayV5CanonAdmission(
  repository: V5CanonAdmissionRepository
): import("./v5-canon-admission-contracts.js").V5CanonAdmissionProjection | null {
  const projection = repository.getProjection(CANON_PROJECTION_KEY);
  if (!projection) {
    return null;
  }
  return projection.projection as import("./v5-canon-admission-contracts.js").V5CanonAdmissionProjection;
}

export function verifyReplayedCanonAdmission(
  repository: V5CanonAdmissionRepository,
  bundle: V5CanonAdmissionBundle
): boolean {
  const projection = replayV5CanonAdmission(repository);
  if (!projection) {
    return false;
  }
  const bible = repository.getNarrativeRevision(
    narrativeRevisionIdSchema.parse(bundle.seriesBibleRevisionId)
  );
  if (!bible || bible.status !== "ACCEPTED") {
    return false;
  }
  if (projection.importId !== bundle.importId) {
    return false;
  }
  if (projection.episodeIdentities.length !== 100) {
    return false;
  }
  for (const identity of projection.episodeIdentities) {
    for (const hash of identity.contentHashes) {
      const artifact = repository.getArtifactReference(hash);
      if (!artifact) {
        return false;
      }
    }
  }
  return true;
}
