import path from "node:path";
import { z } from "zod";
import {
  captionPlanSchema,
  canonicalVisualManifestSchema,
  localizedAlignmentManifestSchema,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  resolveCanonicalVisualManifestPath,
  writeJsonAtomic,
} from "@mediaforge/shared";
import type {
  PositioningVisualPlanV2,
  VisualEvent,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import type {
  VeronicaVisualBibleV1,
  VeronicaVisualTreatmentsArtifact,
} from "./veronica-visual-artifacts.js";

export const VERONICA_LOCALIZED_PRODUCTION_VERSION =
  "veronica-localized-production.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const localeVisualOverrideSchema = z.strictObject({
  semanticSceneId: z.string().min(1),
  reason: z.enum([
    "localized-readable-text",
    "cultural-adaptation",
    "locale-specific-product-context",
    "locale-specific-legal-context",
  ]),
  dependencyHash: sha256Schema,
});

export const veronicaLocalizedProductionArtifactSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_LOCALIZED_PRODUCTION_VERSION),
  episodeId: z.string().min(1),
  contentId: z.string().min(1),
  locale: z.string().min(2),
  variant: z.enum(["full", "short"]),
  master: z.strictObject({
    locale: z.literal("en"),
    narrationHash: sha256Schema,
    semanticPlanHash: sha256Schema,
    visualTreatmentsHash: sha256Schema,
    visualBibleHash: sha256Schema,
    providerPromptSetHash: sha256Schema,
  }),
  localized: z.strictObject({
    narrationHash: sha256Schema,
    translationVersion: z.string().min(1),
    selectedAudioHash: sha256Schema.nullable(),
    timingHash: sha256Schema,
    subtitleHash: sha256Schema,
    visualEventsHash: sha256Schema,
    semanticSceneIds: z.array(z.string().min(1)).min(1),
    timingAuthority: z.enum(["localized-selected-audio", "provisional-planning"]),
  }),
  visualReuse: z.strictObject({
    localeAloneInvalidatesImages: z.literal(false),
    generatedReadableTextAllowed: z.literal(false),
    overrides: z.array(localeVisualOverrideSchema),
    scenes: z.array(z.strictObject({
      semanticSceneId: z.string().min(1),
      wrapperSceneId: z.string().min(1),
      assetId: z.string().min(1),
      imageCacheKey: sha256Schema,
      decision: z.enum(["reuse-canonical", "regenerate-locale-override"]),
      reason: z.string().min(1),
    })).min(1),
    plannedImageCalls: z.number().int().nonnegative(),
    reusedImageCount: z.number().int().nonnegative(),
  }),
  artifacts: z.strictObject({
    canonicalVisualManifestPath: z.string().min(1),
    localizedAlignmentPath: z.string().min(1),
    captionPlanPath: z.string().min(1),
    localizedVisualEventsPath: z.string().min(1),
    renderManifestPath: z.string().min(1),
    publishManifestPath: z.string().min(1),
  }),
  artifactHash: sha256Schema,
});
export type VeronicaLocalizedProductionArtifact = z.infer<
  typeof veronicaLocalizedProductionArtifactSchema
>;

function portable(episodeDir: string, target: string): string {
  return path.relative(episodeDir, target).replace(/\\/gu, "/");
}

function localizedCaptionPlan(input: {
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly scenePlan: ScenePlan;
}) {
  return captionPlanSchema.parse({
    schemaVersion: 1,
    locale: input.locale,
    variant: input.variant,
    maxLineCount: 2,
    layoutVersion: "caption-plan-v1",
    segments: input.scenePlan.scenes.map((scene, index) => ({
      id: `caption-${String(index + 1).padStart(3, "0")}`,
      locale: input.locale,
      startMs: Math.round(scene.timing.startSeconds * 1_000),
      endMs: Math.max(
        Math.round(scene.timing.endSeconds * 1_000),
        Math.round(scene.timing.startSeconds * 1_000) + 1,
      ),
      text: scene.canonicalNarration,
      lines: [scene.canonicalNarration],
      maxLineCount: 2,
      layoutRegion: { x: 0.12, y: 0.68, width: 0.76, height: 0.16 },
      anchor: "lower-middle",
      safeAreaRefs: ["shorts-bottom-controls", "shorts-lower-right-controls"],
      shotIds: [],
      source: { kind: "scene", sceneId: scene.id },
    })),
    brandingSafeAreas: [],
    platformSafeAreas: [
      { x: 0, y: 0.84, width: 1, height: 0.16 },
      { x: 0.78, y: 0.58, width: 0.22, height: 0.34 },
    ],
  });
}

export async function persistVeronicaLocalizedProduction(input: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: "full" | "short";
  readonly narration: string;
  readonly selectedAudioHash: string | null;
  readonly timingHash: string;
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
  readonly visualEvents: readonly VisualEvent[];
  readonly treatments: VeronicaVisualTreatmentsArtifact;
  readonly bible: VeronicaVisualBibleV1;
  readonly localeVisualOverrides?: readonly z.infer<typeof localeVisualOverrideSchema>[];
  readonly now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const localeRoot = path.join(input.episodeDir, "locales", input.locale, input.variant);
  const canonicalVisualManifestPath = resolveCanonicalVisualManifestPath({
    episodeDir: input.episodeDir,
    variant: input.variant,
  });
  const localizedAlignmentPath = path.join(localeRoot, "localized-alignment.v1.json");
  const captionPlanPath = path.join(localeRoot, "captions", "caption-plan.v1.json");
  const localizedVisualEventsPath = path.join(localeRoot, "localized-visual-events.v1.json");
  const renderManifestPath = path.join(localeRoot, "render-manifest.v1.json");
  const publishManifestPath = path.join(localeRoot, "publish-manifest.v1.json");
  const productionPath = path.join(localeRoot, "localized-production.v1.json");

  const canonicalVisualManifest = canonicalVisualManifestSchema.parse({
    episodeSlug: input.episodeId,
    variant: input.variant,
    canonicalLanguage: "en",
    scenes: input.scenePlan.scenes.map((scene, index) => ({
      sceneId: scene.id,
      visualBeat: input.plan.scenes[index]?.visibleThesis ?? scene.visualPurpose,
      canonicalNarrationExcerpt: input.plan.scenes[index]?.narrationAnchor,
      characters: [...((scene as typeof scene & { readonly referenceCharacterIds?: readonly string[] }).referenceCharacterIds ?? [])],
      location: scene.setting,
      visibleElements: [scene.subject, scene.action],
      continuityTags: [...scene.continuityReferences],
      imagePrompt: scene.imagePrompt,
      imagePath: `visuals/${input.variant}/images/${scene.id}.png`,
      minDurationSeconds: input.variant === "short" ? 2.5 : 5,
      maxDurationSeconds: input.variant === "short" ? 9 : 12,
    })),
    createdAt: now,
    schemaVersion: 1,
  });
  const localizedAlignment = localizedAlignmentManifestSchema.parse({
    episodeSlug: input.episodeId,
    language: input.locale,
    variant: input.variant,
    canonicalVisualManifestPath: portable(input.episodeDir, canonicalVisualManifestPath),
    alignments: input.scenePlan.scenes.map((scene) => ({
      language: input.locale,
      variant: input.variant,
      sceneId: scene.id,
      narrationText: scene.canonicalNarration,
      audioStartSeconds: scene.timing.startSeconds,
      audioEndSeconds: scene.timing.endSeconds,
      confidence: (scene.timingConfidence as string | undefined) === "actual" ? 1 : (scene.timingConfidence as string | undefined) === "derived" ? 0.8 : 0.5,
    })),
    createdAt: now,
    schemaVersion: 1,
  });
  const captions = localizedCaptionPlan({
    locale: input.locale,
    variant: input.variant,
    scenePlan: input.scenePlan,
  });
  const localizedVisualEvents = {
    schemaVersion: "veronica-localized-visual-events.v1" as const,
    locale: input.locale,
    variant: input.variant,
    selectedAudioHash: input.selectedAudioHash,
    timingHash: input.timingHash,
    events: input.visualEvents,
    eventsHash: stableHash(input.visualEvents),
  };
  const overrides = [...(input.localeVisualOverrides ?? [])].map((override) =>
    localeVisualOverrideSchema.parse(override),
  );
  const overrideByScene = new Map(overrides.map((override) => [override.semanticSceneId, override]));
  const visualReuseScenes = input.plan.assets.map((asset) => {
    const semanticIndex = input.plan.scenes.findIndex((scene) => scene.sceneId === asset.sceneId);
    const scene = input.plan.scenes[semanticIndex];
    const wrapper = input.scenePlan.scenes[semanticIndex];
    if (!scene || !wrapper) {
      throw new Error(`VERONICA_LOCALIZED_VISUAL_REUSE_SCENE_MISSING:${asset.sceneId}`);
    }
    const override = overrideByScene.get(asset.sceneId);
    return {
      semanticSceneId: asset.sceneId,
      wrapperSceneId: wrapper.id,
      assetId: asset.assetId,
      imageCacheKey: override
        ? stableHash({ canonical: asset.generatedAssetCacheKey, override: override.dependencyHash })
        : asset.generatedAssetCacheKey,
      decision: override ? "regenerate-locale-override" as const : "reuse-canonical" as const,
      reason: override
        ? `explicit visual dependency: ${override.reason}`
        : "locale wording and timing are not image dependencies",
    };
  });
  const renderManifest = {
    schemaVersion: "veronica-localized-render-manifest.v1" as const,
    episodeId: input.episodeId,
    locale: input.locale,
    variant: input.variant,
    selectedAudioHash: input.selectedAudioHash,
    localizedAlignmentHash: stableHash(localizedAlignment),
    captionPlanHash: stableHash(captions),
    canonicalVisualManifestHash: stableHash(canonicalVisualManifest),
    renderProfile: input.variant === "short" ? "vertical" as const : "youtube" as const,
    status: "awaiting-canonical-images" as const,
  };
  const publishManifest = {
    schemaVersion: "veronica-localized-publish-manifest.v1" as const,
    episodeId: input.episodeId,
    locale: input.locale,
    variant: input.variant,
    renderManifestHash: stableHash(renderManifest),
    metadataPath: `locales/${input.locale}/${input.variant}/metadata/youtube-metadata.json`,
    captionsPath: portable(input.episodeDir, captionPlanPath),
    status: "blocked-until-validated-render" as const,
    providerMutations: 0 as const,
  };
  const artifactBase = {
    schemaVersion: VERONICA_LOCALIZED_PRODUCTION_VERSION,
    episodeId: input.episodeId,
    contentId: input.plan.contentId,
    locale: input.locale,
    variant: input.variant,
    master: {
      locale: "en" as const,
      narrationHash: input.plan.canonicalSourceHash,
      semanticPlanHash: input.plan.semanticPlanCacheKey,
      visualTreatmentsHash: input.treatments.artifactHash,
      visualBibleHash: input.bible.artifactHash,
      providerPromptSetHash: input.plan.canonicalImagePlanHash,
    },
    localized: {
      narrationHash: stableHash(input.narration),
      translationVersion: "content-pack-authored-localization.v1",
      selectedAudioHash: input.selectedAudioHash,
      timingHash: input.timingHash,
      subtitleHash: stableHash(captions),
      visualEventsHash: localizedVisualEvents.eventsHash,
      semanticSceneIds: input.plan.scenes.map((scene) => scene.sceneId),
      timingAuthority: input.selectedAudioHash
        ? "localized-selected-audio" as const
        : "provisional-planning" as const,
    },
    visualReuse: {
      localeAloneInvalidatesImages: false as const,
      generatedReadableTextAllowed: false as const,
      overrides,
      scenes: visualReuseScenes,
      plannedImageCalls: visualReuseScenes.filter((scene) => scene.decision === "regenerate-locale-override").length,
      reusedImageCount: visualReuseScenes.filter((scene) => scene.decision === "reuse-canonical").length,
    },
    artifacts: {
      canonicalVisualManifestPath: portable(input.episodeDir, canonicalVisualManifestPath),
      localizedAlignmentPath: portable(input.episodeDir, localizedAlignmentPath),
      captionPlanPath: portable(input.episodeDir, captionPlanPath),
      localizedVisualEventsPath: portable(input.episodeDir, localizedVisualEventsPath),
      renderManifestPath: portable(input.episodeDir, renderManifestPath),
      publishManifestPath: portable(input.episodeDir, publishManifestPath),
    },
  };
  const artifact = veronicaLocalizedProductionArtifactSchema.parse({
    ...artifactBase,
    artifactHash: stableHash(artifactBase),
  });
  await Promise.all([
    writeJsonAtomic(canonicalVisualManifestPath, canonicalVisualManifest),
    writeJsonAtomic(localizedAlignmentPath, localizedAlignment),
    writeJsonAtomic(captionPlanPath, captions),
    writeJsonAtomic(localizedVisualEventsPath, localizedVisualEvents),
    writeJsonAtomic(renderManifestPath, renderManifest),
    writeJsonAtomic(publishManifestPath, publishManifest),
    writeJsonAtomic(productionPath, artifact),
  ]);
  return {
    artifact,
    productionPath,
    canonicalVisualManifestPath,
    localizedAlignmentPath,
    captionPlanPath,
    localizedVisualEventsPath,
    renderManifestPath,
    publishManifestPath,
  };
}
