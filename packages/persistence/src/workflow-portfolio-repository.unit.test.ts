import { describe, expect, it } from "vitest";

import {
  mapWorkflowPortfolioRow,
  readWorkflowAdmissionContext,
} from "./workflow-portfolio-repository.js";

describe("workflow portfolio repository mapping", () => {
  it("extracts admission locale and revision without exposing raw provider data", () => {
    const context = readWorkflowAdmissionContext({
      input: {
        episodeRevision: 4,
        locales: ["en-US"],
        variants: ["full"],
        approvalMode: "required",
        publicationMode: "none",
      },
      configurationVersion: "cfg-1",
      promptVersion: "prompt-1",
      providerSelection: "provider-free",
      rendererVersion: "render-1",
      presetVersion: "preset-1",
      buildVersion: null,
      assetHashes: ["a".repeat(64)],
      taskGraphVersion: "graph-1",
    });
    expect(context).toEqual({ episodeRevision: 4, locale: "en" });
  });

  it("maps joined portfolio rows into tenant-scoped sources", () => {
    const source = mapWorkflowPortfolioRow({
      workspace_id: "workspace-1",
      project_id: "project-1",
      episode_id: "episode-1",
      run_id: "run-1",
      revision: 2,
      status: "failed",
      profile: "history",
      execution_spec: {
        input: { episodeRevision: 3, locales: ["en"] },
        configurationVersion: "cfg-1",
        promptVersion: "prompt-1",
        providerSelection: "provider-free",
        rendererVersion: "render-1",
        presetVersion: "preset-1",
        buildVersion: null,
        assetHashes: ["b".repeat(64)],
        taskGraphVersion: "graph-1",
      },
      created_at: "2026-08-08T10:00:00.000Z",
      updated_at: "2026-08-08T11:00:00.000Z",
      job_id: "job-1",
      job_revision: 1,
      job_status: "failed",
      job_attempt_count: 2,
      step_id: "step-1",
      step_status: "failed",
    });
    expect(source.workspaceId).toBe("workspace-1");
    expect(source.latestJobStatus).toBe("failed");
    expect(source.preservedArtifactHashes).toEqual(["b".repeat(64)]);
  });
});
