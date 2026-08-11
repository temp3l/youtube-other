import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { episodeManifestSchema, scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import { fileExists, normalizeEpisodeId, normalizeWhitespace, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  applyVeronicaSourceGroundedRemediationDirectives,
  hardenVeronicaPreImagePlan,
  rebuildVeronicaFinalTreatmentState,
  reviewVeronicaPreImageTreatment,
  veronicaPreImageSemanticReviewSchema,
  VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION,
} from "./veronica-pre-image-semantic-gate.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import type { PositioningVisualPlanV2, VisualEvent } from "./positioning-visual-contracts.js";
import { deriveVeronicaSemanticProposition, visualTreatmentFromProposition } from "./veronica-semantic-quality.js";
import { stableHash } from "./positioning-visual-semantics.js";
import {
  InMemorySourceGroundedVisualQaCache,
  runSourceGroundedVisualQaController,
  unavailableSourceGroundedVisualQaPolicy,
  type EpisodeSequenceJudgePort,
  type SemanticRemediationAdvisorPort,
  type SourceGroundedSceneJudgePort,
  type SourceGroundedQaProgress,
  type SourceGroundedVisualQaCachePort,
  type SourceGroundedVisualQaPolicy,
} from "./source-grounded-visual-qa.js";
import type { SourceGroundedQaScheduler } from "./source-grounded-qa-scheduler.js";
import {
  compileVeronicaImagePrompts,
  type VeronicaImagePromptCompilationCachePort,
  type VeronicaImagePromptCompilerModel,
  type VeronicaImagePromptCompilerPort,
} from "./veronica-image-prompt-compiler.js";
import { persistVeronicaProviderImagePromptArtifact } from "./veronica-provider-image-prompt-artifact.js";
import {
  resolveVeronicaCanonicalTiming,
  veronicaTimedNarrationUnitSchema,
  type VeronicaResolvedCanonicalTiming,
  type VeronicaTimedNarrationUnit,
} from "./veronica-canonical-timing.js";
import { persistVeronicaVisualArtifacts } from "./veronica-visual-artifacts.js";
import {
  veronicaVisualBibleV1Schema,
  veronicaVisualTreatmentsArtifactSchema,
} from "./veronica-visual-artifacts.js";
import { persistVeronicaLocalizedProduction } from "./veronica-localized-production.js";

export const POSITIONING_PRODUCTION_ADAPTER_VERSION = "veronicabenini-positioning-production-adapter.v4" as const;
export const VERONICA_LONG_FORM_SEMANTIC_SEGMENTATION_VERSION = "veronica-long-form-semantic-segmentation.v3" as const;

const productionSceneSchema = z
  .object({
    sceneId: z.string().min(1),
    progressionStage: z.string().min(1),
    narrationAnchor: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    treatment: z
      .object({
        narrativeBeat: z.string().min(1),
        communicationIntent: z.string().min(1),
        subjectRequirement: z.string().min(1),
        environment: z.string().min(1),
        composition: z.string().min(1),
        camera: z.string().min(1),
        lighting: z.string().min(1),
        action: z.string().min(1),
        actionOwnerRole: z.enum(["expert", "buyer", "shared", "none"]).optional(),
        props: z.array(z.string()),
      })
      .passthrough(),
  })
  .passthrough();

const productionAssetSchema = z
  .object({
    sceneId: z.string().min(1),
    prompt: z.string().min(1),
    nativeAspectRatio: z.enum(["16:9", "9:16"]),
    textFree: z.literal(true),
    textInGeneratedImage: z.literal(false),
  })
  .passthrough();

export const positioningProductionPlanSchema = z
  .object({
    schemaVersion: z.literal("veronicabenini-positioning-visual-plan.v2"),
    contentId: z.string().min(1),
    format: z.enum(["long", "short"]),
    aspectRatio: z.enum(["16:9", "9:16"]),
    scenes: z.array(productionSceneSchema).min(1),
    assets: z.array(productionAssetSchema).min(1),
    // A semantic-gate failure may still be compiled into a human review pack; it
    // never becomes provider-ready because every resulting scene is explicitly
    // `semantic-review-required`.
    validation: z.object({ status: z.enum(["pass", "fail"]) }).passthrough(),
    planHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .passthrough();

export type PositioningProductionPlan = z.infer<typeof positioningProductionPlanSchema>;

export interface PreparePositioningProductionEpisodeInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly planPath?: string;
  readonly scriptPath?: string;
  readonly language: "en" | "de" | "es" | "fr" | "pt" | "it";
  readonly variant: "full" | "short";
  readonly imagePromptCompiler?: {
    readonly strategy: "deterministic-v1" | "openai";
    readonly compiler: VeronicaImagePromptCompilerPort;
    readonly cache: VeronicaImagePromptCompilationCachePort;
    readonly model: VeronicaImagePromptCompilerModel;
  };
  readonly sourceGroundedVisualQa?: {
    readonly policy: SourceGroundedVisualQaPolicy;
    readonly primaryJudge: SourceGroundedSceneJudgePort;
    readonly escalationJudge?: SourceGroundedSceneJudgePort;
    readonly finalJudge?: SourceGroundedSceneJudgePort;
    readonly remediationAdvisor?: SemanticRemediationAdvisorPort;
    readonly sequenceJudge: EpisodeSequenceJudgePort;
    readonly cache?: SourceGroundedVisualQaCachePort;
    readonly scheduler?: SourceGroundedQaScheduler;
    readonly onProgress?: (progress: SourceGroundedQaProgress) => void;
  };
}

export interface PreparePositioningProductionEpisodeResult {
  readonly schemaVersion: typeof POSITIONING_PRODUCTION_ADAPTER_VERSION;
  readonly episodeId: string;
  readonly contentId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly planPath: string;
  readonly scriptPath: string;
  readonly manifestPath: string;
  readonly scenePlanPath: string;
  readonly providerImagePromptsJsonPath: string;
  readonly providerImagePromptsMarkdownPath: string;
  readonly visualTreatmentsPath: string;
  readonly visualBiblePath: string;
  readonly localizedProductionPath: string;
  readonly sceneCount: number;
  readonly semanticRemediationRounds: number;
  readonly semanticRemediationStatus: "CONVERGED" | "NO_OP" | "SEMANTIC_REMEDIATION_EXHAUSTED";
  readonly sourceGroundedVisualQaStatus: "PASS" | "BLOCKED";
}

function defaultScriptPath(episodeDir: string, language: string, variant: "full" | "short"): string {
  return variant === "short" ? path.join(episodeDir, "languages", "short", `script-${language}.md`) : path.join(episodeDir, "languages", `script-${language}.md`);
}

function splitNarration(narration: string, count: number): readonly string[] {
  const normalized = normalizeWhitespace(narration.replace(/^---[\s\S]*?---\s*/u, "").replace(/^#{1,6}\s+.*$/gmu, ""));
  if (!normalized) {
    throw new Error("Veronica production preparation requires non-empty narration.");
  }
  const sentences = normalized
    .split(/(?<=[.!?…])\s+/u)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  const units = sentences.length > 0 ? sentences : [normalized];
  const chunks = Array.from({ length: count }, () => "");
  const totalWords = units.reduce((sum, unit) => sum + unit.split(/\s+/u).filter(Boolean).length, 0);
  let sceneIndex = 0;
  let assignedWords = 0;
  for (const unit of units) {
    const remainingScenes = count - sceneIndex;
    const remainingWords = totalWords - assignedWords;
    const target = remainingWords / Math.max(1, remainingScenes);
    const currentWords = chunks[sceneIndex]!.split(/\s+/u).filter(Boolean).length;
    if (sceneIndex < count - 1 && currentWords > 0 && currentWords >= target) {
      sceneIndex += 1;
    }
    chunks[sceneIndex] = normalizeWhitespace(`${chunks[sceneIndex]} ${unit}`);
    assignedWords += unit.split(/\s+/u).filter(Boolean).length;
  }
  for (let index = 0; index < chunks.length; index += 1) {
    if (!chunks[index]) chunks[index] = chunks[index - 1] ?? normalized;
  }
  return chunks;
}

function narrationParagraphs(narration: string): readonly string[] {
  const body = narration
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/^#{1,6}\s+.*$/gmu, "")
    .trim();
  return body
    .split(/\n\s*\n+/u)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

/**
 * Expands only when authored long-form narration contains more materially
 * distinct semantic groups than the current visual plan. Camera/crop events
 * never count as semantic coverage.
 */
export function expandVeronicaLongFormSemanticScenes(input: { readonly plan: PositioningVisualPlanV2; readonly narration: string }): {
  readonly plan: PositioningVisualPlanV2;
  readonly narrationByScene: readonly string[];
  readonly expanded: boolean;
} {
  if (input.plan.format !== "long")
    return {
      plan: input.plan,
      narrationByScene: splitNarration(input.narration, input.plan.scenes.length),
      expanded: false,
    };
  const persisted = (
    input.plan as PositioningVisualPlanV2 & {
      readonly semanticSegmentation?: {
        readonly version?: string;
        readonly sourceSceneCount?: number;
      };
    }
  ).semanticSegmentation;
  if (persisted?.version === VERONICA_LONG_FORM_SEMANTIC_SEGMENTATION_VERSION)
    return {
      plan: input.plan,
      narrationByScene: input.plan.scenes.map((scene) => scene.narrationAnchor),
      expanded: false,
    };
  const paragraphs = narrationParagraphs(input.narration);
  if (paragraphs.length <= 1)
    return {
      plan: input.plan,
      narrationByScene: splitNarration(input.narration, input.plan.scenes.length),
      expanded: false,
    };
  const wordCount = (value: string) => value.split(/\s+/u).filter(Boolean).length;
  const totalWords = paragraphs.reduce((sum, paragraph) => sum + wordCount(paragraph), 0);
  let cursor = 0;
  const classified = paragraphs.map((paragraph) => {
    const words = wordCount(paragraph);
    const midpoint = cursor + words / 2;
    cursor += words;
    const baseIndex = Math.min(input.plan.scenes.length - 1, Math.floor((midpoint / Math.max(1, totalWords)) * input.plan.scenes.length));
    const base = input.plan.scenes[baseIndex]!;
    const proposition = deriveVeronicaSemanticProposition({
      scene: { ...base, narrationAnchor: paragraph },
      narration: paragraph,
    });
    const polarityFamily =
      proposition.polarity === "NEGATIVE_STATE" ? "negative" : proposition.polarity === "POSITIVE_STATE" ? "positive" : proposition.polarity === "NEUTRAL" ? "neutral" : "relational";
    return {
      paragraph,
      words,
      baseIndex,
      proposition,
      signature: `${proposition.visualMechanism}:${proposition.stateRelation}:${polarityFamily}`,
    };
  });
  const groups: {
    paragraphs: string[];
    words: number;
    baseIndexes: number[];
    signature: string;
  }[] = [];
  for (const entry of classified) {
    const previous = groups.at(-1);
    const shortBridge = entry.words < 8 || /\?$/u.test(entry.paragraph);
    if (previous && (previous.signature === entry.signature || shortBridge || previous.words < 10)) {
      previous.paragraphs.push(entry.paragraph);
      previous.words += entry.words;
      previous.baseIndexes.push(entry.baseIndex);
    } else {
      groups.push({
        paragraphs: [entry.paragraph],
        words: entry.words,
        baseIndexes: [entry.baseIndex],
        signature: entry.signature,
      });
    }
  }
  // Re-evaluate the assembled chunks. A short bridge can change the selected
  // source mechanism of the complete beat; merge adjacent chunks when their
  // final structured signatures converge so segmentation does not manufacture
  // duplicate semantic assets.
  const consolidated: typeof groups = [];
  for (const group of groups) {
    const narrationAnchor = group.paragraphs.join(" ");
    const baseIndex = group.baseIndexes[Math.floor(group.baseIndexes.length / 2)] ?? 0;
    const proposition = deriveVeronicaSemanticProposition({
      scene: { ...input.plan.scenes[baseIndex]!, narrationAnchor },
      narration: narrationAnchor,
    });
    const polarityFamily =
      proposition.polarity === "NEGATIVE_STATE" ? "negative" : proposition.polarity === "POSITIVE_STATE" ? "positive" : proposition.polarity === "NEUTRAL" ? "neutral" : "relational";
    const signature = `${proposition.visualMechanism}:${proposition.stateRelation}:${polarityFamily}`;
    const previous = consolidated.at(-1);
    if (previous?.signature === signature) {
      previous.paragraphs.push(...group.paragraphs);
      previous.words += group.words;
      previous.baseIndexes.push(...group.baseIndexes);
    } else {
      consolidated.push({ ...group, signature });
    }
  }
  groups.splice(0, groups.length, ...consolidated);
  // If two adjacent narration chunks still resolve to the same independently
  // renderable treatment, they are one semantic asset—not two camera beats.
  // Re-derive after each merge so the decision follows the combined evidence.
  const treatmentSignature = (group: (typeof groups)[number]): string => {
    const narrationAnchor = group.paragraphs.join(" ");
    const baseIndex = group.baseIndexes[Math.floor(group.baseIndexes.length / 2)] ?? 0;
    const seed = { ...input.plan.scenes[baseIndex]!, narrationAnchor };
    const proposition = deriveVeronicaSemanticProposition({
      scene: seed,
      narration: narrationAnchor,
    });
    if (proposition.visualMechanism === "UNRESOLVED") return stableHash({ unresolved: proposition.propositionHash });
    const treatment = visualTreatmentFromProposition({
      scene: seed,
      proposition,
      preserveEnvironment: false,
    });
    return stableHash({
      environment: treatment.environment,
      composition: treatment.composition,
      action: treatment.action,
      props: treatment.props,
    });
  };
  let mergedEquivalentTreatment = true;
  while (mergedEquivalentTreatment) {
    mergedEquivalentTreatment = false;
    for (let index = 1; index < groups.length; index += 1) {
      const previous = groups[index - 1]!;
      const current = groups[index]!;
      if (treatmentSignature(previous) !== treatmentSignature(current)) continue;
      previous.paragraphs.push(...current.paragraphs);
      previous.words += current.words;
      previous.baseIndexes.push(...current.baseIndexes);
      groups.splice(index, 1);
      mergedEquivalentTreatment = true;
      break;
    }
  }
  if (!persisted && groups.length <= input.plan.scenes.length)
    return {
      plan: input.plan,
      narrationByScene: splitNarration(input.narration, input.plan.scenes.length),
      expanded: false,
    };
  const totalDurationMs = input.plan.scenes.at(-1) ? input.plan.scenes.at(-1)!.startMs + input.plan.scenes.at(-1)!.durationMs : 0;
  let startMs = 0;
  const assets = [] as PositioningVisualPlanV2["assets"][number][];
  const scenes = groups.map((group, index) => {
    const narrationAnchor = group.paragraphs.join(" ");
    const baseIndex = group.baseIndexes[Math.floor(group.baseIndexes.length / 2)] ?? 0;
    const base = input.plan.scenes[baseIndex]!;
    const seed = { ...base, narrationAnchor };
    const proposition = deriveVeronicaSemanticProposition({
      scene: seed,
      narration: narrationAnchor,
    });
    const projected =
      proposition.visualMechanism === "UNRESOLVED"
        ? undefined
        : visualTreatmentFromProposition({
            scene: seed,
            proposition,
            preserveEnvironment: false,
          });
    const suffix = String(index + 1).padStart(2, "0");
    const sceneId = `${base.sceneId}-SB${suffix}`;
    const assetId = `${base.assetId}-sb${suffix}`;
    const durationMs = index === groups.length - 1 ? totalDurationMs - startMs : Math.max(1, Math.round((totalDurationMs * group.words) / Math.max(1, totalWords)));
    const treatment = {
      ...base.treatment,
      ...(projected ?? {}),
      treatmentId: `${base.treatment.treatmentId}-sb${suffix}`,
      sceneId,
    };
    const scene = {
      ...base,
      sceneId,
      narrationAnchor,
      startMs,
      durationMs,
      treatment,
      assetId,
      eventIds: [],
      visibleThesis: projected?.narrativeBeat ?? base.visibleThesis,
      newInformation: `${proposition.cause ?? proposition.narrationClaim}; ${proposition.consequence}.`,
      semanticProposition: proposition,
    };
    const sourceAsset = input.plan.assets.find((asset) => asset.sceneId === base.sceneId) ?? input.plan.assets[0]!;
    const { projectionProvenance: _staleProjection, semanticFingerprint: _staleSemanticFingerprint, generatedAssetCacheKey: _staleAssetCacheKey, ...sourceAssetBase } = sourceAsset;
    assets.push({
      ...sourceAssetBase,
      assetId,
      sceneId,
      semanticPurpose: scene.visibleThesis,
      semanticFingerprint: stableHash({
        sceneId,
        propositionHash: proposition.propositionHash,
      }),
      generatedAssetCacheKey: stableHash({
        assetId,
        propositionHash: proposition.propositionHash,
        segmentation: VERONICA_LONG_FORM_SEMANTIC_SEGMENTATION_VERSION,
      }),
    });
    startMs += durationMs;
    return scene;
  });
  const segmentation = {
    version: VERONICA_LONG_FORM_SEMANTIC_SEGMENTATION_VERSION,
    sourceNarrationHash: stableHash(input.narration),
    sourceSceneCount: persisted?.sourceSceneCount ?? input.plan.scenes.length,
    semanticSceneCount: scenes.length,
    semanticAssetDensity: scenes.length / Math.max(1, groups.length),
  };
  const basePlan = {
    ...input.plan,
    scenes,
    assets,
    visualEvents: [],
    semanticSegmentation: segmentation,
    semanticPlanCacheKey: stableHash({
      previous: input.plan.semanticPlanCacheKey,
      segmentation,
    }),
    canonicalImagePlanHash: stableHash({ assets, segmentation }),
    renderEventPlanHash: stableHash({
      segmentation,
      scenes: scenes.map((scene) => ({
        sceneId: scene.sceneId,
        startMs: scene.startMs,
        durationMs: scene.durationMs,
      })),
    }),
  };
  return {
    plan: { ...basePlan, planHash: stableHash(basePlan) },
    narrationByScene: scenes.map((scene) => scene.narrationAnchor),
    expanded: true,
  } as const;
}

export function compilePositioningProductionScenePlan(input: {
  readonly episodeId: string;
  readonly narration: string;
  readonly plan: PositioningProductionPlan;
  readonly narrationByScene?: readonly string[];
}): ScenePlan {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const orderedScenes = [...input.plan.scenes].sort((left, right) => left.startMs - right.startMs);
  const narrationChunks = input.narrationByScene ?? splitNarration(input.narration, orderedScenes.length);
  if (narrationChunks.length !== orderedScenes.length) throw new Error("Veronica semantic narration segmentation must match the visual scene count.");
  // A semantic scene may own several provider assets. The scene wrapper has a
  // single imagePrompt slot, so materialize the first (primary) asset exactly as
  // the coherence validator and review surfaces do.
  const assets = new Map<string, PositioningProductionPlan["assets"][number]>();
  for (const asset of input.plan.assets) {
    if (!assets.has(asset.sceneId)) assets.set(asset.sceneId, asset);
  }
  return scenePlanSchema.parse({
    sourceId: episodeId,
    scenes: orderedScenes.map((planned, index) => {
      const asset = assets.get(planned.sceneId);
      if (!asset) {
        throw new Error(`Missing generated-asset plan for ${planned.sceneId}.`);
      }
      const sceneId = `scene-${String(index + 1).padStart(3, "0")}`;
      const startSeconds = planned.startMs / 1_000;
      const endSeconds = (planned.startMs + planned.durationMs) / 1_000;
      const actorAssignments = (planned.treatment as { readonly actors?: readonly { readonly role: string; readonly identityAuthority: string }[] }).actors ?? [];
      const hasCanonicalProtagonist = actorAssignments.some((actor) => actor.role === "expert" && actor.identityAuthority === "canonical-protagonist");
      const previousActors = index > 0 ? ((orderedScenes[index - 1]!.treatment as { readonly actors?: readonly { readonly role: string; readonly identityAuthority: string }[] }).actors ?? []) : [];
      const previousHasCanonicalProtagonist = previousActors.some((actor) => actor.role === "expert" && actor.identityAuthority === "canonical-protagonist");
      const subjectIdentityId = (asset as { readonly subjectIdentityId?: string | null }).subjectIdentityId ?? null;
      return {
        id: sceneId,
        sequenceNumber: index + 1,
        canonicalNarration: narrationChunks[index],
        sourceSegmentIds: [sceneId],
        estimatedDurationSeconds: planned.durationMs / 1_000,
        timing: { startSeconds, endSeconds },
        visualPurpose: `${planned.progressionStage}: ${planned.treatment.communicationIntent}`,
        textRequirement: { required: false },
        subject: planned.treatment.subjectRequirement,
        action: planned.treatment.action,
        setting: planned.treatment.environment,
        composition: planned.treatment.composition,
        cameraFraming: planned.treatment.camera,
        mood: `${planned.treatment.lighting}; ${planned.progressionStage.toLowerCase()}`,
        continuityReferences: index > 0 && hasCanonicalProtagonist && previousHasCanonicalProtagonist ? [`scene-${String(index).padStart(3, "0")}`] : [],
        referenceCharacterIds: hasCanonicalProtagonist && subjectIdentityId ? [subjectIdentityId] : [],
        onScreenText: "",
        negativeConstraints: [
          "no readable text, letters, numbers, logos, UI, or watermarks",
          "no depiction or synthetic likeness of Veronica Benini",
          "no generic motivational stock montage, laptop-at-desk pose, or stock handshake",
          "observer, follower, and customer identities must remain distinct from the canonical professional",
        ],
        aspectRatios: [asset.nativeAspectRatio],
        imagePrompt: asset.prompt,
        expectedImageFilenames: [`${sceneId}-${asset.nativeAspectRatio.replace(":", "x")}.png`],
        qualityStatus: "semantic-review-required",
      };
    }),
  });
}

export function positioningScenePlanMaterializationReasons(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly scenePlan: ScenePlan;
}): readonly string[] {
  return input.scenePlan.scenes.flatMap((wrapper, index) => {
    const scene = input.plan.scenes[index];
    const asset = scene ? input.plan.assets.find((candidate) => candidate.sceneId === scene.sceneId) : undefined;
    if (!scene || !asset) return [`scene-${index + 1}:missing-canonical-scene-or-asset`];
    const provenance = asset.projectionProvenance;
    return [
      ...(wrapper.subject !== scene.treatment.subjectRequirement ? [`${scene.sceneId}:subject-revision-mismatch`] : []),
      ...(wrapper.action !== scene.treatment.action ? [`${scene.sceneId}:action-revision-mismatch`] : []),
      ...(wrapper.setting !== scene.treatment.environment ? [`${scene.sceneId}:environment-revision-mismatch`] : []),
      ...(wrapper.composition !== scene.treatment.composition ? [`${scene.sceneId}:composition-revision-mismatch`] : []),
      ...(wrapper.cameraFraming !== scene.treatment.camera ? [`${scene.sceneId}:camera-revision-mismatch`] : []),
      ...(wrapper.imagePrompt !== asset.prompt ? [`${scene.sceneId}:provider-prompt-revision-mismatch`] : []),
      ...(!scene.materializationRevision ? [`${scene.sceneId}:missing-materialization-revision`] : []),
      ...(scene.materializationRevision && provenance?.materializationRevisionId !== scene.materializationRevision.revisionId ? [`${scene.sceneId}:mixed-materialization-revision`] : []),
      ...(provenance?.sourceTreatmentHash !== scene.treatment.treatmentHash ? [`${scene.sceneId}:mixed-treatment-hash`] : []),
      ...(provenance?.sourcePropositionHash !== (scene.semanticProposition?.propositionHash ?? null) ? [`${scene.sceneId}:mixed-proposition-hash`] : []),
      ...(provenance?.providerPromptHash !== stableHash(asset.prompt) ? [`${scene.sceneId}:mixed-provider-prompt-hash`] : []),
    ];
  });
}

function waveDurationSeconds(bytes: Buffer): number | null {
  if (bytes.length < 44 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") return null;
  let offset = 12;
  let byteRate: number | null = null;
  let dataSize: number | null = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString("ascii");
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 16 <= bytes.length) byteRate = bytes.readUInt32LE(offset + 16);
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  return byteRate && dataSize !== null && byteRate > 0 ? dataSize / byteRate : null;
}

export function reconcileScenePlanToCanonicalAudio(input: {
  readonly scenePlan: ScenePlan;
  readonly selectedAudioHash: string;
  readonly selectedAudioDurationSeconds: number;
  readonly selectedAudioBytes?: Buffer;
  readonly timedNarrationUnits?: readonly VeronicaTimedNarrationUnit[];
}): { readonly scenePlan: ScenePlan; readonly timing: VeronicaResolvedCanonicalTiming } {
  const timing = resolveVeronicaCanonicalTiming({
    selectedAudioHash: input.selectedAudioHash,
    selectedAudioDurationSeconds: input.selectedAudioDurationSeconds,
    ...(input.selectedAudioBytes ? { selectedAudioBytes: input.selectedAudioBytes } : {}),
    ...(input.timedNarrationUnits ? { timedNarrationUnits: input.timedNarrationUnits } : {}),
    scenes: input.scenePlan.scenes.map((scene) => ({
      sceneId: scene.id,
      narration: scene.canonicalNarration,
      plannedDurationSeconds: scene.timing.endSeconds - scene.timing.startSeconds,
    })),
  });
  const byScene = new Map(timing.scenes.map((scene) => [scene.sceneId, scene] as const));
  const scenePlan = scenePlanSchema.parse({
    ...input.scenePlan,
    scenes: input.scenePlan.scenes.map((scene) => {
      const planned = scene.timing.endSeconds - scene.timing.startSeconds;
      const aligned = byScene.get(scene.id);
      if (!aligned) throw new Error(`Veronica canonical timing omitted ${scene.id}.`);
      const reconciled = aligned.endSeconds - aligned.startSeconds;
      return {
        ...scene,
        estimatedDurationSeconds: reconciled,
        plannedDurationSeconds: planned,
        reconciledDurationSeconds: reconciled,
        ...(timing.timingConfidence === "actual" ? { actualAudioDurationSeconds: reconciled } : {}),
        timingSource: timing.timingSource,
        timingConfidence: timing.timingConfidence,
        timing: { startSeconds: aligned.startSeconds, endSeconds: aligned.endSeconds },
      };
    }),
  });
  return { scenePlan, timing };
}

async function loadSelectedAudioTimedNarrationUnits(input: {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly selectedAudioHash: string;
}): Promise<readonly VeronicaTimedNarrationUnit[] | undefined> {
  const artifactPath = path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration", "alignment.v1.json");
  if (!(await fileExists(artifactPath))) return undefined;
  const artifact = z.strictObject({
    schemaVersion: z.literal("veronica-selected-audio-alignment.v1"),
    selectedAudioHash: z.string().regex(/^[a-f0-9]{64}$/u),
    units: z.array(veronicaTimedNarrationUnitSchema).min(1),
  }).parse(JSON.parse(await fs.readFile(artifactPath, "utf8")) as unknown);
  if (artifact.selectedAudioHash !== input.selectedAudioHash) return undefined;
  return artifact.units;
}

function retimeVisualEvents(input: { readonly events: readonly VisualEvent[]; readonly plan: PositioningVisualPlanV2; readonly scenePlan: ScenePlan }): readonly VisualEvent[] {
  const timingByIndex = input.scenePlan.scenes.map((scene) => ({
    startMs: Math.round(scene.timing.startSeconds * 1000),
    durationMs: Math.round((scene.timing.endSeconds - scene.timing.startSeconds) * 1000),
  }));
  const sceneIndex = new Map(input.plan.scenes.map((scene, index) => [scene.sceneId, index] as const));
  return input.events.map((event) => {
    const index = sceneIndex.get(event.sceneId);
    const timing = index === undefined ? undefined : timingByIndex[index];
    const oldScene = input.plan.scenes[index ?? -1];
    if (!timing || !oldScene) return event;
    const oldEvents = input.events.filter((candidate) => candidate.sceneId === event.sceneId);
    const ordinal = oldEvents.findIndex((candidate) => candidate.eventId === event.eventId);
    const count = Math.max(1, oldEvents.length);
    const durationMs = ordinal === count - 1 ? timing.durationMs - Math.floor(timing.durationMs / count) * (count - 1) : Math.floor(timing.durationMs / count);
    const startMs = timing.startMs + Math.floor(timing.durationMs / count) * ordinal;
    const base = { ...event, startMs, durationMs };
    return { ...base, renderCacheKey: stableEventHash(base) };
  });
}

function stableEventHash(event: Omit<VisualEvent, "renderCacheKey">): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

async function prepareLocalizedPositioningProduction(input: PreparePositioningProductionEpisodeInput & {
  readonly workspaceRoot: string;
  readonly episodeDir: string;
  readonly episodeId: string;
  readonly scriptPath: string;
  readonly narration: string;
}): Promise<PreparePositioningProductionEpisodeResult> {
  const canonicalPlanPath = path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json");
  if (!(await fileExists(canonicalPlanPath))) {
    throw new Error("VERONICA_MASTER_SEMANTIC_PLAN_REQUIRED: prepare the English master before a localized production.");
  }
  const canonicalPlan = positioningProductionPlanSchema.parse(
    JSON.parse(await fs.readFile(canonicalPlanPath, "utf8")) as unknown,
  ) as unknown as PositioningVisualPlanV2;
  const expectedFormat = input.variant === "short" ? "short" : "long";
  if (canonicalPlan.format !== expectedFormat) {
    throw new Error(`Veronica canonical plan format ${canonicalPlan.format} does not match requested ${input.variant} production.`);
  }
  const localizedChunks = splitNarration(input.narration, canonicalPlan.scenes.length);
  const provisional = compilePositioningProductionScenePlan({
    episodeId: input.episodeId,
    narration: input.narration,
    plan: canonicalPlan as unknown as PositioningProductionPlan,
    narrationByScene: localizedChunks,
  });
  const narrationPath = path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration.wav");
  let selectedAudioHash: string | null = null;
  let selectedAudioDurationSeconds: number | null = null;
  let selectedAudioBytes: Buffer | null = null;
  try {
    selectedAudioBytes = await fs.readFile(narrationPath);
    selectedAudioDurationSeconds = waveDurationSeconds(selectedAudioBytes);
    selectedAudioHash = createHash("sha256").update(selectedAudioBytes).digest("hex");
  } catch {
    // Localized preparation may remain provisional until localized TTS is selected.
  }
  const timedNarrationUnits = selectedAudioHash
    ? await loadSelectedAudioTimedNarrationUnits({
        episodeDir: input.episodeDir,
        language: input.language,
        variant: input.variant,
        selectedAudioHash,
      })
    : undefined;
  const reconciliation = selectedAudioHash && selectedAudioDurationSeconds
    ? reconcileScenePlanToCanonicalAudio({
        scenePlan: provisional,
        selectedAudioHash,
        selectedAudioDurationSeconds,
        ...(selectedAudioBytes ? { selectedAudioBytes } : {}),
        ...(timedNarrationUnits ? { timedNarrationUnits } : {}),
      })
    : null;
  const scenePlan = reconciliation?.scenePlan ?? provisional;
  const visualEvents = retimeVisualEvents({
    events: canonicalPlan.visualEvents,
    plan: canonicalPlan,
    scenePlan,
  });
  const timingFingerprint = reconciliation?.timing.timingFingerprint ?? stableHash({
    locale: input.language,
    variant: input.variant,
    narrationHash: stableHash(input.narration),
    timingAlgorithmVersion: "veronica-planned-timing.v1",
    scenes: scenePlan.scenes.map((scene) => scene.timing),
  });
  const visualArtifacts = await persistVeronicaVisualArtifacts({
    workspaceRoot: input.workspaceRoot,
    episodeDir: input.episodeDir,
    plan: canonicalPlan,
  });
  const localized = await persistVeronicaLocalizedProduction({
    episodeDir: input.episodeDir,
    episodeId: input.episodeId,
    locale: input.language,
    variant: input.variant,
    narration: input.narration,
    selectedAudioHash,
    timingHash: timingFingerprint,
    plan: canonicalPlan,
    scenePlan,
    visualEvents,
    treatments: visualArtifacts.treatments,
    bible: visualArtifacts.bible,
  });
  const localeRoot = path.join(input.episodeDir, "locales", input.language, input.variant);
  const scenePlanPath = path.join(localeRoot, "scene-plan.json");
  await Promise.all([
    writeJsonAtomic(scenePlanPath, scenePlan),
    writeJsonAtomic(path.join(localeRoot, "canonical-timing.v1.json"), {
      schemaVersion: "veronica-canonical-locale-timing.v3",
      locale: input.language,
      variant: input.variant,
      timingAlgorithmVersion: reconciliation?.timing.timingAlgorithmVersion ?? "veronica-planned-timing.v1",
      timingPhase: selectedAudioHash ? "post-tts-reconciled" : "pre-tts-planning",
      timingSource: reconciliation?.timing.timingSource ?? "planned",
      timingConfidence: reconciliation?.timing.timingConfidence ?? "planned",
      narrationHash: stableHash(input.narration),
      selectedAudioHash,
      timingFingerprint,
      narrationDurationSeconds: selectedAudioDurationSeconds ?? scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0,
      scenes: scenePlan.scenes.map((scene) => ({
        sceneId: scene.id,
        semanticSceneId: canonicalPlan.scenes[scene.sequenceNumber - 1]?.sceneId,
        plannedDurationSeconds: scene.plannedDurationSeconds ?? scene.estimatedDurationSeconds,
        reconciledDurationSeconds: scene.reconciledDurationSeconds ?? scene.estimatedDurationSeconds,
        startSeconds: scene.timing.startSeconds,
        endSeconds: scene.timing.endSeconds,
      })),
    }),
    writeJsonAtomic(path.join(localeRoot, "retimed-visual-events.json"), {
      schemaVersion: "veronica-retimed-visual-events.v3",
      locale: input.language,
      timingSource: reconciliation?.timing.timingSource ?? "planned",
      timingConfidence: reconciliation?.timing.timingConfidence ?? "planned",
      selectedAudioHash,
      timingFingerprint,
      events: visualEvents,
    }),
    writeTextAtomic(path.join(localeRoot, "script.md"), input.narration),
    writeTextAtomic(defaultScriptPath(input.episodeDir, input.language, input.variant), input.narration),
  ]);
  const promptRoot = path.join(input.episodeDir, "locales", "en", input.variant, "image-prompts");
  return {
    schemaVersion: POSITIONING_PRODUCTION_ADAPTER_VERSION,
    episodeId: input.episodeId,
    contentId: canonicalPlan.contentId,
    language: input.language,
    variant: input.variant,
    planPath: canonicalPlanPath,
    scriptPath: input.scriptPath,
    manifestPath: path.join(input.episodeDir, "manifest.json"),
    scenePlanPath,
    providerImagePromptsJsonPath: path.join(promptRoot, "provider-image-prompts.v1.json"),
    providerImagePromptsMarkdownPath: path.join(promptRoot, "provider-image-prompts.md"),
    visualTreatmentsPath: visualArtifacts.treatmentsPath,
    visualBiblePath: visualArtifacts.biblePath,
    localizedProductionPath: localized.productionPath,
    sceneCount: scenePlan.scenes.length,
    semanticRemediationRounds: 0,
    semanticRemediationStatus: "NO_OP",
    sourceGroundedVisualQaStatus: canonicalPlan.sourceGroundedVisualQa?.sourceFidelityReady ? "PASS" : "BLOCKED",
  };
}

export interface ReconcileExistingVeronicaProductionTimingInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly language: "en" | "de" | "es" | "fr" | "pt" | "it";
  readonly variant: "full" | "short";
}

export interface ReconcileExistingVeronicaProductionTimingResult {
  readonly episodeId: string;
  readonly language: string;
  readonly variant: "full" | "short";
  readonly selectedAudioHash: string;
  readonly narrationDurationSeconds: number;
  readonly timingSource: string;
  readonly timingConfidence: string;
  readonly timingPath: string;
  readonly scenePlanPath: string;
  readonly localizedProductionPath: string;
}

/**
 * Reconciles only locale-owned delivery artifacts after staged narration has
 * promoted a selected WAV. The persisted semantic plan, VisualTreatmentV1,
 * VisualBibleV1, and provider prompts are deliberately read-only inputs.
 */
export async function reconcileExistingVeronicaProductionTiming(
  input: ReconcileExistingVeronicaProductionTimingInput,
): Promise<ReconcileExistingVeronicaProductionTimingResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const episodeId = normalizeEpisodeId(input.episodeId);
  const episodeDir = path.join(workspaceRoot, episodeId);
  const localeRoot = path.join(episodeDir, "locales", input.language, input.variant);
  const sourcePlanPath = path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json");
  const scenePlanPath = path.join(localeRoot, "scene-plan.json");
  const scriptPath = path.join(localeRoot, "script.md");
  const narrationPath = path.join(localeRoot, "audio", "narration.wav");
  const timingPath = path.join(localeRoot, "canonical-timing.v1.json");
  const retimedEventsPath = path.join(localeRoot, "retimed-visual-events.json");
  const [planRaw, scenePlanRaw, narration, audioBytes, treatmentsRaw, bibleRaw] = await Promise.all([
    fs.readFile(sourcePlanPath, "utf8"),
    fs.readFile(scenePlanPath, "utf8"),
    fs.readFile(scriptPath, "utf8"),
    fs.readFile(narrationPath),
    fs.readFile(path.join(episodeDir, "shared", "visual-treatments.v1.json"), "utf8"),
    fs.readFile(path.join(episodeDir, "shared", "visual-bible.v1.json"), "utf8"),
  ]);
  const plan = positioningProductionPlanSchema.parse(JSON.parse(planRaw) as unknown) as unknown as PositioningVisualPlanV2;
  const scenePlan = scenePlanSchema.parse(JSON.parse(scenePlanRaw) as unknown);
  const selectedAudioHash = createHash("sha256").update(audioBytes).digest("hex");
  const selectedAudioDurationSeconds = waveDurationSeconds(audioBytes);
  if (selectedAudioDurationSeconds === null) {
    throw new Error(`VERONICA_SELECTED_AUDIO_DURATION_UNAVAILABLE:${narrationPath}`);
  }
  const timedNarrationUnits = await loadSelectedAudioTimedNarrationUnits({
    episodeDir,
    language: input.language,
    variant: input.variant,
    selectedAudioHash,
  });
  const reconciliation = reconcileScenePlanToCanonicalAudio({
    scenePlan,
    selectedAudioHash,
    selectedAudioDurationSeconds,
    selectedAudioBytes: audioBytes,
    ...(timedNarrationUnits ? { timedNarrationUnits } : {}),
  });
  const visualEvents = retimeVisualEvents({
    events: plan.visualEvents,
    plan,
    scenePlan: reconciliation.scenePlan,
  });
  const treatments = veronicaVisualTreatmentsArtifactSchema.parse(JSON.parse(treatmentsRaw) as unknown);
  const bible = veronicaVisualBibleV1Schema.parse(JSON.parse(bibleRaw) as unknown);
  const localized = await persistVeronicaLocalizedProduction({
    episodeDir,
    episodeId,
    locale: input.language,
    variant: input.variant,
    narration,
    selectedAudioHash,
    timingHash: reconciliation.timing.timingFingerprint,
    plan,
    scenePlan: reconciliation.scenePlan,
    visualEvents,
    treatments,
    bible,
  });
  await Promise.all([
    writeJsonAtomic(scenePlanPath, reconciliation.scenePlan),
    writeJsonAtomic(timingPath, {
      schemaVersion: "veronica-canonical-locale-timing.v3",
      locale: input.language,
      variant: input.variant,
      timingAlgorithmVersion: reconciliation.timing.timingAlgorithmVersion,
      timingPhase: "post-tts-reconciled",
      timingSource: reconciliation.timing.timingSource,
      timingConfidence: reconciliation.timing.timingConfidence,
      narrationHash: stableHash(narration),
      selectedAudioHash,
      timingFingerprint: reconciliation.timing.timingFingerprint,
      narrationDurationSeconds: selectedAudioDurationSeconds,
      scenes: reconciliation.scenePlan.scenes.map((scene, index) => ({
        sceneId: scene.id,
        semanticSceneId: plan.scenes[index]?.sceneId,
        plannedDurationSeconds: scene.plannedDurationSeconds ?? scene.estimatedDurationSeconds,
        reconciledDurationSeconds: scene.reconciledDurationSeconds ?? scene.estimatedDurationSeconds,
        startSeconds: scene.timing.startSeconds,
        endSeconds: scene.timing.endSeconds,
      })),
    }),
    writeJsonAtomic(retimedEventsPath, {
      schemaVersion: "veronica-retimed-visual-events.v3",
      locale: input.language,
      timingSource: reconciliation.timing.timingSource,
      timingConfidence: reconciliation.timing.timingConfidence,
      selectedAudioHash,
      timingFingerprint: reconciliation.timing.timingFingerprint,
      events: visualEvents,
    }),
  ]);
  return {
    episodeId,
    language: input.language,
    variant: input.variant,
    selectedAudioHash,
    narrationDurationSeconds: selectedAudioDurationSeconds,
    timingSource: reconciliation.timing.timingSource,
    timingConfidence: reconciliation.timing.timingConfidence,
    timingPath,
    scenePlanPath,
    localizedProductionPath: localized.productionPath,
  };
}

export async function preparePositioningProductionEpisode(input: PreparePositioningProductionEpisodeInput): Promise<PreparePositioningProductionEpisodeResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const episodeId = normalizeEpisodeId(input.episodeId);
  const episodeDir = path.join(workspaceRoot, episodeId);
  const planPath = path.resolve(input.planPath ?? path.join(episodeDir, "source", "visual-plan.json"));
  const scriptPath = path.resolve(input.scriptPath ?? defaultScriptPath(episodeDir, input.language, input.variant));
  const manifestPath = path.join(episodeDir, "manifest.json");
  const scenePlanPath = path.join(episodeDir, "shared", "scenes.json");
  const [planRaw, narration] = await Promise.all([fs.readFile(planPath, "utf8"), fs.readFile(scriptPath, "utf8")]);
  if (input.language !== "en") {
    return prepareLocalizedPositioningProduction({
      ...input,
      workspaceRoot,
      episodeDir,
      episodeId,
      scriptPath,
      narration,
    });
  }
  const plan = positioningProductionPlanSchema.parse(JSON.parse(planRaw) as unknown);
  const expectedFormat = input.variant === "short" ? "short" : "long";
  if (plan.format !== expectedFormat) {
    throw new Error(`Veronica plan format ${plan.format} does not match requested ${input.variant} production.`);
  }
  const semanticSegmentation = expandVeronicaLongFormSemanticScenes({
    plan: plan as unknown as PositioningVisualPlanV2,
    narration,
  });
  const segmentedPlan = positioningProductionPlanSchema.parse(semanticSegmentation.plan as unknown);
  const provisionalScenePlan = compilePositioningProductionScenePlan({
    episodeId,
    narration,
    plan: segmentedPlan,
    narrationByScene: semanticSegmentation.narrationByScene,
  });
  const hardened = hardenVeronicaPreImagePlan({
    plan: segmentedPlan as unknown as PositioningVisualPlanV2,
    narrationByScene: provisionalScenePlan.scenes.map((scene) => scene.canonicalNarration),
  });
  const hardenedProductionPlan = positioningProductionPlanSchema.parse(hardened.plan as unknown);
  const compiledScenePlan = compilePositioningProductionScenePlan({
    episodeId,
    narration,
    plan: hardenedProductionPlan,
    narrationByScene: provisionalScenePlan.scenes.map((scene) => scene.canonicalNarration),
  });
  const narrationPath = path.join(episodeDir, "locales", input.language, input.variant, "audio", "narration.wav");
  let measuredNarrationDurationSeconds: number | null = null;
  let selectedAudioHash: string | null = null;
  let selectedAudioBytes: Buffer | null = null;
  try {
    const narrationAudio = await fs.readFile(narrationPath);
    measuredNarrationDurationSeconds = waveDurationSeconds(narrationAudio);
    selectedAudioHash = createHash("sha256").update(narrationAudio).digest("hex");
    selectedAudioBytes = narrationAudio;
  } catch {
    /* TTS has not run yet; planning timing remains explicit. */
  }
  const timedNarrationUnits = selectedAudioHash
    ? await loadSelectedAudioTimedNarrationUnits({ episodeDir, language: input.language, variant: input.variant, selectedAudioHash })
    : undefined;
  const reconciliation = measuredNarrationDurationSeconds === null || selectedAudioHash === null
    ? null
    : reconcileScenePlanToCanonicalAudio({
        scenePlan: compiledScenePlan,
        selectedAudioHash,
        selectedAudioDurationSeconds: measuredNarrationDurationSeconds,
        ...(selectedAudioBytes ? { selectedAudioBytes } : {}),
        ...(timedNarrationUnits ? { timedNarrationUnits } : {}),
      });
  const scenePlan = reconciliation?.scenePlan ?? compiledScenePlan;
  // The final treatment owns all derived state. Rebuild, rather than retime a
  // prior event list, after narration timing becomes canonical.
  const compilePrompts = async (
    candidate: PositioningVisualPlanV2,
    reasonForRegeneration: string,
  ): Promise<PositioningVisualPlanV2> => input.imagePromptCompiler
    ? compileVeronicaImagePrompts({
        episodeId,
        plan: candidate,
        compiler: input.imagePromptCompiler.compiler,
        cache: input.imagePromptCompiler.cache,
        model: input.imagePromptCompiler.model,
        reasonForRegeneration,
      })
    : ({ ...candidate, imagePromptGenerationStrategy: "legacy-deterministic" } as PositioningVisualPlanV2);
  let canonicalPlan = await compilePrompts(rebuildVeronicaFinalTreatmentState({
    plan: hardened.plan,
    sceneTimings: scenePlan.scenes.map((scene) => ({
      id: scene.id,
      timing: scene.timing,
    })),
    narrationByScene: scenePlan.scenes.map((scene) => scene.canonicalNarration),
  }), "canonical-semantic-snapshot");
  const sourceGroundedDependencies = input.sourceGroundedVisualQa;
  const sourceGrounded = await runSourceGroundedVisualQaController({
    plan: canonicalPlan,
    narrationByScene: scenePlan.scenes.map((scene) => scene.canonicalNarration),
    policy: sourceGroundedDependencies?.policy ?? unavailableSourceGroundedVisualQaPolicy(),
    ...(sourceGroundedDependencies?.primaryJudge ? { primaryJudge: sourceGroundedDependencies.primaryJudge } : {}),
    ...(sourceGroundedDependencies?.escalationJudge ? { escalationJudge: sourceGroundedDependencies.escalationJudge } : {}),
    ...(sourceGroundedDependencies?.finalJudge ? { finalJudge: sourceGroundedDependencies.finalJudge } : {}),
    ...(sourceGroundedDependencies?.remediationAdvisor ? { remediationAdvisor: sourceGroundedDependencies.remediationAdvisor } : {}),
    ...(sourceGroundedDependencies?.sequenceJudge ? { sequenceJudge: sourceGroundedDependencies.sequenceJudge } : {}),
    cache: sourceGroundedDependencies?.cache ?? new InMemorySourceGroundedVisualQaCache(),
    ...(sourceGroundedDependencies?.scheduler ? { scheduler: sourceGroundedDependencies.scheduler } : {}),
    ...(sourceGroundedDependencies?.onProgress ? { onProgress: sourceGroundedDependencies.onProgress } : {}),
    regenerate: async ({ plan: current, directives, round }) => {
      const remediated = applyVeronicaSourceGroundedRemediationDirectives({
        plan: current,
        directives,
        narrationByScene: scenePlan.scenes.map((scene) => scene.canonicalNarration),
        round,
      });
      return compilePrompts(rebuildVeronicaFinalTreatmentState({
        plan: remediated,
        sceneTimings: scenePlan.scenes.map((scene) => ({
          id: scene.id,
          timing: scene.timing,
        })),
        narrationByScene: scenePlan.scenes.map((scene) => scene.canonicalNarration),
      }), `semantic-remediation-round-${round}`);
    },
  });
  const sourcePlan = sourceGrounded.plan;
  const visualReady = sourcePlan.semanticQuality?.status === "PASS" && sourcePlan.providerReadiness?.status === "PASS";
  const technicalReady = sourcePlan.validation.status === "pass";
  const hierarchicalReadiness = {
    schemaVersion: "veronica-hierarchical-readiness.v1" as const,
    sourceFidelityReady: sourceGrounded.qa.sourceFidelityReady,
    visualReady,
    technicalReady,
    providerCandidate: sourceGrounded.qa.sourceFidelityReady && visualReady && technicalReady,
    providerRequestsAllowed: false as const,
    blockers: [...sourceGrounded.qa.blockers, ...(!visualReady ? ["VISUAL_READINESS_FAILED"] : []), ...(!technicalReady ? ["TECHNICAL_READINESS_FAILED"] : []), "HUMAN_PRE_IMAGE_APPROVAL_REQUIRED"],
  };
  const sourceGroundedPlanBase = {
    ...sourcePlan,
    sourceGroundedVisualQa: sourceGrounded.qa,
    hierarchicalReadiness,
  };
  canonicalPlan = {
    ...sourceGroundedPlanBase,
    planHash: stableHash(sourceGroundedPlanBase),
  } as PositioningVisualPlanV2;
  const providerIssuesByScene = new Map(
    canonicalPlan.scenes.map((scene) => [scene.sceneId, canonicalPlan.providerReadiness?.issues.filter((issue) => issue.sceneId === scene.sceneId) ?? []] as const),
  );
  const finalReviews = canonicalPlan.scenes.map((scene, index) => {
    const previous = canonicalPlan.scenes[index - 1];
    const review = reviewVeronicaPreImageTreatment({
      contentId: canonicalPlan.contentId,
      sceneId: scene.sceneId,
      plannerVersion: canonicalPlan.plannerVersion,
      narration: scene.narrationAnchor,
      narrationAnchor: scene.narrationAnchor,
      visibleThesis: scene.visibleThesis,
      newInformation: scene.newInformation ?? scene.treatment.narrativeBeat,
      treatment: scene.treatment,
      ...(scene.semanticProposition ? { proposition: scene.semanticProposition } : {}),
      format: canonicalPlan.format,
      ...(scene.stateComplexity ? { stateComplexity: scene.stateComplexity } : {}),
      ...(previous
        ? {
            previousTreatment: previous.treatment,
            previousVisibleThesis: previous.visibleThesis,
          }
        : {}),
      ...(canonicalPlan.selectedRecurringMotif
        ? {
            selectedMotif: canonicalPlan.selectedRecurringMotif.concept,
            episodeMotifSupported: true,
          }
        : {}),
    });
    const providerIssues = providerIssuesByScene.get(scene.sceneId) ?? [];
    if (providerIssues.length === 0) return review;
    const additions = providerIssues.map((issue) => ({
      code: issue.code,
      severity: "blocker" as const,
      message: issue.reason,
    }));
    return veronicaPreImageSemanticReviewSchema.parse({
      ...review,
      status: "manual-review-required",
      findings: [...review.findings, ...additions],
      requiredEdits: [...review.requiredEdits, ...additions.map((finding) => finding.message)],
      driftFlags: [...new Set([...review.driftFlags, ...additions.map((finding) => finding.code)])],
    });
  });
  const finalReviewHasBlocker = finalReviews.some((review) => review.findings.some((finding) => finding.severity === "blocker" || finding.severity === "error"));
  const finalConvergenceStatus =
    canonicalPlan.validation.status === "pass" && canonicalPlan.providerReadiness?.status === "PASS" && canonicalPlan.sourceGroundedVisualQa?.sourceFidelityReady === true && !finalReviewHasBlocker
      ? ("CONVERGED" as const)
      : ("SEMANTIC_REMEDIATION_EXHAUSTED" as const);
  const retimedEvents = canonicalPlan.visualEvents;
  // Re-materialize wrapper fields and prompt together from the same final
  // treatment revision. Timing-phase metadata remains owned by scenePlan.
  const finalMaterialization = compilePositioningProductionScenePlan({
    episodeId,
    narration,
    plan: canonicalPlan as unknown as PositioningProductionPlan,
    narrationByScene: scenePlan.scenes.map((scene) => scene.canonicalNarration),
  });
  const finalScenePlan = scenePlanSchema.parse({
    ...finalMaterialization,
    scenes: finalMaterialization.scenes.map((materialized, index) => {
      const timingOwner = scenePlan.scenes[index]!;
      return {
        ...materialized,
        estimatedDurationSeconds: timingOwner.estimatedDurationSeconds,
        ...(timingOwner.actualAudioDurationSeconds !== undefined ? { actualAudioDurationSeconds: timingOwner.actualAudioDurationSeconds } : {}),
        ...(timingOwner.plannedDurationSeconds !== undefined ? { plannedDurationSeconds: timingOwner.plannedDurationSeconds } : {}),
        ...(timingOwner.reconciledDurationSeconds !== undefined ? { reconciledDurationSeconds: timingOwner.reconciledDurationSeconds } : {}),
        ...(timingOwner.timingSource ? { timingSource: timingOwner.timingSource } : {}),
        ...(timingOwner.timingConfidence ? { timingConfidence: timingOwner.timingConfidence } : {}),
        timing: timingOwner.timing,
      };
    }),
  });
  const materializationReasons = positioningScenePlanMaterializationReasons({ plan: canonicalPlan, scenePlan: finalScenePlan });
  if (materializationReasons.length > 0) {
    throw new Error(`PROVIDER_SCENE_MATERIALIZATION_INCOHERENT:${materializationReasons.join(",")}`);
  }
  const visualArtifacts = await persistVeronicaVisualArtifacts({
    workspaceRoot,
    episodeDir,
    plan: canonicalPlan,
  });
  const persistedPrompts = await persistVeronicaProviderImagePromptArtifact({
    episodeDir,
    episodeId,
    language: input.language,
    variant: input.variant,
    plan: canonicalPlan,
    scenePlan: finalScenePlan,
    visualTreatmentsHash: visualArtifacts.treatments.artifactHash,
    visualBible: visualArtifacts.bible,
    selectedAudioHash,
  });
  const timingFingerprint = reconciliation?.timing.timingFingerprint ?? stableHash({
    narrationHash: stableHash(narration),
    locale: input.language,
    variant: input.variant,
    timingAlgorithmVersion: "veronica-planned-timing.v1",
    scenes: finalScenePlan.scenes.map((scene) => scene.timing),
  });
  const localizedProduction = await persistVeronicaLocalizedProduction({
    episodeDir,
    episodeId,
    locale: input.language,
    variant: input.variant,
    narration,
    selectedAudioHash,
    timingHash: timingFingerprint,
    plan: canonicalPlan,
    scenePlan: finalScenePlan,
    visualEvents: retimedEvents,
    treatments: visualArtifacts.treatments,
    bible: visualArtifacts.bible,
  });
  const existing = (await fileExists(manifestPath)) ? episodeManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown) : null;
  const now = new Date().toISOString();
  const promptArtifactIds = new Set([
    `artifact-provider-image-prompts-${input.language}-${input.variant}-json`,
    `artifact-provider-image-prompts-${input.language}-${input.variant}-markdown`,
  ]);
  const manifest = episodeManifestSchema.parse({
    ...(existing ?? {
      episodeId,
      slug: episodeId,
      source: { platform: "local-file", filePath: scriptPath },
      images: [],
      artifacts: [],
      pipelineRuns: [],
      createdAt: now,
    }),
    scenePlan: finalScenePlan,
    artifacts: [
      ...(existing?.artifacts ?? []).filter((artifact) => !promptArtifactIds.has(artifact.id)),
      {
        id: `artifact-provider-image-prompts-${input.language}-${input.variant}-json`,
        kind: "provider-image-prompts",
        path: path.relative(episodeDir, persistedPrompts.jsonPath).replace(/\\/gu, "/"),
        mimeType: "application/json",
        sizeBytes: persistedPrompts.jsonSizeBytes,
        checksumSha256: persistedPrompts.jsonSha256,
        createdAt: now,
      },
      {
        id: `artifact-provider-image-prompts-${input.language}-${input.variant}-markdown`,
        kind: "provider-image-prompts",
        path: path.relative(episodeDir, persistedPrompts.markdownPath).replace(/\\/gu, "/"),
        mimeType: "text/markdown",
        sizeBytes: persistedPrompts.markdownSizeBytes,
        checksumSha256: persistedPrompts.markdownSha256,
        createdAt: now,
      },
    ],
    sourceMetadata: {
      ...(existing?.sourceMetadata && typeof existing.sourceMetadata === "object" ? existing.sourceMetadata : {}),
      genre: "veronicabenini",
      creatorProfileId: "veronica-benini",
      contentId: plan.contentId,
      locale: input.language,
      variant: input.variant,
      positioningPlanHash: plan.planHash,
      canonicalPreImagePlanHash: canonicalPlan.planHash,
      canonicalLocaleTimingArtifactPath: `locales/${input.language}/${input.variant}/canonical-timing.v1.json`,
      providerImagePromptsArtifactPath: path.relative(episodeDir, persistedPrompts.jsonPath).replace(/\\/gu, "/"),
      providerImagePromptsMarkdownPath: path.relative(episodeDir, persistedPrompts.markdownPath).replace(/\\/gu, "/"),
      providerImagePromptsArtifactHash: persistedPrompts.artifact.artifactHash,
      timingPhase: measuredNarrationDurationSeconds === null ? "pre-tts-planning" : "post-tts-reconciled",
      syntheticCreatorLikenessAllowed: false,
    },
    updatedAt: now,
  });
  const canonicalScriptPath = path.join(episodeDir, "locales", input.language, input.variant, "script.md");
  const languageScriptPath = defaultScriptPath(episodeDir, input.language, input.variant);
  await Promise.all([
    writeJsonAtomic(manifestPath, manifest),
    writeJsonAtomic(scenePlanPath, finalScenePlan),
    writeJsonAtomic(path.join(episodeDir, "locales", input.language, input.variant, "scene-plan.json"), finalScenePlan),
    writeJsonAtomic(path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json"), canonicalPlan),
    writeJsonAtomic(path.join(episodeDir, "shared", "pre-image-semantic-reviews.v1.json"), {
      schemaVersion: "veronica-pre-image-semantic-reviews.v5",
      gateVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION,
      remediationPolicyVersion: hardened.decisions[0]?.remediationPolicyVersion ?? resolveVeronicaProductionPolicy(plan.format).semanticAutoRemediation.policyVersion,
      initialReviews: hardened.initialReviews,
      reviews: finalReviews,
      remediationRounds: hardened.rounds,
      convergenceStatus: finalConvergenceStatus,
      decisions: hardened.decisions,
      unchangedSceneIds: hardened.unchangedSceneIds,
      semanticPlanHash: canonicalPlan.planHash,
      semanticQuality: canonicalPlan.semanticQuality,
      providerReadiness: canonicalPlan.providerReadiness,
      sourceGroundedVisualQa: canonicalPlan.sourceGroundedVisualQa,
      hierarchicalReadiness: canonicalPlan.hierarchicalReadiness,
    }),
    writeJsonAtomic(path.join(episodeDir, "shared", "source-grounded-visual-qa.v1.json"), canonicalPlan.sourceGroundedVisualQa),
    writeJsonAtomic(path.join(episodeDir, "locales", input.language, input.variant, "canonical-timing.v1.json"), {
      schemaVersion: "veronica-canonical-locale-timing.v3",
      locale: input.language,
      variant: input.variant,
      timingAlgorithmVersion: reconciliation?.timing.timingAlgorithmVersion ?? "veronica-planned-timing.v1",
      timingPhase: measuredNarrationDurationSeconds === null ? "pre-tts-planning" : "post-tts-reconciled",
      timingSource: reconciliation?.timing.timingSource ?? "planned",
      timingConfidence: reconciliation?.timing.timingConfidence ?? "planned",
      narrationHash: createHash("sha256").update(narration).digest("hex"),
      selectedAudioHash,
      timingFingerprint,
      narrationDurationSeconds: measuredNarrationDurationSeconds ?? finalScenePlan.scenes.at(-1)?.timing.endSeconds ?? 0,
      scenes: finalScenePlan.scenes.map((scene) => ({
        sceneId: scene.id,
        plannedDurationSeconds: scene.plannedDurationSeconds ?? scene.estimatedDurationSeconds,
        reconciledDurationSeconds: scene.reconciledDurationSeconds ?? scene.estimatedDurationSeconds,
        startSeconds: scene.timing.startSeconds,
        endSeconds: scene.timing.endSeconds,
      })),
    }),
    writeJsonAtomic(path.join(episodeDir, "locales", input.language, input.variant, "retimed-visual-events.json"), {
      schemaVersion: "veronica-retimed-visual-events.v3",
      timingSource: reconciliation?.timing.timingSource ?? "planned",
      timingConfidence: reconciliation?.timing.timingConfidence ?? "planned",
      selectedAudioHash,
      timingFingerprint: stableHash({ canonicalTimingFingerprint: timingFingerprint, semanticPlanHash: canonicalPlan.planHash, events: retimedEvents }),
      events: retimedEvents,
    }),
    writeTextAtomic(canonicalScriptPath, narration),
    writeTextAtomic(languageScriptPath, narration),
  ]);
  return {
    schemaVersion: POSITIONING_PRODUCTION_ADAPTER_VERSION,
    episodeId,
    contentId: plan.contentId,
    language: input.language,
    variant: input.variant,
    planPath,
    scriptPath,
    manifestPath,
    scenePlanPath,
    providerImagePromptsJsonPath: persistedPrompts.jsonPath,
    providerImagePromptsMarkdownPath: persistedPrompts.markdownPath,
    visualTreatmentsPath: visualArtifacts.treatmentsPath,
    visualBiblePath: visualArtifacts.biblePath,
    localizedProductionPath: localizedProduction.productionPath,
    sceneCount: scenePlan.scenes.length,
    semanticRemediationRounds: hardened.rounds,
    semanticRemediationStatus: finalConvergenceStatus,
    sourceGroundedVisualQaStatus: canonicalPlan.sourceGroundedVisualQa?.sourceFidelityReady ? "PASS" : "BLOCKED",
  };
}
