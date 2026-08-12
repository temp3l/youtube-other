import type { DeliveryBundle } from "@mediaforge/metadata/delivery-bundle";
import type {
  MicrodramaPublicationIntent,
  MicrodramaPublicationTargetProfile,
} from "@mediaforge/domain";
import type {
  MicrodramaYoutubeLocaleMetadataRevision,
  MicrodramaYoutubeSeriesProjection,
} from "@mediaforge/metadata/microdrama-youtube-locale-metadata";

import {
  planYoutubePublicationIntent,
  reconcileYoutubePublicationIntent,
  type PlanYoutubePublicationIntentInput,
  type PublicationAuditSink,
  type YoutubePublicationIntent,
} from "./publication-intent.js";
import type { YoutubeReconciliationClient } from "./publication-reconciliation.js";

const YOUTUBE_VISIBILITY_BY_BINDING = {
  private: "private",
  friends: "unlisted",
  public: "public",
} as const;

export interface PlanMicrodramaYoutubeCoexistenceIntentInput
  extends Omit<
    PlanYoutubePublicationIntentInput,
    | "contentProfileId"
    | "episodeId"
    | "productionRevisionId"
    | "locale"
    | "deliveryBundleId"
    | "deliveryBundleFingerprint"
    | "effectiveConfigurationHash"
    | "dependencyIdentity"
    | "provenance"
    | "artifacts"
    | "approval"
    | "target"
  > {
  readonly deliveryBundle: DeliveryBundle;
  readonly metadataRevision: MicrodramaYoutubeLocaleMetadataRevision;
  readonly seriesProjection: MicrodramaYoutubeSeriesProjection;
  readonly targetProfile: MicrodramaPublicationTargetProfile;
  readonly publicationIntent: MicrodramaPublicationIntent;
}

function mapYoutubeVisibility(
  privacy: MicrodramaPublicationIntent["binding"]["privacy"],
): "private" | "unlisted" | "public" {
  return YOUTUBE_VISIBILITY_BY_BINDING[privacy];
}

function assertCoexistenceBinding(input: PlanMicrodramaYoutubeCoexistenceIntentInput): void {
  const { binding } = input.publicationIntent;
  if (binding.provider !== "youtube") {
    throw new Error("MICRODRAMA_YOUTUBE_PROVIDER_REQUIRED");
  }
  if (input.targetProfile.provider !== "youtube") {
    throw new Error("MICRODRAMA_YOUTUBE_TARGET_PROFILE_REQUIRED");
  }
  if (input.targetProfile.profileId !== input.publicationIntent.targetProfileId) {
    throw new Error("MICRODRAMA_YOUTUBE_TARGET_PROFILE_MISMATCH");
  }
  if (binding.metadataRevisionId !== input.metadataRevision.metadataRevisionId) {
    throw new Error("MICRODRAMA_YOUTUBE_METADATA_REVISION_MISMATCH");
  }
  if (binding.renderHash !== input.deliveryBundle.files.render.fingerprint) {
    throw new Error("MICRODRAMA_YOUTUBE_RENDER_HASH_MISMATCH");
  }
  if (
    input.metadataRevision.seriesId !== input.seriesProjection.seriesId ||
    input.metadataRevision.locale !== input.seriesProjection.locale
  ) {
    throw new Error("MICRODRAMA_YOUTUBE_SERIES_PROJECTION_MISMATCH");
  }
  const record = input.metadataRevision.copy as Record<string, unknown>;
  if ("caption" in record || "coverText" in record) {
    throw new Error("MICRODRAMA_YOUTUBE_METADATA_TIKTOK_REUSE_REJECTED");
  }
}

/**
 * Projects an embedded microdrama publication intent into the existing
 * provider-free YouTube publication safety model without TikTok metadata reuse.
 */
export function planMicrodramaYoutubeCoexistenceIntent(
  input: PlanMicrodramaYoutubeCoexistenceIntentInput,
): { readonly intent: YoutubePublicationIntent; readonly reused: boolean } {
  assertCoexistenceBinding(input);
  const bundle = input.deliveryBundle;
  if (
    bundle.execution.providerDispatchEnabled ||
    bundle.execution.publicationEnabled ||
    bundle.approval.boundRevision !== bundle.productionRevisionId
  ) {
    throw new Error("MICRODRAMA_YOUTUBE_PUBLICATION_APPROVAL_REQUIRED");
  }
  const playlistIds = [
    input.seriesProjection.seriesPlaylistId,
    ...input.seriesProjection.episodePlaylistIds,
  ];
  return planYoutubePublicationIntent({
    ...input,
    contentProfileId: bundle.contentProfileId,
    episodeId: bundle.episodeId,
    productionRevisionId: bundle.productionRevisionId,
    locale: bundle.locale,
    deliveryBundleId: bundle.bundleId,
    deliveryBundleFingerprint: bundle.fingerprint,
    effectiveConfigurationHash: bundle.effectiveConfigurationHash,
    dependencyIdentity: bundle.dependencyIdentity,
    provenance: {
      source: "approved-delivery-bundle",
      localeEditionId: bundle.provenance.localeEditionId,
      localeEditionFingerprint: bundle.provenance.localeEditionFingerprint,
      renderDerivativeId: bundle.provenance.renderDerivativeId,
      renderDerivativeFingerprint: bundle.provenance.renderDerivativeFingerprint,
    },
    artifacts: [
      {
        assetId: bundle.files.render.artifactId,
        role: "render",
        contentHash: bundle.files.render.fingerprint,
      },
      ...(bundle.files.preview
        ? [{
            assetId: bundle.files.preview.artifactId,
            role: "preview" as const,
            contentHash: bundle.files.preview.fingerprint,
          }]
        : []),
      ...(bundle.files.captions
        ? [{
            assetId: bundle.files.captions.artifactId,
            role: "captions" as const,
            contentHash: bundle.files.captions.fingerprint,
          }]
        : []),
    ],
    approval: {
      approvalIds: bundle.approval.approvalIds,
      boundRevision: bundle.approval.boundRevision,
      artifactHash: bundle.fingerprint,
    },
    target: {
      channelId: input.targetProfile.providerAccountId,
      accountId: input.targetProfile.providerAccountId,
      visibility: mapYoutubeVisibility(input.publicationIntent.binding.privacy),
      playlistIds,
    },
  });
}

export interface MicrodramaYoutubeCoexistenceExecutorPort {
  saveYoutubeIntent(input: {
    readonly intent: YoutubePublicationIntent;
  }): YoutubePublicationIntent;
  getYoutubeIntent(publicationId: string): YoutubePublicationIntent | null;
}

/** Provider-free executor that records preflighted intents without dispatch. */
export class FakeMicrodramaYoutubeCoexistenceExecutor
  implements MicrodramaYoutubeCoexistenceExecutorPort
{
  private readonly intents = new Map<string, YoutubePublicationIntent>();

  public saveYoutubeIntent(input: {
    readonly intent: YoutubePublicationIntent;
  }): YoutubePublicationIntent {
    this.intents.set(input.intent.publicationId, input.intent);
    return input.intent;
  }

  public getYoutubeIntent(publicationId: string): YoutubePublicationIntent | null {
    return this.intents.get(publicationId) ?? null;
  }
}

export async function executeMicrodramaYoutubeCoexistencePreflight(input: {
  readonly intent: YoutubePublicationIntent;
  readonly executor: MicrodramaYoutubeCoexistenceExecutorPort;
  readonly audit?: PublicationAuditSink;
}): Promise<YoutubePublicationIntent> {
  if (input.intent.providerDispatchEnabled) {
    throw new Error("MICRODRAMA_YOUTUBE_PROVIDER_DISPATCH_BLOCKED");
  }
  if (input.intent.target.visibility !== "private" && input.intent.scheduledAt === null) {
    throw new Error("MICRODRAMA_YOUTUBE_PRIVATE_FIRST_REQUIRED");
  }
  const saved = input.executor.saveYoutubeIntent({ intent: input.intent });
  if (input.audit) {
    await input.audit.append({
      action: saved.scheduledAt ? "publication.scheduled" : "publication.preflighted",
      publicationId: saved.publicationId,
      evidence: {
        fingerprint: saved.fingerprint,
        visibility: saved.target.visibility,
      },
    });
  }
  return saved;
}

export async function reconcileMicrodramaYoutubeCoexistenceIntent(input: {
  readonly intent: YoutubePublicationIntent;
  readonly client: YoutubeReconciliationClient;
  readonly audit?: PublicationAuditSink;
}): Promise<ReturnType<typeof reconcileYoutubePublicationIntent>> {
  return reconcileYoutubePublicationIntent(input);
}
