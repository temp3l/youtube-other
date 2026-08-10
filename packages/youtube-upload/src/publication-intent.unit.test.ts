import { describe, expect, it, vi } from "vitest";

import {
  auditYoutubePublicationIntent,
  planYoutubePublicationIntent,
  reconcileYoutubePublicationIntent,
} from "./publication-intent.js";

const hash = "a".repeat(64);
const later = new Date(Date.now() + 60_000).toISOString();

function input(overrides: Record<string, unknown> = {}) {
  return {
    contentProfileId: "strategic-reinvention",
    episodeId: "episode-1",
    productionRevisionId: "revision-1",
    locale: "it",
    deliveryBundleId: "delivery-bundle-1",
    deliveryBundleFingerprint: hash,
    effectiveConfigurationHash: hash,
    dependencyIdentity: { render: hash },
    provenance: {
      source: "approved-delivery-bundle" as const,
      localeEditionId: "edition-1",
      localeEditionFingerprint: hash,
      renderDerivativeId: "render-1",
      renderDerivativeFingerprint: hash,
    },
    target: { channelId: "channel-1", accountId: "account-1", visibility: "private" as const, playlistIds: ["playlist-1", "playlist-1"] },
    artifacts: [{ assetId: "render-1", role: "render" as const, contentHash: hash }],
    approval: { approvalIds: ["reviewer-one", "reviewer-two"], boundRevision: "revision-1", artifactHash: hash },
    authorization: { actorId: "operator-1", allowed: true, permissions: ["publication.execute", "publication.schedule"] },
    idempotency: { key: "request-1" },
    ...overrides,
  };
}

describe("generic YouTube publication intent", () => {
  it("normalizes the profile, binds all current revision evidence, and schedules without provider dispatch", async () => {
    const { intent } = planYoutubePublicationIntent(input({ scheduledAt: later }));
    expect(intent.contentProfileId).toBe("veronicabenini");
    expect(intent.state).toBe("scheduled");
    expect(intent.providerDispatchEnabled).toBe(false);
    expect(intent.authorization).toEqual({ actorId: "operator-1", permission: "publication.schedule" });
    expect(intent.idempotency.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(intent.target.playlistIds).toEqual(["playlist-1"]);
    const append = vi.fn(async () => undefined);
    await auditYoutubePublicationIntent(intent, { append });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ action: "publication.scheduled", publicationId: intent.publicationId }));
    const repeat = planYoutubePublicationIntent(input({ scheduledAt: later, previousIntent: intent }));
    expect(repeat.reused).toBe(true);
    expect(repeat.intent.regenerationRationale).toBe("not-regenerated");
  });

  it("fails closed for stale approvals, missing authorization, or non-future schedules", () => {
    expect(() => planYoutubePublicationIntent(input({ approval: { approvalIds: ["reviewer-one", "reviewer-two"], boundRevision: "revision-2", artifactHash: hash } }))).toThrow("YOUTUBE_PUBLICATION_APPROVAL_STALE");
    expect(() => planYoutubePublicationIntent(input({ authorization: { actorId: "operator-1", allowed: false, permissions: [] } }))).toThrow("YOUTUBE_PUBLICATION_AUTHORIZATION_REQUIRED");
    expect(() => planYoutubePublicationIntent(input({ approval: { approvalIds: ["reviewer-one", "reviewer-two"], boundRevision: "revision-1", artifactHash: "b".repeat(64) } }))).toThrow("YOUTUBE_PUBLICATION_APPROVAL_STALE");
    expect(() => planYoutubePublicationIntent(input({ scheduledAt: "2020-01-01T00:00:00.000Z" }))).toThrow("YOUTUBE_PUBLICATION_SCHEDULE_INVALID");
  });

  it("reconciles read-only only when exactly one marker-bound receipt exists", async () => {
    const { intent } = planYoutubePublicationIntent(input());
    const result = await reconcileYoutubePublicationIntent({
      intent,
      client: {
        search: { list: async () => ({ data: { items: [{ id: { videoId: "video-1" } }] } }) },
        videos: { list: async () => ({ data: { items: [{ id: "video-1", snippet: { description: `<!-- mediaforge-publication:${intent.recoveryIdentity} -->`, channelId: "channel-1" }, status: { privacyStatus: "private" } }] } }) },
      },
    });
    expect(result.state).toBe("published");
    expect(result.receipt?.providerObjectId).toBe("video-1");
  });
});
