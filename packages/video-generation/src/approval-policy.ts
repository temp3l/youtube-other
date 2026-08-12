import {
  APPROVAL_SCHEMA_VERSION,
  approvalRecordSchema,
  type ApprovalRecord,
} from "@mediaforge/domain";

import {
  VIDEO_GENERATION_APPROVAL_GATE,
  type VideoGenerationRequest,
} from "./contracts.js";

export type VideoGenerationApprovalErrorCode =
  | "VIDEO_APPROVAL_MISSING"
  | "VIDEO_APPROVAL_REJECTED"
  | "VIDEO_APPROVAL_EXPIRED"
  | "VIDEO_APPROVAL_REVISION_MISMATCH"
  | "VIDEO_APPROVAL_INPUT_MISMATCH";

export class VideoGenerationApprovalError extends Error {
  public constructor(
    public readonly code: VideoGenerationApprovalErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VideoGenerationApprovalError";
  }
}

export type VideoGenerationDispatchContext = {
  readonly workflowInstanceId: string;
  readonly taskId: string;
  readonly approvals: readonly ApprovalRecord[];
  readonly evaluatedAt: string;
};

function parseApproval(value: ApprovalRecord): ApprovalRecord {
  return approvalRecordSchema.parse(value);
}

function latestApprovedRecord(
  approvals: readonly ApprovalRecord[]
): ApprovalRecord | undefined {
  const approved = approvals
    .filter((record) => record.decision === "approved")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latest = approved.at(-1);
  if (!latest) return undefined;

  const superseded = new Set(
    approvals
      .map((record) => record.supersedesApprovalId)
      .filter((value): value is string => value !== undefined)
  );
  if (superseded.has(latest.id)) return undefined;
  if (
    approvals.some(
      (record) =>
        record.decision !== "approved" &&
        record.createdAt > latest.createdAt &&
        record.supersedesApprovalId === latest.id
    )
  ) {
    return undefined;
  }
  return latest;
}

export function assertVideoGenerationApproval(input: {
  readonly request: VideoGenerationRequest;
  readonly dispatchContext: VideoGenerationDispatchContext;
  readonly inputArtifactHashes: readonly string[];
}): ApprovalRecord {
  const approvals = input.dispatchContext.approvals.map(parseApproval);
  const approved = latestApprovedRecord(approvals);
  if (!approved) {
    throw new VideoGenerationApprovalError(
      "VIDEO_APPROVAL_MISSING",
      `Approved ${VIDEO_GENERATION_APPROVAL_GATE} gate is required before video generation dispatch.`
    );
  }
  if (
    approved.expiresAt &&
    approved.expiresAt <= input.dispatchContext.evaluatedAt
  ) {
    throw new VideoGenerationApprovalError(
      "VIDEO_APPROVAL_EXPIRED",
      "Video generation approval has expired."
    );
  }
  if (approved.boundRevision !== input.request.shotPlanRevisionId) {
    throw new VideoGenerationApprovalError(
      "VIDEO_APPROVAL_REVISION_MISMATCH",
      "Video generation approval is not bound to the current shot plan revision."
    );
  }
  const scope = approved.scope;
  if (!scope || scope.gate !== VIDEO_GENERATION_APPROVAL_GATE) {
    throw new VideoGenerationApprovalError(
      "VIDEO_APPROVAL_MISSING",
      `Approval scope must include the ${VIDEO_GENERATION_APPROVAL_GATE} gate.`
    );
  }
  const expectedInputs = [...input.inputArtifactHashes].sort().join("\n");
  const scopedInputs = [...scope.inputArtifactHashes].sort().join("\n");
  if (expectedInputs !== scopedInputs) {
    throw new VideoGenerationApprovalError(
      "VIDEO_APPROVAL_INPUT_MISMATCH",
      "Video generation approval input artifact hashes do not match the request."
    );
  }
  if (
    approvals.some(
      (record) =>
        record.decision === "rejected" &&
        record.createdAt >= approved.createdAt &&
        record.taskId === input.dispatchContext.taskId
    )
  ) {
    throw new VideoGenerationApprovalError(
      "VIDEO_APPROVAL_REJECTED",
      "A later rejection blocks video generation dispatch."
    );
  }
  return approved;
}
