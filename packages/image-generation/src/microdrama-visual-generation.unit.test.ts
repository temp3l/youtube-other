import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
  type VisualAssetRegistryReadPort,
  type VisualRegistryRevisionEnvelope,
} from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  buildMicrodramaSharedVisualCacheKey,
  createMockMicrodramaImageProvider,
  generateMicrodramaVisualAsset,
  InMemorySharedVisualCache,
  MicrodramaVisualGenerationBlockedError,
  type MicrodramaVisualGenerationRequest,
} from "./microdrama-visual-generation/index.js";
import {
  assertSourceImagePromptIsLanguageNeutral,
  buildMicrodramaSourcePlatePrompt,
  containsLocalizedReadableText,
} from "@mediaforge/visual-planning";
import {
  buildMicrodramaSharedVisualArtifactIdentity,
  planMicrodramaSharedVisualInvalidation,
} from "@mediaforge/workflow-engine";

const seriesId = "series.seven-minutes-ahead";
const createdAt = "2026-08-12T12:00:00.000Z";
const portraitHash =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function approvedCharacterRevision(
  overrides: Partial<VisualRegistryRevisionEnvelope> = {}
): VisualRegistryRevisionEnvelope {
  const payload = {
    displayName: "Mira Chen",
    characterId: "char.mira-chen",
  };
  return {
    schemaVersion: VISUAL_ASSET_REGISTRY_SCHEMA_VERSION,
    revisionId: "var.char.mira-chen.rev.1",
    seriesId,
    entryId: "char.mira-chen",
    entryKind: "character",
    revisionNumber: 1,
    status: "ACCEPTED",
    payload,
    contentHash: computePayloadHash(payload),
    parentRevisionIds: [],
    referenceAssets: [
      {
        artifactHash: portraitHash,
        mimeType: "image/png",
        byteSize: 1024,
        storageUri: "file:///registry/char.mira-chen/portrait.png",
        role: "portrait",
      },
    ],
    provenance: { sourceKind: "import" },
    createdAt,
    ...overrides,
  };
}

function memoryRegistry(
  revisions: Record<string, VisualRegistryRevisionEnvelope>
): VisualAssetRegistryReadPort {
  return {
    getRevision(revisionId: string) {
      return revisions[revisionId] ?? null;
    },
    getAcceptedRevision(series, entryId, entryKind) {
      return (
        Object.values(revisions).find(
          (revision) =>
            revision.seriesId === series &&
            revision.entryId === entryId &&
            revision.entryKind === entryKind &&
            revision.status === "ACCEPTED"
        ) ?? null
      );
    },
  };
}

function baseRequest(
  overrides: Partial<MicrodramaVisualGenerationRequest> = {}
): MicrodramaVisualGenerationRequest {
  const prompt = buildMicrodramaSourcePlatePrompt({
    sourcePlateSemanticId: "plate.sem.e001.001",
    sceneSemanticId: "scene.sem.e001.001",
    blockingKind: "establishing",
    registryRevisionFingerprints: [approvedCharacterRevision().contentHash],
    sceneShotPlanRevisionId: "rev.scene-shot.e001.v1",
  });
  return {
    schemaVersion: "mediaforge.microdrama.visual-generation.v1",
    requestId: "req.visual.plate.sem.e001.001",
    seriesId,
    episodeId: "E001",
    sceneShotPlanRevisionId: "rev.scene-shot.e001.v1",
    assetKind: "source_plate",
    shotSemanticId: "shot.sem.e001.001.001",
    sourcePlateSemanticId: "plate.sem.e001.001",
    sceneSemanticId: "scene.sem.e001.001",
    blockingKind: "establishing",
    registryReferences: [
      {
        entryId: "char.mira-chen",
        entryKind: "character",
        revisionId: "var.char.mira-chen.rev.1",
      },
    ],
    promptText: prompt.promptText,
    forceRegeneration: false,
    ...overrides,
  };
}

describe("microdrama shared visual generation", () => {
  it("rejects localized readable text in source-image prompts", () => {
    expect(containsLocalizedReadableText("Hallo, wie geht es dir?")).toBe(true);
    expect(containsLocalizedReadableText("plate.sem.e001.001")).toBe(false);
    expect(() =>
      assertSourceImagePromptIsLanguageNeutral(
        "A cinematic frame with the subtitle: Guten Abend"
      )
    ).toThrow(/Localized readable text/);
  });

  it("builds stable shared cache keys from shot and plate semantic ids", () => {
    const revision = approvedCharacterRevision();
    const left = buildMicrodramaSharedVisualCacheKey({
      assetKind: "source_plate",
      shotSemanticId: "shot.sem.e001.001.001",
      sourcePlateSemanticId: "plate.sem.e001.001",
      sceneShotPlanRevisionId: "rev.scene-shot.e001.v1",
      registryRevisionFingerprints: [revision.contentHash],
      promptVersion: "mediaforge.microdrama.source-plate-prompt.v1",
    });
    const right = buildMicrodramaSharedVisualCacheKey({
      assetKind: "source_plate",
      shotSemanticId: "shot.sem.e001.001.001",
      sourcePlateSemanticId: "plate.sem.e001.001",
      sceneShotPlanRevisionId: "rev.scene-shot.e001.v1",
      registryRevisionFingerprints: [revision.contentHash],
      promptVersion: "mediaforge.microdrama.source-plate-prompt.v1",
    });
    const differentPlate = buildMicrodramaSharedVisualCacheKey({
      assetKind: "source_plate",
      shotSemanticId: "shot.sem.e001.002.001",
      sourcePlateSemanticId: "plate.sem.e001.002",
      sceneShotPlanRevisionId: "rev.scene-shot.e001.v1",
      registryRevisionFingerprints: [revision.contentHash],
      promptVersion: "mediaforge.microdrama.source-plate-prompt.v1",
    });

    expect(left.cacheKey).toBe(right.cacheKey);
    expect(left.cacheKey).not.toBe(differentPlate.cacheKey);
    expect(left.canonicalInput).not.toContain("de-DE");
    expect(left.canonicalInput).not.toContain("en-US");
  });

  it("blocks dispatch when scene-shot plan is not approved or continuity fails", async () => {
    const revision = approvedCharacterRevision();
    const registry = memoryRegistry({ [revision.revisionId]: revision });
    const cache = new InMemorySharedVisualCache();
    const provider = createMockMicrodramaImageProvider();

    await expect(
      generateMicrodramaVisualAsset({
        request: baseRequest(),
        sceneShotPlanApproved: false,
        registry,
        provider,
        cache,
      })
    ).rejects.toBeInstanceOf(MicrodramaVisualGenerationBlockedError);

    await expect(
      generateMicrodramaVisualAsset({
        request: baseRequest({
          registryReferences: [
            {
              entryId: "char.mira-chen",
              entryKind: "character",
              revisionId: "var.char.mira-chen.missing",
            },
          ],
        }),
        sceneShotPlanApproved: true,
        registry,
        provider,
        cache,
      })
    ).rejects.toMatchObject({
      issues: [{ code: "registry_continuity_failed" }],
    });
  });

  it("reuses cached artifacts across locales and invalidates on dependency change", async () => {
    const revision = approvedCharacterRevision();
    const registry = memoryRegistry({ [revision.revisionId]: revision });
    const cache = new InMemorySharedVisualCache();
    const provider = createMockMicrodramaImageProvider();
    const request = baseRequest();

    const first = await generateMicrodramaVisualAsset({
      request,
      sceneShotPlanApproved: true,
      registry,
      provider,
      cache,
    });
    const second = await generateMicrodramaVisualAsset({
      request: {
        ...request,
        requestId: "req.visual.plate.sem.e001.001.retry",
      },
      sceneShotPlanApproved: true,
      registry,
      provider,
      cache,
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.artifactHash).toBe(first.artifactHash);

    const identity = buildMicrodramaSharedVisualArtifactIdentity({
      episodeId: "E001",
      shotSemanticId: request.shotSemanticId,
      sourcePlateSemanticId: request.sourcePlateSemanticId,
      sceneShotPlanRevisionId: request.sceneShotPlanRevisionId,
      registryDependencies: [
        {
          revisionId: revision.revisionId,
          contentHash: revision.contentHash,
        },
      ],
      cacheKey: first.cacheKey,
    });
    const invalidation = planMicrodramaSharedVisualInvalidation({
      artifacts: [identity],
      changes: [
        {
          kind: "configuration",
          id: `scene-shot-plan:${request.sceneShotPlanRevisionId}`,
          fingerprint: createHash("sha256")
            .update("rev.scene-shot.e001.v2", "utf8")
            .digest("hex"),
        },
      ],
    });
    expect(invalidation).toEqual([
      {
        artifactId: identity.artifactId,
        reasons: ["dependency-changed:configuration:scene-shot-plan:rev.scene-shot.e001.v1"],
      },
    ]);

    const invalidated = cache.invalidateByDependencyChanges({
      changes: [
        {
          kind: "configuration",
          id: `scene-shot-plan:${request.sceneShotPlanRevisionId}`,
          fingerprint: "rev.scene-shot.e001.v2",
        },
      ],
    });
    expect(invalidated).toHaveLength(1);
    expect(invalidated[0]?.cacheKey).toBe(first.cacheKey);

    await expect(
      generateMicrodramaVisualAsset({
        request,
        sceneShotPlanApproved: true,
        registry,
        provider,
        cache,
      })
    ).rejects.toMatchObject({
      issues: [{ code: "cache_invalidated" }],
    });
  });
});
