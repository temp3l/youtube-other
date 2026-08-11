import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { hashFile, writeJsonAtomic } from "@mediaforge/shared";
import type {
  PlannedScene,
  PositioningVisualPlanV2,
  VisualStrategy,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";

export const VERONICA_VISUAL_TREATMENTS_VERSION =
  "veronica-visual-treatments.v1" as const;
export const VERONICA_VISUAL_BIBLE_VERSION = "veronica-visual-bible.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const semanticPurposeSchema = z.enum([
  "hook",
  "problem",
  "contrast",
  "cause",
  "consequence",
  "solution",
  "proof",
  "insight",
  "resolution",
]);
const visualStrategySchema = z.enum([
  "literal",
  "metaphor",
  "contrast",
  "cause-effect",
  "transformation",
  "reaction",
  "diagrammatic",
]);

const narrationSpanRefSchema = z.strictObject({
  semanticSceneId: z.string().min(1),
  sentenceIds: z.array(z.string().min(1)).min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  spanHash: sha256Schema,
});

export const veronicaVisualTreatmentV1Schema = z.strictObject({
  version: z.literal(1),
  sceneId: z.string().min(1),
  narrationRef: narrationSpanRefSchema,
  semanticPurpose: semanticPurposeSchema,
  coreMeaning: z.string().min(1),
  viewerShouldUnderstand: z.string().min(1),
  visualThesis: z.string().min(1),
  visualStrategy: visualStrategySchema,
  subject: z.string().min(1),
  action: z.string().min(1),
  state: z.string().min(1),
  environment: z.string().min(1),
  symbolism: z.array(z.string().min(1)),
  emotionalState: z.string().min(1),
  negativeConstraints: z.array(z.string().min(1)),
  composition: z.strictObject({
    description: z.string().min(1),
    camera: z.string().min(1),
    lighting: z.string().min(1),
    subtitleSafeAreaRequired: z.literal(true),
  }),
  continuity: z.strictObject({
    characterRequired: z.boolean(),
    identityReferenceRequired: z.boolean(),
    episodeAnchorPreferred: z.boolean(),
  }),
  referenceRequirements: z.array(z.strictObject({
    kind: z.enum(["canonical-identity", "episode-anchor", "scene-reference"]),
    assetId: z.string().min(1),
    required: z.boolean(),
  })),
  treatmentHash: sha256Schema,
});
export type VeronicaVisualTreatmentV1 = z.infer<
  typeof veronicaVisualTreatmentV1Schema
>;

export const veronicaVisualTreatmentsArtifactSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_VISUAL_TREATMENTS_VERSION),
  contentId: z.string().min(1),
  masterLocale: z.literal("en"),
  masterNarrationHash: sha256Schema,
  semanticPlanHash: sha256Schema,
  treatments: z.array(veronicaVisualTreatmentV1Schema).min(1),
  artifactHash: sha256Schema,
});
export type VeronicaVisualTreatmentsArtifact = z.infer<
  typeof veronicaVisualTreatmentsArtifactSchema
>;

const characterReferenceManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  characterId: z.literal("veronica-benini"),
  identityVersion: z.string().min(1),
  canonicalSource: z.strictObject({
    path: z.string().min(1),
    sha256: sha256Schema,
    authority: z.literal("canonical"),
  }),
  references: z.array(z.strictObject({
    id: z.string().min(1),
    path: z.string().min(1),
    view: z.string().min(1),
    framing: z.string().min(1),
    expression: z.string().min(1),
    source: z.literal("derived"),
    sha256: sha256Schema,
  })).min(1),
  policy: z.strictObject({
    canonicalSourceRemainsAuthoritative: z.literal(true),
    derivedReferencesAreIdentityAssistOnly: z.literal(true),
    defaultMaxReferencesPerGeneration: z.number().int().positive(),
    doNotInheritFromReference: z.array(z.string().min(1)),
    activateForVariants: z.array(z.enum(["short", "full"])).min(1),
  }),
});

export const veronicaVisualBibleV1Schema = z.strictObject({
  schemaVersion: z.literal(VERONICA_VISUAL_BIBLE_VERSION),
  version: z.literal(1),
  contentId: z.string().min(1),
  characterIdentity: z.strictObject({
    characterId: z.literal("veronica-benini"),
    identityVersion: z.string().min(1),
    authority: z.literal("canonical-character-reference-pack"),
    manifestPath: z.string().min(1),
    canonicalSource: z.strictObject({ path: z.string().min(1), sha256: sha256Schema }),
    approvedReferences: z.array(z.strictObject({
      id: z.string().min(1),
      path: z.string().min(1),
      sha256: sha256Schema,
    })).min(1),
    requiredSceneIds: z.array(z.string().min(1)),
  }),
  wardrobe: z.string().min(1),
  palette: z.array(z.string().min(1)).min(1),
  lighting: z.string().min(1),
  editorialStyle: z.string().min(1),
  environmentDefaults: z.array(z.string().min(1)),
  recurringMotifs: z.array(z.string().min(1)),
  output: z.strictObject({
    aspectRatio: z.enum(["9:16", "16:9"]),
    subtitleSafeArea: z.strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    }),
    readableGeneratedTextAllowed: z.literal(false),
    logosAllowed: z.literal(false),
    watermarksAllowed: z.literal(false),
  }),
  continuityPolicy: z.strictObject({
    canonicalIdentityAlwaysWins: z.literal(true),
    episodeAnchorMayReplaceIdentity: z.literal(false),
    maxIdentityReferencesPerGeneration: z.number().int().positive(),
    referencePriority: z.tuple([
      z.literal("canonical-identity"),
      z.literal("episode-anchor"),
      z.literal("scene-reference"),
    ]),
  }),
  visualStoryBibleFingerprint: sha256Schema,
  artifactHash: sha256Schema,
});
export type VeronicaVisualBibleV1 = z.infer<
  typeof veronicaVisualBibleV1Schema
>;

function semanticPurpose(scene: PlannedScene): z.infer<typeof semanticPurposeSchema> {
  const text = `${scene.narrativeFunction} ${scene.progressionStage} ${scene.semanticProposition?.narrationClaim ?? ""}`.toLowerCase();
  if (scene.progressionStage === "HOOK" || scene.progressionStage === "COLD_OPEN") return "hook";
  if (scene.progressionStage === "PROOF" || /\bproof|evidence\b/u.test(text)) return "proof";
  if (scene.progressionStage === "REVERSAL" || /\bcontrast|versus|different\b/u.test(text)) return "contrast";
  if (/\bcause|because|why\b/u.test(text)) return "cause";
  if (/\bconsequence|result|therefore|confus|hesitat|fail\b/u.test(text)) return "consequence";
  if (scene.progressionStage === "METHOD" || /\bsolution|bridge|method|how\b/u.test(text)) return "solution";
  if (scene.progressionStage === "PAYOFF" || /\bpayoff|resolution|resolve\b/u.test(text)) return "resolution";
  if (scene.progressionStage === "EXPLANATION") return "insight";
  return "problem";
}

function visualStrategy(strategy: VisualStrategy): z.infer<typeof visualStrategySchema> {
  switch (strategy) {
    case "symbolic-metaphor": return "metaphor";
    case "comparison-composition":
    case "before-after":
    case "audience-segmentation": return "contrast";
    case "transformation": return "transformation";
    case "process-visualization": return "cause-effect";
    case "semantic-diagram": return "diagrammatic";
    case "social-interaction":
    case "client-decision":
    case "identity-perception": return "reaction";
    default: return "literal";
  }
}

function emotionalState(scene: PlannedScene): string {
  switch (scene.semanticProposition?.polarity) {
    case "NEGATIVE_STATE": return "controlled uncertainty without hostility or rejection";
    case "POSITIVE_STATE": return "clarity, confidence, and forward movement";
    case "CONTRAST": return "an immediately legible contrast between uncertainty and clarity";
    case "TRANSITION_NEGATIVE_TO_POSITIVE": return "movement from uncertainty toward clarity";
    case "TRANSITION_POSITIVE_TO_NEGATIVE": return "a visible loss of clarity or confidence";
    default: return "restrained editorial realism";
  }
}

export function buildVeronicaVisualTreatmentsArtifact(
  plan: PositioningVisualPlanV2,
): VeronicaVisualTreatmentsArtifact {
  const treatments = plan.scenes.map((scene) => {
    const proposition = scene.semanticProposition;
    if (!proposition || proposition.evidenceSpans.length === 0) {
      throw new Error(`VERONICA_VISUAL_TREATMENT_NARRATION_REF_MISSING:${scene.sceneId}`);
    }
    const spans = proposition.evidenceSpans;
    const characterRequired = scene.treatment.actors?.some(
      (actor) => actor.identityAuthority === "canonical-protagonist",
    ) ?? false;
    const asset = plan.assets.find((candidate) => candidate.sceneId === scene.sceneId);
    const withoutHash = {
      version: 1 as const,
      sceneId: scene.sceneId,
      narrationRef: {
        semanticSceneId: scene.sceneId,
        sentenceIds: spans.map((span) => span.sentenceId),
        startOffset: Math.min(...spans.map((span) => span.startOffset)),
        endOffset: Math.max(...spans.map((span) => span.endOffset)),
        spanHash: stableHash(spans.map((span) => span.spanHash)),
      },
      semanticPurpose: semanticPurpose(scene),
      coreMeaning: proposition.narrationClaim,
      viewerShouldUnderstand: proposition.buyerInterpretation ?? proposition.consequence,
      visualThesis: scene.visibleThesis,
      visualStrategy: visualStrategy(scene.treatment.strategy),
      subject: scene.treatment.subjectRequirement,
      action: scene.treatment.action,
      state: `${proposition.polarity}; ${proposition.stateRelation}`,
      environment: scene.treatment.environment,
      symbolism: [...scene.treatment.props],
      emotionalState: emotionalState(scene),
      negativeConstraints: [
        "no readable text, letters, numbers, logos, UI, or watermarks",
        "do not depict hostility, anger, or rejection when the required state is confusion",
        "do not transfer canonical identity to an observer, follower, customer, or buyer",
      ],
      composition: {
        description: scene.treatment.composition,
        camera: scene.treatment.camera,
        lighting: scene.treatment.lighting,
        subtitleSafeAreaRequired: true as const,
      },
      continuity: {
        characterRequired,
        identityReferenceRequired: characterRequired,
        episodeAnchorPreferred: false,
      },
      referenceRequirements: characterRequired && asset?.canonicalReferenceAssetId
        ? [{ kind: "canonical-identity" as const, assetId: asset.canonicalReferenceAssetId, required: true }]
        : [],
    };
    return veronicaVisualTreatmentV1Schema.parse({
      ...withoutHash,
      treatmentHash: stableHash(withoutHash),
    });
  });
  const base = {
    schemaVersion: VERONICA_VISUAL_TREATMENTS_VERSION,
    contentId: plan.contentId,
    masterLocale: "en" as const,
    masterNarrationHash: plan.canonicalSourceHash,
    semanticPlanHash: plan.semanticPlanCacheKey,
    treatments,
  };
  return veronicaVisualTreatmentsArtifactSchema.parse({
    ...base,
    artifactHash: stableHash(base),
  });
}

async function loadCharacterReferenceManifest(workspaceRoot: string) {
  const repositoryRoot = await Promise.all(
    [workspaceRoot, path.dirname(workspaceRoot)].map(async (candidate) => ({
      candidate,
      exists: await fs.access(path.join(candidate, "content-packs", "veronica-character-reference-v1", "manifest.json")).then(() => true).catch(() => false),
    })),
  ).then((candidates) => candidates.find((candidate) => candidate.exists)?.candidate);
  if (!repositoryRoot) {
    throw new Error("VERONICA_CANONICAL_REFERENCE_PACK_MISSING: content-packs/veronica-character-reference-v1/manifest.json");
  }
  const packRoot = path.join(repositoryRoot, "content-packs", "veronica-character-reference-v1");
  const manifestPath = path.join(packRoot, "manifest.json");
  const manifest = characterReferenceManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
  );
  const files = [manifest.canonicalSource, ...manifest.references];
  for (const file of files) {
    if (await hashFile(path.join(packRoot, file.path)) !== file.sha256) {
      throw new Error(`VERONICA_CANONICAL_REFERENCE_HASH_MISMATCH:${file.path}`);
    }
  }
  return { repositoryRoot, packRoot, manifestPath, manifest };
}

export async function buildVeronicaVisualBibleArtifact(input: {
  readonly workspaceRoot: string;
  readonly plan: PositioningVisualPlanV2;
}): Promise<VeronicaVisualBibleV1> {
  const loaded = await loadCharacterReferenceManifest(input.workspaceRoot);
  const storyBible = (input.plan as PositioningVisualPlanV2 & {
    readonly visualStoryBible?: PositioningVisualPlanV2["visualStoryBible"];
  }).visualStoryBible;
  const requiredSceneIds = input.plan.scenes.filter((scene) =>
    scene.treatment.actors?.some(
      (actor) => actor.identityAuthority === "canonical-protagonist",
    ) ?? false,
  ).map((scene) => scene.sceneId);
  const subtitleSafeArea = input.plan.assets.flatMap((asset) =>
    asset.ratioAdaptations
      .filter((adaptation) => adaptation.aspectRatio === input.plan.aspectRatio)
      .flatMap((adaptation) => adaptation.safeRegions)
      .filter((region) => region.id === "subtitle"),
  )[0] ?? { x: 0.12, y: 0.72, width: 0.76, height: 0.16 };
  const withoutHash = {
    schemaVersion: VERONICA_VISUAL_BIBLE_VERSION,
    version: 1 as const,
    contentId: input.plan.contentId,
    characterIdentity: {
      characterId: loaded.manifest.characterId,
      identityVersion: loaded.manifest.identityVersion,
      authority: "canonical-character-reference-pack" as const,
      manifestPath: path.relative(loaded.repositoryRoot, loaded.manifestPath).replace(/\\/gu, "/"),
      canonicalSource: {
        path: path.relative(loaded.repositoryRoot, path.join(loaded.packRoot, loaded.manifest.canonicalSource.path)).replace(/\\/gu, "/"),
        sha256: loaded.manifest.canonicalSource.sha256,
      },
      approvedReferences: loaded.manifest.references.map((reference) => ({
        id: reference.id,
        path: path.relative(loaded.repositoryRoot, path.join(loaded.packRoot, reference.path)).replace(/\\/gu, "/"),
        sha256: reference.sha256,
      })),
      requiredSceneIds,
    },
    wardrobe: input.plan.continuity.mode === "persistent-protagonist"
      ? input.plan.continuity.appearance.wardrobeAnchor
      : "episode-directed occupation-neutral editorial wardrobe",
    palette: input.plan.visualVocabulary.materialPalette.length > 0
      ? [...input.plan.visualVocabulary.materialPalette]
      : ["restrained neutrals", "warm evidence accents"],
    lighting: "naturalistic editorial light with scene-specific contrast",
    editorialStyle: "contemporary European editorial business-psychology realism",
    environmentDefaults: [...input.plan.visualVocabulary.environments],
    recurringMotifs: [...(storyBible?.visualMotifs ?? input.plan.visualVocabulary.recurringMotifs)],
    output: {
      aspectRatio: input.plan.aspectRatio,
      subtitleSafeArea: {
        x: subtitleSafeArea.x,
        y: subtitleSafeArea.y,
        width: subtitleSafeArea.width,
        height: subtitleSafeArea.height,
      },
      readableGeneratedTextAllowed: false as const,
      logosAllowed: false as const,
      watermarksAllowed: false as const,
    },
    continuityPolicy: {
      canonicalIdentityAlwaysWins: true as const,
      episodeAnchorMayReplaceIdentity: false as const,
      maxIdentityReferencesPerGeneration: loaded.manifest.policy.defaultMaxReferencesPerGeneration,
      referencePriority: ["canonical-identity", "episode-anchor", "scene-reference"] as const,
    },
    visualStoryBibleFingerprint: storyBible?.fingerprint ?? stableHash({
      legacyDerived: true,
      contentId: input.plan.contentId,
      vocabularyHash: input.plan.visualVocabulary.vocabularyHash,
    }),
  };
  return veronicaVisualBibleV1Schema.parse({
    ...withoutHash,
    artifactHash: stableHash(withoutHash),
  });
}

export async function persistVeronicaVisualArtifacts(input: {
  readonly workspaceRoot: string;
  readonly episodeDir: string;
  readonly plan: PositioningVisualPlanV2;
}) {
  const treatments = buildVeronicaVisualTreatmentsArtifact(input.plan);
  const bible = await buildVeronicaVisualBibleArtifact(input);
  const treatmentsPath = path.join(input.episodeDir, "shared", "visual-treatments.v1.json");
  const biblePath = path.join(input.episodeDir, "shared", "visual-bible.v1.json");
  await Promise.all([
    writeJsonAtomic(treatmentsPath, treatments),
    writeJsonAtomic(biblePath, bible),
  ]);
  return { treatments, bible, treatmentsPath, biblePath };
}
