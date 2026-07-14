import { describe, expect, it } from "vitest";

import {
  WORKFLOW_ERROR_CODES,
  type WorkflowErrorCode,
} from "@mediaforge/domain";

import {
  ERROR_EXIT_CODE_MAP,
  WORKFLOW_EXIT_CODES,
  WorkflowApprovalError,
  WorkflowConflictError,
  WorkflowInputError,
  WorkflowInterruptedError,
  WorkflowPermanentFailureError,
  WorkflowProviderRetriesExhaustedError,
  errorCodeToExitCode,
  errorToExitCode,
  normalizeWorkflowError,
} from "./index.js";

describe("workflow error taxonomy", () => {
  it("maps every registered error code to a stable exit code", () => {
    expect(Object.keys(ERROR_EXIT_CODE_MAP).sort()).toEqual(
      [...WORKFLOW_ERROR_CODES].sort()
    );
    for (const code of WORKFLOW_ERROR_CODES) {
      expect(errorCodeToExitCode(code)).toBe(ERROR_EXIT_CODE_MAP[code]);
    }
  });

  it.each([
    [
      new WorkflowInputError("bad input"),
      WORKFLOW_EXIT_CODES.INPUT_OR_CONFIGURATION,
    ],
    [
      new WorkflowApprovalError("approval missing"),
      WORKFLOW_EXIT_CODES.APPROVAL_OR_MINOR_EDITS,
    ],
    [
      new WorkflowProviderRetriesExhaustedError("rate limited"),
      WORKFLOW_EXIT_CODES.TRANSIENT_PROVIDER_EXHAUSTED,
    ],
    [
      new WorkflowConflictError("LOCK_CONFLICT", "locked"),
      WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT,
    ],
    [
      new WorkflowPermanentFailureError(
        "ARTIFACT_VALIDATION_FAILED",
        "corrupt",
        "Regenerate it."
      ),
      WORKFLOW_EXIT_CODES.PERMANENT_OR_ARTIFACT_FAILURE,
    ],
    [new WorkflowInterruptedError(), WORKFLOW_EXIT_CODES.INTERRUPTED],
  ])("maps typed errors to exit semantics", (error, expectedExitCode) => {
    expect(errorToExitCode(error)).toBe(expectedExitCode);
  });

  it("normalizes legacy named errors without importing legacy implementations", () => {
    const legacy = new Error("Credentials are missing.");
    legacy.name = "ProviderAuthenticationError";
    Object.assign(legacy, {
      retryable: false,
      remediation: "Configure provider credentials.",
    });

    expect(normalizeWorkflowError(legacy)).toMatchObject({
      code: "PROVIDER_PERMANENT_FAILURE",
      retryable: false,
      remediation: "Configure provider credentials.",
      causeName: "ProviderAuthenticationError",
    });
  });

  it("fails closed for unknown errors", () => {
    const normalized = normalizeWorkflowError(new Error("surprise"));
    expect(normalized.code).toBe("UNEXPECTED_FAILURE");
    expect(errorToExitCode(new Error("surprise"))).toBe(
      WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT
    );
  });

  it("keeps the mapping exhaustive at the type boundary", () => {
    const codes: readonly WorkflowErrorCode[] = WORKFLOW_ERROR_CODES;
    expect(codes).toContain("INTERRUPTED");
  });
});
