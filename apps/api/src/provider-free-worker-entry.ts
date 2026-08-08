import { loadRuntimeConfig } from "@mediaforge/config";
import { Pool } from "pg";

import {
  createProviderFreeEpisodeProductionJobHandler,
  startPostgresDurableJobProcess,
} from "./job-process.js";

const shutdown = new AbortController();
const stop = (): void => shutdown.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const config = await loadRuntimeConfig();
if (!config.workflowDatabaseUrl)
  throw new Error(
    "MEDIAFORGE_WORKFLOW_DATABASE_URL is required to start the provider-free worker."
  );

const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
try {
  await startPostgresDurableJobProcess({
    pool,
    handler: createProviderFreeEpisodeProductionJobHandler({ pool }),
    signal: shutdown.signal,
    migrate: false,
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
