import { createHash } from "node:crypto";

import type { MicrodramaVisualAssetKind } from "./contracts.js";

export const MICRODRAMA_SHARED_VISUAL_CACHE_KEY_VERSION =
  "mediaforge.microdrama.shared-visual-cache.v1" as const;

export type MicrodramaSharedVisualCacheKeyInput = {
  readonly assetKind: MicrodramaVisualAssetKind;
  readonly shotSemanticId: string;
  readonly sourcePlateSemanticId: string;
  readonly sceneShotPlanRevisionId: string;
  readonly registryRevisionFingerprints: readonly string[];
  readonly promptVersion: string;
};

export type MicrodramaSharedVisualCacheKey = {
  readonly schemaVersion: typeof MICRODRAMA_SHARED_VISUAL_CACHE_KEY_VERSION;
  readonly cacheKey: string;
  readonly canonicalInput: string;
};

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export function buildMicrodramaSharedVisualCacheKey(
  input: MicrodramaSharedVisualCacheKeyInput
): MicrodramaSharedVisualCacheKey {
  const registryRevisionFingerprints = [...input.registryRevisionFingerprints]
    .map((fingerprint) => fingerprint.toLowerCase())
    .sort();
  const material = {
    schemaVersion: MICRODRAMA_SHARED_VISUAL_CACHE_KEY_VERSION,
    assetKind: input.assetKind,
    shotSemanticId: input.shotSemanticId,
    sourcePlateSemanticId: input.sourcePlateSemanticId,
    sceneShotPlanRevisionId: input.sceneShotPlanRevisionId,
    registryRevisionFingerprints,
    promptVersion: input.promptVersion,
    localeScope: "language-independent",
  } as const;
  const canonicalInput = canonicalJson(material);
  return {
    schemaVersion: MICRODRAMA_SHARED_VISUAL_CACHE_KEY_VERSION,
    canonicalInput,
    cacheKey: createHash("sha256").update(canonicalInput, "utf8").digest("hex"),
  };
}

export function buildMicrodramaSharedVisualDependencies(input: {
  readonly sceneShotPlanRevisionId: string;
  readonly registryReferences: ReadonlyArray<{
    readonly revisionId: string;
    readonly contentHash: string;
  }>;
}): readonly { readonly kind: "source" | "configuration"; readonly id: string; readonly fingerprint: string }[] {
  return [
    {
      kind: "configuration",
      id: `scene-shot-plan:${input.sceneShotPlanRevisionId}`,
      fingerprint: input.sceneShotPlanRevisionId,
    },
    ...input.registryReferences
      .map((reference) => ({
        kind: "source" as const,
        id: `registry:${reference.revisionId}`,
        fingerprint: reference.contentHash,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ];
}
