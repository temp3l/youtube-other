import { describe, expect, it } from "vitest";

import { buildTikTokDirectPostEffectReference } from "@mediaforge/domain";
import { FixtureTikTokPublishStatusAdapter } from "@mediaforge/tiktok-publishing";

import { TikTokStatusReconciliationApplicationService } from "./tiktok-status-reconciliation-service.js";

const QUERIED_AT = "2026-08-12T10:00:00.000Z";

const binding = {
  provider: "tiktok" as const,
  providerAccountId: "tiktok.account.en-us",
  credentialVersion: "cred.v1",
  episodeId: "episode.e001",
  episodeRevisionId: "episode.e001.rev1",
  locale: "en-US",
  renderHash: "c".repeat(64),
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

function uncertainEffect() {
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
      publishId: "publish.001",
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

describe("TikTok status reconciliation application service", () => {
  it("persists reconciliation evidence and receipts without creating a new attempt", async () => {
    const effect = uncertainEffect();
    const savedEvidence = [];
    const savedReceipts = [];
    const service = new TikTokStatusReconciliationApplicationService({
      adapter: new FixtureTikTokPublishStatusAdapter(
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
      ),
      port: {
        getUncertainEffect: (effectId) =>
          effectId === effect.effectId ? effect : null,
        saveReconciliationEvidence: ({ evidence }) => {
          savedEvidence.push(evidence);
          return evidence;
        },
        savePublicationReceipt: ({ receipt }) => {
          savedReceipts.push(receipt);
          return receipt;
        },
      },
    });

    const result = await service.reconcileUncertainEffect({
      effectId: effect.effectId,
      pollAttempt: 1,
      reconciledAt: QUERIED_AT,
    });

    expect(result.nextIntentState).toBe("reconciled");
    expect(result.receipt?.publicVideoId).toBe("video.001");
    expect(savedEvidence).toHaveLength(1);
    expect(savedReceipts).toHaveLength(1);
    expect(savedEvidence[0]?.effectReference.attemptId).toBe(effect.attemptId);
  });
});
