import { describe, expect, it, vi } from "vitest";

import {
  buildTikTokDirectPostEffectReference,
  evaluateRetryAdmission,
} from "@mediaforge/domain";

import {
  FixtureTikTokPublishStatusAdapter,
  TikTokStatusReconciliationService,
  auditTikTokStatusReconciliation,
} from "./tiktok-status-reconciliation-service.js";

const QUERIED_AT = "2026-08-12T10:00:00.000Z";

const binding = {
  provider: "tiktok" as const,
  providerAccountId: "tiktok.account.en-us",
  credentialVersion: "cred.v1",
  episodeId: "episode.e001",
  episodeRevisionId: "episode.e001.rev1",
  locale: "en-US",
  renderHash: "b".repeat(64),
  metadataRevisionId: "metadata.rev1",
  consentRevisionId: "consent.rev1",
  exportApprovalRevisionId: "export.rev1",
  privacy: "private" as const,
  interactionSettings: {
    allowComments: false,
    allowDuet: false,
    allowStitch: false,
  },
  aiContentDeclared: true,
  commercialContentDeclared: false,
};

function uncertainEffect(publishId = "publish.001") {
  return buildTikTokDirectPostEffectReference({
    effectId: "effect.001",
    initRequest: {
      schemaVersion: "mediaforge.tiktok-direct-post.v1",
      attemptId: "attempt.001",
      intentId: "intent.001",
      idempotencyKey: "idempotency.001",
      attemptFence: 1,
      binding,
      metadataRevisionId: "metadata.rev1",
      requestedAt: QUERIED_AT,
    },
    initResponse: {
      schemaVersion: "mediaforge.tiktok-direct-post.v1",
      publishId,
      providerCorrelation: {
        requestId: "provider.request.001",
        correlationId: "provider.correlation.001",
      },
      initializedAt: QUERIED_AT,
    },
    dispatchOutcome: "outcome_uncertain",
    recordedAt: QUERIED_AT,
  });
}

describe("TikTok status reconciliation service", () => {
  it("uses the fake adapter for bounded read-only status recovery", async () => {
    const adapter = new FixtureTikTokPublishStatusAdapter(
      new Map([
        [
          "publish.001",
          [
            { kind: "status", providerStatus: "PROCESSING_UPLOAD" },
            {
              kind: "status",
              providerStatus: "PUBLISH_COMPLETE",
              publicVideoId: "video.001",
            },
          ],
        ],
      ])
    );
    const service = new TikTokStatusReconciliationService({ adapter });
    const effect = uncertainEffect();

    const first = await service.reconcileUncertainEffect({
      effect,
      pollAttempt: 1,
      reconciledAt: QUERIED_AT,
    });
    expect(first.kind).toBe("still_uncertain");

    const second = await service.reconcileUncertainEffect({
      effect,
      pollAttempt: 2,
      reconciledAt: "2026-08-12T10:01:00.000Z",
    });
    expect(second.kind).toBe("published");
    expect(adapter.queries).toHaveLength(2);
    expect(adapter.queries[0]?.recoveryIdentity).toBe(effect.recoveryIdentity);
  });

  it("honors Retry-After without overlapping reconciliation retries", async () => {
    const adapter = new FixtureTikTokPublishStatusAdapter(
      new Map([
        [
          "publish.001",
          [{ kind: "rate_limited", retryAfter: "60" }],
        ],
      ])
    );
    const service = new TikTokStatusReconciliationService({ adapter });
    const decision = await service.reconcileUncertainEffect({
      effect: uncertainEffect(),
      pollAttempt: 1,
      reconciledAt: QUERIED_AT,
    });

    expect(decision.kind).toBe("throttled");
    if (decision.kind !== "throttled") {
      throw new Error("expected throttled decision");
    }
    expect(decision.nextEligibleAt).toBe("2026-08-12T10:01:00.000Z");
    expect(
      evaluateRetryAdmission({
        intentState: "outcome_uncertain",
        attemptState: "outcome_uncertain",
        outcomeState: "outcome_uncertain",
      }).allowed
    ).toBe(false);
  });

  it("records audit evidence for reconciliation without provider secrets", async () => {
    const adapter = new FixtureTikTokPublishStatusAdapter(
      new Map([
        [
          "publish.001",
          [
            {
              kind: "status",
              providerStatus: "PUBLISH_COMPLETE",
              publicVideoId: "video.001",
            },
          ],
        ],
      ])
    );
    const service = new TikTokStatusReconciliationService({ adapter });
    const append = vi.fn(async () => undefined);
    const decision = await service.reconcileUncertainEffect({
      effect: uncertainEffect(),
      pollAttempt: 1,
      reconciledAt: QUERIED_AT,
    });
    await auditTikTokStatusReconciliation({
      decision,
      audit: { append },
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tiktok.status.reconciled",
        effectId: "effect.001",
      })
    );
  });
});
