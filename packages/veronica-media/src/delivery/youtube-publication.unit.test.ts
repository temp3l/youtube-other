import { deliveryBundleSchema } from "@mediaforge/metadata/delivery-bundle";
import { describe, expect, it } from "vitest";

import { planVeronicaYoutubePublication } from "./youtube-publication.js";

const digest = (character: string) => character.repeat(64);

function deliveryBundle() {
  return deliveryBundleSchema.parse({
    schemaVersion: "delivery-bundle.v1",
    contentProfileId: "veronicabenini",
    bundleId: "delivery-bundle-aaaaaaaaaaaaaaaa",
    episodeId: "episode-001",
    productionRevisionId: "production-001",
    locale: "it",
    metadataRevisionId: "metadata-bbbbbbbbbbbbbbbb",
    metadata: {
      title: "Titolo",
      description: "Descrizione",
      tags: ["storia"],
      chapters: [{ startSeconds: 0, title: "Inizio" }],
    },
    files: {
      render: { artifactId: "render-001", relativePath: "it/final.mp4", fingerprint: digest("a") },
    },
    effectiveConfigurationHash: digest("b"),
    dependencyIdentity: { render: digest("a") },
    provenance: {
      source: "approved-revision-artifacts",
      localeEditionId: "locale-edition-001",
      localeEditionFingerprint: digest("c"),
      renderDerivativeId: "render-001",
      renderDerivativeFingerprint: digest("a"),
    },
    approval: {
      state: "approved",
      approvalIds: ["approval-one", "approval-two"],
      boundRevision: "production-001",
    },
    reuseRationale: "new-content",
    regenerationRationale: "new-delivery-bundle",
    visualsInvalidated: false,
    execution: { state: "planned", providerDispatchEnabled: false, publicationEnabled: false },
    fingerprint: digest("d"),
  });
}

describe("Veronica YouTube publication adapter", () => {
  it("creates a canonical provider-free intent from the exact approved bundle", () => {
    const result = planVeronicaYoutubePublication({
      deliveryBundle: deliveryBundle(),
      target: {
        channelId: "channel-001",
        accountId: "account-001",
        visibility: "private",
        playlistIds: ["playlist-001"],
      },
      authorization: {
        actorId: "operator-001",
        allowed: true,
        permissions: ["publication.execute"],
      },
      idempotency: { key: "publish-request-001" },
    });

    expect(result.intent.contentProfileId).toBe("veronicabenini");
    expect(result.intent.deliveryBundleFingerprint).toBe(deliveryBundle().fingerprint);
    expect(result.intent.providerDispatchEnabled).toBe(false);
  });

  it("rejects a bundle whose approval is not bound to its production revision", () => {
    const bundle = deliveryBundle();
    expect(() => planVeronicaYoutubePublication({
      deliveryBundle: { ...bundle, approval: { ...bundle.approval, boundRevision: "production-002" } },
      target: { channelId: "channel-001", accountId: "account-001", visibility: "private", playlistIds: ["playlist-001"] },
      authorization: { actorId: "operator-001", allowed: true, permissions: ["publication.execute"] },
      idempotency: { key: "publish-request-001" },
    })).toThrow("VERONICA_PUBLICATION_APPROVAL_REQUIRED");
  });
});
