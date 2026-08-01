import { loadRuntimeConfig } from "@mediaforge/config";
import {
  PostgresWebhookRepository,
  PostgresWorkflowRepository,
  type PostgresPool,
  type WebhookEndpointRecord,
} from "@mediaforge/persistence";
import { Pool } from "pg";
import { z } from "zod";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const positiveInteger = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/u)
  .transform(Number)
  .refine(Number.isSafeInteger);
const webhookUrl = z
  .string()
  .max(2_048)
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash;
  }, "Webhook endpoint must be an HTTPS URL without credentials or a fragment.");
const secretHandle = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => {
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/u.test(value)) return false;
    const parsed = new URL(value);
    return Boolean(parsed.hostname) && !parsed.username && !parsed.password && !parsed.hash;
  }, "Webhook secret handle must be a scheme-qualified external secret reference.");

const environmentSchema = z.object({
  MEDIAFORGE_WEBHOOK_ENDPOINT_WORKSPACE_ID: opaqueId,
  MEDIAFORGE_WEBHOOK_ENDPOINT_ID: opaqueId,
  MEDIAFORGE_WEBHOOK_ENDPOINT_URL: webhookUrl,
  MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_HANDLE: secretHandle,
  MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_VERSION: positiveInteger,
  MEDIAFORGE_WEBHOOK_ENDPOINT_EVENT_FILTERS: z.string().max(16_100).default(""),
});

export interface WebhookEndpointProvisionEnvironment {
  readonly workspaceId: string;
  readonly endpointId: string;
  readonly url: string;
  readonly secretHandle: string;
  readonly secretVersion: number;
  readonly eventFilters: readonly string[];
}

export function parseWebhookEndpointProvisionEnvironment(
  environment: NodeJS.ProcessEnv
): WebhookEndpointProvisionEnvironment {
  const parsed = environmentSchema.parse(environment);
  const eventFilters = [
    ...new Set(
      parsed.MEDIAFORGE_WEBHOOK_ENDPOINT_EVENT_FILTERS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].sort();
  if (
    eventFilters.length > 100 ||
    eventFilters.some(
      (value) =>
        value.length > 160 ||
        !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(value)
    )
  )
    throw new Error("Webhook endpoint event filters are invalid or exceed the configured limit.");
  return {
    workspaceId: parsed.MEDIAFORGE_WEBHOOK_ENDPOINT_WORKSPACE_ID,
    endpointId: parsed.MEDIAFORGE_WEBHOOK_ENDPOINT_ID,
    url: parsed.MEDIAFORGE_WEBHOOK_ENDPOINT_URL,
    secretHandle: parsed.MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_HANDLE,
    secretVersion: parsed.MEDIAFORGE_WEBHOOK_ENDPOINT_SECRET_VERSION,
    eventFilters,
  };
}

export type WebhookEndpointProvisionResult = Omit<
  WebhookEndpointRecord,
  "secretHandle"
>;

function withoutSecretHandle(
  endpoint: WebhookEndpointRecord
): WebhookEndpointProvisionResult {
  return {
    workspaceId: endpoint.workspaceId,
    endpointId: endpoint.endpointId,
    url: endpoint.url,
    secretVersion: endpoint.secretVersion,
    enabled: endpoint.enabled,
    eventFilters: endpoint.eventFilters,
    revision: endpoint.revision,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export async function provisionWebhookEndpoint(input: {
  readonly pool: PostgresPool;
  readonly environment: WebhookEndpointProvisionEnvironment;
  readonly now?: () => Date;
}): Promise<WebhookEndpointProvisionResult> {
  await new PostgresWorkflowRepository(input.pool).migrate();
  const repository = new PostgresWebhookRepository(input.pool);
  await repository.migrate();
  const endpoint = await repository.createEndpoint({
    ...input.environment,
    now: (input.now ?? (() => new Date()))().toISOString(),
  });
  return withoutSecretHandle(endpoint);
}

export async function provisionWebhookEndpointFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): Promise<WebhookEndpointProvisionResult> {
  const config = await loadRuntimeConfig();
  if (!config.workflowDatabaseUrl)
    throw new Error(
      "MEDIAFORGE_WORKFLOW_DATABASE_URL is required to provision a webhook endpoint."
    );
  const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
  try {
    return await provisionWebhookEndpoint({
      pool,
      environment: parseWebhookEndpointProvisionEnvironment(environment),
    });
  } finally {
    await pool.end();
  }
}
