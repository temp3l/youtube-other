import crypto from "node:crypto";

import { normalizeApiPermissions } from "@mediaforge/application";
import { loadRuntimeConfig } from "@mediaforge/config";
import {
  PostgresPrincipalDirectory,
  type PostgresPool,
  type PrincipalDirectoryRecord,
} from "@mediaforge/persistence";
import { Pool } from "pg";
import { z } from "zod";

const opaqueId = z.string().min(3).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const environmentSchema = z.object({
  MEDIAFORGE_PRINCIPAL_WORKSPACE_ID: opaqueId,
  MEDIAFORGE_PRINCIPAL_OIDC_SUBJECT: z.string().min(1).max(512),
  MEDIAFORGE_PRINCIPAL_ID: opaqueId,
  MEDIAFORGE_PRINCIPAL_KIND: z.enum(["user", "service", "worker"]),
  MEDIAFORGE_PRINCIPAL_PERMISSIONS: z.string().min(1),
  MEDIAFORGE_PRINCIPAL_EXPECTED_REVISION: z.coerce.number().int().nonnegative().optional(),
  MEDIAFORGE_PRINCIPAL_ACTOR_SUBJECT: z.string().min(1).max(512),
});

export interface PrincipalProvisionEnvironment {
  readonly workspaceId: string;
  readonly oidcSubject: string;
  readonly principalId: string;
  readonly kind: "user" | "service" | "worker";
  readonly permissions: readonly string[];
  readonly expectedRevision: number | null;
  readonly actorSubject: string;
}

export function parsePrincipalProvisionEnvironment(
  environment: NodeJS.ProcessEnv
): PrincipalProvisionEnvironment {
  const parsed = environmentSchema.parse(environment);
  const permissions = normalizeApiPermissions(
    parsed.MEDIAFORGE_PRINCIPAL_PERMISSIONS.split(",")
  );
  return {
    workspaceId: parsed.MEDIAFORGE_PRINCIPAL_WORKSPACE_ID,
    oidcSubject: parsed.MEDIAFORGE_PRINCIPAL_OIDC_SUBJECT,
    principalId: parsed.MEDIAFORGE_PRINCIPAL_ID,
    kind: parsed.MEDIAFORGE_PRINCIPAL_KIND,
    permissions,
    expectedRevision: parsed.MEDIAFORGE_PRINCIPAL_EXPECTED_REVISION ?? null,
    actorSubject: parsed.MEDIAFORGE_PRINCIPAL_ACTOR_SUBJECT,
  };
}

export async function provisionPrincipal(input: {
  readonly pool: PostgresPool;
  readonly environment: PrincipalProvisionEnvironment;
  readonly now?: () => Date;
  readonly createAuditId?: () => string;
}): Promise<PrincipalDirectoryRecord> {
  const directory = new PostgresPrincipalDirectory(input.pool);
  await directory.migrate();
  return directory.provision({
    workspaceId: input.environment.workspaceId,
    oidcSubject: input.environment.oidcSubject,
    principalId: input.environment.principalId,
    kind: input.environment.kind,
    permissions: input.environment.permissions,
    expectedRevision: input.environment.expectedRevision,
    actorSubject: input.environment.actorSubject,
    auditId: input.createAuditId?.() ?? `principal-audit-${crypto.randomUUID()}`,
    now: (input.now ?? (() => new Date()))().toISOString(),
  });
}

export async function provisionPrincipalFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): Promise<PrincipalDirectoryRecord> {
  const config = await loadRuntimeConfig();
  if (!config.workflowDatabaseUrl)
    throw new Error("MEDIAFORGE_WORKFLOW_DATABASE_URL is required to provision an API principal.");
  const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
  try {
    return await provisionPrincipal({
      pool,
      environment: parsePrincipalProvisionEnvironment(environment),
    });
  } finally {
    await pool.end();
  }
}
