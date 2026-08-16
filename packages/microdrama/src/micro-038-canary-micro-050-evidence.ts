import { readFileSync } from "node:fs";

import {
  MICRO_050_CANARY_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_WORKSPACE_ID,
  MICRO_050_OAUTH_FIXTURE,
  MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
} from "./micro-050-canary-bindings.js";
import {
  MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  type Micro050TikTokOAuthCanaryExecuteResult,
} from "./micro-050-tiktok-oauth-canary-execute.js";

export const DEFAULT_MICRO_050_EXECUTION_EVIDENCE_JSON_PATH =
  "docs/reports/codex-runs/2026-08-12-micro-050-oauth-canary-execution-evidence.json";

export type Micro050CanaryExecutionEvidence = {
  readonly status: "DONE" | "BLOCKED";
  readonly taskId: string;
  readonly executedAt?: string;
  readonly providerAccountId?: string;
  readonly accountId?: string;
  readonly workspaceId?: string;
  readonly credentialVersionId?: string;
  readonly refreshedCredentialVersionId?: string;
  readonly creatorCapabilityEvidenceRevision?: string;
  readonly grantedScopes?: readonly string[];
  readonly publicationCalls?: number;
  readonly externalCalls?: number | { readonly total?: number; readonly publication?: number };
  readonly evidenceProjectionKey?: string;
  readonly preparationFingerprint?: string;
};

export function loadMicro050CanaryExecutionEvidenceFromProjection(
  repository: {
    getProjection(projectionKey: string): { projection: unknown } | null;
  }
): Micro050CanaryExecutionEvidence | null {
  const stored = repository.getProjection(
    MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY
  );
  if (!stored) {
    return null;
  }
  const projection = stored.projection as Micro050CanaryExecutionEvidence & {
    blockers?: readonly string[];
  };
  const status =
    projection.status ??
    ((projection as Micro050TikTokOAuthCanaryExecuteResult).status ?? "BLOCKED");
  return {
    ...projection,
    status,
    evidenceProjectionKey: MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}

export function loadMicro050CanaryExecutionEvidenceFromJson(
  jsonFilePath: string
): Micro050CanaryExecutionEvidence | null {
  try {
    const parsed = JSON.parse(readFileSync(jsonFilePath, "utf8")) as Micro050CanaryExecutionEvidence;
    if (!parsed.status) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadMicro050CanaryExecutionEvidence(input: {
  readonly repository?: {
    getProjection(projectionKey: string): { projection: unknown } | null;
  };
  readonly jsonFilePath?: string;
}): Micro050CanaryExecutionEvidence | null {
  if (input.repository) {
    const fromProjection = loadMicro050CanaryExecutionEvidenceFromProjection(
      input.repository
    );
    if (fromProjection) {
      return fromProjection;
    }
  }
  if (input.jsonFilePath) {
    return loadMicro050CanaryExecutionEvidenceFromJson(input.jsonFilePath);
  }
  return null;
}

export function micro050EvidenceProvesActiveAccount(
  evidence: Micro050CanaryExecutionEvidence | null
): boolean {
  return (
    evidence?.status === "DONE" &&
    evidence.providerAccountId === MICRO_050_CANARY_PROVIDER_ACCOUNT_ID &&
    evidence.refreshedCredentialVersionId === MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID &&
    Boolean(evidence.creatorCapabilityEvidenceRevision)
  );
}

export function defaultMicro050PublicationTargetFromEvidence(
  evidence: Micro050CanaryExecutionEvidence,
  registeredAt: string
) {
  return {
    schemaVersion: "mediaforge.microdrama-publication.v1" as const,
    profileId: "profile.micro-038.public-canary",
    seriesId: "seven-minutes-ahead",
    locale: "en-US",
    provider: "tiktok" as const,
    providerAccountId:
      evidence.providerAccountId ?? MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    credentialVersion:
      evidence.refreshedCredentialVersionId ?? MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
    metadataProfileId: "meta.profile.en-us",
    scheduleProfileId: "schedule.profile.en-us",
    enabled: true,
    registeredAt,
  };
}

export const MICRO_050_EVIDENCE_ACCOUNT_BINDINGS = {
  workspaceId: MICRO_050_CANARY_WORKSPACE_ID,
  accountId: MICRO_050_CANARY_ACCOUNT_ID,
  providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  oauthFixtureAccountId: MICRO_050_OAUTH_FIXTURE.accountId,
} as const;
