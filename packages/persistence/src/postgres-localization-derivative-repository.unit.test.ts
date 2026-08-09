import { describe, expect, it } from "vitest";

import { POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION } from "./postgres-localization-derivative-repository.js";

describe("postgres localization derivative migration", () => {
  it("stores immutable source linkage and independent derivative revision", () => {
    expect(POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS episode_localization_derivatives"
    );
    expect(POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION).toContain(
      "source_episode_revision"
    );
    expect(POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION).toContain(
      "source_content_fingerprint"
    );
    expect(POSTGRES_LOCALIZATION_DERIVATIVE_MIGRATION).toContain(
      "episode_localization_derivatives_tuple_unique"
    );
  });
});
