import { describe, expect, it } from "vitest";

import {
  computePublicationMetadataContentHash,
  evaluateOAuthSessionTenantBinding,
  evaluatePublicationIntentPreflight,
  evaluateScheduleAdmission,
  redactChannelConnectionForApi,
} from "./publication-preparation-lifecycle.js";
import { projectPublishingChannelRecord } from "./publication-preparation-lifecycle.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);
const now = "2026-08-09T12:00:00.000Z";

const baseMetadata = {
  title: "Episode title",
  description: "Episode description",
  tags: ["history"],
  defaultAudioLanguage: "en" as const,
  thumbnailAssetId: "asset-thumbnail-1",
  thumbnailHash: hashD,
};

const basePreflight = {
  episodeId: "episode-1",
  channelId: "channel-1",
  visibility: "private" as const,
  playlistIds: [],
  approvalId: "approval-1",
  approvalRevision: 2,
  approvalArtifactHash: hashC,
  assetHash: hashA,
  artifactBindings: [
    { assetId: "asset-video-1", role: "video", contentHash: hashA },
    { assetId: "asset-thumbnail-1", role: "thumbnail", contentHash: hashD },
  ],
  metadata: baseMetadata,
  captionsRequired: false,
  publishReady: true,
  renderStatus: "succeeded" as const,
  requiredReviewGates: ["publish"],
  activeApprovals: [
    {
      approvalId: "approval-1",
      gate: "publish",
      state: "active" as const,
      boundFingerprint: hashC,
    },
  ],
  validationStatuses: ["passed" as const],
  channelConnectionStatus: "connected" as const,
  schedulePolicy: {
    maxScheduleHorizonHours: 168,
    defaultTimezone: "UTC",
  },
};

describe("publication preparation lifecycle", () => {
  it("binds OAuth callbacks to the initiating tenant and nonce", () => {
    expect(
      evaluateOAuthSessionTenantBinding({
        sessionWorkspaceId: "ws-a",
        callbackWorkspaceId: "ws-b",
        sessionNonce: "nonce-1",
        callbackNonce: "nonce-1",
      }).code
    ).toBe("oauth_workspace_mismatch");
    expect(
      evaluateOAuthSessionTenantBinding({
        sessionWorkspaceId: "ws-a",
        callbackWorkspaceId: "ws-a",
        sessionNonce: "nonce-1",
        callbackNonce: "nonce-2",
      }).code
    ).toBe("oauth_nonce_mismatch");
    expect(
      evaluateOAuthSessionTenantBinding({
        sessionWorkspaceId: "ws-a",
        callbackWorkspaceId: "ws-a",
        sessionNonce: "nonce-1",
        callbackNonce: "nonce-1",
      }).allowed
    ).toBe(true);
  });

  it("fails closed when schedule policy is missing", () => {
    expect(
      evaluateScheduleAdmission({
        scheduledAt: "2026-08-10T12:00:00.000Z",
        now,
        schedulePolicy: null,
      }).code
    ).toBe("schedule_policy_missing");
  });

  it("rejects schedules beyond the configured horizon", () => {
    expect(
      evaluateScheduleAdmission({
        scheduledAt: "2026-09-10T12:00:00.000Z",
        now,
        schedulePolicy: {
          maxScheduleHorizonHours: 24,
          defaultTimezone: "UTC",
        },
      }).code
    ).toBe("schedule_horizon_exceeded");
  });

  it("blocks stale approval hash and missing caption requirements", () => {
    const stale = evaluatePublicationIntentPreflight({
      ...basePreflight,
      approvalArtifactHash: hashB,
    });
    expect(stale.admitted).toBe(false);
    expect(stale.rejections.some((item) => item.code === "approval_stale")).toBe(
      true
    );

    const captions = evaluatePublicationIntentPreflight({
      ...basePreflight,
      captionsRequired: true,
      metadata: baseMetadata,
    });
    expect(captions.admitted).toBe(false);
    expect(captions.rejections.some((item) => item.code === "caption_required")).toBe(
      true
    );
  });

  it("admits publish-ready intents with metadata hash evidence", () => {
    const result = evaluatePublicationIntentPreflight(basePreflight);
    expect(result.admitted).toBe(true);
    expect(result.metadataContentHash).toBe(
      computePublicationMetadataContentHash(baseMetadata)
    );
  });

  it("redacts channel projections without credential material", () => {
    const record = projectPublishingChannelRecord({
      workspaceId: "ws-1",
      channelId: "channel-1",
      displayName: "Main channel",
      connectionStatus: "connected",
      credentialVersion: "credential-v1",
      revision: 1,
      updatedAt: now,
    });
    expect(redactChannelConnectionForApi(record).credentialVersion).toBe(
      "credential-v1"
    );
  });
});
