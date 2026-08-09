import { describe, expect, it } from "vitest";

import { redactLifecycleAuditPayload } from "./content-lifecycle-contracts.js";
import {
  buildLifecycleTransitionResult,
  buildUnresolvedRetentionPolicy,
  evaluateArchiveAdmission,
  evaluateEpisodeDeletion,
  evaluateRestoreAdmission,
  projectEpisodeContentLifecycleRecord,
  verifyDeletionEvaluationToken,
} from "./content-lifecycle.js";

const evaluatedAt = "2026-08-09T14:00:00.000Z";
const secret = "test-evaluation-secret-with-32-bytes-min";

function lifecycle(visibility: "active" | "archived" | "tombstoned") {
  return projectEpisodeContentLifecycleRecord({
    workspaceId: "workspace-1",
    projectId: "project-1",
    episodeId: "episode-1",
    visibility,
    revision: 1,
    updatedAt: evaluatedAt,
  });
}

describe("content lifecycle", () => {
  it("blocks archive when a workflow run is active", () => {
    expect(
      evaluateArchiveAdmission({
        visibility: "active",
        activeWorkflowRunCount: 1,
      })
    ).toMatchObject({ allowed: false, code: "active_workflow" });
  });

  it("allows restore without starting workflow", () => {
    const record = lifecycle("archived");
    const result = buildLifecycleTransitionResult({
      lifecycle: record,
      replayed: false,
    });
    expect(result.startedWorkflow).toBe(false);
    expect(evaluateRestoreAdmission({ visibility: "archived" }).allowed).toBe(
      true
    );
  });

  it("fails closed when retention policy is unresolved", () => {
    const evaluation = evaluateEpisodeDeletion({
      visibility: "active",
      activeWorkflowRunCount: 0,
      terminalPublicationCount: 0,
      sharedAssetSurvivorCount: 0,
      retentionPolicyStatus: "unresolved",
      legalHoldCategories: [],
        evaluationSecret: secret,
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
      });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.blockers).toContainEqual({
      code: "retention_unresolved",
      message:
        "Retention policy is unresolved; destructive actions are blocked.",
    });
  });

  it("reports shared asset survivors as impacts not blockers", () => {
    const evaluation = evaluateEpisodeDeletion({
      visibility: "active",
      activeWorkflowRunCount: 0,
      terminalPublicationCount: 0,
      sharedAssetSurvivorCount: 2,
      retentionPolicyStatus: "configured",
      legalHoldCategories: [],
        evaluationSecret: secret,
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
      });
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.impacts[0]?.code).toBe("shared_assets_survive");
  });

  it("verifies deletion evaluation tokens", () => {
    const evaluation = evaluateEpisodeDeletion({
      visibility: "active",
      activeWorkflowRunCount: 0,
      terminalPublicationCount: 0,
      sharedAssetSurvivorCount: 0,
      retentionPolicyStatus: "configured",
      legalHoldCategories: [],
        evaluationSecret: secret,
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
      });
    expect(
      verifyDeletionEvaluationToken({
        evaluation,
        evaluationSecret: secret,
        workspaceId: "workspace-1",
        projectId: "project-1",
        episodeId: "episode-1",
        visibility: "active",
        activeWorkflowRunCount: 0,
        terminalPublicationCount: 0,
        retentionPolicyStatus: "configured",
        legalHoldCategories: [],
      })
    ).toBe(true);
  });

  it("declares unresolved retention without inventing periods", () => {
    expect(buildUnresolvedRetentionPolicy("workspace-1")).toMatchObject({
      status: "unresolved",
      categories: [],
    });
  });

  it("redacts evaluation tokens from audit payloads", () => {
    expect(
      redactLifecycleAuditPayload({
        episodeId: "episode-1",
        evaluationToken: "hidden",
      })
    ).toEqual({ episodeId: "episode-1" });
  });
});
