import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  VeronicaBulkPreflightCoordinator,
  buildVeronicaBulkAggregateReview,
  createVeronicaBulkPreflight,
  type VeronicaBulkPreflightInput,
} from "./bulk-preflight.js";

const hash = (character: string) => character.repeat(64);

function input(
  overrides: Partial<VeronicaBulkPreflightInput> = {}
): VeronicaBulkPreflightInput {
  return {
    profileId: "strategic-reinvention",
    operation: "veronica.production",
    limits: {
      concurrency: 2,
      rateLimitPerSecond: 3,
      maxItems: 5,
      maxEstimatedCostMicros: 100,
    },
    items: [
      {
        key: "episode-a",
        taskId: "veronica.production",
        unitId: "episode-a",
        locale: "it",
        variant: "full",
        revisionId: "revision-1",
        configurationFingerprint: hash("a"),
        dependencyFingerprint: hash("b"),
        provenanceFingerprint: hash("c"),
        estimatedCostMicros: 25,
        cache: "reusable",
        approval: "approved",
      },
      {
        key: "episode-b",
        taskId: "veronica.production",
        unitId: "episode-b",
        locale: "it",
        variant: "full",
        revisionId: "revision-2",
        configurationFingerprint: hash("d"),
        dependencyFingerprint: hash("e"),
        provenanceFingerprint: hash("f"),
        estimatedCostMicros: 30,
        cache: "stale",
        approval: "not-required",
      },
      {
        key: "episode-c",
        taskId: "veronica.production",
        unitId: "episode-c",
        locale: "it",
        variant: "full",
        revisionId: "revision-3",
        configurationFingerprint: hash("1"),
        dependencyFingerprint: hash("2"),
        provenanceFingerprint: hash("3"),
        estimatedCostMicros: 20,
        cache: "disabled",
        approval: "required",
        failureEvidence: {
          code: "SOURCE_INVALID",
          message: "Source is not approved.",
          remediation: "Approve a corrected source revision.",
          details: { authorization: "Bearer secret", nested: { apiKey: "secret" } },
        },
      },
    ],
    ...overrides,
  };
}

describe("VeronicaBulkPreflightCoordinator", () => {
  it("normalizes the legacy alias and persists isolated, revision-bound preflight evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-preflight-"));
    const coordinator = new VeronicaBulkPreflightCoordinator({
      root,
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });

    const planned = await coordinator.plan(input());

    expect(planned).toMatchObject({
      profileId: "veronicabenini",
      totals: { ready: 1, reusable: 1, blocked: 1, estimatedCostMicros: 30 },
    });
    expect(planned.items.map((item) => item.status)).toEqual([
      "reusable",
      "ready",
      "blocked",
    ]);
    expect(planned.items[2]?.failureEvidence?.details).toEqual({
      authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]" },
    });

    const resumed = await coordinator.resume({
      batchId: planned.batchId,
      authorized: true,
      idempotencyKey: "resume-1",
    });
    expect(resumed).toEqual(planned);
    const idempotent = await new VeronicaBulkPreflightCoordinator({
      root,
      now: () => new Date("2026-08-10T12:00:00.000Z"),
    }).plan(input());
    expect(idempotent).toEqual(planned);
    await expect(new VeronicaBulkPreflightCoordinator({ root }).plan(input({
      limits: { ...input().limits, concurrency: 4 },
    }))).rejects.toThrow("different limits or identity");
    await expect(
      coordinator.store.readAggregateReview(planned.batchId)
    ).resolves.toMatchObject({
      aggregateStatus: "partial",
      episodes: expect.arrayContaining([
        expect.objectContaining({ unitId: "episode-c", status: "blocked" }),
      ]),
    });
  });

  it("fails closed on limits and unauthorized resume before any provider work", async () => {
    expect(() =>
      createVeronicaBulkPreflight(
        input({ limits: { concurrency: 1, maxItems: 2, maxEstimatedCostMicros: 100 } })
      )
    ).toThrow("item count");

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-preflight-"));
    const coordinator = new VeronicaBulkPreflightCoordinator({ root });
    const planned = await coordinator.plan(input());
    await expect(
      coordinator.resume({
        batchId: planned.batchId,
        authorized: false,
        idempotencyKey: "resume-2",
      })
    ).rejects.toThrow("authorization");
  });

  it("keeps every per-episode defect in aggregate review instead of making the batch transactional", () => {
    const preflight = createVeronicaBulkPreflight(input());
    const review = buildVeronicaBulkAggregateReview(preflight);

    expect(review.aggregateStatus).toBe("partial");
    expect(review.episodes).toHaveLength(3);
    expect(review.episodes[2]).toMatchObject({
      unitId: "episode-c",
      failureEvidence: { code: "SOURCE_INVALID" },
    });
  });
});
