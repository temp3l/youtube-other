import { MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION } from "@mediaforge/visual-planning";
import type { VisualAssetRegistryReadPort } from "@mediaforge/domain";

import {
  buildMicrodramaSharedVisualCacheKey,
  buildMicrodramaSharedVisualDependencies,
} from "./cache-key.js";
import {
  type MicrodramaImageProviderPort,
  type MicrodramaVisualGenerationEffect,
  type MicrodramaVisualGenerationRequest,
  microdramaVisualGenerationEffectSchema,
  microdramaVisualGenerationRequestSchema,
} from "./contracts.js";
import {
  collectRegistryRevisionFingerprints,
  evaluateMicrodramaVisualDispatch,
} from "./dispatch-gates.js";
import {
  InMemorySharedVisualCache,
  type SharedVisualCacheEntry,
} from "./shared-visual-cache.js";

export class MicrodramaVisualGenerationBlockedError extends Error {
  public constructor(
    public readonly issues: readonly {
      readonly code: string;
      readonly message: string;
    }[]
  ) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "MicrodramaVisualGenerationBlockedError";
  }
}

export type MicrodramaVisualGenerationServiceInput = {
  readonly request: MicrodramaVisualGenerationRequest;
  readonly sceneShotPlanApproved: boolean;
  readonly registry: VisualAssetRegistryReadPort;
  readonly provider: MicrodramaImageProviderPort;
  readonly cache: InMemorySharedVisualCache;
  readonly seenRequestIds?: ReadonlySet<string>;
};

export async function generateMicrodramaVisualAsset(
  input: MicrodramaVisualGenerationServiceInput
): Promise<MicrodramaVisualGenerationEffect> {
  const request = microdramaVisualGenerationRequestSchema.parse(input.request);
  const dispatch = evaluateMicrodramaVisualDispatch({
    request,
    sceneShotPlanApproved: input.sceneShotPlanApproved,
    registry: input.registry,
    seenRequestIds: input.seenRequestIds,
  });
  if (!dispatch.approved) {
    throw new MicrodramaVisualGenerationBlockedError(dispatch.issues);
  }

  const revisions = collectRegistryRevisionFingerprints({
    registry: input.registry,
    references: request.registryReferences,
  });
  const cacheKey = buildMicrodramaSharedVisualCacheKey({
    assetKind: request.assetKind,
    shotSemanticId: request.shotSemanticId,
    sourcePlateSemanticId: request.sourcePlateSemanticId,
    sceneShotPlanRevisionId: request.sceneShotPlanRevisionId,
    registryRevisionFingerprints: revisions.map((revision) => revision.contentHash),
    promptVersion: MICRODRAMA_SOURCE_PLATE_PROMPT_VERSION,
  });

  if (!request.forceRegeneration) {
    const cached = input.cache.get(cacheKey.cacheKey);
    if (cached.status === "hit") {
      return microdramaVisualGenerationEffectSchema.parse({
        ...cached.entry.effect,
        requestId: request.requestId,
        cacheHit: true,
        estimatedCostMinor: 0,
      });
    }
    if (cached.status === "invalidated") {
      throw new MicrodramaVisualGenerationBlockedError([
        {
          code: "cache_invalidated",
          message: `Shared visual cache invalidated: ${cached.reasons.join(", ")}`,
        },
      ]);
    }
  }

  const providerResult = await input.provider.generate({
    request,
    cacheKey: cacheKey.cacheKey,
  });
  const effect = microdramaVisualGenerationEffectSchema.parse({
    schemaVersion: request.schemaVersion,
    requestId: request.requestId,
    cacheKey: cacheKey.cacheKey,
    artifactHash: providerResult.artifactHash,
    storageUri: providerResult.storageUri,
    providerRequestId: providerResult.providerRequestId,
    cacheHit: false,
    estimatedCostMinor: providerResult.estimatedCostMinor,
  });

  const entry: SharedVisualCacheEntry = {
    cacheKey: cacheKey.cacheKey,
    dependencies: buildMicrodramaSharedVisualDependencies({
      sceneShotPlanRevisionId: request.sceneShotPlanRevisionId,
      registryReferences: revisions.map((revision) => ({
        revisionId: revision.revisionId,
        contentHash: revision.contentHash,
      })),
    }),
    effect,
  };
  input.cache.put(entry);
  return effect;
}
