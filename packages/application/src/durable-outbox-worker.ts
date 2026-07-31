export interface DurableOutboxLease {
  readonly workspaceId: string;
  readonly outboxId: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly leaseFence: number;
  readonly leaseOwner: string;
  readonly attemptCount: number;
}

export interface DurableOutboxRepository {
  claimNextOutbox(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<DurableOutboxLease | null>;
  markOutboxDelivered(input: {
    readonly workspaceId: string;
    readonly outboxId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
  }): Promise<boolean>;
  rescheduleOutbox(input: {
    readonly workspaceId: string;
    readonly outboxId: string;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly now: string;
    readonly nextAttemptAt: string;
    readonly error: string;
    readonly maxAttempts: number;
  }): Promise<"rescheduled" | "dead_letter" | "lost_lease">;
}

export interface OutboxEventDispatcher {
  dispatch(event: {
    readonly id: string;
    readonly workspaceId: string;
    readonly topic: string;
    readonly payload: unknown;
    readonly attempt: number;
  }): Promise<void>;
}

export type OutboxDispatchResult =
  | { readonly kind: "idle" }
  | { readonly kind: "delivered"; readonly outboxId: string }
  | { readonly kind: "rescheduled"; readonly outboxId: string }
  | { readonly kind: "dead_letter"; readonly outboxId: string }
  | { readonly kind: "lost_lease"; readonly outboxId: string };

/**
 * One worker tick. It intentionally provides at-least-once delivery: a crash
 * after the downstream send but before acknowledgement causes a redelivery,
 * for which the immutable outbox ID is the consumer deduplication key.
 */
export class DurableOutboxWorker {
  public constructor(
    private readonly repository: DurableOutboxRepository,
    private readonly dispatcher: OutboxEventDispatcher,
    private readonly options: {
      readonly workerId: string;
      readonly leaseSeconds: number;
      readonly maxAttempts: number;
      readonly now: () => Date;
      readonly retryAt: (attempt: number, now: Date) => Date;
    }
  ) {}

  public async dispatchOne(workspaceId: string): Promise<OutboxDispatchResult> {
    const startedAt = this.options.now();
    const lease = await this.repository.claimNextOutbox({
      workspaceId,
      workerId: this.options.workerId,
      now: startedAt.toISOString(),
      leaseSeconds: this.options.leaseSeconds,
    });
    if (!lease) return { kind: "idle" };

    try {
      await this.dispatcher.dispatch({
        id: lease.outboxId,
        workspaceId: lease.workspaceId,
        topic: lease.topic,
        payload: lease.payload,
        attempt: lease.attemptCount,
      });
      const acknowledged = await this.repository.markOutboxDelivered({
        workspaceId: lease.workspaceId,
        outboxId: lease.outboxId,
        workerId: this.options.workerId,
        leaseFence: lease.leaseFence,
        now: this.options.now().toISOString(),
      });
      return acknowledged
        ? { kind: "delivered", outboxId: lease.outboxId }
        : { kind: "lost_lease", outboxId: lease.outboxId };
    } catch (error) {
      const now = this.options.now();
      const outcome = await this.repository.rescheduleOutbox({
        workspaceId: lease.workspaceId,
        outboxId: lease.outboxId,
        workerId: this.options.workerId,
        leaseFence: lease.leaseFence,
        now: now.toISOString(),
        nextAttemptAt: this.options.retryAt(lease.attemptCount, now).toISOString(),
        error: error instanceof Error ? error.message : "Unknown outbox delivery failure.",
        maxAttempts: this.options.maxAttempts,
      });
      return outcome === "lost_lease"
        ? { kind: "lost_lease", outboxId: lease.outboxId }
        : { kind: outcome, outboxId: lease.outboxId };
    }
  }
}
