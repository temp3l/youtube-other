import type {
  WebhookDeliveryRequest,
  WebhookDeliveryResult,
  WebhookHttpDelivery,
} from "./webhook-delivery.js";

const MAX_RETRY_AGE_MS = 72 * 60 * 60 * 1_000;

export interface DurableWebhookLease {
  readonly workspaceId: string;
  readonly deliveryId: string;
  readonly eventId: string;
  readonly eventPayload: unknown;
  readonly endpointUrl: string;
  readonly secretHandle: string;
  readonly secretVersion: number;
  readonly revision: number;
  readonly attemptCount: number;
  readonly leaseFence: number;
  readonly createdAt: string;
}

export interface DurableWebhookRepository {
  claimNextDue(input: {
    readonly workspaceId: string;
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<DurableWebhookLease | null>;
  recordAttempt(input: {
    readonly workspaceId: string;
    readonly deliveryId: string;
    readonly expectedRevision: number;
    readonly workerId: string;
    readonly leaseFence: number;
    readonly outcome: "delivered" | "retry" | "dead_letter";
    readonly now: string;
    readonly nextAttemptAt?: string;
    readonly responseStatus?: number;
    readonly error?: string;
  }): Promise<unknown | null>;
}

export interface WebhookSigningSecretResolver {
  resolve(input: {
    readonly workspaceId: string;
    readonly handle: string;
    readonly version: number;
  }): Promise<string>;
}

export type DurableWebhookDispatchResult =
  | { readonly kind: "idle" }
  | { readonly kind: "delivered"; readonly deliveryId: string }
  | { readonly kind: "rescheduled"; readonly deliveryId: string }
  | { readonly kind: "dead_letter"; readonly deliveryId: string }
  | { readonly kind: "lost_lease"; readonly deliveryId: string };

export class DurableWebhookWorker {
  private readonly maxRetryAgeMs: number;

  public constructor(
    private readonly repository: DurableWebhookRepository,
    private readonly secrets: WebhookSigningSecretResolver,
    private readonly delivery: Pick<WebhookHttpDelivery, "deliver">,
    private readonly options: {
      readonly workerId: string;
      readonly leaseSeconds: number;
      readonly now: () => Date;
      readonly retryAt: (attempt: number, now: Date) => Date;
      readonly maxRetryAgeMs?: number;
    }
  ) {
    this.maxRetryAgeMs = options.maxRetryAgeMs ?? MAX_RETRY_AGE_MS;
    if (!Number.isSafeInteger(options.leaseSeconds) || options.leaseSeconds < 1)
      throw new Error("Webhook worker lease duration must be positive.");
    if (!Number.isSafeInteger(this.maxRetryAgeMs) || this.maxRetryAgeMs < 1 || this.maxRetryAgeMs > MAX_RETRY_AGE_MS)
      throw new Error("Webhook retry age must be positive and no more than 72 hours.");
  }

  public async dispatchOne(workspaceId: string): Promise<DurableWebhookDispatchResult> {
    const claimedAt = this.options.now();
    const lease = await this.repository.claimNextDue({
      workspaceId,
      workerId: this.options.workerId,
      now: claimedAt.toISOString(),
      leaseSeconds: this.options.leaseSeconds,
    });
    if (!lease) return { kind: "idle" };

    let outcome: WebhookDeliveryResult;
    const payload = JSON.stringify(lease.eventPayload);
    if (typeof payload !== "string") {
      outcome = { kind: "terminal", reason: "invalid_endpoint" };
    } else {
      try {
        const secret = await this.secrets.resolve({
          workspaceId: lease.workspaceId,
          handle: lease.secretHandle,
          version: lease.secretVersion,
        });
        if (secret.length === 0) throw new Error("Signing secret is unavailable.");
        const request: WebhookDeliveryRequest = {
          endpointUrl: lease.endpointUrl,
          eventId: lease.eventId,
          payload,
          timestamp: claimedAt.toISOString(),
          attempt: lease.attemptCount + 1,
          secret,
        };
        outcome = await this.delivery.deliver(request);
      } catch {
        outcome = { kind: "retry", reason: "network" };
      }
    }

    const completedAt = this.options.now();
    const retryDeadline = new Date(lease.createdAt).getTime() + this.maxRetryAgeMs;
    let completion: Parameters<DurableWebhookRepository["recordAttempt"]>[0];
    let resultKind: "delivered" | "rescheduled" | "dead_letter";
    if (outcome.kind === "delivered") {
      completion = {
        workspaceId: lease.workspaceId,
        deliveryId: lease.deliveryId,
        expectedRevision: lease.revision,
        workerId: this.options.workerId,
        leaseFence: lease.leaseFence,
        outcome: "delivered",
        responseStatus: outcome.status,
        now: completedAt.toISOString(),
      };
      resultKind = "delivered";
    } else if (outcome.kind === "retry" && completedAt.getTime() < retryDeadline) {
      const proposed = this.options.retryAt(lease.attemptCount + 1, completedAt);
      const nextAttemptAt = new Date(Math.max(completedAt.getTime() + 1, proposed.getTime()));
      if (Number.isFinite(nextAttemptAt.getTime()) && nextAttemptAt.getTime() <= retryDeadline) {
        completion = {
          workspaceId: lease.workspaceId,
          deliveryId: lease.deliveryId,
          expectedRevision: lease.revision,
          workerId: this.options.workerId,
          leaseFence: lease.leaseFence,
          outcome: "retry",
          nextAttemptAt: nextAttemptAt.toISOString(),
          ...(outcome.status === undefined ? {} : { responseStatus: outcome.status }),
          error: "Webhook delivery will be retried.",
          now: completedAt.toISOString(),
        };
        resultKind = "rescheduled";
      } else {
        completion = this.deadLetter(lease, completedAt, outcome.status);
        resultKind = "dead_letter";
      }
    } else {
      completion = this.deadLetter(lease, completedAt, outcome.status);
      resultKind = "dead_letter";
    }

    const recorded = await this.repository.recordAttempt(completion);
    return recorded === null
      ? { kind: "lost_lease", deliveryId: lease.deliveryId }
      : { kind: resultKind, deliveryId: lease.deliveryId };
  }

  private deadLetter(
    lease: DurableWebhookLease,
    now: Date,
    status: number | undefined
  ): Parameters<DurableWebhookRepository["recordAttempt"]>[0] {
    return {
      workspaceId: lease.workspaceId,
      deliveryId: lease.deliveryId,
      expectedRevision: lease.revision,
      workerId: this.options.workerId,
      leaseFence: lease.leaseFence,
      outcome: "dead_letter",
      ...(status === undefined ? {} : { responseStatus: status }),
      error: "Webhook delivery is terminal or exceeded its retry window.",
      now: now.toISOString(),
    };
  }
}
