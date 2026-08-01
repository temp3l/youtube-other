import { loadRuntimeConfig } from "@mediaforge/config";
import {
  PostgresWorkflowAdmissionPort,
  PostgresWebhookRepository,
  PostgresUsageAuditRepository,
  PostgresPrincipalDirectory,
  PostgresPilotApiKeyRepository,
  PostgresSpeechRepository,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";
import { WorkflowAdmissionHandler } from "@mediaforge/application";
import type { AuthenticatedPrincipal } from "@mediaforge/application";
import { Pool } from "pg";

export * from "./contract.js";
export * from "./speech-contract.js";
export * from "./http-server.js";
export * from "./job-process.js";
export * from "./postgres-durable-workflow-loader.js";
export * from "./node-webhook-delivery.js";
export * from "./pilot-api-key-authenticator.js";
export * from "./pilot-api-key-admin.js";
export * from "./principal-provision.js";
export * from "./publication-reconciliation.js";
export * from "./postgres-api-use-cases.js";
export * from "./postgres-speech-use-cases.js";
export * from "./reconciliation-process.js";
export * from "./tenant-reconciliation-scheduler.js";
export * from "./webhook-process.js";
export * from "./webhook-endpoint-provision.js";
import {
  createApiServer,
  createDirectoryBackedRequestAuthenticator,
  type ApiServerOptions,
} from "./http-server.js";
import { createPostgresApiUseCases } from "./postgres-api-use-cases.js";
import {
  createPostgresSpeechApiUseCases,
  type SpeechProductionConfiguration,
} from "./postgres-speech-use-cases.js";

/** Production composition root; HTTP only receives the shared application handler. */
export function createPostgresApiWorkflowAdmissionHandler(
  pool: PostgresPool
): WorkflowAdmissionHandler {
  return new WorkflowAdmissionHandler(
    new PostgresWorkflowAdmissionPort({
      repository: new PostgresWorkflowRepository(pool),
    })
  );
}

export function createPostgresApiServer(input: {
  readonly pool: PostgresPool;
  readonly authenticate: NonNullable<ApiServerOptions["authenticate"]>;
  readonly cursorSecret: string;
  readonly speechConfiguration?: SpeechProductionConfiguration;
  readonly options?: Omit<
    ApiServerOptions,
    "workflowAdmissionHandler" | "useCases" | "authenticate" | "readiness"
  >;
}) {
  const workflowAdmissionHandler = createPostgresApiWorkflowAdmissionHandler(
    input.pool
  );
  return createApiServer({
    ...input.options,
    authenticate: input.authenticate,
    readiness: async () => {
      try {
        await input.pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    useCases: createPostgresApiUseCases({
      pool: input.pool,
      workflowAdmissionHandler,
      cursorSecret: input.cursorSecret,
    }),
    ...(input.speechConfiguration
      ? {
          speechUseCases: createPostgresSpeechApiUseCases({
            pool: input.pool,
            config: input.speechConfiguration,
          }),
        }
      : {}),
  });
}

export async function startApiServer(input: {
  readonly port?: number;
  readonly host?: string;
  readonly authenticate: (
    request: import("node:http").IncomingMessage
  ) => Promise<AuthenticatedPrincipal | null>;
  readonly cursorSecret: string;
}) {
  const config = await loadRuntimeConfig();
  if (!config.workflowDatabaseUrl)
    throw new Error(
      "MEDIAFORGE_WORKFLOW_DATABASE_URL is required to start the API."
    );
  const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
  const repository = new PostgresWorkflowRepository(pool);
  try {
    await repository.migrate();
    await new PostgresWebhookRepository(pool).migrate();
    await new PostgresUsageAuditRepository(pool).migrate();
    await new PostgresPrincipalDirectory(pool).migrate();
    await new PostgresPilotApiKeyRepository(pool).migrate();
    await new PostgresSpeechRepository(pool).migrate();
    const server = createPostgresApiServer({
      pool,
      authenticate: createDirectoryBackedRequestAuthenticator({
        authenticateToken: input.authenticate,
        directory: new PostgresPrincipalDirectory(pool),
      }),
      cursorSecret: input.cursorSecret,
      speechConfiguration: {
        workspaceDirectory: config.workspaceDir,
        ...(config.openAiCompatibleApiKey
          ? { openAiApiKey: config.openAiCompatibleApiKey }
          : {}),
        ...(config.openAiCompatibleBaseUrl
          ? { openAiBaseUrl: config.openAiCompatibleBaseUrl }
          : {}),
        ...(config.openAiCompatibleOrganization
          ? { openAiOrganization: config.openAiCompatibleOrganization }
          : {}),
        ...(config.openAiCompatibleProject
          ? { openAiProject: config.openAiCompatibleProject }
          : {}),
        openAiModel:
          config.openAiSpeechModel ??
          config.openAiCompatibleModel ??
          "gpt-4o-mini-tts",
        openAiVoice:
          config.openAiSpeechVoice ?? config.openAiCompatibleTtsVoice ?? "onyx",
        elevenLabsFeatureEnabled: config.elevenLabsFeatureEnabled,
        ...(config.elevenLabsApiKey
          ? { elevenLabsApiKey: config.elevenLabsApiKey }
          : {}),
        ...(config.elevenLabsBaseUrl
          ? { elevenLabsBaseUrl: config.elevenLabsBaseUrl }
          : {}),
        elevenLabsRequestTimeoutMs: config.elevenLabsRequestTimeoutMs,
        channel: config.youtubeChannelId ?? "youtube",
      },
    });
    server.once("close", () => {
      void pool.end();
    });
    return server.listen({
      port: input.port ?? config.apiPort,
      host: input.host ?? "127.0.0.1",
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
}
