import type {
  ApplicationExecutionContext,
  ApplicationIdempotency,
} from "./contracts.js";

export interface WorkflowPort {
  start(input: {
    readonly execution: ApplicationExecutionContext;
    readonly command: string;
    readonly input: unknown;
  }): Promise<{ readonly workflowRunId: string }>;
  get(input: {
    readonly execution: ApplicationExecutionContext;
    readonly workflowRunId: string;
  }): Promise<unknown | null>;
}

export interface JobPort {
  enqueue(input: {
    readonly execution: ApplicationExecutionContext;
    readonly jobType: string;
    readonly subjectId: string;
  }): Promise<{ readonly jobId: string }>;
}

/** Must atomically persist workflow state, job admission, and outbox intent. */
export interface WorkflowAdmissionPort {
  admit(input: {
    readonly execution: ApplicationExecutionContext;
    readonly command: string;
    readonly input: unknown;
  }): Promise<{ readonly workflowRunId: string; readonly jobId: string; readonly revision: number }>;
}

export interface AssetPort {
  find(input: {
    readonly execution: ApplicationExecutionContext;
    readonly assetId: string;
  }): Promise<unknown | null>;
}

export interface ApprovalPort {
  record(input: {
    readonly execution: ApplicationExecutionContext;
    readonly subjectId: string;
    readonly decision: "approved" | "rejected" | "revoked";
  }): Promise<{ readonly approvalId: string }>;
}

export interface ProviderPort {
  readonly name: string;
}

export interface RenderPort {
  request(input: {
    readonly execution: ApplicationExecutionContext;
    readonly renderId: string;
  }): Promise<void>;
}

export interface PublishPort {
  request(input: {
    readonly execution: ApplicationExecutionContext;
    readonly publicationId: string;
  }): Promise<void>;
}

export interface AuditPort {
  append(input: {
    readonly execution: ApplicationExecutionContext;
    readonly action: string;
    readonly subjectId: string;
  }): Promise<void>;
}

export interface UsagePort {
  record(input: {
    readonly execution: ApplicationExecutionContext;
    readonly dimension: string;
    readonly quantity: number;
  }): Promise<void>;
}

export interface ClockPort {
  now(): Date;
}

export interface IdPort {
  create(prefix: string): string;
}

export interface IdempotencyPort {
  replay(input: {
    readonly execution: ApplicationExecutionContext;
    readonly idempotency: ApplicationIdempotency;
  }): Promise<unknown | null>;
}

export interface ApplicationPorts {
  readonly workflows: WorkflowPort;
  readonly jobs: JobPort;
  readonly admissions: WorkflowAdmissionPort;
  readonly assets: AssetPort;
  readonly approvals: ApprovalPort;
  readonly providers: readonly ProviderPort[];
  readonly renderer: RenderPort;
  readonly publisher: PublishPort;
  readonly audit: AuditPort;
  readonly usage: UsagePort;
  readonly clock: ClockPort;
  readonly ids: IdPort;
  readonly idempotency: IdempotencyPort;
}
