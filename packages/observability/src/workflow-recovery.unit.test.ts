import { describe, expect, it } from "vitest";

import {
  WORKFLOW_RECOVERY_TELEMETRY_VERSION,
  createWorkflowRecoveryCorrelationId,
  recordWorkflowRecoveryEvent,
  redactWorkflowFailureEvidence,
} from "./workflow-recovery.js";

describe("workflow recovery telemetry", () => {
  it("creates stable correlations and bounds secret-bearing failure evidence", () => {
    const input = { workspaceId: "workspace-1", jobId: "job-1", task: "veronica.voice" };
    expect(createWorkflowRecoveryCorrelationId(input)).toBe(
      createWorkflowRecoveryCorrelationId(input)
    );
    expect(
      redactWorkflowFailureEvidence(
        "provider authorization=Bearer secret https://example.test/x?token=secret"
      )
    ).not.toContain("secret");
  });

  it("accepts canonical Veronica recovery states with bounded labels", () => {
    const event = recordWorkflowRecoveryEvent({
      schemaVersion: WORKFLOW_RECOVERY_TELEMETRY_VERSION,
      correlationId: "workflow-123",
      status: "reconciliation_required",
      profileId: "veronicabenini",
      unitId: "episode-1",
      revisionId: "revision-1",
      task: "veronica.voice",
      attempt: 2,
      durationMs: 123,
      failureClass: "uncertain",
      failureCode: "PROVIDER_UNKNOWN",
      cacheStatus: "hit",
    });
    expect(event).toMatchObject({
      profileId: "veronicabenini",
      failureClass: "uncertain",
    });
  });
});
