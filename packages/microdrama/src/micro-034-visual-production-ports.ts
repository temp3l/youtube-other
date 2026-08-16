import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
  type ShotVisualRegistryReference,
  type VisualAssetRegistryReadPort,
  type VisualRegistryRevisionEnvelope,
} from "@mediaforge/domain";
import {
  createMockMicrodramaImageProvider,
  createOpenAiMicrodramaImageProviderFromEnv,
  generateMicrodramaVisualAsset,
  InMemorySharedVisualCache,
  type MicrodramaImageProviderPort,
  type MicrodramaVisualGenerationRequest,
} from "../../image-generation/src/microdrama-visual-generation/index.js";
import { computePayloadHash } from "@mediaforge/narrative-core";

import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";
import type { V5SceneShotPlanRecord } from "./v5-scene-shot-compiler-contracts.js";
import {
  expandMicrodramaProviderPromptFromRequest,
  loadSevenMinutesAheadEpisodeVisualContexts,
  loadSevenMinutesAheadVisualLexicon,
} from "./microdrama-visual-lexicon.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmNIQAAAABJRU5ErkJggg==";

export function createMinimalPngBuffer(): Buffer {
  return Buffer.from(MINIMAL_PNG_BASE64, "base64");
}

function buildSeedRegistryRevision(input: {
  readonly reference: ShotVisualRegistryReference;
  readonly createdAt: string;
}): VisualRegistryRevisionEnvelope {
  const payload = {
    entryId: input.reference.entryId,
    entryKind: input.reference.entryKind,
  };
  return {
    schemaVersion: VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
    revisionId: input.reference.revisionId,
    seriesId: SEVEN_MINUTES_AHEAD_SERIES_ID,
    entryId: input.reference.entryId,
    entryKind: input.reference.entryKind,
    revisionNumber: 1,
    status: "ACCEPTED",
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [],
    referenceAssets: [
      {
        artifactHash: computePayloadHash({
          entryId: input.reference.entryId,
          seed: true,
        }),
        mimeType: "image/png",
        byteSize: 128,
        storageUri: `seed://registry/${input.reference.entryId}.png`,
        role: "portrait",
      },
    ],
    provenance: { sourceKind: "import" },
    createdAt: input.createdAt,
  };
}

export function buildV5SeedVisualAssetRegistry(input: {
  readonly plan: V5SceneShotPlanRecord;
  readonly createdAt: string;
}): VisualAssetRegistryReadPort {
  const revisions = new Map<string, VisualRegistryRevisionEnvelope>();
  for (const scene of input.plan.scenes) {
    for (const reference of scene.registryReferences) {
      if (!revisions.has(reference.revisionId)) {
        revisions.set(
          reference.revisionId,
          buildSeedRegistryRevision({ reference, createdAt: input.createdAt })
        );
      }
    }
  }
  return {
    getRevision(revisionId: string) {
      return revisions.get(revisionId) ?? null;
    },
    getAcceptedRevision(seriesId, entryId, entryKind) {
      return (
        [...revisions.values()].find(
          (revision) =>
            revision.seriesId === seriesId &&
            revision.entryId === entryId &&
            revision.entryKind === entryKind &&
            revision.status === "ACCEPTED"
        ) ?? null
      );
    },
  };
}

export type Micro034VisualProductionPort = {
  readonly registry: VisualAssetRegistryReadPort;
  readonly cache: InMemorySharedVisualCache;
  readonly providerId: string;
  generateSharedVisual(input: {
    readonly request: MicrodramaVisualGenerationRequest;
    readonly outputPath: string;
    readonly sceneShotPlanApproved?: boolean;
    readonly registry?: VisualAssetRegistryReadPort;
    /** Spoken narration overlapping this plate's shot window. */
    readonly narrationMoment?: string;
  }): Promise<{
    readonly artifactHash: string;
    readonly estimatedCostMinor: number;
    readonly cacheHit: boolean;
    readonly providerRequestId: string;
  }>;
};

function createEmptyRegistry(): VisualAssetRegistryReadPort {
  return {
    getRevision() {
      return null;
    },
    getAcceptedRevision() {
      return null;
    },
  };
}

function buildVisualProductionPort(input: {
  readonly provider: MicrodramaImageProviderPort;
  readonly writeImageBytes: (outputPath: string) => void;
  readonly registry?: VisualAssetRegistryReadPort;
  readonly cache?: InMemorySharedVisualCache;
}): Micro034VisualProductionPort {
  const registry = input.registry ?? createEmptyRegistry();
  const cache = input.cache ?? new InMemorySharedVisualCache();

  return {
    registry,
    cache,
    providerId: input.provider.id,
    async generateSharedVisual(args) {
      const effect = await generateMicrodramaVisualAsset({
        request: args.request,
        sceneShotPlanApproved: args.sceneShotPlanApproved ?? true,
        registry: args.registry ?? registry,
        provider: input.provider,
        cache,
      });
      input.writeImageBytes(args.outputPath);
      return {
        artifactHash: effect.artifactHash,
        estimatedCostMinor: effect.estimatedCostMinor,
        cacheHit: effect.cacheHit,
        providerRequestId: effect.providerRequestId ?? `${input.provider.id}-unknown`,
      };
    },
  };
}

export function createMicro034MockVisualProductionPort(input?: {
  readonly estimatedCostMinor?: number;
  readonly writeImageBytes?: (outputPath: string) => void;
}): Micro034VisualProductionPort {
  const estimatedCostMinor = input?.estimatedCostMinor ?? 25;
  const writeImageBytes =
    input?.writeImageBytes ??
    ((outputPath: string) => {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, createMinimalPngBuffer());
    });
  const imageProvider = createMockMicrodramaImageProvider({
    providerId: "mock-image",
    estimatedCostMinor,
  });

  return buildVisualProductionPort({
    provider: imageProvider,
    writeImageBytes,
  });
}

export function createMicro034MockVisualProductionPortFromEnv(): Micro034VisualProductionPort {
  return createMicro034MockVisualProductionPort();
}

export function createMicro034LiveVisualProductionPort(input?: {
  readonly estimatedCostMinor?: number;
  readonly provider?: MicrodramaImageProviderPort;
  readonly packRoot?: string;
  readonly resolveProviderPrompt?: (args: {
    readonly request: MicrodramaVisualGenerationRequest;
    readonly cacheKey: string;
  }) => string;
}): Micro034VisualProductionPort {
  const estimatedCostMinor = input?.estimatedCostMinor ?? 25;
  const bytesByArtifactHash = new Map<string, Buffer>();
  let pendingBytes: Buffer | undefined;
  const registry = createEmptyRegistry();
  const cache = new InMemorySharedVisualCache();

  const lexicon = loadSevenMinutesAheadVisualLexicon({ packRoot: input?.packRoot });
  const episodeContexts = loadSevenMinutesAheadEpisodeVisualContexts({
    packRoot: input?.packRoot,
  });
  let activeNarrationMoment: string | undefined;
  const resolveProviderPrompt =
    input?.resolveProviderPrompt ??
    ((args: {
      readonly request: MicrodramaVisualGenerationRequest;
      readonly cacheKey: string;
    }) =>
      expandMicrodramaProviderPromptFromRequest({
        request: args.request,
        lexicon,
        episodeContexts,
        narrationMoment: activeNarrationMoment,
      }));

  const provider =
    input?.provider ??
    createOpenAiMicrodramaImageProviderFromEnv({
      estimatedCostMinor,
      onGenerated: (bytes) => {
        pendingBytes = bytes;
      },
      resolveProviderPrompt,
    });

  return {
    registry,
    cache,
    providerId: provider.id,
    async generateSharedVisual(args) {
      activeNarrationMoment = args.narrationMoment;
      try {
        const effect = await generateMicrodramaVisualAsset({
          request: args.request,
          sceneShotPlanApproved: args.sceneShotPlanApproved ?? true,
          registry: args.registry ?? registry,
          provider,
          cache,
        });

        let bytes = pendingBytes;
        if (bytes) {
          bytesByArtifactHash.set(effect.artifactHash, bytes);
          pendingBytes = undefined;
        } else {
          bytes = bytesByArtifactHash.get(effect.artifactHash);
        }
        if (!bytes) {
          throw new Error(
            "OpenAI microdrama image provider did not materialize image bytes."
          );
        }

        mkdirSync(path.dirname(args.outputPath), { recursive: true });
        writeFileSync(args.outputPath, bytes);
        return {
          artifactHash: effect.artifactHash,
          estimatedCostMinor: effect.estimatedCostMinor,
          cacheHit: effect.cacheHit,
          providerRequestId: effect.providerRequestId ?? `${provider.id}-unknown`,
        };
      } finally {
        activeNarrationMoment = undefined;
      }
    },
  };
}

export function createMicro034LiveVisualProductionPortFromEnv(): Micro034VisualProductionPort {
  return createMicro034LiveVisualProductionPort();
}

export function attachPlanRegistryToVisualProductionPort(input: {
  readonly port: Micro034VisualProductionPort;
  readonly plan: V5SceneShotPlanRecord;
  readonly createdAt: string;
  readonly estimatedCostMinor?: number;
}): Micro034VisualProductionPort {
  const registry = buildV5SeedVisualAssetRegistry({
    plan: input.plan,
    createdAt: input.createdAt,
  });

  return {
    registry,
    cache: input.port.cache,
    providerId: input.port.providerId,
    async generateSharedVisual(args) {
      return input.port.generateSharedVisual({
        ...args,
        registry,
      });
    },
  };
}
