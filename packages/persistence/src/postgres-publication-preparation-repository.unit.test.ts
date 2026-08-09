import { describe, expect, it } from "vitest";

import { POSTGRES_PUBLICATION_PREPARATION_MIGRATION } from "./postgres-publication-preparation-repository.js";

describe("Postgres publication preparation repository", () => {
  it("exports idempotent schema for channels, schedule policy, oauth sessions, and metadata revisions", () => {
    expect(POSTGRES_PUBLICATION_PREPARATION_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS workspace_publishing_channels"
    );
    expect(POSTGRES_PUBLICATION_PREPARATION_MIGRATION).toContain(
      "oauth_token_vault_ref TEXT NULL"
    );
    expect(POSTGRES_PUBLICATION_PREPARATION_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS workspace_publication_schedule_policies"
    );
    expect(POSTGRES_PUBLICATION_PREPARATION_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS publication_oauth_sessions"
    );
    expect(POSTGRES_PUBLICATION_PREPARATION_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS publication_metadata_revisions"
    );
    expect(POSTGRES_PUBLICATION_PREPARATION_MIGRATION).toContain(
      "connection_status IN ("
    );
  });
});
