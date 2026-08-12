import type {
  CreatorContentConsentRevision,
  MicrodramaPublicationIntent,
  MicrodramaPublicationTargetProfile,
  TikTokPostExportApprovalRevision,
} from "@mediaforge/domain";
import type { DeliveryBundle } from "@mediaforge/metadata/delivery-bundle";
import type {
  MicrodramaYoutubeLocaleMetadataRevision,
  MicrodramaYoutubeSeriesProjection,
} from "@mediaforge/metadata/microdrama-youtube-locale-metadata";
import {
  executeMicrodramaYoutubeCoexistencePreflight,
  planMicrodramaYoutubeCoexistenceIntent,
  type MicrodramaYoutubeCoexistenceExecutorPort,
} from "@mediaforge/youtube-upload/microdrama-youtube-coexistence";
import type { YoutubePublicationIntent } from "@mediaforge/youtube-upload/publication-intent";

import {
  MicrodramaPublicationService,
  type MicrodramaPublicationServicePort,
} from "./microdrama-publication-service.js";

export interface MicrodramaYoutubeCoexistenceServiceInput {
  readonly publicationPort: MicrodramaPublicationServicePort;
  readonly youtubeExecutor: MicrodramaYoutubeCoexistenceExecutorPort;
  readonly capabilityState?: "disabled" | "private_canary" | "public_canary" | "enabled";
}

export class MicrodramaYoutubeCoexistenceService {
  private readonly publicationService: MicrodramaPublicationService;

  public constructor(private readonly input: MicrodramaYoutubeCoexistenceServiceInput) {
    this.publicationService = new MicrodramaPublicationService({
      port: input.publicationPort,
      ...(input.capabilityState ? { capabilityState: input.capabilityState } : {}),
    });
  }

  public projectPublicationIntent(input: {
    readonly deliveryBundle: DeliveryBundle;
    readonly metadataRevision: MicrodramaYoutubeLocaleMetadataRevision;
    readonly seriesProjection: MicrodramaYoutubeSeriesProjection;
    readonly targetProfile: MicrodramaPublicationTargetProfile;
    readonly publicationIntent: MicrodramaPublicationIntent;
    readonly authorization: {
      readonly actorId: string;
      readonly allowed: boolean;
      readonly permissions: readonly string[];
    };
    readonly idempotency: { readonly key: string };
    readonly scheduledAt?: string | null;
    readonly previousIntent?: YoutubePublicationIntent;
  }): { readonly intent: YoutubePublicationIntent; readonly reused: boolean } {
    return planMicrodramaYoutubeCoexistenceIntent(input);
  }

  public async preflightPublication(input: {
    readonly intent: YoutubePublicationIntent;
  }): Promise<YoutubePublicationIntent> {
    return executeMicrodramaYoutubeCoexistencePreflight({
      intent: input.intent,
      executor: this.input.youtubeExecutor,
    });
  }

  public evaluateEmbeddedDispatch(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: "disabled" | "private_canary" | "public_canary" | "enabled";
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): ReturnType<MicrodramaPublicationService["evaluateDispatch"]> {
    return this.publicationService.evaluateDispatch(input);
  }

  public requireEmbeddedDispatch(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: "disabled" | "private_canary" | "public_canary" | "enabled";
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): ReturnType<MicrodramaPublicationService["requireDispatch"]> {
    return this.publicationService.requireDispatch(input);
  }

  public approveEmbeddedIntent(input: {
    readonly intentId: string;
    readonly exportApproval: TikTokPostExportApprovalRevision;
    readonly consent: CreatorContentConsentRevision;
    readonly now: string;
  }): MicrodramaPublicationIntent {
    return this.publicationService.approveIntent(input);
  }
}
