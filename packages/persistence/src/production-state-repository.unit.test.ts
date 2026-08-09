import { describe, expect, it } from "vitest";

import { PRODUCTION_STATE_SCHEMA_VERSION } from "@mediaforge/domain";

import { POSTGRES_MIGRATION_MODULES } from "./postgres-migration-registry.js";
import { POSTGRES_PRODUCTION_STATE_MIGRATION } from "./postgres-production-state.js";
import {
  InMemoryProductionStateRepository,
  computeResolvedConfigFingerprint,
  buildEpisodeProductionStateFromSources,
} from "./production-state-repository.js";
import { WorkflowStateTransitionError } from "./relational-workflow-state.js";

const now = "2026-08-08T12:00:00.000Z";
const fingerprint = computeResolvedConfigFingerprint({
  episodeRevision: 1,
  locale: "en",
  variant: "full",
  configurationVersion: "config-v1",
});

describe("postgres migration registry", () => {
  it("registers production-state migration after workflow foundations", () => {
    const ids = POSTGRES_MIGRATION_MODULES.map((module) => module.id);
    expect(ids).toEqual([
      "workflow-state",
      "workflow-authority",
      "durable-dispatch",
      "production-state",
      "capability-configuration",
      "principal-directory",
      "quota-dimensions",
    ]);
    expect(POSTGRES_PRODUCTION_STATE_MIGRATION).toContain(
      "production_revisions"
    );
    expect(POSTGRES_PRODUCTION_STATE_MIGRATION).toContain(
      "episode_production_state"
    );
  });
});

describe("in-memory production state repository", () => {
  it("keeps production revisions immutable and scopes by workspace", () => {
    const repository = new InMemoryProductionStateRepository();
    const revision = repository.createRevision({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      productionRevisionId: "prod-rev-1",
      episodeRevision: 1,
      episodeRevisionId: "episode-rev-1",
      resolvedConfigFingerprint: fingerprint,
      locale: "en",
      variant: "full",
      workflowRunId: "run-1",
      createdAt: now,
    });
    expect(revision.workspaceId).toBe("workspace-a");
    expect(() =>
      repository.createRevision({
        workspaceId: "workspace-a",
        projectId: "project-1",
        episodeId: "episode-1",
        productionRevisionId: "prod-rev-1",
        episodeRevision: 1,
        resolvedConfigFingerprint: fingerprint,
        locale: "en",
        variant: "full",
        createdAt: now,
      })
    ).toThrow(WorkflowStateTransitionError);
    expect(
      repository.getAuthoritativeRevision({
        workspaceId: "workspace-b",
        projectId: "project-1",
        episodeId: "episode-1",
      })
    ).toBeNull();
  });

  it("selects the highest episode revision as authoritative across runs", () => {
    const repository = new InMemoryProductionStateRepository();
    repository.createRevision({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      productionRevisionId: "prod-rev-1",
      episodeRevision: 1,
      resolvedConfigFingerprint: fingerprint,
      locale: "en",
      variant: "full",
      workflowRunId: "run-1",
      createdAt: now,
    });
    repository.createRevision({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      productionRevisionId: "prod-rev-2",
      episodeRevision: 2,
      resolvedConfigFingerprint: computeResolvedConfigFingerprint({
        episodeRevision: 2,
        locale: "en",
        variant: "full",
        configurationVersion: "config-v2",
      }),
      locale: "en",
      variant: "full",
      workflowRunId: "run-2",
      createdAt: "2026-08-08T12:01:00.000Z",
    });
    const authoritative = repository.getAuthoritativeRevision({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
    });
    expect(authoritative?.id).toBe("prod-rev-2");
    expect(authoritative?.episodeRevision).toBe(2);
  });

  it("rejects stale projection replacements", () => {
    const repository = new InMemoryProductionStateRepository();
    const revision = repository.createRevision({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      productionRevisionId: "prod-rev-1",
      episodeRevision: 1,
      resolvedConfigFingerprint: fingerprint,
      locale: "en",
      variant: "full",
      createdAt: now,
    });
    const projected = buildEpisodeProductionStateFromSources({
      productionRevision: revision,
      projectedAt: now,
      workflow: { runStatus: "none" },
      validations: [],
      approvals: [],
      requiredReviewGates: [],
      render: { status: "none", renderArtifactHashes: [] },
      localizationVariants: [],
      publication: {
        readiness: "not_ready",
        publishReady: false,
        publicationStatus: "none",
      },
    });
    const stored = repository.replaceProjection({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      state: projected,
      updatedAt: now,
    });
    expect(stored.projectionRevision).toBe(0);
    const advanced = repository.replaceProjection({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      expectedProjectionRevision: 0,
      state: projected,
      updatedAt: "2026-08-08T12:01:00.000Z",
    });
    expect(advanced.projectionRevision).toBe(1);
    expect(() =>
      repository.replaceProjection({
        workspaceId: "workspace-a",
        projectId: "project-1",
        episodeId: "episode-1",
        expectedProjectionRevision: 0,
        state: projected,
        updatedAt: "2026-08-08T12:02:00.000Z",
      })
    ).toThrow(WorkflowStateTransitionError);
    const next = repository.replaceProjection({
      workspaceId: "workspace-a",
      projectId: "project-1",
      episodeId: "episode-1",
      expectedProjectionRevision: 1,
      state: projected,
      updatedAt: "2026-08-08T12:02:00.000Z",
    });
    expect(next.projectionRevision).toBe(2);
  });
});
