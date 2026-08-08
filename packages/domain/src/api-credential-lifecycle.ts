import {
  computeRequestFingerprint,
  computeScopedIdempotencyKey,
  evaluateIdempotencyReplay,
} from "./command-security.js";
import {
  API_CREDENTIAL_SCHEMA_VERSION,
  type ApiCredentialIssueResult,
  type ApiCredentialRecord,
  apiCredentialIssueResultSchema,
  apiCredentialRecordSchema,
  deriveApiCredentialStatus,
  type DeveloperJourneyExamples,
  developerJourneyExamplesSchema,
} from "./api-credential-contracts.js";
import {
  COMMAND_SECURITY_SCHEMA_VERSION,
  requestFingerprintSchema,
  type IdempotencyRecord,
  type IdempotencyScope,
} from "./command-security-contracts.js";

export type ApiCredentialIssueIdempotencyRecord = {
  readonly requestFingerprint: string;
  readonly keyId: string;
  readonly createdAt: string;
};

export function projectApiCredentialRecord(input: {
  readonly workspaceId: string;
  readonly keyId: string;
  readonly name: string;
  readonly principalId: string;
  readonly permissions: readonly string[];
  readonly expiresAt: string;
  readonly overlapUntil?: string | null;
  readonly lastUsedAt?: string | null;
  readonly rotatedFromKeyId?: string | null;
  readonly revokedAt: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evaluatedAt: string;
}): ApiCredentialRecord {
  return apiCredentialRecordSchema.parse({
    schemaVersion: API_CREDENTIAL_SCHEMA_VERSION,
    workspaceId: input.workspaceId,
    keyId: input.keyId,
    name: input.name,
    principalId: input.principalId,
    permissions: [...input.permissions],
    status: deriveApiCredentialStatus({
      revokedAt: input.revokedAt,
      expiresAt: input.expiresAt,
      overlapUntil: input.overlapUntil ?? null,
      evaluatedAt: input.evaluatedAt,
    }),
    expiresAt: input.expiresAt,
    ...(input.overlapUntil ? { overlapUntil: input.overlapUntil } : {}),
    ...(input.lastUsedAt ? { lastUsedAt: input.lastUsedAt } : {}),
    ...(input.rotatedFromKeyId ? { rotatedFromKeyId: input.rotatedFromKeyId } : {}),
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

export function evaluateApiCredentialIssueReplay(input: {
  readonly scope: {
    readonly workspaceId: string;
    readonly principalId: string;
    readonly idempotencyKey: string;
  };
  readonly requestBody: unknown;
  readonly existing?: ApiCredentialIssueIdempotencyRecord | null;
}): {
  readonly replay: ReturnType<typeof evaluateIdempotencyReplay>;
  readonly requestFingerprint: string;
} {
  const requestFingerprint = computeRequestFingerprint(input.requestBody);
  const scope: IdempotencyScope = {
    schemaVersion: COMMAND_SECURITY_SCHEMA_VERSION,
    workspaceId: input.scope.workspaceId,
    principalId: input.scope.principalId,
    method: "POST",
    normalizedRoute: "/v1/workspaces/{workspace}/api-credentials",
    clientKey: input.scope.idempotencyKey,
  };
  const mappedExisting: IdempotencyRecord | null = input.existing
    ? {
        scopedKey: computeScopedIdempotencyKey(scope),
        fingerprint: requestFingerprintSchema.parse(
          input.existing.requestFingerprint
        ),
        commandId: input.existing.keyId,
        response: {},
        createdAt: input.existing.createdAt,
      }
    : null;
  const replay = evaluateIdempotencyReplay({
    scope,
    fingerprint: requestFingerprint,
    existing: mappedExisting,
  });
  return { replay, requestFingerprint };
}

export function buildApiCredentialIssueResult(input: {
  readonly credential: ApiCredentialRecord;
  readonly token?: string;
  readonly replayed: boolean;
}): ApiCredentialIssueResult {
  return apiCredentialIssueResultSchema.parse({
    credential: input.credential,
    replayed: input.replayed,
    showOnce: !input.replayed,
    ...(input.token ? { token: input.token } : {}),
  });
}

export function buildDeveloperJourneyExamples(
  projectedAt: string
): DeveloperJourneyExamples {
  return developerJourneyExamplesSchema.parse({
    schemaVersion: API_CREDENTIAL_SCHEMA_VERSION,
    title: "External workflow journey",
    projectedAt,
    steps: [
      {
        operationId: "createProject",
        method: "POST",
        path: "/v1/workspaces/{workspace}/projects",
        requestSchema: "ProjectInput",
        responseSchema: "Project",
        requiredHeaders: [],
        note: "Create a tenant project bound to one profile.",
      },
      {
        operationId: "createEpisode",
        method: "POST",
        path: "/v1/workspaces/{workspace}/projects/{project}/episodes",
        requestSchema: "EpisodeInput",
        responseSchema: "EpisodeCreated",
        requiredHeaders: [],
      },
      {
        operationId: "admitWorkflow",
        method: "POST",
        path: "/v1/workspaces/{workspace}/projects/{project}/episodes/{episode}/workflow-runs",
        requestSchema: "WorkflowAdmission",
        responseSchema: "WorkflowAdmissionAccepted",
        requiredHeaders: ["IdempotencyKey"],
        note: "Retry-safe admission; identical keys replay, changed payloads conflict.",
      },
      {
        operationId: "getJob",
        method: "GET",
        path: "/v1/workspaces/{workspace}/projects/{project}/jobs/{job}",
        requestSchema: null,
        responseSchema: "Job",
        requiredHeaders: [],
        note: "Poll job status until terminal state.",
      },
    ],
  });
}

export function assertWorkspaceAdminCredentialAccess(
  permissions: readonly string[]
): void {
  if (!permissions.includes("workspace.admin")) {
    throw new Error("API credential administration requires workspace.admin.");
  }
}
