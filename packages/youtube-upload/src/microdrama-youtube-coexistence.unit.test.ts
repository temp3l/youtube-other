import { describe, expect, it, vi } from "vitest";

import { MicrodramaPublicationService } from "../../application/src/microdrama-publication-service.js";
import { MicrodramaYoutubeCoexistenceService } from "../../application/src/microdrama-youtube-coexistence-service.js";
import { FakeMicrodramaPublicationRepository } from "@mediaforge/persistence";
import {
  planMicrodramaYoutubeLocaleMetadataRevision,
  projectMicrodramaYoutubeSeriesPlaylists,
} from "@mediaforge/metadata/microdrama-youtube-locale-metadata";
import { planDeliveryBundle } from "@mediaforge/metadata/delivery-bundle";
import {
  FakeMicrodramaYoutubeCoexistenceExecutor,
  executeMicrodramaYoutubeCoexistencePreflight,
  planMicrodramaYoutubeCoexistenceIntent,
  reconcileMicrodramaYoutubeCoexistenceIntent,
} from "@mediaforge/youtube-upload/microdrama-youtube-coexistence";

const evaluatedAt = "2026-08-12T12:00:00.000Z";
const renderHash = "a".repeat(64);
const manifestHash = "b".repeat(64);
const evidenceHash = "c".repeat(64);
const capabilityHash = "d".repeat(64);
const localeEditionHash = "e".repeat(64);

function deliveryBundle(metadataRevisionId: string) {
  const metadata = {
    title: "Episode title for YouTube",
    description: "Localized YouTube description with revision-bound copy.",
    tags: ["microdrama", "episode001"],
    chapters: [{ startSeconds: 0, title: "Cold open" }],
    thumbnailText: "Episode 001",
  };
  const planned = planDeliveryBundle({
    contentProfileId: "strategic-reinvention",
    episodeId: "episode.001",
    productionRevisionId: "rev.episode.001",
    locale: "en-US",
    metadata,
    files: {
      render: {
        artifactId: "render.001",
        relativePath: "locales/en-US/full/renders/youtube/final.mp4",
        fingerprint: renderHash,
      },
    },
    effectiveConfiguration: { packaging: "v1" },
    dependencyIdentity: { render: renderHash, localeEdition: localeEditionHash },
    provenance: {
      source: "approved-revision-artifacts",
      localeEditionId: "locale.edition.001",
      localeEditionFingerprint: localeEditionHash,
      renderDerivativeId: "render.001",
      renderDerivativeFingerprint: renderHash,
    },
    approval: {
      state: "approved",
      approvalIds: ["approval.locale", "approval.render"],
      boundRevision: "rev.episode.001",
    },
    regenerationRationale: "new-delivery-bundle",
  });
  return {
    ...planned.bundle,
    metadataRevisionId,
  };
}

function createYoutubeFixture() {
  const repository = new FakeMicrodramaPublicationRepository();
  repository.migratePublication();
  const youtubeExecutor = new FakeMicrodramaYoutubeCoexistenceExecutor();

  const targetProfile = repository.upsertTargetProfile({
    profile: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      profileId: "profile.series001.en-us.youtube",
      seriesId: "series.001",
      locale: "en-US",
      provider: "youtube",
      providerAccountId: "youtube.channel.001",
      credentialVersion: "cred.youtube.v1",
      metadataProfileId: "meta.profile.en-us.youtube",
      scheduleProfileId: "schedule.profile.en-us.youtube",
      enabled: true,
      registeredAt: evaluatedAt,
    },
  });

  const consent = repository.recordConsentRevision({
    consent: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      consentRevisionId: "consent.rev.youtube.001",
      subjectId: "creator.001",
      rightsholderId: "rightsholder.001",
      evidenceHash,
      evidenceSource: "operator-attestation",
      permittedMedia: ["video"],
      permittedUse: ["publish"],
      permittedLocale: "en-US",
      permittedProvider: "youtube",
      permittedTerritory: "US",
      effectiveAt: "2026-08-12T00:00:00.000Z",
      state: "active",
      recordedAt: evaluatedAt,
    },
  });

  const metadataRevision = planMicrodramaYoutubeLocaleMetadataRevision({
    seriesId: targetProfile.seriesId,
    locale: targetProfile.locale,
    episodeId: "episode.001",
    episodeRevisionId: "rev.episode.001",
    metadata: {
      title: "Episode title for YouTube",
      description: "Localized YouTube description with revision-bound copy.",
      tags: ["microdrama", "episode001"],
      chapters: [{ startSeconds: 0, title: "Cold open" }],
      thumbnailText: "Episode 001",
    },
    createdAt: evaluatedAt,
  }).revision;

  const seriesProjection = projectMicrodramaYoutubeSeriesPlaylists({
    seriesId: targetProfile.seriesId,
    locale: targetProfile.locale,
    seriesPlaylistId: "playlist.series.001",
    episodePlaylistIds: ["playlist.episode.001"],
  });

  const exportApproval = repository.recordExportApprovalRevision({
    exportApproval: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      exportApprovalRevisionId: "export.approval.youtube.001",
      consentRevisionId: consent.consentRevisionId,
      creatorCapabilityEvidenceHash: capabilityHash,
      providerAccountId: targetProfile.providerAccountId,
      renderHash,
      artifactManifestHash: manifestHash,
      metadataRevisionId: metadataRevision.metadataRevisionId,
      privacy: "private",
      interactionSettings: {
        allowComments: false,
        allowDuet: false,
        allowStitch: false,
      },
      aiContentDeclared: true,
      commercialContentDeclared: false,
      operatorId: "operator.001",
      approvedAt: evaluatedAt,
      state: "active",
    },
  });

  const binding = {
    provider: "youtube" as const,
    providerAccountId: targetProfile.providerAccountId,
    credentialVersion: targetProfile.credentialVersion,
    episodeId: "episode.001",
    episodeRevisionId: "rev.episode.001",
    locale: "en-US",
    renderHash,
    metadataRevisionId: metadataRevision.metadataRevisionId,
    consentRevisionId: consent.consentRevisionId,
    exportApprovalRevisionId: exportApproval.exportApprovalRevisionId,
    privacy: "private" as const,
    interactionSettings: {
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    },
    aiContentDeclared: true,
    commercialContentDeclared: false,
  };

  const publicationService = new MicrodramaPublicationService({
    port: repository,
    capabilityState: "private_canary",
  });
  const coexistenceService = new MicrodramaYoutubeCoexistenceService({
    publicationPort: repository,
    youtubeExecutor,
    capabilityState: "private_canary",
  });

  const approvedIntent = publicationService.createIntent({
    intentId: "intent.youtube.001",
    targetProfile,
    binding,
    dispatchMode: "manual",
    idempotencyKey: "idempotency.youtube.001",
    createdAt: evaluatedAt,
  });
  publicationService.approveIntent({
    intentId: approvedIntent.intentId,
    exportApproval,
    consent,
    now: evaluatedAt,
  });
  const publicationIntent = repository.getIntent(approvedIntent.intentId)!;

  return {
    repository,
    youtubeExecutor,
    targetProfile,
    metadataRevision,
    seriesProjection,
    publicationIntent,
    bundle: deliveryBundle(metadataRevision.metadataRevisionId),
    coexistenceService,
  };
}

describe("microdrama YouTube locale metadata projection", () => {
  it("keeps title, description and hashtags as provider-specific revisions", () => {
    const revision = planMicrodramaYoutubeLocaleMetadataRevision({
      seriesId: "series.001",
      locale: "en-US",
      episodeId: "episode.001",
      episodeRevisionId: "rev.episode.001",
      metadata: {
        title: "YouTube title",
        description: "YouTube description",
        tags: ["history", "drama"],
        chapters: [{ startSeconds: 0, title: "Intro" }],
      },
      createdAt: evaluatedAt,
    }).revision;

    expect(revision.metadataRevisionId).toMatch(/^youtube-metadata-[a-f0-9]{16}$/u);
    expect(revision.copy.title).toBe("YouTube title");
    expect(revision.copy.description).toBe("YouTube description");
    expect(revision.copy.hashtags).toEqual(["#history", "#drama"]);
    expect(revision.copy).not.toHaveProperty("caption");
  });

  it("rejects TikTok-shaped metadata reuse", () => {
    expect(() =>
      planMicrodramaYoutubeLocaleMetadataRevision({
        seriesId: "series.001",
        locale: "en-US",
        episodeId: "episode.001",
        episodeRevisionId: "rev.episode.001",
        metadata: {
          title: "Title",
          description: "Description",
          tags: ["tag"],
          chapters: [{ startSeconds: 0, title: "Intro" }],
          caption: "TikTok caption",
        } as never,
        createdAt: evaluatedAt,
      })
    ).toThrow(/caption|MICRODRAMA_YOUTUBE_METADATA_TIKTOK_REUSE_REJECTED/u);
  });

  it("projects playlist and series targets without TikTok metadata", () => {
    const projection = projectMicrodramaYoutubeSeriesPlaylists({
      seriesId: "series.001",
      locale: "en-US",
      seriesPlaylistId: "playlist.series.001",
      episodePlaylistIds: ["playlist.episode.001", "playlist.episode.001"],
    });
    expect(projection.episodePlaylistIds).toEqual(["playlist.episode.001"]);
    expect(projection.seriesPlaylistId).toBe("playlist.series.001");
  });
});

describe("microdrama YouTube coexistence projection", () => {
  it("projects an embedded publication intent into a provider-free YouTube intent", async () => {
    const fixture = createYoutubeFixture();
    const projected = fixture.coexistenceService.projectPublicationIntent({
      deliveryBundle: fixture.bundle,
      metadataRevision: fixture.metadataRevision,
      seriesProjection: fixture.seriesProjection,
      targetProfile: fixture.targetProfile,
      publicationIntent: fixture.publicationIntent,
      authorization: {
        actorId: "operator.001",
        allowed: true,
        permissions: ["publication.execute"],
      },
      idempotency: { key: "publish.youtube.001" },
    });

    expect(projected.intent.providerDispatchEnabled).toBe(false);
    expect(projected.intent.target.visibility).toBe("private");
    expect(projected.intent.target.playlistIds).toEqual([
      "playlist.episode.001",
      "playlist.series.001",
    ]);
    expect(projected.intent.productionRevisionId).toBe("rev.episode.001");

    const preflighted = await fixture.coexistenceService.preflightPublication({
      intent: projected.intent,
    });
    expect(preflighted.state).toBe("preflighted");
    expect(fixture.youtubeExecutor.getYoutubeIntent(preflighted.publicationId)).toEqual(preflighted);
  });

  it("retains embedded publication safety and private-first reconciliation", async () => {
    const fixture = createYoutubeFixture();
    const projected = planMicrodramaYoutubeCoexistenceIntent({
      deliveryBundle: fixture.bundle,
      metadataRevision: fixture.metadataRevision,
      seriesProjection: fixture.seriesProjection,
      targetProfile: fixture.targetProfile,
      publicationIntent: fixture.publicationIntent,
      authorization: {
        actorId: "operator.001",
        allowed: true,
        permissions: ["publication.execute"],
      },
      idempotency: { key: "publish.youtube.002" },
    });

    await expect(
      executeMicrodramaYoutubeCoexistencePreflight({
        intent: { ...projected.intent, target: { ...projected.intent.target, visibility: "public" } },
        executor: fixture.youtubeExecutor,
      })
    ).rejects.toThrow("MICRODRAMA_YOUTUBE_PRIVATE_FIRST_REQUIRED");

    const blocked = fixture.repository.evaluateDispatchAdmission({
      correlationId: "corr.youtube.blocked",
      evaluatedAt,
      intentId: fixture.publicationIntent.intentId,
      capabilityState: "private_canary",
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockReason).toBe("manual_dispatch_required");

    const admitted = fixture.coexistenceService.requireEmbeddedDispatch({
      correlationId: "corr.youtube.allowed",
      evaluatedAt,
      intentId: fixture.publicationIntent.intentId,
      capabilityState: "private_canary",
      operatorDispatchConfirmed: true,
    });
    expect(admitted.allowed).toBe(true);

    const reconciled = await reconcileMicrodramaYoutubeCoexistenceIntent({
      intent: projected.intent,
      client: {
        search: { list: async () => ({ data: { items: [{ id: { videoId: "video-001" } }] } }) },
        videos: {
          list: async () => ({
            data: {
              items: [{
                id: "video-001",
                snippet: {
                  description: `<!-- mediaforge-publication:${projected.intent.recoveryIdentity} -->`,
                  channelId: "youtube.channel.001",
                },
                status: { privacyStatus: "private" },
              }],
            },
          }),
        },
      },
      audit: { append: vi.fn(async () => undefined) },
    });
    expect(reconciled.state).toBe("published");
    expect(reconciled.receipt?.providerObjectId).toBe("video-001");
  });
});
