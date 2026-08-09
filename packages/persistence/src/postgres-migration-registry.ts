import type { PostgresClient } from "./postgres-workflow-repository.js";
import { POSTGRES_DURABLE_DISPATCH_MIGRATION } from "./relational-workflow-state.js";
import { POSTGRES_WORKFLOW_AUTHORITY_MIGRATION } from "./relational-workflow-state.js";
import { POSTGRES_WORKFLOW_STATE_MIGRATION } from "./relational-workflow-state.js";
import { POSTGRES_PRODUCTION_STATE_MIGRATION } from "./postgres-production-state.js";
import { POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION } from "./postgres-principal-directory.js";
import { POSTGRES_QUOTA_DIMENSION_MIGRATION } from "./postgres-usage-audit-repository.js";
import { POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION } from "./postgres-capability-configuration-repository.js";
import { POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION } from "./postgres-recent-auth-confirmation-repository.js";

export interface PostgresMigrationModule {
  readonly id: string;
  readonly migration: string;
}

/** Canonical registration order for PostgreSQL schema modules owned by persistence. */
export const POSTGRES_MIGRATION_MODULES: readonly PostgresMigrationModule[] = [
  { id: "workflow-state", migration: POSTGRES_WORKFLOW_STATE_MIGRATION },
  { id: "workflow-authority", migration: POSTGRES_WORKFLOW_AUTHORITY_MIGRATION },
  { id: "durable-dispatch", migration: POSTGRES_DURABLE_DISPATCH_MIGRATION },
  { id: "production-state", migration: POSTGRES_PRODUCTION_STATE_MIGRATION },
  { id: "capability-configuration", migration: POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION },
  { id: "recent-auth-confirmation", migration: POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION },
  { id: "principal-directory", migration: POSTGRES_PRINCIPAL_DIRECTORY_MIGRATION },
  { id: "quota-dimensions", migration: POSTGRES_QUOTA_DIMENSION_MIGRATION },
];

export async function applyRegisteredPostgresMigrations(
  client: PostgresClient,
  options?: { readonly moduleIds?: readonly string[] }
): Promise<void> {
  const selected =
    options?.moduleIds === undefined
      ? POSTGRES_MIGRATION_MODULES
      : POSTGRES_MIGRATION_MODULES.filter((module) =>
          options.moduleIds!.includes(module.id)
        );
  for (const module of selected) {
    await client.query(module.migration);
  }
}
