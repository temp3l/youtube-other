import { describe, expect, it, vi } from "vitest";

import {
  parseDurableWebhookProcessEnvironment,
  runDurableWebhookProcess,
} from "./webhook-process.js";

describe("durable webhook process", () => {
  it("parses bounded role settings and derives a worker identity", () => {
    expect(
      parseDurableWebhookProcessEnvironment(
        { MEDIAFORGE_WEBHOOK_WORKSPACE_ID: "workspace-1" },
        { hostname: "host-a", pid: 42 }
      )
    ).toEqual({
      workspaceId: "workspace-1",
      workerId: "webhook-host-a-42",
      pollIntervalMs: 1_000,
      leaseSeconds: 60,
    });
  });

  it("drains ready work and sleeps only when idle", async () => {
    const controller = new AbortController();
    const dispatchOne = vi
      .fn()
      .mockResolvedValueOnce({ kind: "delivered", deliveryId: "delivery-1" })
      .mockResolvedValueOnce({ kind: "idle" });
    const sleep = vi.fn(async () => controller.abort());

    await runDurableWebhookProcess({
      worker: { dispatchOne },
      workspaceId: "workspace-1",
      signal: controller.signal,
      pollIntervalMs: 50,
      sleep,
    });

    expect(dispatchOne).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50, controller.signal);
  });

  it("rejects missing workspace scope and unsafe polling bounds", () => {
    expect(() => parseDurableWebhookProcessEnvironment({})).toThrow();
    expect(() =>
      parseDurableWebhookProcessEnvironment({
        MEDIAFORGE_WEBHOOK_WORKSPACE_ID: "workspace-1",
        MEDIAFORGE_WEBHOOK_POLL_INTERVAL_MS: "1",
      })
    ).toThrow();
  });

  it("does not claim work after shutdown and rejects unsafe direct polling input", async () => {
    const controller = new AbortController();
    controller.abort();
    const dispatchOne = vi.fn();
    await runDurableWebhookProcess({
      worker: { dispatchOne },
      workspaceId: "workspace-1",
      signal: controller.signal,
      pollIntervalMs: 50,
    });
    expect(dispatchOne).not.toHaveBeenCalled();

    await expect(runDurableWebhookProcess({
      worker: { dispatchOne },
      workspaceId: "workspace-1",
      signal: new AbortController().signal,
      pollIntervalMs: 1,
    })).rejects.toThrow(/poll interval/u);
  });
});
