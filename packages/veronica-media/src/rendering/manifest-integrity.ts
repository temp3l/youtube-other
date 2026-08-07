import type {
  VeronicaAspectRatio,
  VeronicaMediaPlan,
  VeronicaRenderManifest,
} from "../contracts/media-plan.v1.js";

export const RENDER_ASPECT_ASSET_MISMATCH = "RENDER_ASPECT_ASSET_MISMATCH";
export const RENDER_PREPARED_ASSET_MISSING = "RENDER_PREPARED_ASSET_MISSING";
export const RENDER_VISUAL_STATE_MISSING = "RENDER_VISUAL_STATE_MISSING";

export function resolvePreparedAssetIdForAspect(
  plan: VeronicaMediaPlan,
  stateId: string,
  aspectRatio: VeronicaAspectRatio,
): string | undefined {
  const state = plan.visualStates.find((candidate) => candidate.stateId === stateId);
  if (!state) {
    return undefined;
  }
  if (aspectRatio === "9:16") {
    return state.portraitPreparedAssetId ?? state.preparedAssetId;
  }
  return state.preparedAssetId;
}

export function resolvePreparedAssetPathForPlacement(input: {
  readonly plan: VeronicaMediaPlan;
  readonly aspectRatio: VeronicaAspectRatio;
  readonly placementId: string;
  readonly preparedAssetPaths: Readonly<Record<string, string>>;
}): { readonly preparedAssetId: string; readonly assetPath: string } {
  const placement =
    input.aspectRatio === "16:9"
      ? input.plan.landscapePlacements.find((entry) => entry.placementId === input.placementId)
      : input.plan.portraitPlacements.find((entry) => entry.placementId === input.placementId);
  if (!placement) {
    throw new Error(`Placement ${input.placementId} not found for aspect ${input.aspectRatio}.`);
  }
  const stateId = placement.visualStateIds[0];
  if (!stateId) {
    throw new Error(`Placement ${input.placementId} has no visual states.`);
  }
  const preparedAssetId = resolvePreparedAssetIdForAspect(input.plan, stateId, input.aspectRatio);
  if (!preparedAssetId) {
    throw new Error(RENDER_PREPARED_ASSET_MISSING);
  }
  const prepared = input.plan.preparedAssets.find(
    (asset) => asset.preparedAssetId === preparedAssetId,
  );
  if (!prepared) {
    throw new Error(RENDER_PREPARED_ASSET_MISSING);
  }
  if (prepared.aspectRatio !== input.aspectRatio) {
    throw new Error(RENDER_ASPECT_ASSET_MISMATCH);
  }
  const assetPath = input.preparedAssetPaths[preparedAssetId];
  if (!assetPath) {
    throw new Error(RENDER_PREPARED_ASSET_MISSING);
  }
  return { preparedAssetId, assetPath };
}

export interface RenderManifestIntegrityIssue {
  readonly code: string;
  readonly message: string;
  readonly placementId?: string;
  readonly preparedAssetId?: string;
}

export function validateRenderManifestAspectIntegrity(input: {
  readonly manifest: VeronicaRenderManifest;
  readonly plan: VeronicaMediaPlan;
  readonly preparedAssetPaths: Readonly<Record<string, string>>;
}): { readonly valid: boolean; readonly issues: readonly RenderManifestIntegrityIssue[] } {
  const issues: RenderManifestIntegrityIssue[] = [];
  if (input.manifest.aspectRatio !== input.manifest.profile.aspectRatio) {
    issues.push({
      code: RENDER_ASPECT_ASSET_MISMATCH,
      message: "Render manifest profile aspect ratio does not match manifest aspect ratio.",
    });
  }
  for (const clip of input.manifest.clips) {
    const placement =
      input.manifest.aspectRatio === "16:9"
        ? input.plan.landscapePlacements.find((entry) => entry.placementId === clip.placementId)
        : input.plan.portraitPlacements.find((entry) => entry.placementId === clip.placementId);
    if (!placement) {
      issues.push({
        code: "PLACEMENT_REFERENCE_MISSING",
        message: `Clip ${clip.clipId} references unknown placement ${clip.placementId}.`,
        placementId: clip.placementId,
      });
      continue;
    }
    const stateId = placement.visualStateIds[0];
    if (!stateId) {
      issues.push({
        code: RENDER_VISUAL_STATE_MISSING,
        message: `Placement ${clip.placementId} has no visual states.`,
        placementId: clip.placementId,
      });
      continue;
    }
    const state = input.plan.visualStates.find((candidate) => candidate.stateId === stateId);
    if (!state) {
      issues.push({
        code: RENDER_VISUAL_STATE_MISSING,
        message: `Placement ${clip.placementId} references missing visual state ${stateId}.`,
        placementId: clip.placementId,
      });
      continue;
    }
    const preparedAssetId = resolvePreparedAssetIdForAspect(
      input.plan,
      stateId,
      input.manifest.aspectRatio,
    );
    if (!preparedAssetId) {
      issues.push({
        code: RENDER_PREPARED_ASSET_MISSING,
        message: `Visual state ${stateId} has no prepared asset for ${input.manifest.aspectRatio}.`,
        placementId: clip.placementId,
      });
      continue;
    }
    const prepared = input.plan.preparedAssets.find(
      (asset) => asset.preparedAssetId === preparedAssetId,
    );
    if (!prepared) {
      issues.push({
        code: RENDER_PREPARED_ASSET_MISSING,
        message: `Prepared asset ${preparedAssetId} is missing from plan.`,
        placementId: clip.placementId,
        preparedAssetId,
      });
      continue;
    }
    if (prepared.aspectRatio !== input.manifest.aspectRatio) {
      issues.push({
        code: RENDER_ASPECT_ASSET_MISMATCH,
        message: `Prepared asset ${preparedAssetId} is ${prepared.aspectRatio} but render target is ${input.manifest.aspectRatio}.`,
        placementId: clip.placementId,
        preparedAssetId,
      });
    }
    for (const operation of clip.operations) {
      if (!("assetPath" in operation)) {
        continue;
      }
      const expectedPath = input.preparedAssetPaths[preparedAssetId];
      if (expectedPath && operation.assetPath !== expectedPath) {
        issues.push({
          code: RENDER_ASPECT_ASSET_MISMATCH,
          message: `Clip ${clip.clipId} references asset path that does not match prepared asset ${preparedAssetId}.`,
          placementId: clip.placementId,
          preparedAssetId,
        });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}
