import { describe, expect, it } from "vitest";

import { POSTGRES_CONTENT_REUSE_MIGRATION } from "./postgres-content-reuse-repository.js";

describe("Postgres content reuse repository", () => {
  it("exports an idempotent schema for templates, bindings, and asset references", () => {
    expect(POSTGRES_CONTENT_REUSE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS production_templates"
    );
    expect(POSTGRES_CONTENT_REUSE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS episode_production_template_bindings"
    );
    expect(POSTGRES_CONTENT_REUSE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS episode_asset_references"
    );
    expect(POSTGRES_CONTENT_REUSE_MIGRATION).toContain(
      "episode_asset_reference_asset_unique"
    );
    expect(POSTGRES_CONTENT_REUSE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS episode_clone_idempotency"
    );
    expect(POSTGRES_CONTENT_REUSE_MIGRATION).toContain(
      "mode IN ('reference', 'copy_on_write')"
    );
  });
});
