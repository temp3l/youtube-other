/**
 * Strategy B: IDs are episode-local. All lookups must use episodeScopedLookupKey.
 */
export function episodeScopedLookupKey(episodeId: string, localId: string): string {
  return `${episodeId}::${localId}`;
}

export function assertEpisodeScopedLookup(
  episodeId: string,
  localId: string,
  planEpisodeId: string,
): void {
  if (episodeId !== planEpisodeId) {
    throw new Error(
      `Episode scope mismatch for ${localId}: expected ${planEpisodeId}, got ${episodeId}.`,
    );
  }
}
