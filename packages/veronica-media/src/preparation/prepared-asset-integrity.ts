import { createHash } from "node:crypto";
import { hashCanonical } from "../canonical-json.js";
import type { VeronicaMediaPlan } from "../contracts/media-plan.v1.js";
import { readPngDimensions, sha256Bytes } from "./png-metadata.js";

export const PREPARED_ASSET_CHECKSUM_MISMATCH = "PREPARED_ASSET_CHECKSUM_MISMATCH";
export const PREPARED_ASSET_DIMENSION_MISMATCH = "PREPARED_ASSET_DIMENSION_MISMATCH";

export function computePreparedAssetContentKey(input: {
  readonly episodeId: string;
  readonly preparedAssetId: string;
  readonly sourceChecksum: string;
  readonly transformationChain: readonly string[];
  readonly language: string;
  readonly aspectRatio: "16:9" | "9:16";
  readonly width: number;
  readonly height: number;
  readonly rendererProfile: string;
}): string {
  return createHash("sha256").update(hashCanonical(input)).digest("hex");
}

export function computeTransformationFingerprint(input: {
  readonly transformationChain: readonly string[];
  readonly aspectRatio: "16:9" | "9:16";
  readonly width: number;
  readonly height: number;
  readonly rendererProfile: string;
}): string {
  return createHash("sha256").update(hashCanonical(input)).digest("hex");
}

export function verifyPreparedAssetBytes(
  prepared: VeronicaMediaPlan["preparedAssets"][number],
  bytes: Uint8Array,
): { readonly valid: boolean; readonly issues: readonly string[] } {
  const issues: string[] = [];
  const outputChecksum = sha256Bytes(bytes);
  if (outputChecksum !== prepared.checksum) {
    issues.push(PREPARED_ASSET_CHECKSUM_MISMATCH);
  }
  try {
    const dimensions = readPngDimensions(bytes);
    if (dimensions.width !== prepared.width || dimensions.height !== prepared.height) {
      issues.push(PREPARED_ASSET_DIMENSION_MISMATCH);
    }
  } catch {
    issues.push(PREPARED_ASSET_DIMENSION_MISMATCH);
  }
  return { valid: issues.length === 0, issues };
}
