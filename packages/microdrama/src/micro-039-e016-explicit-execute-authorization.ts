import { createHash } from "node:crypto";

import { computePayloadHash } from "@mediaforge/narrative-core";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

import { MICRO_039_E016_TASK_ID } from "./micro-039-e016-batch-bindings.js";
import { loadMicro039E016OperatorAuthorization } from "./micro-039-e016-batch-authorization-persistence.js";

export const MICRO_039_E016_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY =
  "microdrama.explicit-execute-authorization.MICRO-039-E016";

export const MICRO_039_E016_EXPLICIT_EXECUTE_AUTHORIZATION_ID =
  "execute-auth.micro-039-e016.progressive-e016-batch";

export type Micro039E016ExplicitExecuteAuthorizationRecord = {
  readonly schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1";
  readonly authorizationId: typeof MICRO_039_E016_EXPLICIT_EXECUTE_AUTHORIZATION_ID;
  readonly taskId: typeof MICRO_039_E016_TASK_ID;
  readonly state: "active";
  readonly preparationFingerprint: string;
  readonly binds: {
    readonly episodeRange: { readonly startEpisodeId: string; readonly endEpisodeId: string };
    readonly locales: readonly string[];
    readonly costLimitMinor: number;
    readonly scheduleMode: "manual" | "scheduled";
    readonly revisionSet: readonly string[];
  };
  readonly authorizedAt: string;
  readonly operatorId: string;
};

export function computeMicro039E016PreparationFingerprint(input: {
  readonly operatorAuthorizationId: string | null;
  readonly micro036EvidenceContentHash: string | null;
  readonly micro038EvidenceContentHash: string | null;
  readonly micro039E015EvidenceContentHash: string | null;
  readonly micro042EvidenceContentHash: string | null;
  readonly learningAdmissionId: string | null;
  readonly bindingProbe: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-039-e016.preparation-fingerprint.v1",
        ...input,
      }),
      "utf8"
    )
    .digest("hex");
}

export function persistMicro039E016ExplicitExecuteAuthorization(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly record: Micro039E016ExplicitExecuteAuthorizationRecord;
}): void {
  input.repository.replaceProjection({
    projectionKey: MICRO_039_E016_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY,
    projection: input.record,
    contentHash: computePayloadHash(input.record),
    updatedAt: input.record.authorizedAt,
  });
}

export function loadMicro039E016ExplicitExecuteAuthorization(
  repository: MicrodramaSQLiteRepository
): Micro039E016ExplicitExecuteAuthorizationRecord | null {
  const stored = repository.getProjection(
    MICRO_039_E016_EXPLICIT_EXECUTE_AUTHORIZATION_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  return stored.projection as Micro039E016ExplicitExecuteAuthorizationRecord;
}

export function buildMicro039E016ExplicitExecuteAuthorizationRecord(input: {
  readonly preparationFingerprint: string;
  readonly binds: Micro039E016ExplicitExecuteAuthorizationRecord["binds"];
  readonly authorizedAt: string;
  readonly operatorId: string;
}): Micro039E016ExplicitExecuteAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-explicit-execute-authorization.v1",
    authorizationId: MICRO_039_E016_EXPLICIT_EXECUTE_AUTHORIZATION_ID,
    taskId: MICRO_039_E016_TASK_ID,
    state: "active",
    preparationFingerprint: input.preparationFingerprint,
    binds: input.binds,
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

export function summarizeMicro039E016PreparationForFingerprint(
  repository: MicrodramaSQLiteRepository,
  input: {
    readonly micro036EvidenceContentHash: string | null;
    readonly micro038EvidenceContentHash: string | null;
    readonly micro039E015EvidenceContentHash: string | null;
    readonly micro042EvidenceContentHash: string | null;
    readonly learningAdmissionId: string | null;
    readonly bindingProbe: Record<string, unknown>;
  }
) {
  const operatorAuthorization = loadMicro039E016OperatorAuthorization(repository);
  return {
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    micro036EvidenceContentHash: input.micro036EvidenceContentHash,
    micro038EvidenceContentHash: input.micro038EvidenceContentHash,
    micro039E015EvidenceContentHash: input.micro039E015EvidenceContentHash,
    micro042EvidenceContentHash: input.micro042EvidenceContentHash,
    learningAdmissionId: input.learningAdmissionId,
    bindingProbe: input.bindingProbe,
  };
}
