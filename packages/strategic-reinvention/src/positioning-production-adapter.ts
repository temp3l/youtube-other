import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  episodeManifestSchema,
  scenePlanSchema,
  type ScenePlan,
} from "@mediaforge/domain";
import {
  fileExists,
  normalizeEpisodeId,
  normalizeWhitespace,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { z } from "zod";
import { hardenVeronicaPreImagePlan, rebuildVeronicaFinalTreatmentState, veronicaPreImageSemanticReviewSchema, VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION } from "./veronica-pre-image-semantic-gate.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import type { PositioningVisualPlanV2, VisualEvent } from "./positioning-visual-contracts.js";

export const POSITIONING_PRODUCTION_ADAPTER_VERSION =
  "veronicabenini-positioning-production-adapter.v4" as const;

const productionSceneSchema = z.object({
  sceneId: z.string().min(1),
  progressionStage: z.string().min(1),
  narrationAnchor: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  treatment: z.object({
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
  }).passthrough(),
}).passthrough();

const productionAssetSchema = z.object({
  sceneId: z.string().min(1),
  prompt: z.string().min(1),
  nativeAspectRatio: z.enum(["16:9", "9:16"]),
  textFree: z.literal(true),
  textInGeneratedImage: z.literal(false),
}).passthrough();

export const positioningProductionPlanSchema = z.object({
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
}).passthrough();

export type PositioningProductionPlan = z.infer<
  typeof positioningProductionPlanSchema
>;

export interface PreparePositioningProductionEpisodeInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly planPath?: string;
  readonly scriptPath?: string;
  readonly language: "en" | "de" | "es" | "fr" | "pt" | "it";
  readonly variant: "full" | "short";
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
  readonly sceneCount: number;
  readonly semanticRemediationRounds: number;
  readonly semanticRemediationStatus: "CONVERGED" | "NO_OP" | "SEMANTIC_REMEDIATION_EXHAUSTED";
}

function defaultScriptPath(
  episodeDir: string,
  language: string,
  variant: "full" | "short",
): string {
  return variant === "short"
    ? path.join(episodeDir, "languages", "short", `script-${language}.md`)
    : path.join(episodeDir, "languages", `script-${language}.md`);
}

function splitNarration(narration: string, count: number): readonly string[] {
  const normalized = normalizeWhitespace(
    narration.replace(/^---[\s\S]*?---\s*/u, "").replace(/^#{1,6}\s+.*$/gmu, ""),
  );
  if (!normalized) {
    throw new Error("Veronica production preparation requires non-empty narration.");
  }
  const sentences = normalized
    .split(/(?<=[.!?…])\s+/u)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  const units = sentences.length > 0 ? sentences : [normalized];
  const chunks = Array.from({ length: count }, () => "");
  const totalWords = units.reduce(
    (sum, unit) => sum + unit.split(/\s+/u).filter(Boolean).length,
    0,
  );
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

export function compilePositioningProductionScenePlan(input: {
  readonly episodeId: string;
  readonly narration: string;
  readonly plan: PositioningProductionPlan;
}): ScenePlan {
  const episodeId = normalizeEpisodeId(input.episodeId);
  const orderedScenes = [...input.plan.scenes].sort(
    (left, right) => left.startMs - right.startMs,
  );
  const narrationChunks = splitNarration(input.narration, orderedScenes.length);
  const assets = new Map(input.plan.assets.map((asset) => [asset.sceneId, asset]));
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
        continuityReferences: index > 0 ? [`scene-${String(index).padStart(3, "0")}`] : [],
        onScreenText: "",
        negativeConstraints: [
          "no readable text, letters, numbers, logos, UI, or watermarks",
          "no depiction or synthetic likeness of Veronica Benini",
          "no generic motivational stock montage, laptop-at-desk pose, or stock handshake",
        ],
        aspectRatios: [asset.nativeAspectRatio],
        imagePrompt: asset.prompt,
        expectedImageFilenames: [`${sceneId}-${asset.nativeAspectRatio.replace(":", "x")}.png`],
        qualityStatus: "semantic-review-required",
      };
    }),
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
    if (id === "data") { dataSize = size; break; }
    offset += 8 + size + (size % 2);
  }
  return byteRate && dataSize !== null && byteRate > 0 ? dataSize / byteRate : null;
}

function reconcileScenePlan(scenePlan: ScenePlan, narrationDurationSeconds: number): ScenePlan {
  const plannedTotal = scenePlan.scenes.at(-1)?.timing.endSeconds ?? 0;
  if (plannedTotal <= 0) throw new Error("Veronica scene timing must have a positive planned duration.");
  let cursor = 0;
  return scenePlanSchema.parse({
    ...scenePlan,
    scenes: scenePlan.scenes.map((scene, index) => {
      const planned = scene.timing.endSeconds - scene.timing.startSeconds;
      const reconciled = index === scenePlan.scenes.length - 1
        ? narrationDurationSeconds - cursor
        : planned * narrationDurationSeconds / plannedTotal;
      const timing = { startSeconds: cursor, endSeconds: cursor + reconciled };
      cursor = timing.endSeconds;
      return { ...scene, estimatedDurationSeconds: reconciled, plannedDurationSeconds: planned, reconciledDurationSeconds: reconciled, timingSource: "proportional-total-audio-reconciliation" as const, timingConfidence: "estimated" as const, timing };
    }),
  });
}

function retimeVisualEvents(input: { readonly events: readonly VisualEvent[]; readonly plan: PositioningVisualPlanV2; readonly scenePlan: ScenePlan }): readonly VisualEvent[] {
  const timingByIndex = input.scenePlan.scenes.map((scene) => ({ startMs: Math.round(scene.timing.startSeconds * 1000), durationMs: Math.round((scene.timing.endSeconds - scene.timing.startSeconds) * 1000) }));
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

export async function preparePositioningProductionEpisode(
  input: PreparePositioningProductionEpisodeInput,
): Promise<PreparePositioningProductionEpisodeResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const episodeId = normalizeEpisodeId(input.episodeId);
  const episodeDir = path.join(workspaceRoot, episodeId);
  const planPath = path.resolve(
    input.planPath ?? path.join(episodeDir, "source", "visual-plan.json"),
  );
  const scriptPath = path.resolve(
    input.scriptPath ?? defaultScriptPath(episodeDir, input.language, input.variant),
  );
  const manifestPath = path.join(episodeDir, "manifest.json");
  const scenePlanPath = path.join(episodeDir, "shared", "scenes.json");
  const [planRaw, narration] = await Promise.all([
    fs.readFile(planPath, "utf8"),
    fs.readFile(scriptPath, "utf8"),
  ]);
  const plan = positioningProductionPlanSchema.parse(JSON.parse(planRaw) as unknown);
  const expectedFormat = input.variant === "short" ? "short" : "long";
  if (plan.format !== expectedFormat) {
    throw new Error(
      `Veronica plan format ${plan.format} does not match requested ${input.variant} production.`,
    );
  }
  const provisionalScenePlan = compilePositioningProductionScenePlan({
    episodeId,
    narration,
    plan,
  });
  const hardened = hardenVeronicaPreImagePlan({
    plan: plan as unknown as PositioningVisualPlanV2,
    narrationByScene: provisionalScenePlan.scenes.map((scene) => scene.canonicalNarration),
  });
  const hardenedProductionPlan = positioningProductionPlanSchema.parse(hardened.plan as unknown);
  const compiledScenePlan = compilePositioningProductionScenePlan({ episodeId, narration, plan: hardenedProductionPlan });
  const narrationPath = path.join(episodeDir, "locales", input.language, input.variant, "audio", "narration.wav");
  let measuredNarrationDurationSeconds: number | null = null;
  let selectedAudioHash: string | null = null;
  try {
    const narrationAudio = await fs.readFile(narrationPath);
    measuredNarrationDurationSeconds = waveDurationSeconds(narrationAudio);
    selectedAudioHash = createHash("sha256").update(narrationAudio).digest("hex");
  } catch { /* TTS has not run yet; planning timing remains explicit. */ }
  const scenePlan = measuredNarrationDurationSeconds === null ? compiledScenePlan : reconcileScenePlan(compiledScenePlan, measuredNarrationDurationSeconds);
  // The final treatment owns all derived state. Rebuild, rather than retime a
  // prior event list, after narration timing becomes canonical.
  const canonicalPlan = rebuildVeronicaFinalTreatmentState({
    plan: hardened.plan,
    sceneTimings: scenePlan.scenes.map((scene) => ({ id: scene.id, timing: scene.timing })),
  });
  const providerIssuesByScene = new Map(canonicalPlan.scenes.map((scene) => [scene.sceneId, canonicalPlan.providerReadiness?.issues.filter((issue) => issue.sceneId === scene.sceneId) ?? []] as const));
  const finalReviews = hardened.reviews.map((review) => {
    const providerIssues = providerIssuesByScene.get(review.sceneId) ?? [];
    if (providerIssues.length === 0) return review;
    const additions = providerIssues.map((issue) => ({ code: issue.code, severity: "blocker" as const, message: issue.reason }));
    return veronicaPreImageSemanticReviewSchema.parse({
      ...review,
      status: "manual-review-required",
      findings: [...review.findings, ...additions],
      requiredEdits: [...review.requiredEdits, ...additions.map((finding) => finding.message)],
      driftFlags: [...new Set([...review.driftFlags, ...additions.map((finding) => finding.code)])],
    });
  });
  const retimedEvents = canonicalPlan.visualEvents;
  // Scene-plan prompts are the provider-facing projection copied into the
  // review pack, so replace their provisional prompts with final state-aware
  // projections after final-treatment reconciliation.
  const finalScenePlan = scenePlanSchema.parse({
    ...scenePlan,
    scenes: scenePlan.scenes.map((scene, index) => ({
      ...scene,
      imagePrompt: canonicalPlan.assets.find((asset) => asset.sceneId === canonicalPlan.scenes[index]?.sceneId)?.prompt ?? scene.imagePrompt,
    })),
  });
  const existing = (await fileExists(manifestPath))
    ? episodeManifestSchema.parse(
        JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
      )
    : null;
  const now = new Date().toISOString();
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
    sourceMetadata: {
      ...(existing?.sourceMetadata && typeof existing.sourceMetadata === "object"
        ? existing.sourceMetadata
        : {}),
      genre: "veronicabenini",
      creatorProfileId: "veronica-benini",
      contentId: plan.contentId,
      locale: input.language,
      variant: input.variant,
      positioningPlanHash: plan.planHash,
      canonicalPreImagePlanHash: canonicalPlan.planHash,
      canonicalLocaleTimingArtifactPath: `locales/${input.language}/${input.variant}/canonical-timing.v1.json`,
      timingPhase: measuredNarrationDurationSeconds === null ? "pre-tts-planning" : "post-tts-reconciled",
      syntheticCreatorLikenessAllowed: false,
    },
    updatedAt: now,
  });
  const canonicalScriptPath = path.join(
    episodeDir,
    "locales",
    input.language,
    input.variant,
    "script.md",
  );
  const languageScriptPath = defaultScriptPath(
    episodeDir,
    input.language,
    input.variant,
  );
  await Promise.all([
    writeJsonAtomic(manifestPath, manifest),
    writeJsonAtomic(scenePlanPath, finalScenePlan),
    writeJsonAtomic(path.join(episodeDir, "locales", input.language, input.variant, "scene-plan.json"), finalScenePlan),
    writeJsonAtomic(path.join(episodeDir, "source", "pre-image-semantic-plan.v1.json"), canonicalPlan),
    writeJsonAtomic(path.join(episodeDir, "shared", "pre-image-semantic-reviews.v1.json"), { schemaVersion: "veronica-pre-image-semantic-reviews.v4", gateVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION, remediationPolicyVersion: hardened.decisions[0]?.remediationPolicyVersion ?? resolveVeronicaProductionPolicy(plan.format).semanticAutoRemediation.policyVersion, initialReviews: hardened.initialReviews, reviews: finalReviews, remediationRounds: hardened.rounds, convergenceStatus: canonicalPlan.providerReadiness?.status === "PASS" && hardened.convergenceStatus !== "SEMANTIC_REMEDIATION_EXHAUSTED" ? hardened.convergenceStatus : "SEMANTIC_REMEDIATION_EXHAUSTED", decisions: hardened.decisions, unchangedSceneIds: hardened.unchangedSceneIds, semanticPlanHash: canonicalPlan.planHash, semanticQuality: canonicalPlan.semanticQuality, providerReadiness: canonicalPlan.providerReadiness }),
    writeJsonAtomic(path.join(episodeDir, "locales", input.language, input.variant, "canonical-timing.v1.json"), { schemaVersion: "veronica-canonical-locale-timing.v2", locale: input.language, variant: input.variant, timingAlgorithmVersion: "proportional-total-audio-reconciliation.v2", timingPhase: measuredNarrationDurationSeconds === null ? "pre-tts-planning" : "post-tts-reconciled", timingSource: measuredNarrationDurationSeconds === null ? "planned" : "selected-canonical-audio", narrationHash: createHash("sha256").update(narration).digest("hex"), selectedAudioHash, timingFingerprint: createHash("sha256").update(JSON.stringify({ selectedAudioHash, narrationHash: createHash("sha256").update(narration).digest("hex"), locale: input.language, variant: input.variant, timingAlgorithmVersion: "proportional-total-audio-reconciliation.v2" })).digest("hex"), narrationDurationSeconds: measuredNarrationDurationSeconds ?? finalScenePlan.scenes.at(-1)?.timing.endSeconds ?? 0, scenes: finalScenePlan.scenes.map((scene) => ({ sceneId: scene.id, plannedDurationSeconds: scene.plannedDurationSeconds ?? scene.estimatedDurationSeconds, reconciledDurationSeconds: scene.reconciledDurationSeconds ?? scene.estimatedDurationSeconds, startSeconds: scene.timing.startSeconds, endSeconds: scene.timing.endSeconds })) }),
    writeJsonAtomic(path.join(episodeDir, "locales", input.language, input.variant, "retimed-visual-events.json"), { schemaVersion: "veronica-retimed-visual-events.v2", timingSource: measuredNarrationDurationSeconds === null ? "planned" : "selected-canonical-audio", selectedAudioHash, timingFingerprint: createHash("sha256").update(JSON.stringify({ selectedAudioHash, duration: measuredNarrationDurationSeconds, semanticPlanHash: canonicalPlan.planHash })).digest("hex"), events: retimedEvents }),
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
    sceneCount: scenePlan.scenes.length,
    semanticRemediationRounds: hardened.rounds,
    semanticRemediationStatus: hardened.convergenceStatus,
  };
}
