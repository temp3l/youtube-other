import { describe, expect, it } from "vitest";
import { POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION } from "./postgres-capability-configuration-repository.js";

describe("capability configuration migration", () => {
  it("persists tenant, profile, and episode layers under workspace isolation", () => {
    expect(POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION).toContain("workspace_tenant_configurations");
    expect(POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION).toContain("workspace_genre_configurations");
    expect(POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION).toContain("episode_configuration_overrides");
    expect(POSTGRES_CAPABILITY_CONFIGURATION_MIGRATION).toContain("workspace_isolation");
  });
});
