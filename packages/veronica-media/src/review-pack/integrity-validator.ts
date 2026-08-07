import fs from "node:fs/promises";
import path from "node:path";
import type {
  VeronicaApprovalEligibility,
  VeronicaAspectRatio,
  VeronicaMediaPlan,
  VeronicaRenderManifest,
} from "../contracts/media-plan.v1.js";
import { episodeScopedLookupKey } from "../identifiers/episode-scope.js";
import {
  PREPARED_ASSET_CHECKSUM_MISMATCH,
  PREPARED_ASSET_DIMENSION_MISMATCH,
  verifyPreparedAssetBytes,
} from "../preparation/prepared-asset-integrity.js";
import { readPngDimensions } from "../preparation/png-metadata.js";
import {
  RENDER_ASPECT_ASSET_MISMATCH,
  validateRenderManifestAspectIntegrity,
} from "../rendering/manifest-integrity.js";
import { buildContactSheetTiles } from "./contact-sheet.js";

export const PLACEMENT_REFERENCE_MISSING = "PLACEMENT_REFERENCE_MISSING";
export const VISUAL_STATE_REFERENCE_MISSING = "VISUAL_STATE_REFERENCE_MISSING";
export const PROVENANCE_REFERENCE_MISSING = "PROVENANCE_REFERENCE_MISSING";
export const CONTACT_SHEET_ASSET_MISMATCH = "CONTACT_SHEET_ASSET_MISMATCH";
export const PACKAGE_CHECKSUM_MISMATCH = "PACKAGE_CHECKSUM_MISMATCH";

export interface EpisodeIntegrityIssue {
  readonly code: string;
  readonly severity: "blocking-error" | "non-blocking-warning";
  readonly message: string;
  readonly placementId?: string;
  readonly assetId?: string;
}

export interface ValidateEpisodeApprovalPackInput {
  readonly episodeId: string;
  readonly stateDir: string;
  readonly plan: VeronicaMediaPlan;
  readonly landscapeManifest?: VeronicaRenderManifest;
  readonly portraitManifest?: VeronicaRenderManifest;
  readonly contactSheetAssetIds?: Readonly<
    Partial<Record<VeronicaAspectRatio, readonly string[]>>
  >;
}

export async function validateEpisodeApprovalPackIntegrity(
  input: ValidateEpisodeApprovalPackInput,
): Promise<{ readonly valid: boolean; readonly issues: readonly EpisodeIntegrityIssue[] }> {
  const issues: EpisodeIntegrityIssue[] = [];
  const preparedAssetPaths: Record<string, string> = {};
  const preparedAssetBytes: Record<string, Uint8Array> = {};

  if (input.plan.episodeId !== input.episodeId) {
    issues.push({
      code: "EPISODE_SCOPE_MISMATCH",
      severity: "blocking-error",
      message: `Plan episodeId ${input.plan.episodeId} does not match pack episode ${input.episodeId}.`,
    });
  }

  for (const prepared of input.plan.preparedAssets) {
    const absolute = path.join(input.stateDir, prepared.relativePath);
  preparedAssetPaths[prepared.preparedAssetId] = absolute;
    try {
      const bytes = await fs.readFile(absolute);
      preparedAssetBytes[prepared.preparedAssetId] = bytes;
      const verification = verifyPreparedAssetBytes(prepared, bytes);
      for (const code of verification.issues) {
        issues.push({
          code,
          severity: "blocking-error",
          message: `Prepared asset ${prepared.preparedAssetId} failed ${code}.`,
          assetId: prepared.preparedAssetId,
        });
      }
    } catch {
      issues.push({
        code: "PREPARED_ASSET_PATH_MISSING",
        severity: "blocking-error",
        message: `Prepared asset ${prepared.preparedAssetId} file is missing.`,
        assetId: prepared.preparedAssetId,
      });
    }
  }

  const anchorIds = new Set(input.plan.narrationAnchors.map((anchor) => anchor.anchorId));
  const provenanceIds = new Set(input.plan.provenance.map((record) => record.provenanceId));
  const visualStateIds = new Set(input.plan.visualStates.map((state) => state.stateId));

  for (const placement of [...input.plan.landscapePlacements, ...input.plan.portraitPlacements]) {
    if (!anchorIds.has(placement.anchorId)) {
      issues.push({
        code: PLACEMENT_REFERENCE_MISSING,
        severity: "blocking-error",
        message: `Placement ${placement.placementId} references missing anchor ${placement.anchorId}.`,
        placementId: placement.placementId,
      });
    }
    for (const stateId of placement.visualStateIds) {
      if (!visualStateIds.has(stateId)) {
        issues.push({
          code: VISUAL_STATE_REFERENCE_MISSING,
          severity: "blocking-error",
          message: `Placement ${placement.placementId} references missing visual state ${stateId}.`,
          placementId: placement.placementId,
        });
      }
    }
  }

  for (const state of input.plan.visualStates) {
    const provenance = input.plan.provenance.find(
      (record) => record.provenanceId === state.provenanceId,
    );
    if (!provenance) {
      issues.push({
        code: PROVENANCE_REFERENCE_MISSING,
        severity: "blocking-error",
        message: `Visual state ${state.stateId} references missing provenance ${state.provenanceId}.`,
      });
    }
    for (const preparedId of [state.preparedAssetId, state.portraitPreparedAssetId]) {
      if (!preparedId) continue;
      if (!input.plan.preparedAssets.some((asset) => asset.preparedAssetId === preparedId)) {
        issues.push({
          code: "PREPARED_ASSET_MISSING",
          severity: "blocking-error",
          message: `Visual state ${state.stateId} references missing prepared asset ${preparedId}.`,
          assetId: preparedId,
        });
      }
    }
  }

  for (const manifest of [input.landscapeManifest, input.portraitManifest].filter(Boolean)) {
    const result = validateRenderManifestAspectIntegrity({
      manifest: manifest!,
      plan: input.plan,
      preparedAssetPaths,
    });
    for (const issue of result.issues) {
      issues.push({
        code: issue.code,
        severity: "blocking-error",
        message: issue.message,
        ...(issue.placementId ? { placementId: issue.placementId } : {}),
        ...(issue.preparedAssetId ? { assetId: issue.preparedAssetId } : {}),
      });
    }
  }

  for (const aspectRatio of ["16:9", "9:16"] as const) {
    const tiles = buildContactSheetTiles(input.plan, aspectRatio, preparedAssetBytes);
    const manifest =
      aspectRatio === "16:9" ? input.landscapeManifest : input.portraitManifest;
    if (!manifest) continue;
    for (const tile of tiles) {
      if (!tile.preparedAssetId || tile.preparedAssetId === "unknown") {
        issues.push({
          code: CONTACT_SHEET_ASSET_MISMATCH,
          severity: "blocking-error",
          message: `Contact sheet tile ${tile.placementId} lacks prepared asset reference.`,
          placementId: tile.placementId,
        });
        continue;
      }
      if (!preparedAssetBytes[tile.preparedAssetId]) {
        issues.push({
          code: CONTACT_SHEET_ASSET_MISMATCH,
          severity: "blocking-error",
          message: `Contact sheet tile ${tile.placementId} references missing bytes for ${tile.preparedAssetId}.`,
          placementId: tile.placementId,
          assetId: tile.preparedAssetId,
        });
      }
      const prepared = input.plan.preparedAssets.find(
        (asset) => asset.preparedAssetId === tile.preparedAssetId,
      );
      if (prepared && prepared.aspectRatio !== aspectRatio) {
        issues.push({
          code: CONTACT_SHEET_ASSET_MISMATCH,
          severity: "blocking-error",
          message: `Contact sheet tile ${tile.placementId} uses ${prepared.aspectRatio} asset for ${aspectRatio} sheet.`,
          placementId: tile.placementId,
          assetId: tile.preparedAssetId,
        });
      }
    }
  }

  const duplicateContentKeys = new Map<string, string>();
  for (const prepared of input.plan.preparedAssets) {
    if (!prepared.contentKey) continue;
    const scoped = episodeScopedLookupKey(input.episodeId, prepared.contentKey);
    const existing = duplicateContentKeys.get(scoped);
    if (existing && existing !== prepared.preparedAssetId) {
      const firstBytes = preparedAssetBytes[existing];
      const secondBytes = preparedAssetBytes[prepared.preparedAssetId];
      if (firstBytes && secondBytes && Buffer.from(firstBytes).equals(Buffer.from(secondBytes))) {
        continue;
      }
      issues.push({
        code: "CONTENT_KEY_COLLISION",
        severity: "blocking-error",
        message: `Different prepared outputs share content key ${prepared.contentKey}.`,
        assetId: prepared.preparedAssetId,
      });
    } else {
      duplicateContentKeys.set(scoped, prepared.preparedAssetId);
    }
  }

  return {
    valid: issues.filter((issue) => issue.severity === "blocking-error").length === 0,
    issues,
  };
}

export function mergeIntegrityIssuesIntoEligibility(input: {
  readonly eligibility: VeronicaApprovalEligibility;
  readonly integrityIssues: readonly EpisodeIntegrityIssue[];
  readonly approvalState?: "draft" | "review" | "approved" | "blocked";
}): VeronicaApprovalEligibility {
  const mergedIssues = [
    ...input.eligibility.issues,
    ...input.integrityIssues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      ...(issue.placementId ? { placementId: issue.placementId } : {}),
      ...(issue.assetId ? { assetId: issue.assetId } : {}),
    })),
  ];
  const hasBlocking = mergedIssues.some((issue) => issue.severity === "blocking-error");
  const hasApprovalRequired = mergedIssues.some(
    (issue) => issue.severity === "approval-required",
  );
  const renderEligible = !hasBlocking && !hasApprovalRequired;
  return {
    renderEligible,
    contentReviewEligible: !hasBlocking,
    productionEligible:
      renderEligible && (input.approvalState ?? "review") === "approved",
    issues: mergedIssues,
  };
}

export async function validatePreparedAssetFileIntegrity(
  prepared: VeronicaMediaPlan["preparedAssets"][number],
  filePath: string,
): Promise<void> {
  const bytes = await fs.readFile(filePath);
  const verification = verifyPreparedAssetBytes(prepared, bytes);
  if (!verification.valid) {
    throw new Error(verification.issues.join(", "));
  }
  const dimensions = readPngDimensions(bytes);
  if (dimensions.width !== prepared.width || dimensions.height !== prepared.height) {
    throw new Error(PREPARED_ASSET_DIMENSION_MISMATCH);
  }
}

export {
  PREPARED_ASSET_CHECKSUM_MISMATCH,
  PREPARED_ASSET_DIMENSION_MISMATCH,
  RENDER_ASPECT_ASSET_MISMATCH,
};
