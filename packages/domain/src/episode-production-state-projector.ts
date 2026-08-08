import crypto from "node:crypto";

import type { ProductionInputFingerprint } from "./production-state-contracts.js";
import {
  type EpisodeProductionState,
  episodeProductionStateSchema,
  type ProductionAction,
  type ProductionGateEvaluation,
  type ProductionLifecycleStage,
  type ProductionRevision,
  PRODUCTION_STATE_SCHEMA_VERSION,
  productionInputFingerprintSchema,
} from "./production-state-contracts.js";
import type { ApprovalGate } from "./workflow-contracts.js";

export interface EpisodeProductionProjectionInputs {
  readonly productionRevision: ProductionRevision;
  readonly projectedAt: string;
  readonly workflow: {
    readonly activeRunId?: string;
    readonly runStatus?:
      | "queued"
      | "running"
      | "awaiting_approval"
      | "succeeded"
      | "failed"
      | "cancelled"
      | "none";
    readonly runRevision?: number;
    readonly jobId?: string;
    readonly jobStatus?: string;
    readonly jobRevision?: number;
    readonly sanitizedFailureCode?: string;
  };
  readonly validations: ReadonlyArray<{
    readonly validationId: string;
    readonly status: "passed" | "failed" | "pending" | "unknown";
    readonly resultFingerprint?: string;
  }>;
  readonly approvals: ReadonlyArray<{
    readonly approvalId: string;
    readonly gate?: ApprovalGate;
    readonly decision: "approved" | "rejected" | "revoked";
    readonly state: "active" | "rejected" | "revoked";
    readonly boundFingerprint?: string;
    readonly stale?: boolean;
  }>;
  readonly requiredReviewGates: readonly ApprovalGate[];
  readonly render: {
    readonly status: "none" | "pending" | "succeeded" | "failed";
    readonly renderArtifactHashes: readonly string[];
  };
  readonly localizationVariants: ReadonlyArray<{
    readonly locale: ProductionRevision["locale"];
    readonly variant: ProductionRevision["variant"];
    readonly productionRevisionId?: string;
    readonly status: "none" | "in_progress" | "ready" | "blocked";
  }>;
  readonly publication: {
    readonly readiness: "not_ready" | "ready" | "disabled";
    readonly activePublicationId?: string;
    readonly publicationStatus?:
      | "none"
      | "pending"
      | "executing"
      | "published"
      | "failed"
      | "cancelled"
      | "reconciliation_required";
    readonly publishReady: boolean;
  };
}

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deriveLifecycleStage(input: {
  readonly workflowStatus?: EpisodeProductionProjectionInputs["workflow"]["runStatus"];
  readonly blockers: readonly ProductionGateEvaluation[];
  readonly publication: EpisodeProductionProjectionInputs["publication"];
  readonly renderStatus: EpisodeProductionProjectionInputs["render"]["status"];
}): ProductionLifecycleStage {
  if (input.blockers.some((item) => item.code === "workflow_failed")) {
    return "blocked";
  }
  if (input.publication.publicationStatus === "published") {
    return "published";
  }
  if (input.publication.publishReady) {
    return "publish_ready";
  }
  if (input.renderStatus === "pending") {
    return "rendering";
  }
  if (
    input.blockers.some(
      (item) =>
        item.code === "approval_missing" || item.code === "approval_stale"
    )
  ) {
    return "reviewing";
  }
  if (
    input.blockers.some(
      (item) =>
        item.code === "validation_failed" || item.code === "validation_missing"
    )
  ) {
    return "validating";
  }
  if (
    input.workflowStatus === "running" ||
    input.workflowStatus === "queued" ||
    input.workflowStatus === "awaiting_approval"
  ) {
    return "producing";
  }
  if (input.workflowStatus === "none" || input.workflowStatus === undefined) {
    return "draft";
  }
  return "producing";
}

function buildBlockersAndWarnings(
  input: EpisodeProductionProjectionInputs
): {
  readonly blockers: ProductionGateEvaluation[];
  readonly warnings: ProductionGateEvaluation[];
} {
  const blockers: ProductionGateEvaluation[] = [];
  const warnings: ProductionGateEvaluation[] = [];

  if (input.workflow.runStatus === "failed") {
    blockers.push({
      severity: "blocking",
      code: "workflow_failed",
      message: "The active workflow run failed.",
      evidence: [
        {
          kind: "workflow_run",
          id: input.workflow.activeRunId ?? "unknown",
          revision: input.workflow.runRevision,
        },
      ],
    });
  }

  const failedValidation = input.validations.find(
    (item) => item.status === "failed"
  );
  if (failedValidation) {
    blockers.push({
      severity: "blocking",
      code: "validation_failed",
      message: "Blocking validation evidence failed.",
      evidence: [
        {
          kind: "validation",
          id: failedValidation.validationId,
          contentHash: failedValidation.resultFingerprint,
        },
      ],
    });
  }

  const staleApproval = input.approvals.find((item) => item.stale);
  if (staleApproval) {
    blockers.push({
      severity: "blocking",
      code: "approval_stale",
      message: "An approval no longer matches the current production revision.",
      gate: staleApproval.gate,
      evidence: [
        {
          kind: "approval",
          id: staleApproval.approvalId,
          contentHash: staleApproval.boundFingerprint,
        },
      ],
      affectedProductionRevisionId: input.productionRevision.id,
    });
  }

  const rejectedApproval = input.approvals.find(
    (item) => item.decision === "rejected" || item.state === "rejected"
  );
  if (rejectedApproval) {
    blockers.push({
      severity: "blocking",
      code: "approval_rejected",
      message: "A required review gate was rejected.",
      gate: rejectedApproval.gate,
      evidence: [
        {
          kind: "approval",
          id: rejectedApproval.approvalId,
        },
      ],
    });
  }

  for (const gate of input.requiredReviewGates) {
    const active = input.approvals.find(
      (item) => item.gate === gate && item.state === "active"
    );
    if (!active) {
      blockers.push({
        severity: "blocking",
        code: "approval_missing",
        message: `Required review gate ${gate} is not approved.`,
        gate,
        evidence: [
          {
            kind: "production_revision",
            id: input.productionRevision.id,
            contentHash: input.productionRevision.resolvedConfigFingerprint,
          },
        ],
      });
    }
  }

  if (input.render.status === "failed") {
    blockers.push({
      severity: "blocking",
      code: "render_failed",
      message: "The required render failed.",
      evidence: [
        {
          kind: "production_revision",
          id: input.productionRevision.id,
        },
      ],
    });
  }

  if (
    input.publication.readiness === "disabled" &&
    input.publication.publishReady
  ) {
    warnings.push({
      severity: "warning",
      code: "publication_unavailable",
      message: "Publication capability is disabled for this workspace.",
      evidence: [
        {
          kind: "production_revision",
          id: input.productionRevision.id,
        },
      ],
    });
  }

  return { blockers, warnings };
}

function buildActions(input: {
  readonly productionRevision: ProductionRevision;
  readonly blockers: readonly ProductionGateEvaluation[];
  readonly workflow: EpisodeProductionProjectionInputs["workflow"];
  readonly publication: EpisodeProductionProjectionInputs["publication"];
  readonly validations: EpisodeProductionProjectionInputs["validations"];
}): ProductionAction[] {
  const actions: ProductionAction[] = [
    {
      actionId: "view-artifacts",
      kind: "view_artifacts",
      label: "Inspect artifacts",
      enabled: true,
    },
    {
      actionId: "view-validation",
      kind: "view_validation",
      label: "Inspect validation",
      enabled: input.validations.length > 0,
      ...(input.validations.length === 0
        ? { reason: "No validation evidence is recorded yet." }
        : {}),
    },
  ];

  const workflowFailed = input.blockers.some(
    (item) => item.code === "workflow_failed"
  );
  actions.push({
    actionId: "start-workflow",
    kind: "start_workflow",
    label: "Start workflow",
    enabled:
      input.workflow.runStatus === "none" ||
      input.workflow.runStatus === undefined,
    ...(input.workflow.runStatus &&
    input.workflow.runStatus !== "none"
      ? {
          reason: "An active workflow run already exists for this revision.",
        }
      : {}),
  });

  if (workflowFailed) {
    actions.push({
      actionId: "retry-workflow",
      kind: "retry_workflow",
      label: "Retry workflow",
      enabled: true,
      requiresProductionRevisionId: input.productionRevision.id,
    });
  }

  const reviewBlocked = input.blockers.some(
    (item) =>
      item.code === "approval_missing" || item.code === "approval_stale"
  );
  actions.push({
    actionId: "submit-review",
    kind: "submit_review",
    label: "Submit for review",
    enabled: !reviewBlocked && input.workflow.runStatus === "succeeded",
    ...(reviewBlocked
      ? { reason: "Resolve review blockers before submitting." }
      : input.workflow.runStatus !== "succeeded"
        ? { reason: "Workflow evidence is not complete yet." }
        : {}),
  });

  actions.push({
    actionId: "prepare-publication",
    kind: "prepare_publication",
    label: "Prepare publication",
    enabled: input.publication.publishReady,
    ...(input.publication.publishReady
      ? {}
      : { reason: "Publication is not ready for this revision." }),
  });

  return actions;
}

export function computeProductionInputFingerprint(
  input: Omit<EpisodeProductionProjectionInputs, "projectedAt">
): ProductionInputFingerprint {
  return productionInputFingerprintSchema.parse(
    digest({
      productionRevision: input.productionRevision,
      workflow: input.workflow,
      validations: input.validations,
      approvals: input.approvals,
      requiredReviewGates: input.requiredReviewGates,
      render: input.render,
      localizationVariants: input.localizationVariants,
      publication: input.publication,
    })
  );
}

export function projectEpisodeProductionState(
  input: EpisodeProductionProjectionInputs
): EpisodeProductionState {
  const { blockers, warnings } = buildBlockersAndWarnings(input);
  const lifecycleStage = deriveLifecycleStage({
    workflowStatus: input.workflow.runStatus,
    blockers,
    publication: input.publication,
    renderStatus: input.render.status,
  });

  const projectionInputFingerprint = computeProductionInputFingerprint(input);

  return episodeProductionStateSchema.parse({
    schemaVersion: PRODUCTION_STATE_SCHEMA_VERSION,
    projectId: input.productionRevision.projectId,
    episodeId: input.productionRevision.episodeId,
    currentProductionRevision: input.productionRevision,
    lifecycleStage,
    workflow: {
      activeRunId: input.workflow.activeRunId,
      runStatus: input.workflow.runStatus,
      runRevision: input.workflow.runRevision,
      jobId: input.workflow.jobId,
      jobStatus: input.workflow.jobStatus,
      jobRevision: input.workflow.jobRevision,
      sanitizedFailureCode: input.workflow.sanitizedFailureCode,
    },
    validation: { items: [...input.validations] },
    review: {
      requiredGates: [...input.requiredReviewGates],
      approvals: input.approvals.map((approval) => ({
        approvalId: approval.approvalId,
        gate: approval.gate,
        decision: approval.decision,
        state: approval.state,
        boundFingerprint: approval.boundFingerprint,
        stale: approval.stale ?? false,
      })),
    },
    render: {
      status: input.render.status,
      renderArtifactHashes: [...input.render.renderArtifactHashes],
    },
    localization: { variants: [...input.localizationVariants] },
    publication: {
      readiness: input.publication.readiness,
      activePublicationId: input.publication.activePublicationId,
      publicationStatus: input.publication.publicationStatus,
      publishReady: input.publication.publishReady,
    },
    blockers,
    warnings,
    actions: buildActions({
      productionRevision: input.productionRevision,
      blockers,
      workflow: input.workflow,
      publication: input.publication,
      validations: input.validations,
    }),
    projectedAt: input.projectedAt,
    projectionInputFingerprint,
  });
}
