export interface DurableJobLease {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly payload: unknown;
  readonly leaseFence: number;
  readonly leaseOwner: string;
  readonly attemptCount: number;
  readonly deadlineAt: string | null;
  readonly cancellationRequested: boolean;
}

interface FencedJobMutation {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseFence: number;
  readonly now: string;
}

export interface DurableJobRepository {
  claimNextJob(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<DurableJobLease | null>;
  heartbeatJob(
    input: FencedJobMutation & { readonly leaseSeconds: number }
  ): Promise<"renewed" | "cancel_requested" | "lost_lease">;
  completeJob(input: FencedJobMutation): Promise<boolean>;
  failJob(
    input: FencedJobMutation & { readonly error: string }
  ): Promise<boolean>;
  scheduleJobRetry(
    input: FencedJobMutation & {
      readonly error: string;
      readonly nextAttemptAt: string;
      readonly maxAttempts: number;
    }
  ): Promise<"retry_scheduled" | "dead_letter" | "lost_lease">;
  markJobCancelled(input: FencedJobMutation): Promise<boolean>;
}

export type DurableJobHandlerResult =
  | { readonly kind: "succeeded" }
  | { readonly kind: "retryable_failure"; readonly error: string }
  | { readonly kind: "terminal_failure"; readonly error: string };

export interface DurableJobExecutionContext {
  readonly signal: AbortSignal;
  readonly deadlineAt: string | null;
  readonly leaseFence: number;
  readonly attempt: number;
}

export interface DurableJobHandler {
  execute(
    job: Pick<DurableJobLease, "workspaceId" | "jobId" | "jobType" | "payload">,
    context: DurableJobExecutionContext
  ): Promise<DurableJobHandlerResult>;
}

export type DurableJobDispatchResult =
  | { readonly kind: "idle" }
  | { readonly kind: "succeeded"; readonly jobId: string }
  | { readonly kind: "retry_scheduled"; readonly jobId: string }
  | { readonly kind: "dead_letter"; readonly jobId: string }
  | { readonly kind: "failed"; readonly jobId: string }
  | { readonly kind: "cancelled"; readonly jobId: string }
  | { readonly kind: "interrupted"; readonly jobId?: string }
  | { readonly kind: "lost_lease"; readonly jobId: string };

type StopReason =
  | "cancel_requested"
  | "deadline_exceeded"
  | "interrupted"
  | "lost_lease";

function abortableWait(
  milliseconds: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted || milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

function boundedError(error: string): string {
  return error.slice(0, 2_000);
}

/**
 * Claims and executes one job. The repository owns every terminal decision;
 * all writes carry the lease fence, so a late handler can never commit after
 * another worker reclaims the job.
 */
export class DurableJobWorker {
  private readonly heartbeatIntervalMs: number;

  public constructor(
    private readonly repository: DurableJobRepository,
    private readonly handler: DurableJobHandler,
    private readonly options: {
      readonly workerId: string;
      readonly leaseSeconds: number;
      readonly maxAttempts: number;
      readonly now: () => Date;
      readonly retryAt: (attempt: number, now: Date) => Date;
      readonly heartbeatIntervalMs?: number;
      readonly wait?: (
        milliseconds: number,
        signal: AbortSignal
      ) => Promise<void>;
      readonly classifyError?: (
        error: unknown,
        lease: DurableJobLease
      ) => Exclude<DurableJobHandlerResult, { readonly kind: "succeeded" }>;
    }
  ) {
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ??
      Math.max(250, Math.floor((options.leaseSeconds * 1_000) / 3));
    if (options.leaseSeconds <= 0 || options.maxAttempts <= 0)
      throw new Error(
        "Durable job lease seconds and max attempts must be positive."
      );
    if (
      this.heartbeatIntervalMs <= 0 ||
      this.heartbeatIntervalMs >= options.leaseSeconds * 1_000
    )
      throw new Error(
        "Durable job heartbeat interval must be shorter than its lease."
      );
  }

  public async dispatchOne(
    workspaceId: string,
    workerSignal: AbortSignal = new AbortController().signal
  ): Promise<DurableJobDispatchResult> {
    if (workerSignal.aborted) return { kind: "interrupted" };
    const lease = await this.repository.claimNextJob({
      workspaceId,
      workerId: this.options.workerId,
      now: this.options.now().toISOString(),
      leaseSeconds: this.options.leaseSeconds,
    });
    if (!lease) return { kind: "idle" };
    if (lease.cancellationRequested) return this.finishCancellation(lease);

    const execution = new AbortController();
    const monitor = new AbortController();
    let stopReason: StopReason | undefined;
    const stop = (reason: StopReason): void => {
      stopReason ??= reason;
      execution.abort(reason);
    };
    const onWorkerAbort = (): void => {
      stop("interrupted");
      monitor.abort();
    };
    workerSignal.addEventListener("abort", onWorkerAbort, { once: true });

    const monitorPromise = this.monitorLease(lease, monitor.signal, stop);
    let outcome: DurableJobHandlerResult;
    try {
      outcome = await this.handler.execute(
        {
          workspaceId: lease.workspaceId,
          jobId: lease.jobId,
          jobType: lease.jobType,
          payload: lease.payload,
        },
        {
          signal: execution.signal,
          deadlineAt: lease.deadlineAt,
          leaseFence: lease.leaseFence,
          attempt: lease.attemptCount,
        }
      );
    } catch (error) {
      outcome = this.options.classifyError?.(error, lease) ?? {
        kind: "terminal_failure",
        error:
          error instanceof Error
            ? error.message
            : "Unknown job execution failure.",
      };
    } finally {
      monitor.abort();
      workerSignal.removeEventListener("abort", onWorkerAbort);
      await monitorPromise;
    }

    if (stopReason === "lost_lease")
      return { kind: "lost_lease", jobId: lease.jobId };
    if (stopReason === "cancel_requested")
      return this.finishCancellation(lease);
    if (stopReason === "interrupted")
      return { kind: "interrupted", jobId: lease.jobId };
    if (stopReason === "deadline_exceeded")
      outcome = {
        kind: "terminal_failure",
        error: "The durable job deadline expired.",
      };

    return this.persistOutcome(lease, outcome);
  }

  private async monitorLease(
    lease: DurableJobLease,
    signal: AbortSignal,
    stop: (reason: StopReason) => void
  ): Promise<void> {
    const wait = this.options.wait ?? abortableWait;
    const deadline = lease.deadlineAt
      ? new Date(lease.deadlineAt).getTime()
      : null;
    while (!signal.aborted) {
      const now = this.options.now();
      if (deadline !== null && now.getTime() >= deadline) {
        stop("deadline_exceeded");
        return;
      }
      const delay =
        deadline === null
          ? this.heartbeatIntervalMs
          : Math.min(this.heartbeatIntervalMs, deadline - now.getTime());
      await wait(delay, signal);
      if (signal.aborted) return;
      let heartbeat: "renewed" | "cancel_requested" | "lost_lease";
      try {
        heartbeat = await this.repository.heartbeatJob({
          workspaceId: lease.workspaceId,
          jobId: lease.jobId,
          workerId: this.options.workerId,
          leaseFence: lease.leaseFence,
          now: this.options.now().toISOString(),
          leaseSeconds: this.options.leaseSeconds,
        });
      } catch {
        // Database authority cannot be proven, so provider/process work must stop.
        stop("lost_lease");
        return;
      }
      if (heartbeat === "lost_lease") {
        stop("lost_lease");
        return;
      }
      if (heartbeat === "cancel_requested") {
        stop("cancel_requested");
        return;
      }
    }
  }

  private fenced(lease: DurableJobLease): FencedJobMutation {
    return {
      workspaceId: lease.workspaceId,
      jobId: lease.jobId,
      workerId: this.options.workerId,
      leaseFence: lease.leaseFence,
      now: this.options.now().toISOString(),
    };
  }

  private async finishCancellation(
    lease: DurableJobLease
  ): Promise<DurableJobDispatchResult> {
    const cancelled = await this.repository.markJobCancelled(
      this.fenced(lease)
    );
    return cancelled
      ? { kind: "cancelled", jobId: lease.jobId }
      : { kind: "lost_lease", jobId: lease.jobId };
  }

  private async persistOutcome(
    lease: DurableJobLease,
    outcome: DurableJobHandlerResult
  ): Promise<DurableJobDispatchResult> {
    if (outcome.kind === "succeeded") {
      const completed = await this.repository.completeJob(this.fenced(lease));
      return completed
        ? { kind: "succeeded", jobId: lease.jobId }
        : { kind: "lost_lease", jobId: lease.jobId };
    }
    if (outcome.kind === "terminal_failure") {
      const failed = await this.repository.failJob({
        ...this.fenced(lease),
        error: boundedError(outcome.error),
      });
      return failed
        ? { kind: "failed", jobId: lease.jobId }
        : { kind: "lost_lease", jobId: lease.jobId };
    }
    const now = this.options.now();
    const retry = await this.repository.scheduleJobRetry({
      ...this.fenced(lease),
      now: now.toISOString(),
      error: boundedError(outcome.error),
      nextAttemptAt: this.options
        .retryAt(lease.attemptCount, now)
        .toISOString(),
      maxAttempts: this.options.maxAttempts,
    });
    return retry === "lost_lease"
      ? { kind: "lost_lease", jobId: lease.jobId }
      : { kind: retry, jobId: lease.jobId };
  }
}
