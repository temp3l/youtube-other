import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import { writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { z } from "zod";
import type { PositioningVisualPlanV2 } from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import type { VeronicaVisualBibleV1 } from "./veronica-visual-artifacts.js";

export const VERONICA_PROVIDER_IMAGE_PROMPT_ARTIFACT_VERSION =
  "veronica-provider-image-prompts.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const veronicaProviderImagePromptArtifactSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_PROVIDER_IMAGE_PROMPT_ARTIFACT_VERSION),
  episodeId: z.string().min(1),
  contentId: z.string().min(1),
  language: z.string().min(2),
  variant: z.enum(["full", "short"]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  generationStrategy: z.enum(["deterministic-v1", "openai", "legacy-deterministic"]),
  canonicalImagePlanHash: sha256Schema,
  compiler: z.strictObject({
    version: z.string().min(1),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1),
  }).nullable(),
  provenance: z.strictObject({
    masterNarrationHash: sha256Schema,
    semanticScenePlanHash: sha256Schema,
    visualTreatmentsHash: sha256Schema,
    visualBibleHash: sha256Schema,
    selectedAudioHash: sha256Schema.nullable(),
    canonicalIdentity: z.strictObject({
      characterId: z.literal("veronica-benini"),
      identityVersion: z.string().min(1),
      canonicalSourceHash: sha256Schema,
      approvedReferenceHashes: z.array(sha256Schema).min(1),
    }),
    providerProfile: z.strictObject({
      adapter: z.literal("canonical-openai-image-adapter"),
      settingsHash: sha256Schema,
    }),
  }),
  sceneCount: z.number().int().positive(),
  promptCount: z.number().int().positive(),
  prompts: z.array(z.strictObject({
    wrapperSceneId: z.string().min(1),
    semanticSceneId: z.string().min(1),
    assetId: z.string().min(1),
    imagePrompt: z.string().min(1),
    promptHash: sha256Schema,
    compilationInputHash: sha256Schema.nullable(),
    compilationResultHash: sha256Schema.nullable(),
    propositionHash: sha256Schema.nullable(),
    treatmentHash: sha256Schema,
    materializationRevisionId: sha256Schema,
    subjectIdentityId: z.string().nullable(),
    canonicalReferenceAssetId: z.string().nullable(),
    continuityReferenceAssetIds: z.array(z.string().min(1)),
    referenceAssetId: z.string().nullable(),
    providerSemanticQa: z.strictObject({
      status: z.enum(["PASS", "BLOCKED"]),
      canonicalContractHash: sha256Schema,
      providerPromptHash: sha256Schema,
      blockerCodes: z.array(z.string().min(1)),
    }).nullable(),
    sameSnapshot: z.boolean(),
  })).min(1),
  artifactHash: sha256Schema,
});

export type VeronicaProviderImagePromptArtifact = z.infer<
  typeof veronicaProviderImagePromptArtifactSchema
>;

export function resolveVeronicaProviderImagePromptArtifactPaths(input: {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
}) {
  const directory = path.join(
    input.episodeDir,
    "locales",
    input.language,
    input.variant,
    "image-prompts",
  );
  return {
    directory,
    jsonPath: path.join(directory, "provider-image-prompts.v1.json"),
    markdownPath: path.join(directory, "provider-image-prompts.md"),
  };
}

function createArtifact(input: {
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
  readonly visualTreatmentsHash: string;
  readonly visualBible: VeronicaVisualBibleV1;
  readonly selectedAudioHash: string | null;
}): VeronicaProviderImagePromptArtifact {
  const scenePlan = scenePlanSchema.parse(input.scenePlan);
  const generationStrategy = input.plan.imagePromptGenerationStrategy ?? "legacy-deterministic";
  const prompts = input.plan.assets.map((asset, assetIndex) => {
    const assetId = asset.assetId ?? `${asset.sceneId}-asset-${assetIndex + 1}`;
    const semanticIndex = input.plan.scenes.findIndex((scene) => scene.sceneId === asset.sceneId);
    const scene = input.plan.scenes[semanticIndex];
    const wrapper = scenePlan.scenes[semanticIndex];
    if (!scene || !wrapper || !scene.materializationRevision) {
      throw new Error(`VERONICA_PROVIDER_PROMPT_ARTIFACT_SCENE_MISSING:${assetId}`);
    }
    const compilation = asset.promptCompilation;
    const sameSnapshot = generationStrategy === "legacy-deterministic" || Boolean(
      compilation
      && compilation.result.imagePrompt === asset.prompt
      && compilation.input.provenance.materializationRevisionId === scene.materializationRevision.revisionId
      && compilation.input.provenance.treatmentHash === scene.treatment.treatmentHash
      && compilation.input.provenance.propositionHash === scene.semanticProposition?.propositionHash,
    );
    if (!sameSnapshot) {
      throw new Error(`VERONICA_PROVIDER_PROMPT_ARTIFACT_SNAPSHOT_MISMATCH:${assetId}`);
    }
    return {
      wrapperSceneId: wrapper.id,
      semanticSceneId: scene.sceneId,
      assetId,
      imagePrompt: asset.prompt,
      promptHash: stableHash(asset.prompt),
      compilationInputHash: compilation?.inputHash ?? null,
      compilationResultHash: compilation?.resultHash ?? null,
      propositionHash: scene.semanticProposition?.propositionHash ?? null,
      treatmentHash: scene.treatment.treatmentHash,
      materializationRevisionId: scene.materializationRevision.revisionId,
      subjectIdentityId: asset.subjectIdentityId,
      canonicalReferenceAssetId: asset.canonicalReferenceAssetId ?? null,
      continuityReferenceAssetIds: [...(asset.continuityReferenceAssetIds ?? [])],
      referenceAssetId: asset.referenceAssetId ?? null,
      providerSemanticQa: compilation?.semanticQa
        ? {
            status: compilation.semanticQa.status,
            canonicalContractHash: compilation.semanticQa.canonicalContractHash,
            providerPromptHash: compilation.semanticQa.providerPromptHash,
            blockerCodes: compilation.semanticQa.blockers.map((blocker) => blocker.code),
          }
        : null,
      sameSnapshot,
    };
  });
  const base = {
    schemaVersion: VERONICA_PROVIDER_IMAGE_PROMPT_ARTIFACT_VERSION,
    episodeId: input.episodeId,
    contentId: input.plan.contentId,
    language: input.language,
    variant: input.variant,
    aspectRatio: input.plan.aspectRatio,
    generationStrategy,
    canonicalImagePlanHash: input.plan.canonicalImagePlanHash ?? stableHash(prompts),
    compiler: input.plan.imagePromptCompilation
      ? {
          version: input.plan.imagePromptCompilation.compilerVersion,
          model: input.plan.imagePromptCompilation.compilerModel,
          reasoningEffort: input.plan.imagePromptCompilation.reasoningEffort,
        }
      : null,
    provenance: {
      masterNarrationHash: input.plan.canonicalSourceHash,
      semanticScenePlanHash: input.plan.semanticPlanCacheKey,
      visualTreatmentsHash: input.visualTreatmentsHash,
      visualBibleHash: input.visualBible.artifactHash,
      selectedAudioHash: input.selectedAudioHash,
      canonicalIdentity: {
        characterId: input.visualBible.characterIdentity.characterId,
        identityVersion: input.visualBible.characterIdentity.identityVersion,
        canonicalSourceHash: input.visualBible.characterIdentity.canonicalSource.sha256,
        approvedReferenceHashes: input.visualBible.characterIdentity.approvedReferences.map((reference) => reference.sha256),
      },
      providerProfile: {
        adapter: "canonical-openai-image-adapter" as const,
        settingsHash: stableHash({
          aspectRatio: input.plan.aspectRatio,
          textInGeneratedImage: false,
          referencePriority: input.visualBible.continuityPolicy.referencePriority,
        }),
      },
    },
    sceneCount: input.plan.scenes.length,
    promptCount: prompts.length,
    prompts,
  } as const;
  return veronicaProviderImagePromptArtifactSchema.parse({
    ...base,
    artifactHash: stableHash(base),
  });
}

export function renderVeronicaProviderImagePromptsMarkdown(
  artifact: VeronicaProviderImagePromptArtifact,
): string {
  const grouped = new Map<string, Array<(typeof artifact.prompts)[number]>>();
  for (const prompt of artifact.prompts) {
    const entries = grouped.get(prompt.wrapperSceneId) ?? [];
    entries.push(prompt);
    grouped.set(prompt.wrapperSceneId, entries);
  }
  return [
    "# UNAPPROVED — DO NOT SUBMIT",
    "",
    "These are the exact persisted provider-facing prompts. Provider submission remains blocked until readiness and human pre-image approval pass.",
    "",
    ...[...grouped.entries()].flatMap(([sceneId, prompts]) => [
      `## ${sceneId}`,
      "",
      ...prompts.flatMap((prompt) => [
        `### Asset ${prompt.assetId}`,
        "",
        prompt.imagePrompt,
        "",
      ]),
    ]),
  ].join("\n");
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export async function persistVeronicaProviderImagePromptArtifact(input: {
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
  readonly visualTreatmentsHash: string;
  readonly visualBible: VeronicaVisualBibleV1;
  readonly selectedAudioHash: string | null;
}) {
  const paths = resolveVeronicaProviderImagePromptArtifactPaths(input);
  const artifact = createArtifact(input);
  const markdown = renderVeronicaProviderImagePromptsMarkdown(artifact);
  await fs.mkdir(paths.directory, { recursive: true });
  await Promise.all([
    writeJsonAtomic(paths.jsonPath, artifact),
    writeTextAtomic(paths.markdownPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`),
  ]);
  const [jsonStat, markdownStat, jsonSha256, markdownSha256] = await Promise.all([
    fs.stat(paths.jsonPath), fs.stat(paths.markdownPath), sha256(paths.jsonPath), sha256(paths.markdownPath),
  ]);
  return {
    ...paths,
    artifact,
    jsonSha256,
    markdownSha256,
    jsonSizeBytes: jsonStat.size,
    markdownSizeBytes: markdownStat.size,
  };
}

export async function loadVeronicaProviderImagePromptArtifact(input: {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly expectedCanonicalImagePlanHash: string;
}) {
  const paths = resolveVeronicaProviderImagePromptArtifactPaths(input);
  const [raw, markdown] = await Promise.all([
    fs.readFile(paths.jsonPath, "utf8"),
    fs.readFile(paths.markdownPath, "utf8"),
  ]).catch(() => {
    throw new Error("VERONICA_PROVIDER_PROMPT_ARTIFACT_MISSING: rerun prepare-production");
  });
  const artifact = veronicaProviderImagePromptArtifactSchema.parse(JSON.parse(raw) as unknown);
  const { artifactHash: _artifactHash, ...base } = artifact;
  if (artifact.artifactHash !== stableHash(base)
    || artifact.canonicalImagePlanHash !== input.expectedCanonicalImagePlanHash
    || artifact.prompts.some((prompt) => stableHash(prompt.imagePrompt) !== prompt.promptHash)
    || renderVeronicaProviderImagePromptsMarkdown(artifact).trimEnd() !== markdown.trimEnd()) {
    throw new Error("VERONICA_PROVIDER_PROMPT_ARTIFACT_STALE_OR_CORRUPT: rerun prepare-production");
  }
  return { ...paths, artifact, markdown, json: raw };
}
