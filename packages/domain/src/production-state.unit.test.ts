import { describe, expect, it } from "vitest";

import {
  PRODUCTION_STATE_SCHEMA_VERSION,
  productionRevisionSchema,
  resolvedConfigFingerprintSchema,
} from "./production-state-contracts.js";
import {
  computeProductionInputFingerprint,
  projectEpisodeProductionState,
} from "./episode-production-state-projector.js";

const fingerprint = resolvedConfigFingerprintSchema.parse("a".repeat(64));
const now = "2026-08-08T12:00:00.000Z";

const productionRevision = productionRevisionSchema.parse({
  schemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
  id: "prod-rev-1",
  projectId: "project-1",
  episodeId: "episode-1",
  episodeRevision: 2,
  episodeRevisionId: "episode-rev-2",
  resolvedConfigFingerprint: fingerprint,
  locale: "en",
  variant: "full",
  workflowRunId: "run-1",
  createdAt: now,
});

describe("episode production state projection", () => {
  it("identifies authoritative revision and fragmented slices without filenames", () => {
    const state = projectEpisodeProductionState({
      productionRevision,
      projectedAt: now,
      workflow: {
        activeRunId: "run-1",
        runStatus: "failed",
        runRevision: 3,
        jobId: "job-1",
        jobStatus: "failed",
        sanitizedFailureCode: "WORKFLOW_BLOCKED",
      },
      validations: [
        {
          validationId: "validation-1",
          status: "failed",
          resultFingerprint: "b".repeat(64),
        },
      ],
      approvals: [
        {
          approvalId: "approval-1",
          gate: "render-qa",
          decision: "approved",
          state: "active",
          boundFingerprint: "c".repeat(64),
          stale: true,
        },
      ],
      requiredReviewGates: ["render-qa", "publish"],
      render: { status: "failed", renderArtifactHashes: [] },
      localizationVariants: [
        {
          locale: "en",
          variant: "full",
          productionRevisionId: "prod-rev-1",
          status: "blocked",
        },
      ],
      publication: {
        readiness: "disabled",
        publishReady: false,
        publicationStatus: "none",
      },
    });

    expect(state.currentProductionRevision.id).toBe("prod-rev-1");
    expect(state.currentProductionRevision.episodeRevision).toBe(2);
    expect(state.workflow.runStatus).toBe("failed");
    expect(state.validation.items[0]?.validationId).toBe("validation-1");
    expect(state.review.approvals[0]?.stale).toBe(true);
    expect(state.localization.variants[0]?.status).toBe("blocked");
    expect(state.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "workflow_failed",
        "validation_failed",
        "approval_stale",
        "approval_missing",
        "render_failed",
      ])
    );
    expect(
      state.actions.find((action) => action.kind === "retry_workflow")?.enabled
    ).toBe(true);
    expect(state.projectionInputFingerprint).toBe(
      computeProductionInputFingerprint({
        productionRevision,
        workflow: {
          activeRunId: "run-1",
          runStatus: "failed",
          runRevision: 3,
          jobId: "job-1",
          jobStatus: "failed",
          sanitizedFailureCode: "WORKFLOW_BLOCKED",
        },
        validations: [
          {
            validationId: "validation-1",
            status: "failed",
            resultFingerprint: "b".repeat(64),
          },
        ],
        approvals: [
          {
            approvalId: "approval-1",
            gate: "render-qa",
            decision: "approved",
            state: "active",
            boundFingerprint: "c".repeat(64),
            stale: true,
          },
        ],
        requiredReviewGates: ["render-qa", "publish"],
        render: { status: "failed", renderArtifactHashes: [] },
        localizationVariants: [
          {
            locale: "en",
            variant: "full",
            productionRevisionId: "prod-rev-1",
            status: "blocked",
          },
        ],
        publication: {
          readiness: "disabled",
          publishReady: false,
          publicationStatus: "none",
        },
      })
    );
  });

  it("marks publish-ready lifecycle when gates pass", () => {
    const state = projectEpisodeProductionState({
      productionRevision,
      projectedAt: now,
      workflow: {
        activeRunId: "run-1",
        runStatus: "succeeded",
        runRevision: 4,
      },
      validations: [
        {
          validationId: "validation-1",
          status: "passed",
          resultFingerprint: "b".repeat(64),
        },
      ],
      approvals: [
        {
          approvalId: "approval-1",
          gate: "publish",
          decision: "approved",
          state: "active",
          boundFingerprint: fingerprint,
        },
      ],
      requiredReviewGates: ["publish"],
      render: {
        status: "succeeded",
        renderArtifactHashes: ["d".repeat(64)],
      },
      localizationVariants: [
        {
          locale: "en",
          variant: "full",
          productionRevisionId: "prod-rev-1",
          status: "ready",
        },
      ],
      publication: {
        readiness: "ready",
        publishReady: true,
        publicationStatus: "none",
      },
    });

    expect(state.lifecycleStage).toBe("publish_ready");
    expect(state.blockers).toHaveLength(0);
    expect(
      state.actions.find((action) => action.kind === "prepare_publication")
        ?.enabled
    ).toBe(true);
  });
});
