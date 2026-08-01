export interface YoutubeReconciliationClient {
  readonly search: {
    list(request: unknown): Promise<{
      readonly data?: {
        readonly items?: ReadonlyArray<{
          readonly id?: { readonly videoId?: string | null } | null;
        }>;
      };
    }>;
  };
  readonly videos: {
    list(request: unknown): Promise<{
      readonly data?: {
        readonly items?: ReadonlyArray<{
          readonly id?: string | null;
          readonly snippet?: {
            readonly description?: string | null;
            readonly channelId?: string | null;
          } | null;
          readonly status?: { readonly privacyStatus?: string | null } | null;
        }>;
      };
    }>;
  };
}

export interface YoutubePublicationReceipt {
  readonly providerObjectId: string;
  readonly recoveryIdentity: string;
  readonly evidence: unknown;
}

export const youtubePublicationRecoveryMarker = (
  publicationId: string
): string => `mediaforge-publication:${publicationId}`;

/**
 * Queries YouTube read-only and accepts receipts only when the immutable
 * publication marker is present in the returned video description.
 */
export class YoutubePublicationEvidenceLookup {
  public constructor(private readonly client: YoutubeReconciliationClient) {}

  public async findByRecoveryIdentity(input: {
    readonly publicationId: string;
  }): Promise<readonly YoutubePublicationReceipt[]> {
    const marker = youtubePublicationRecoveryMarker(input.publicationId);
    const search = await this.client.search.list({
      part: ["id"],
      q: marker,
      type: ["video"],
      forMine: true,
      maxResults: 10,
    });
    const candidateIds = (search.data?.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (candidateIds.length === 0) return [];
    const videos = await this.client.videos.list({
      part: ["snippet", "status"],
      id: candidateIds,
      maxResults: candidateIds.length,
    });
    return (videos.data?.items ?? [])
      .filter(
        (
          video
        ): video is {
          readonly id: string;
          readonly snippet: {
            readonly description?: string | null;
            readonly channelId?: string | null;
          };
          readonly status?: { readonly privacyStatus?: string | null } | null;
        } =>
          typeof video.id === "string" &&
          video.snippet?.description?.includes(marker) === true
      )
      .map((video) => ({
        providerObjectId: video.id,
        recoveryIdentity: input.publicationId,
        evidence: {
          marker,
          channelId: video.snippet.channelId ?? null,
          privacyStatus: video.status?.privacyStatus ?? null,
        },
      }));
  }
}
