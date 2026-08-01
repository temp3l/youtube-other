import { loadRuntimeConfig } from "@mediaforge/config";
import {
  PostgresWorkflowAdmissionPort,
  PostgresWorkflowRepository,
  type PostgresPool,
} from "@mediaforge/persistence";
import { WorkflowAdmissionHandler } from "@mediaforge/application";
import { Pool } from "pg";

export * from "./contract.js";
export * from "./http-server.js";
export * from "./publication-reconciliation.js";
export * from "./reconciliation-process.js";
export * from "./tenant-reconciliation-scheduler.js";
import { createApiServer } from "./http-server.js";

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
  readonly options?: Omit<
    Parameters<typeof createApiServer>[0],
    "workflowAdmissionHandler"
  >;
}) {
  return createApiServer({
    ...input.options,
    workflowAdmissionHandler: createPostgresApiWorkflowAdmissionHandler(
      input.pool
    ),
  });
}

export async function startApiServer(port = 3333) {
  const config = await loadRuntimeConfig();
  if (!config.workflowDatabaseUrl)
    throw new Error(
      "MEDIAFORGE_WORKFLOW_DATABASE_URL is required to start the API."
    );
  const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
  const repository = new PostgresWorkflowRepository(pool);
  try {
    await repository.migrate();
    const server = createPostgresApiServer({ pool });
    server.once("close", () => {
      void pool.end();
    });
    return server.listen(port);
  } catch (error) {
    await pool.end();
    throw error;
  }
}
