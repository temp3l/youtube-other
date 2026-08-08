import { describe, expect, it } from "vitest";

import {
  WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
  type WorkflowPortfolioSource,
} from "./workflow-portfolio-contracts.js";
import {
  classifyWorkflowRecovery,
  mapProjectProfileToDomain,
  matchesWorkflowPortfolioFilter,
  projectWorkflowPortfolioPage,
  recoveryClassificationForStatus,
} from "./workflow-portfolio-projector.js";

const projectedAt = "2026-08-08T12:00:00.000Z";

function source(
  overrides: Partial<WorkflowPortfolioSource> = {}
): WorkflowPortfolioSource {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    episodeId: "episode-1",
    runId: "run-1",
    runRevision: 2,
    runStatus: "failed",
    profileId: "history",
    locale: "en",
    episodeRevision: 3,
    latestJobId: "job-1",
    latestJobRevision: 4,
    latestJobStatus: "failed",
    latestJobAttempts: 2,
    latestStageId: "step-1",
    latestStageStatus: "failed",
    preservedArtifactHashes: ["a".repeat(64)],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T11:00:00.000Z",
    ...overrides,
  };
}

describe("workflow portfolio projection", () => {
  it("isolates tenant portfolio filters from other workspaces", () => {
    const page = projectWorkflowPortfolioPage({
      filter: {
        schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        limit: 10,
      },
      sources: [
        source(),
        source({
          workspaceId: "workspace-2",
          runId: "run-2",
          profileId: "dark_truth",
        }),
      ],
      projectedAt,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.workspaceId).toBe("workspace-1");
  });

  it("filters by profile, locale, and run status", () => {
    const page = projectWorkflowPortfolioPage({
      filter: {
        schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        profileId: "history",
        locale: "en",
        runStatus: "failed",
        limit: 10,
      },
      sources: [
        source(),
        source({ runId: "run-2", profileId: "mathematics_education", locale: "en" }),
        source({ runId: "run-3", locale: "de" }),
      ],
      projectedAt,
    });
    expect(page.items.map((item) => item.runId)).toEqual(["run-1"]);
  });

  it("classifies partial failures with safe recovery actions", () => {
    expect(
      classifyWorkflowRecovery({ runStatus: "failed", jobStatus: "retry_scheduled" })
    ).toEqual(
      expect.objectContaining({
        classification: "retryable",
        availableActions: expect.arrayContaining(["resume"]),
      })
    );
    expect(
      classifyWorkflowRecovery({ runStatus: "failed", jobStatus: "dead_lettered" })
        .availableActions
    ).toContain("abandon");
  });

  it("paginates with stable cursors by updated time", () => {
    const first = projectWorkflowPortfolioPage({
      filter: {
        schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        limit: 1,
      },
      sources: [
        source({ runId: "run-old", updatedAt: "2026-08-08T09:00:00.000Z" }),
        source({ runId: "run-new", updatedAt: "2026-08-08T11:00:00.000Z" }),
      ],
      projectedAt,
    });
    expect(first.items[0]?.runId).toBe("run-new");
    expect(first.nextCursor).toBeDefined();

    const second = projectWorkflowPortfolioPage({
      filter: {
        schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        limit: 1,
        cursor: first.nextCursor,
      },
      sources: [
        source({ runId: "run-old", updatedAt: "2026-08-08T09:00:00.000Z" }),
        source({ runId: "run-new", updatedAt: "2026-08-08T11:00:00.000Z" }),
      ],
      projectedAt,
    });
    expect(second.items[0]?.runId).toBe("run-old");
  });

  it("maps API profile slugs to domain profile identifiers", () => {
    expect(mapProjectProfileToDomain("dark_truth")).toBe("dark-truth");
    expect(matchesWorkflowPortfolioFilter(source({ profileId: "history" }), {
      schemaVersion: WORKFLOW_PORTFOLIO_SCHEMA_VERSION,
      workspaceId: "workspace-1",
      profileId: "history",
      limit: 10,
    })).toBe(true);
  });

  it("reports non-retryable classification for terminal failed jobs", () => {
    expect(recoveryClassificationForStatus("failed", "dead_lettered")).toBe(
      "non_retryable"
    );
  });
});
