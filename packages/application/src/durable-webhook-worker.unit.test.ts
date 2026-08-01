import { describe, expect, it, vi } from "vitest";

import {
  DurableWebhookWorker,
  type DurableWebhookLease,
  type DurableWebhookRepository,
} from "./durable-webhook-worker.js";

const lease: DurableWebhookLease = {
  workspaceId: "workspace-1",
  deliveryId: "delivery-1",
  eventId: "event-1",
  eventPayload: { id: "event-1" },
  endpointUrl: "https://hooks.example.test/mediaforge",
  secretHandle: "kms/webhooks/endpoint-1/2",
  secretVersion: 2,
  revision: 3,
  attemptCount: 1,
  leaseFence: 7,
  createdAt: "2026-08-01T12:00:00.000Z",
};

function repository(claim: DurableWebhookLease | null = lease): DurableWebhookRepository {
  return {
    claimNextDue: vi.fn(async () => claim),
    recordAttempt: vi.fn(async () => ({ recorded: true })),
  };
}

function worker(input: {
  readonly repository?: DurableWebhookRepository;
  readonly deliveryResult?: { readonly kind: "delivered"; readonly status: number } | { readonly kind: "retry"; readonly reason: "network" } | { readonly kind: "terminal"; readonly reason: "http_status"; readonly status: number };
  readonly now?: readonly Date[];
  readonly resolve?: () => Promise<string>;
} = {}) {
  const repo = input.repository ?? repository();
  const times = [...(input.now ?? [new Date("2026-08-01T12:01:00.000Z"), new Date("2026-08-01T12:01:01.000Z")])];
  const resolve = vi.fn(input.resolve ?? (async () => "signing-secret"));
  const deliver = vi.fn(async () => input.deliveryResult ?? { kind: "delivered" as const, status: 204 });
  return {
    repo,
    resolve,
    deliver,
    instance: new DurableWebhookWorker(repo, { resolve }, { deliver }, {
      workerId: "webhook-worker-1",
      leaseSeconds: 60,
      now: () => times.shift() ?? new Date("2026-08-01T12:01:01.000Z"),
      retryAt: (_attempt, now) => new Date(now.getTime() + 60_000),
    }),
  };
}

describe("durable webhook worker", () => {
  it("is idle when no due delivery can be claimed", async () => {
    const runtime = worker({ repository: repository(null) });
    await expect(runtime.instance.dispatchOne("workspace-1")).resolves.toEqual({ kind: "idle" });
    expect(runtime.resolve).not.toHaveBeenCalled();
  });

  it("resolves the secret handle, delivers, and completes with the claim fence", async () => {
    const runtime = worker();
    await expect(runtime.instance.dispatchOne("workspace-1")).resolves.toEqual({ kind: "delivered", deliveryId: "delivery-1" });
    expect(runtime.resolve).toHaveBeenCalledWith({ workspaceId: "workspace-1", handle: lease.secretHandle, version: 2 });
    expect(runtime.deliver).toHaveBeenCalledWith(expect.objectContaining({ eventId: "event-1", attempt: 2, secret: "signing-secret" }));
    expect(runtime.repo.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: "delivered", workerId: "webhook-worker-1", leaseFence: 7, expectedRevision: 3 }));
  });

  it("reschedules transient delivery within the bounded retry window", async () => {
    const runtime = worker({ deliveryResult: { kind: "retry", reason: "network" } });
    await expect(runtime.instance.dispatchOne("workspace-1")).resolves.toEqual({ kind: "rescheduled", deliveryId: "delivery-1" });
    expect(runtime.repo.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "retry",
      nextAttemptAt: "2026-08-01T12:02:01.000Z",
      error: "Webhook delivery will be retried.",
    }));
  });

  it("dead-letters retryable failures once the 72-hour window is exhausted", async () => {
    const runtime = worker({
      deliveryResult: { kind: "retry", reason: "network" },
      now: [new Date("2026-08-04T12:00:00.000Z"), new Date("2026-08-04T12:00:01.000Z")],
    });
    await expect(runtime.instance.dispatchOne("workspace-1")).resolves.toEqual({ kind: "dead_letter", deliveryId: "delivery-1" });
    expect(runtime.repo.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: "dead_letter" }));
  });

  it("never persists secret resolver errors and reports a lost late-worker fence", async () => {
    const repo = repository();
    repo.recordAttempt = vi.fn(async () => null);
    const runtime = worker({
      repository: repo,
      resolve: async () => { throw new Error("vault contained super-secret-value"); },
    });
    await expect(runtime.instance.dispatchOne("workspace-1")).resolves.toEqual({ kind: "lost_lease", deliveryId: "delivery-1" });
    expect(runtime.deliver).not.toHaveBeenCalled();
    expect(repo.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: "retry", error: "Webhook delivery will be retried." }));
    expect(JSON.stringify(vi.mocked(repo.recordAttempt).mock.calls)).not.toContain("super-secret-value");
  });

  it("dead-letters terminal HTTP responses without retrying", async () => {
    const runtime = worker({ deliveryResult: { kind: "terminal", reason: "http_status", status: 400 } });
    await expect(runtime.instance.dispatchOne("workspace-1")).resolves.toEqual({ kind: "dead_letter", deliveryId: "delivery-1" });
    expect(runtime.repo.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ outcome: "dead_letter", responseStatus: 400 }));
  });
});
