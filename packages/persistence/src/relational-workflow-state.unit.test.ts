import { describe, expect, it } from "vitest";

import {
  InMemoryRelationalWorkflowRepository,
  POSTGRES_WORKFLOW_STATE_MIGRATION,
  WorkflowStateTransitionError,
} from "./relational-workflow-state.js";

const execution = {
  input: { episodeId: "episode-1" },
  configurationVersion: "config-r1",
  promptVersion: "prompt-r1",
  providerSelection: "fixture",
  rendererVersion: "renderer-r1",
  presetVersion: "preset-r1",
  buildVersion: "build-r1",
  assetHashes: ["a".repeat(64)],
  taskGraphVersion: "workflow-r1",
};

describe("relational workflow state conformance", () => {
  it("accepts the canonical history project profile during fresh and existing-schema migration", () => {
    const profileCheck =
      "profile IN ('dark_truth', 'mathematics_education', 'dynamic_generic', 'history')";

    expect(POSTGRES_WORKFLOW_STATE_MIGRATION).toContain(profileCheck);
    expect(POSTGRES_WORKFLOW_STATE_MIGRATION.split(profileCheck)).toHaveLength(
      3
    );
  });

  it("scopes runs by workspace and preserves immutable execution specifications", () => {
    const repository = new InMemoryRelationalWorkflowRepository();
    repository.create({
      workspaceId: "workspace-a",
      runId: "run-1",
      status: "queued",
      execution,
      supersedesRunId: null,
      createdAt: "2026-07-31T12:00:00.000Z",
    });

    expect(repository.get("workspace-b", "run-1")).toBeNull();
    const loaded = repository.get("workspace-a", "run-1");
    expect(loaded?.execution).toEqual(execution);
    expect(() =>
      repository.create({
        workspaceId: "workspace-a",
        runId: "run-1",
        status: "queued",
        execution,
        supersedesRunId: null,
        createdAt: "2026-07-31T12:00:00.000Z",
      })
    ).toThrow(WorkflowStateTransitionError);
  });

  it("requires CAS and rejects late writers and terminal mutations", () => {
    const repository = new InMemoryRelationalWorkflowRepository();
    repository.create({
      workspaceId: "workspace-a",
      runId: "run-1",
      status: "queued",
      execution,
      supersedesRunId: null,
      createdAt: "2026-07-31T12:00:00.000Z",
    });
    const running = repository.transition({
      workspaceId: "workspace-a",
      runId: "run-1",
      expectedRevision: 0,
      authority: "database-v1",
      status: "running",
      now: "2026-07-31T12:01:00.000Z",
    });
    expect(running.revision).toBe(1);
    expect(() =>
      repository.transition({
        workspaceId: "workspace-a",
        runId: "run-1",
        expectedRevision: 0,
        authority: "database-v1",
        status: "failed",
        now: "2026-07-31T12:02:00.000Z",
      })
    ).toThrow(/stale/u);
    const completed = repository.transition({
      workspaceId: "workspace-a",
      runId: "run-1",
      expectedRevision: 1,
      authority: "database-v1",
      status: "succeeded",
      now: "2026-07-31T12:02:00.000Z",
    });
    expect(() =>
      repository.transition({
        workspaceId: "workspace-a",
        runId: "run-1",
        expectedRevision: completed.revision,
        authority: "database-v1",
        status: "running",
        now: "2026-07-31T12:03:00.000Z",
      })
    ).toThrow(/Terminal/u);
  });

  it("rejects writes from an authority other than the run owner", () => {
    const repository = new InMemoryRelationalWorkflowRepository();
    repository.create({
      workspaceId: "workspace-a",
      runId: "legacy-run",
      status: "queued",
      authority: "filesystem-legacy",
      execution,
      supersedesRunId: null,
      createdAt: "2026-07-31T12:00:00.000Z",
    });
    expect(() =>
      repository.transition({
        workspaceId: "workspace-a",
        runId: "legacy-run",
        expectedRevision: 0,
        authority: "database-v1",
        status: "running",
        now: "2026-07-31T12:01:00.000Z",
      })
    ).toThrow(/authority/u);
  });
});
