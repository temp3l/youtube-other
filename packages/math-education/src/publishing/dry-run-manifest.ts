import { type MathMetadata } from "./types.js";

export interface MathPublishDryRunManifest {
  artifactVersion: "math-publish-dry-run.v1";
  lessonId: string;
  language: string;
  privacyStatus: "private";
  playlistKeys: readonly string[];
  dispatchAllowed: false;
  paidProviderCalled: false;
}
export function createPublishDryRunManifest(
  lessonId: string,
  metadata: MathMetadata
): MathPublishDryRunManifest {
  return {
    artifactVersion: "math-publish-dry-run.v1",
    lessonId,
    language: metadata.language,
    privacyStatus: "private",
    playlistKeys: metadata.playlists.map((playlist) => playlist.key),
    dispatchAllowed: false,
    paidProviderCalled: false,
  };
}
