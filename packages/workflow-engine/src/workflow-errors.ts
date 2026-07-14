import {
  ERROR_SCHEMA_VERSION,
  normalizedWorkflowErrorSchema,
  type NormalizedWorkflowError,
  type WorkflowErrorCode,
} from "@mediaforge/domain";

export const WORKFLOW_ENGINE_VERSION = "0.1.0" as const;

export const WORKFLOW_EXIT_CODES = {
  SUCCESS: 0,
  INPUT_OR_CONFIGURATION: 1,
  APPROVAL_OR_MINOR_EDITS: 2,
  BLOCKED_OR_PARTIAL_BATCH: 3,
  TRANSIENT_PROVIDER_EXHAUSTED: 4,
  WORKFLOW_CONFLICT: 5,
  PERMANENT_OR_ARTIFACT_FAILURE: 6,
  INTERRUPTED: 130,
} as const;

export type WorkflowExitCode =
  (typeof WORKFLOW_EXIT_CODES)[keyof typeof WORKFLOW_EXIT_CODES];

export const ERROR_EXIT_CODE_MAP = {
  INPUT_INVALID: WORKFLOW_EXIT_CODES.INPUT_OR_CONFIGURATION,
  CONFIGURATION_INVALID: WORKFLOW_EXIT_CODES.INPUT_OR_CONFIGURATION,
  APPROVAL_REQUIRED: WORKFLOW_EXIT_CODES.APPROVAL_OR_MINOR_EDITS,
  QUALITY_MINOR_EDITS_REQUIRED: WORKFLOW_EXIT_CODES.APPROVAL_OR_MINOR_EDITS,
  WORKFLOW_BLOCKED: WORKFLOW_EXIT_CODES.BLOCKED_OR_PARTIAL_BATCH,
  BATCH_PARTIAL_FAILURE: WORKFLOW_EXIT_CODES.BLOCKED_OR_PARTIAL_BATCH,
  PROVIDER_RETRIES_EXHAUSTED: WORKFLOW_EXIT_CODES.TRANSIENT_PROVIDER_EXHAUSTED,
  WORKFLOW_CONFLICT: WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT,
  LOCK_CONFLICT: WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT,
  PERSISTENCE_CONFLICT: WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT,
  CACHE_CONFLICT: WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT,
  PROVIDER_PERMANENT_FAILURE: WORKFLOW_EXIT_CODES.PERMANENT_OR_ARTIFACT_FAILURE,
  ARTIFACT_VALIDATION_FAILED: WORKFLOW_EXIT_CODES.PERMANENT_OR_ARTIFACT_FAILURE,
  INTERRUPTED: WORKFLOW_EXIT_CODES.INTERRUPTED,
  UNEXPECTED_FAILURE: WORKFLOW_EXIT_CODES.WORKFLOW_CONFLICT,
} as const satisfies Record<WorkflowErrorCode, WorkflowExitCode>;

export interface WorkflowEngineErrorOptions {
  readonly retryable: boolean;
  readonly remediation: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly cause?: unknown;
}

export class WorkflowEngineError extends Error {
  public readonly retryable: boolean;
  public readonly remediation: string;
  public readonly taskId: string | undefined;
  public readonly attemptId: string | undefined;

  public constructor(
    public readonly code: WorkflowErrorCode,
    message: string,
    options: WorkflowEngineErrorOptions
  ) {
    super(message, { cause: options.cause });
    this.name = "WorkflowEngineError";
    this.retryable = options.retryable;
    this.remediation = options.remediation;
    this.taskId = options.taskId;
    this.attemptId = options.attemptId;
  }
}

export class WorkflowInputError extends WorkflowEngineError {
  public constructor(
    message: string,
    remediation = "Correct the input and retry.",
    cause?: unknown
  ) {
    super("INPUT_INVALID", message, { retryable: false, remediation, cause });
    this.name = "WorkflowInputError";
  }
}

export class WorkflowApprovalError extends WorkflowEngineError {
  public constructor(
    message: string,
    remediation = "Record a current attributable approval."
  ) {
    super("APPROVAL_REQUIRED", message, { retryable: false, remediation });
    this.name = "WorkflowApprovalError";
  }
}

export class WorkflowBlockedError extends WorkflowEngineError {
  public constructor(
    message: string,
    remediation = "Resolve the blocking prerequisite."
  ) {
    super("WORKFLOW_BLOCKED", message, { retryable: false, remediation });
    this.name = "WorkflowBlockedError";
  }
}

export class WorkflowProviderRetriesExhaustedError extends WorkflowEngineError {
  public constructor(
    message: string,
    remediation = "Retry after the provider recovers."
  ) {
    super("PROVIDER_RETRIES_EXHAUSTED", message, {
      retryable: true,
      remediation,
    });
    this.name = "WorkflowProviderRetriesExhaustedError";
  }
}

export class WorkflowConflictError extends WorkflowEngineError {
  public constructor(
    code: Extract<
      WorkflowErrorCode,
      | "WORKFLOW_CONFLICT"
      | "LOCK_CONFLICT"
      | "PERSISTENCE_CONFLICT"
      | "CACHE_CONFLICT"
    >,
    message: string,
    remediation = "Reconcile workflow state before retrying."
  ) {
    super(code, message, { retryable: false, remediation });
    this.name = "WorkflowConflictError";
  }
}

export class WorkflowPermanentFailureError extends WorkflowEngineError {
  public constructor(
    code: Extract<
      WorkflowErrorCode,
      "PROVIDER_PERMANENT_FAILURE" | "ARTIFACT_VALIDATION_FAILED"
    >,
    message: string,
    remediation: string
  ) {
    super(code, message, { retryable: false, remediation });
    this.name = "WorkflowPermanentFailureError";
  }
}

export class WorkflowInterruptedError extends WorkflowEngineError {
  public constructor(message = "Workflow execution was interrupted.") {
    super("INTERRUPTED", message, {
      retryable: true,
      remediation: "Resume the interrupted workflow when ready.",
    });
    this.name = "WorkflowInterruptedError";
  }
}

const legacyErrorCodeByName = {
  ValidationError: "INPUT_INVALID",
  ConfigurationError: "CONFIGURATION_INVALID",
  UnsupportedSourceError: "INPUT_INVALID",
  SourceAcquisitionError: "ARTIFACT_VALIDATION_FAILED",
  ProviderAuthenticationError: "PROVIDER_PERMANENT_FAILURE",
  ProviderRateLimitError: "PROVIDER_RETRIES_EXHAUSTED",
  ProviderResponseError: "PROVIDER_PERMANENT_FAILURE",
  ProcessExecutionError: "PROVIDER_RETRIES_EXHAUSTED",
  MediaValidationError: "ARTIFACT_VALIDATION_FAILED",
  ArtifactNotFoundError: "ARTIFACT_VALIDATION_FAILED",
  PipelineInvariantError: "WORKFLOW_CONFLICT",
  HumanActionRequiredError: "APPROVAL_REQUIRED",
} as const satisfies Record<string, WorkflowErrorCode>;

type LegacyErrorName = keyof typeof legacyErrorCodeByName;

function isLegacyErrorName(name: string): name is LegacyErrorName {
  return Object.hasOwn(legacyErrorCodeByName, name);
}

function propertyString(value: object, property: string): string | undefined {
  const candidate = Reflect.get(value, property);
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : undefined;
}

function propertyBoolean(value: object, property: string): boolean | undefined {
  const candidate = Reflect.get(value, property);
  return typeof candidate === "boolean" ? candidate : undefined;
}

export function normalizeWorkflowError(
  error: unknown
): NormalizedWorkflowError {
  if (error instanceof WorkflowEngineError) {
    return normalizedWorkflowErrorSchema.parse({
      schemaVersion: ERROR_SCHEMA_VERSION,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      remediation: error.remediation,
      taskId: error.taskId,
      attemptId: error.attemptId,
      causeName: error.cause instanceof Error ? error.cause.name : undefined,
    });
  }

  if (error instanceof Error && isLegacyErrorName(error.name)) {
    return normalizedWorkflowErrorSchema.parse({
      schemaVersion: ERROR_SCHEMA_VERSION,
      code: legacyErrorCodeByName[error.name],
      message: error.message,
      retryable: propertyBoolean(error, "retryable") ?? false,
      remediation:
        propertyString(error, "remediation") ??
        "Inspect the failure and retry when safe.",
      causeName: error.name,
    });
  }

  return normalizedWorkflowErrorSchema.parse({
    schemaVersion: ERROR_SCHEMA_VERSION,
    code: "UNEXPECTED_FAILURE",
    message:
      error instanceof Error
        ? error.message
        : "An unexpected workflow failure occurred.",
    retryable: false,
    remediation:
      "Inspect the workflow attempt and reconcile state before retrying.",
    causeName: error instanceof Error ? error.name : undefined,
  });
}

export function errorCodeToExitCode(code: WorkflowErrorCode): WorkflowExitCode {
  return ERROR_EXIT_CODE_MAP[code];
}

export function errorToExitCode(error: unknown): WorkflowExitCode {
  return errorCodeToExitCode(normalizeWorkflowError(error).code);
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected contract variant: ${String(value)}`);
}
