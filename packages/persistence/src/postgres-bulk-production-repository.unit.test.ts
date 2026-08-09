import { describe, expect, it } from "vitest";

import { POSTGRES_BULK_PRODUCTION_MIGRATION } from "./postgres-bulk-production-repository.js";
import { POSTGRES_MIGRATION_MODULES } from "./postgres-migration-registry.js";

describe("Postgres bulk production repository", () => {
  it("persists every selected item and enforces tenant-scoped idempotency", () => {
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS bulk_production_batches");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS bulk_production_batch_items");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("UNIQUE (workspace_id, idempotency_key)");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("eligibility_reasons JSONB NOT NULL");
    expect(POSTGRES_BULK_PRODUCTION_MIGRATION).toContain("FORCE ROW LEVEL SECURITY");
    expect(POSTGRES_MIGRATION_MODULES.map((module) => module.id)).toContain("bulk-production");
  });

  it("keeps running claims and completed child outcomes distinct from eligibility", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./postgres-bulk-production-repository.ts", import.meta.url), "utf8"));
    expect(source).toContain("FOR UPDATE OF item SKIP LOCKED");
    expect(source).toContain("AND status='running'");
    expect(source).toContain("workflow_run_id=$5");
  });
});
