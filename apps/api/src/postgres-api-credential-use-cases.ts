import {
  ApplicationError,
  PilotApiKeyService,
  type AuthenticatedPrincipal,
} from "@mediaforge/application";
import {
  apiCredentialIssueInputSchema,
  apiCredentialRevokeInputSchema,
  assertWorkspaceAdminCredentialAccess,
  buildApiCredentialIssueResult,
  buildDeveloperJourneyExamples,
  evaluateApiCredentialIssueReplay,
  projectApiCredentialRecord,
  redactApiCredentialAuditPayload,
} from "@mediaforge/domain";
import {
  PostgresPilotApiKeyRepository,
  type PostgresPool,
  type PersistedPilotApiKeyRecord,
} from "@mediaforge/persistence";

import type { ApiRequestContext } from "./http-server.js";

function toRecord(
  record: PersistedPilotApiKeyRecord,
  evaluatedAt: string
) {
  return projectApiCredentialRecord({
    workspaceId: record.workspaceId,
    keyId: record.keyId,
    name: record.name,
    principalId: record.principalId,
    permissions: record.permissions,
    expiresAt: record.expiresAt,
    overlapUntil: record.overlapUntil,
    lastUsedAt: record.lastUsedAt,
    rotatedFromKeyId: record.rotatedFromKeyId,
    revokedAt: record.revokedAt,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    evaluatedAt,
  });
}

export function createApiCredentialUseCases(input: {
  readonly pool: PostgresPool;
  readonly now: () => Date;
  readonly createId: (prefix: string) => string;
}) {
  const repository = new PostgresPilotApiKeyRepository(input.pool);
  const service = new PilotApiKeyService(repository, {
    now: input.now,
    createId: (kind) =>
      input.createId(kind === "key" ? "api-key" : "api-key-audit"),
  });

  function assertAdmin(principal: AuthenticatedPrincipal): void {
    try {
      assertWorkspaceAdminCredentialAccess(principal.permissions);
    } catch {
      throw new ApplicationError(
        "authorization_denied",
        "API credential administration requires workspace.admin.",
        false
      );
    }
  }

  return {
    issueApiCredential: async (
      body: unknown,
      context: Required<
        Pick<
          ApiRequestContext,
          "workspaceId" | "principal" | "requestId" | "idempotencyKey"
        >
      >
    ) => {
      assertAdmin(context.principal);
      if (!context.idempotencyKey) {
        throw new ApplicationError(
          "precondition_required",
          "Idempotency-Key is required.",
          false
        );
      }
      const parsed = apiCredentialIssueInputSchema.parse(body);
      const evaluatedAt = input.now().toISOString();
      const existing = await repository.findIssueIdempotency({
        workspaceId: context.workspaceId,
        idempotencyKey: context.idempotencyKey,
      });
      const { replay, requestFingerprint } = evaluateApiCredentialIssueReplay({
        scope: {
          workspaceId: context.workspaceId,
          principalId: context.principal.principalId,
          idempotencyKey: context.idempotencyKey,
        },
        requestBody: parsed,
        existing: existing
          ? {
              requestFingerprint: existing.requestFingerprint,
              keyId: existing.keyId,
              createdAt: evaluatedAt,
            }
          : null,
      });
      if (replay.outcome === "conflict") {
        throw new ApplicationError(
          "conflict",
          "Idempotency key was reused with a different payload.",
          false
        );
      }
      if (replay.outcome === "replay" && existing) {
        const key = await repository.get({
          workspaceId: context.workspaceId,
          keyId: existing.keyId,
        });
        if (!key) {
          throw new ApplicationError("not_found", "Resource not found.", false);
        }
        return buildApiCredentialIssueResult({
          credential: toRecord(key, evaluatedAt),
          replayed: true,
        });
      }
      const issued = await service.issue({
        workspaceId: context.workspaceId,
        principalId: parsed.principalId,
        name: parsed.name,
        permissions: parsed.permissions,
        expiresAt: parsed.expiresAt,
        actorSubject: context.principal.principalId,
      });
      await repository.recordIssueIdempotency({
        workspaceId: context.workspaceId,
        idempotencyKey: context.idempotencyKey,
        keyId: issued.key.keyId,
        requestFingerprint,
        now: evaluatedAt,
      });
      return buildApiCredentialIssueResult({
        credential: toRecord(issued.key, evaluatedAt),
        token: issued.token,
        replayed: false,
      });
    },
    listApiCredentials: async (
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertAdmin(context.principal);
      const evaluatedAt = input.now().toISOString();
      const keys = await repository.list({ workspaceId: context.workspaceId });
      return {
        items: keys.map((key) => toRecord(key, evaluatedAt)),
      };
    },
    getApiCredential: async (
      keyId: string,
      context: Required<Pick<ApiRequestContext, "workspaceId" | "principal">>
    ) => {
      assertAdmin(context.principal);
      const key = await repository.get({
        workspaceId: context.workspaceId,
        keyId,
      });
      if (!key) {
        throw new ApplicationError("not_found", "Resource not found.", false);
      }
      return toRecord(key, input.now().toISOString());
    },
    revokeApiCredential: async (
      keyId: string,
      body: unknown,
      context: Required<
        Pick<ApiRequestContext, "workspaceId" | "principal" | "ifMatch">
      >
    ) => {
      assertAdmin(context.principal);
      const parsed = apiCredentialRevokeInputSchema.parse(body);
      const expectedRevision = Number(
        String(context.ifMatch).replace(/"/g, "")
      );
      const key = await service.revoke({
        workspaceId: context.workspaceId,
        keyId,
        expectedRevision,
        actorSubject: context.principal.principalId,
        reason: parsed.reason,
        auditId: input.createId("api-key-audit"),
        now: input.now().toISOString(),
      });
      return toRecord(key, input.now().toISOString());
    },
    getDeveloperJourneyExamples: async () =>
      buildDeveloperJourneyExamples(input.now().toISOString()),
    redactApiCredentialAuditPayload,
  };
}
