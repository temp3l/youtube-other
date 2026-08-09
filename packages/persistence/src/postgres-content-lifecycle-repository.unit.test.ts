import { describe, expect, it } from "vitest";

import { POSTGRES_CONTENT_LIFECYCLE_MIGRATION } from "./postgres-content-lifecycle-repository.js";

describe("Postgres content lifecycle repository", () => {
  it("exports an idempotent schema for episode lifecycle and retention policy", () => {
    expect(POSTGRES_CONTENT_LIFECYCLE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS episode_content_lifecycle"
    );
    expect(POSTGRES_CONTENT_LIFECYCLE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS workspace_retention_policies"
    );
    expect(POSTGRES_CONTENT_LIFECYCLE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS episode_deletion_idempotency"
    );
    expect(POSTGRES_CONTENT_LIFECYCLE_MIGRATION).toContain(
      "visibility IN ('active', 'archived', 'tombstoned')"
    );
  });
});
