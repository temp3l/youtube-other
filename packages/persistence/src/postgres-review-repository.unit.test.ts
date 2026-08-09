import { describe, expect, it } from "vitest";

import { POSTGRES_REVIEW_MIGRATION } from "./postgres-review-repository.js";

describe("postgres review repository migration", () => {
  it("stores challenge submitter and optional claim metadata", () => {
    expect(POSTGRES_REVIEW_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS approval_challenge_metadata"
    );
    expect(POSTGRES_REVIEW_MIGRATION).toContain("submitted_by_principal_id");
    expect(POSTGRES_REVIEW_MIGRATION).toContain("claimed_by_principal_id");
    expect(POSTGRES_REVIEW_MIGRATION).toContain(
      "REFERENCES approval_challenges (workspace_id, challenge_id)"
    );
  });
});
