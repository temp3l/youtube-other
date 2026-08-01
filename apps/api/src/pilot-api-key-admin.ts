import crypto from "node:crypto";

import {
  PilotApiKeyService,
  normalizeApiPermissions,
} from "@mediaforge/application";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  PostgresPilotApiKeyRepository,
  PostgresPrincipalDirectory,
  type PersistedPilotApiKeyRecord,
  type PostgresPool,
} from "@mediaforge/persistence";
import { Pool } from "pg";
import { z } from "zod";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const revision = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,15})$/u)
  .transform(Number)
  .refine(Number.isSafeInteger);
const expiresAt = z.string().max(64).datetime({ offset: true });
const commonSchema = z.object({
  MEDIAFORGE_API_KEY_ACTION: z.enum(["issue", "rotate", "revoke"]),
  MEDIAFORGE_API_KEY_WORKSPACE_ID: opaqueId,
  MEDIAFORGE_API_KEY_ACTOR_SUBJECT: z.string().min(1).max(512),
});

export type PilotApiKeyAdminEnvironment =
  | {
      readonly action: "issue";
      readonly workspaceId: string;
      readonly principalId: string;
      readonly permissions: readonly string[];
      readonly expiresAt: string;
      readonly actorSubject: string;
    }
  | {
      readonly action: "rotate";
      readonly workspaceId: string;
      readonly principalId: string;
      readonly permissions: readonly string[];
      readonly expiresAt: string;
      readonly actorSubject: string;
      readonly previousKeyId: string;
      readonly previousExpectedRevision: number;
    }
  | {
      readonly action: "revoke";
      readonly workspaceId: string;
      readonly actorSubject: string;
      readonly keyId: string;
      readonly expectedRevision: number;
      readonly reason: string;
    };

function permissions(value: string | undefined): readonly string[] {
  if (!value || value.length > 16_100)
    throw new Error("MEDIAFORGE_API_KEY_PERMISSIONS is required and bounded.");
  try {
    return normalizeApiPermissions(value.split(","), "pilot-api-key");
  } catch {
    throw new Error("MEDIAFORGE_API_KEY_PERMISSIONS is invalid.");
  }
}

export function parsePilotApiKeyAdminEnvironment(
  environment: NodeJS.ProcessEnv
): PilotApiKeyAdminEnvironment {
  const common = commonSchema.parse(environment);
  if (common.MEDIAFORGE_API_KEY_ACTION === "revoke") {
    return {
      action: "revoke",
      workspaceId: common.MEDIAFORGE_API_KEY_WORKSPACE_ID,
      actorSubject: common.MEDIAFORGE_API_KEY_ACTOR_SUBJECT,
      keyId: opaqueId.parse(environment["MEDIAFORGE_API_KEY_ID"]),
      expectedRevision: revision.parse(
        environment["MEDIAFORGE_API_KEY_EXPECTED_REVISION"]
      ),
      reason: z.string().min(1).max(2_000).parse(
        environment["MEDIAFORGE_API_KEY_REVOCATION_REASON"]
      ),
    };
  }
  const issue = {
    workspaceId: common.MEDIAFORGE_API_KEY_WORKSPACE_ID,
    actorSubject: common.MEDIAFORGE_API_KEY_ACTOR_SUBJECT,
    principalId: opaqueId.parse(environment["MEDIAFORGE_API_KEY_PRINCIPAL_ID"]),
    permissions: permissions(environment["MEDIAFORGE_API_KEY_PERMISSIONS"]),
    expiresAt: expiresAt.parse(
      environment["MEDIAFORGE_API_KEY_EXPIRES_AT"]
    ),
  };
  return common.MEDIAFORGE_API_KEY_ACTION === "issue"
    ? { action: "issue", ...issue }
    : {
        action: "rotate",
        ...issue,
        previousKeyId: opaqueId.parse(
          environment["MEDIAFORGE_API_KEY_PREVIOUS_ID"]
        ),
        previousExpectedRevision: revision.parse(
          environment["MEDIAFORGE_API_KEY_EXPECTED_REVISION"]
        ),
      };
}

export type PilotApiKeyAdminResult =
  | { readonly action: "issued" | "rotated"; readonly token: string; readonly key: PersistedPilotApiKeyRecord }
  | { readonly action: "revoked"; readonly key: PersistedPilotApiKeyRecord };

export function pilotApiKeyAdminOutput(result: PilotApiKeyAdminResult): Readonly<{
  action: PilotApiKeyAdminResult["action"];
  token?: string;
  workspaceId: string;
  keyId: string;
  principalId: string;
  permissions: readonly string[];
  expiresAt: string;
  revision: number;
}> {
  return {
    action: result.action,
    ...(result.action === "revoked" ? {} : { token: result.token }),
    workspaceId: result.key.workspaceId,
    keyId: result.key.keyId,
    principalId: result.key.principalId,
    permissions: result.key.permissions,
    expiresAt: result.key.expiresAt,
    revision: result.key.revision,
  };
}

export async function administerPilotApiKey(input: {
  readonly pool: PostgresPool;
  readonly environment: PilotApiKeyAdminEnvironment;
  readonly now?: () => Date;
  readonly createId?: (kind: "key" | "audit") => string;
}): Promise<PilotApiKeyAdminResult> {
  await new PostgresPrincipalDirectory(input.pool).migrate();
  const repository = new PostgresPilotApiKeyRepository(input.pool);
  await repository.migrate();
  const now = input.now ?? (() => new Date());
  const service = new PilotApiKeyService(repository, {
    now,
    createId:
      input.createId ??
      ((kind) => `${kind === "key" ? "key" : "api-key-audit"}-${crypto.randomUUID()}`),
  });
  if (input.environment.action === "revoke") {
    const key = await service.revoke({
      workspaceId: input.environment.workspaceId,
      keyId: input.environment.keyId,
      expectedRevision: input.environment.expectedRevision,
      actorSubject: input.environment.actorSubject,
      reason: input.environment.reason,
      auditId: (input.createId ?? ((kind) => `${kind}-${crypto.randomUUID()}`))(
        "audit"
      ),
      now: now().toISOString(),
    });
    return { action: "revoked", key };
  }
  const result =
    input.environment.action === "issue"
      ? await service.issue(input.environment)
      : await service.rotate({
          workspaceId: input.environment.workspaceId,
          previousKeyId: input.environment.previousKeyId,
          previousExpectedRevision:
            input.environment.previousExpectedRevision,
          principalId: input.environment.principalId,
          permissions: input.environment.permissions,
          expiresAt: input.environment.expiresAt,
          actorSubject: input.environment.actorSubject,
        });
  return {
    action: input.environment.action === "issue" ? "issued" : "rotated",
    token: result.token,
    key: result.key,
  };
}

export async function administerPilotApiKeyFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): Promise<PilotApiKeyAdminResult> {
  const config = await loadRuntimeConfig();
  if (!config.workflowDatabaseUrl)
    throw new Error(
      "MEDIAFORGE_WORKFLOW_DATABASE_URL is required to administer API keys."
    );
  const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
  try {
    return await administerPilotApiKey({
      pool,
      environment: parsePilotApiKeyAdminEnvironment(environment),
    });
  } finally {
    await pool.end();
  }
}
