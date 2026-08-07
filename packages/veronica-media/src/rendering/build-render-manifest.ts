import {
  veronicaRenderClipSchema,
  veronicaRenderManifestSchema,
  type VeronicaMediaPlan,
  type VeronicaRenderManifest,
} from "../contracts/media-plan.v1.js";
import { hashCanonical } from "../canonical-json.js";
import { resolvePreparedAssetPathForPlacement } from "./manifest-integrity.js";

export function buildRenderManifest(input: {
  readonly plan: VeronicaMediaPlan;
  readonly aspectRatio: "16:9" | "9:16";
  readonly placements: VeronicaMediaPlan["placements"];
  readonly preparedAssetPaths: Readonly<Record<string, string>>;
  readonly outputPath: string;
  readonly narrationAudioPath: string;
}): VeronicaRenderManifest {
  const profile =
    input.aspectRatio === "16:9"
      ? input.plan.aspectProfiles.landscape
      : input.plan.aspectProfiles.portrait;
  let cursor = 0;
  const clips = input.placements.map((placement) => {
    const { assetPath } = resolvePreparedAssetPathForPlacement({
      plan: input.plan,
      aspectRatio: input.aspectRatio,
      placementId: placement.placementId,
      preparedAssetPaths: input.preparedAssetPaths,
    });
    const startSeconds = cursor;
    const endSeconds = cursor + placement.dwellDurationSeconds;
    cursor = endSeconds;
    return veronicaRenderClipSchema.parse({
      clipId: `${placement.placementId}-clip`,
      placementId: placement.placementId,
      startSeconds,
      endSeconds,
      operations: [
        {
          kind: "contain",
          assetPath,
          x: 0,
          y: 0,
          width: profile.width,
          height: profile.height,
        },
      ],
    });
  });
  const manifestWithoutHash = {
    schemaVersion: "veronica-render-manifest.v1" as const,
    aspectRatio: input.aspectRatio,
    profile,
    clips,
    narrationAudioPath: input.narrationAudioPath,
    outputPath: input.outputPath,
    contentHash: "0".repeat(64),
  };
  return veronicaRenderManifestSchema.parse({
    ...manifestWithoutHash,
    contentHash: hashCanonical(manifestWithoutHash),
  });
}
