import { z } from "zod";
import { writeJsonAtomic } from "@mediaforge/shared";
import type {
  GeneratedVisualAsset,
  PlannedScene,
  PositioningVisualPlanV2,
  VisualBeatAssetDecision,
  VisualBeatBoundaryKind,
  VisualBeatRole,
  VisualBeatTreatmentV1,
  VisualEvent,
  VisualEventKind,
  VeronicaVisualDensityMetrics,
  VeronicaVisualBeatPlanV1,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";

export const VERONICA_VISUAL_BEAT_PLAN_VERSION =
  "veronica-visual-beat-plan.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const beatRoleSchema = z.enum([
  "establish",
  "primary",
  "progression",
  "contrast",
  "reaction",
  "payoff",
  "cutaway",
]);
const assetDecisionSchema = z.enum([
  "new-image",
  "reuse-with-motion",
  "reuse-with-crop",
  "reuse-existing-asset",
]);
const boundaryKindSchema = z.enum([
  "narration-aligned",
  "semantic-subspan-aligned",
  "editorially-allocated",
]);

const compositionSchema = z.strictObject({
  description: z.string().min(1),
  camera: z.string().min(1),
  lighting: z.string().min(1),
  subtitleSafeAreaRequired: z.literal(true),
});

const referenceRequirementSchema = z.strictObject({
  kind: z.enum(["canonical-identity", "episode-anchor", "scene-reference"]),
  assetId: z.string().min(1),
  required: z.boolean(),
});

export const visualBeatTreatmentV1Schema = z.strictObject({
  version: z.literal(1),
  beatId: z.string().min(1),
  sceneId: z.string().min(1),
  role: beatRoleSchema,
  narrationRef: z.strictObject({
    semanticSceneId: z.string().min(1),
    sentenceIds: z.array(z.string().min(1)).min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    spanHash: sha256Schema,
  }),
  parentTreatmentHash: sha256Schema,
  coreMeaning: z.string().min(1),
  newInformation: z.string().min(1),
  viewerShouldUnderstand: z.string().min(1),
  visualThesis: z.string().min(1),
  subject: z.string().min(1),
  action: z.string().min(1),
  state: z.string().min(1),
  environment: z.string().min(1),
  composition: compositionSchema,
  continuationOfPreviousBeat: z.boolean(),
  referenceRequirements: z.array(referenceRequirementSchema),
  assetDecision: assetDecisionSchema,
  reuseSourceBeatId: z.string().min(1).nullable(),
  timingWeight: z.number().positive(),
  boundaryKind: boundaryKindSchema,
  beatHash: sha256Schema,
});

const qualitySchema = z.strictObject({
  status: z.enum(["PASS", "WARN", "FAIL"]),
  findings: z.array(z.strictObject({
    code: z.enum([
      "REDUNDANT_SIBLING_BEAT",
      "REDUNDANT_PAID_IMAGE_CANDIDATE",
      "EVENT_ONLY_DENSITY_INCREASE",
      "OPENING_STATIC_HOLD",
      "LONG_STATIC_OPENING_ASSET_HOLD",
      "BEAT_OUTSIDE_PARENT_MEANING",
      "INVALID_REUSE_SOURCE",
    ]),
    severity: z.enum(["warning", "blocker"]),
    sceneId: z.string().min(1),
    beatId: z.string().min(1).nullable(),
    message: z.string().min(1),
  })),
  beatsInFirst5Seconds: z.number().int().nonnegative(),
  beatsInFirst10Seconds: z.number().int().nonnegative(),
  beatsInFirst15Seconds: z.number().int().nonnegative(),
  density: z.strictObject({
    semanticSceneCount: z.number().int().positive(),
    visualBeatCount: z.number().int().positive(),
    visualEventCount: z.number().int().positive(),
    uniqueCanonicalAssetCount: z.number().int().positive(),
    newImageBeatCount: z.number().int().nonnegative(),
    reuseWithMotionBeatCount: z.number().int().nonnegative(),
    reuseWithCropBeatCount: z.number().int().nonnegative(),
    reuseExistingAssetBeatCount: z.number().int().nonnegative(),
    sameAssetEventCount: z.number().int().nonnegative(),
    firstNewAssetChangeMs: z.number().int().nonnegative().nullable(),
    uniqueAssetsInFirst5Seconds: z.number().int().nonnegative(),
    uniqueAssetsInFirst10Seconds: z.number().int().nonnegative(),
    uniqueAssetsInFirst15Seconds: z.number().int().nonnegative(),
    longestContinuousSameAssetHoldMs: z.number().int().nonnegative(),
    averageCanonicalAssetHoldMs: z.number().nonnegative(),
    redundantPaidImageCandidateBeatIds: z.array(z.string().min(1)),
    informationGain: z.array(z.strictObject({
      beatId: z.string().min(1),
      newInformationHash: sha256Schema,
      addsMaterialInformation: z.boolean(),
    })),
    higherImageDensityThanOnePerScene: z.boolean(),
  }),
});

export const veronicaVisualBeatPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(VERONICA_VISUAL_BEAT_PLAN_VERSION),
  policyVersion: z.string().min(1),
  contentId: z.string().min(1),
  semanticSceneCount: z.number().int().positive(),
  beats: z.array(visualBeatTreatmentV1Schema).min(1),
  quality: qualitySchema,
  beatPlanHash: sha256Schema,
});

const beatOverrideSchema = z.strictObject({
  beatId: z.string().min(1),
  role: beatRoleSchema,
  coreMeaning: z.string().min(1),
  newInformation: z.string().min(1),
  viewerShouldUnderstand: z.string().min(1),
  visualThesis: z.string().min(1),
  subject: z.string().min(1),
  action: z.string().min(1),
  state: z.string().min(1),
  environment: z.string().min(1),
  composition: compositionSchema,
  continuationOfPreviousBeat: z.boolean(),
  assetDecision: assetDecisionSchema,
  reuseSourceBeatId: z.string().min(1).nullable().default(null),
  timingWeight: z.number().positive(),
  boundaryKind: boundaryKindSchema,
});

export const veronicaVisualBeatOverrideArtifactSchema = z.strictObject({
  schemaVersion: z.literal("veronica-visual-beat-overrides.v1"),
  episodeId: z.string().min(1),
  baseCanonicalImagePlanHash: sha256Schema,
  scenes: z.array(z.strictObject({
    sceneId: z.string().min(1),
    beats: z.array(beatOverrideSchema).min(1),
  })).min(1),
});
export type VeronicaVisualBeatOverrideArtifact = z.infer<
  typeof veronicaVisualBeatOverrideArtifactSchema
>;

function narrationRef(scene: PlannedScene) {
  const spans = scene.semanticProposition?.evidenceSpans;
  if (!spans || spans.length === 0) {
    throw new Error(`VERONICA_VISUAL_BEAT_NARRATION_REF_MISSING:${scene.sceneId}`);
  }
  return {
    semanticSceneId: scene.sceneId,
    sentenceIds: spans.map((span) => span.sentenceId),
    startOffset: Math.min(...spans.map((span) => span.startOffset)),
    endOffset: Math.max(...spans.map((span) => span.endOffset)),
    spanHash: stableHash(spans.map((span) => span.spanHash)),
  };
}

function referenceRequirements(plan: PositioningVisualPlanV2, scene: PlannedScene) {
  const asset = plan.assets.find((candidate) => candidate.sceneId === scene.sceneId);
  return asset?.canonicalReferenceAssetId
    ? [{ kind: "canonical-identity" as const, assetId: asset.canonicalReferenceAssetId, required: true }]
    : [];
}

function defaultBeat(plan: PositioningVisualPlanV2, scene: PlannedScene): Omit<VisualBeatTreatmentV1, "beatHash"> {
  const proposition = scene.semanticProposition;
  if (!proposition) throw new Error(`VERONICA_VISUAL_BEAT_PROPOSITION_MISSING:${scene.sceneId}`);
  return {
    version: 1,
    beatId: `${scene.sceneId}-B01`,
    sceneId: scene.sceneId,
    role: scene.progressionStage === "HOOK" ? "primary" : scene.progressionStage === "PAYOFF" ? "payoff" : "primary",
    narrationRef: narrationRef(scene),
    parentTreatmentHash: scene.treatment.treatmentHash,
    coreMeaning: proposition.narrationClaim,
    newInformation: scene.newInformation,
    viewerShouldUnderstand: proposition.buyerInterpretation ?? proposition.consequence,
    visualThesis: scene.visibleThesis,
    subject: scene.treatment.subjectRequirement,
    action: scene.treatment.action,
    state: `${proposition.polarity}; ${proposition.stateRelation}`,
    environment: scene.treatment.environment,
    composition: {
      description: scene.treatment.composition,
      camera: scene.treatment.camera,
      lighting: scene.treatment.lighting,
      subtitleSafeAreaRequired: true,
    },
    continuationOfPreviousBeat: false,
    referenceRequirements: referenceRequirements(plan, scene),
    assetDecision: "new-image",
    reuseSourceBeatId: null,
    timingWeight: 1,
    boundaryKind: "narration-aligned",
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function semanticTokens(value: string): ReadonlySet<string> {
  const stop = new Set(["the", "and", "that", "with", "this", "from", "into", "eine", "einer", "und", "der", "die", "das"]);
  return new Set(normalize(value).split(/\s+/u).filter((token) => token.length > 3 && !stop.has(token)));
}

function overlapsParent(beat: VisualBeatTreatmentV1, scene: PlannedScene): boolean {
  const parent = semanticTokens(`${scene.semanticProposition?.narrationClaim ?? ""} ${scene.semanticProposition?.consequence ?? ""} ${scene.visibleThesis} ${scene.treatment.action}`);
  const child = semanticTokens(`${beat.coreMeaning} ${beat.newInformation} ${beat.viewerShouldUnderstand} ${beat.visualThesis} ${beat.action}`);
  return [...child].some((token) => parent.has(token));
}

interface DensityEvent {
  readonly visualBeatId?: string;
  readonly assetId: string;
  readonly startMs: number;
  readonly durationMs: number;
}

function materiallyDiffers(current: VisualBeatTreatmentV1, previous: VisualBeatTreatmentV1): boolean {
  const informationDiffers = normalize(current.newInformation) !== normalize(previous.newInformation);
  const visibleStateDiffers = ["subject", "action", "state", "environment"].some((field) =>
    normalize(current[field as "subject" | "action" | "state" | "environment"])
      !== normalize(previous[field as "subject" | "action" | "state" | "environment"]));
  return informationDiffers && visibleStateDiffers;
}

export function calculateVeronicaVisualDensityMetrics(input: {
  readonly semanticSceneCount: number;
  readonly beats: readonly VisualBeatTreatmentV1[];
  readonly events: readonly DensityEvent[];
}): VeronicaVisualDensityMetrics {
  const ordered = [...input.events].sort((left, right) => left.startMs - right.startMs);
  const seenAssets = new Set<string>();
  let sameAssetEventCount = 0;
  let firstNewAssetChangeMs: number | null = null;
  for (const event of ordered) {
    if (seenAssets.has(event.assetId)) sameAssetEventCount += 1;
    else {
      if (seenAssets.size > 0 && firstNewAssetChangeMs === null) firstNewAssetChangeMs = event.startMs;
      seenAssets.add(event.assetId);
    }
  }
  const assetsBefore = (endMs: number) => new Set(ordered.filter((event) => event.startMs < endMs).map((event) => event.assetId)).size;
  let longestContinuousSameAssetHoldMs = 0;
  let runAsset: string | null = null;
  let runStart = 0;
  let runEnd = 0;
  for (const event of ordered) {
    if (event.assetId === runAsset && event.startMs <= runEnd) runEnd = Math.max(runEnd, event.startMs + event.durationMs);
    else {
      longestContinuousSameAssetHoldMs = Math.max(longestContinuousSameAssetHoldMs, runEnd - runStart);
      runAsset = event.assetId;
      runStart = event.startMs;
      runEnd = event.startMs + event.durationMs;
    }
  }
  longestContinuousSameAssetHoldMs = Math.max(longestContinuousSameAssetHoldMs, runEnd - runStart);
  const priorByScene = new Map<string, VisualBeatTreatmentV1>();
  const informationGain = input.beats.map((beat) => {
    const previous = priorByScene.get(beat.sceneId);
    const addsMaterialInformation = !previous || materiallyDiffers(beat, previous);
    priorByScene.set(beat.sceneId, beat);
    return { beatId: beat.beatId, newInformationHash: stableHash(beat.newInformation), addsMaterialInformation };
  });
  const redundantPaidImageCandidateBeatIds = informationGain
    .filter((gain) => !gain.addsMaterialInformation && input.beats.find((beat) => beat.beatId === gain.beatId)?.assetDecision === "new-image")
    .map((gain) => gain.beatId);
  const timelineStart = ordered[0]?.startMs ?? 0;
  const timelineEnd = ordered.reduce((end, event) => Math.max(end, event.startMs + event.durationMs), timelineStart);
  return {
    semanticSceneCount: input.semanticSceneCount,
    visualBeatCount: input.beats.length,
    visualEventCount: ordered.length,
    uniqueCanonicalAssetCount: seenAssets.size,
    newImageBeatCount: input.beats.filter((beat) => beat.assetDecision === "new-image").length,
    reuseWithMotionBeatCount: input.beats.filter((beat) => beat.assetDecision === "reuse-with-motion").length,
    reuseWithCropBeatCount: input.beats.filter((beat) => beat.assetDecision === "reuse-with-crop").length,
    reuseExistingAssetBeatCount: input.beats.filter((beat) => beat.assetDecision === "reuse-existing-asset").length,
    sameAssetEventCount,
    firstNewAssetChangeMs,
    uniqueAssetsInFirst5Seconds: assetsBefore(5_000),
    uniqueAssetsInFirst10Seconds: assetsBefore(10_000),
    uniqueAssetsInFirst15Seconds: assetsBefore(15_000),
    longestContinuousSameAssetHoldMs,
    averageCanonicalAssetHoldMs: seenAssets.size === 0 ? 0 : Math.round(((timelineEnd - timelineStart) / seenAssets.size) * 1_000) / 1_000,
    redundantPaidImageCandidateBeatIds,
    informationGain,
    higherImageDensityThanOnePerScene: seenAssets.size > input.semanticSceneCount,
  };
}

function predictedDensityEvents(plan: PositioningVisualPlanV2, beats: readonly VisualBeatTreatmentV1[]): readonly DensityEvent[] {
  const assetByBeat = new Map<string, string>();
  return plan.scenes.flatMap((scene) => {
    const siblings = beats.filter((beat) => beat.sceneId === scene.sceneId);
    const total = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    return siblings.map((beat, index) => {
      const assetId = beat.assetDecision === "new-image"
        ? beat.beatId
        : assetByBeat.get(beat.reuseSourceBeatId ?? "") ?? `invalid-reuse:${beat.beatId}`;
      assetByBeat.set(beat.beatId, assetId);
      const durationMs = index === siblings.length - 1
        ? scene.startMs + scene.durationMs - cursor
        : Math.round(scene.durationMs * (beat.timingWeight / total));
      const event = { visualBeatId: beat.beatId, assetId, startMs: cursor, durationMs };
      cursor += durationMs;
      return event;
    });
  });
}

function beatStarts(plan: PositioningVisualPlanV2, beats: readonly VisualBeatTreatmentV1[]): Map<string, number> {
  const starts = new Map<string, number>();
  for (const scene of plan.scenes) {
    const siblings = beats.filter((beat) => beat.sceneId === scene.sceneId);
    const total = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    for (const beat of siblings) {
      starts.set(beat.beatId, cursor);
      cursor += Math.round(scene.durationMs * (beat.timingWeight / Math.max(total, 0.001)));
    }
  }
  return starts;
}

export function validateVeronicaVisualBeatPlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly beats: readonly VisualBeatTreatmentV1[];
}) {
  const findings: VeronicaVisualBeatPlanV1["quality"]["findings"][number][] = [];
  const beatIds = new Set(input.beats.map((beat) => beat.beatId));
  for (const scene of input.plan.scenes) {
    const siblings = input.beats.filter((beat) => beat.sceneId === scene.sceneId);
    if (siblings.length === 0) throw new Error(`VERONICA_VISUAL_BEAT_SCENE_EMPTY:${scene.sceneId}`);
    siblings.forEach((beat, index) => {
      const previous = siblings[index - 1];
      if (previous && beat.assetDecision === "new-image"
        && normalize(previous.newInformation) === normalize(beat.newInformation)
        && normalize(previous.subject) === normalize(beat.subject)
        && normalize(previous.action) === normalize(beat.action)
        && normalize(previous.state) === normalize(beat.state)
        && normalize(previous.environment) === normalize(beat.environment)) {
        findings.push({
          code: "REDUNDANT_SIBLING_BEAT",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "Secondary beat repeats subject, visible action, and environment without adding a material visual state.",
        });
      }
      if (!overlapsParent(beat, scene)) {
        findings.push({
          code: "BEAT_OUTSIDE_PARENT_MEANING",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "Visual beat has no meaningful lexical grounding in its parent scene treatment/proposition.",
        });
      }
      if (beat.assetDecision !== "new-image" && (!beat.reuseSourceBeatId || !beatIds.has(beat.reuseSourceBeatId))) {
        findings.push({
          code: "INVALID_REUSE_SOURCE",
          severity: "blocker",
          sceneId: scene.sceneId,
          beatId: beat.beatId,
          message: "Reuse decision requires a valid canonical source beat.",
        });
      }
    });
  }
  const starts = beatStarts(input.plan, input.beats);
  const beatsInFirst5Seconds = [...starts.values()].filter((start) => start < 5_000).length;
  const beatsInFirst10Seconds = [...starts.values()].filter((start) => start < 10_000).length;
  const beatsInFirst15Seconds = [...starts.values()].filter((start) => start < 15_000).length;
  const densityEvents = predictedDensityEvents(input.plan, input.beats);
  const density = calculateVeronicaVisualDensityMetrics({ semanticSceneCount: input.plan.scenes.length, beats: input.beats, events: densityEvents });
  for (const beatId of density.redundantPaidImageCandidateBeatIds) {
    const beat = input.beats.find((candidate) => candidate.beatId === beatId)!;
    findings.push({
      code: "REDUNDANT_PAID_IMAGE_CANDIDATE",
      severity: "blocker",
      sceneId: beat.sceneId,
      beatId,
      message: "A paid new-image beat must add both distinct semantic information and a materially changed visible state.",
    });
  }
  if (input.beats.length > input.plan.scenes.length && !density.higherImageDensityThanOnePerScene) {
    findings.push({
      code: "EVENT_ONLY_DENSITY_INCREASE",
      severity: "warning",
      sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
      beatId: input.beats[0]?.beatId ?? null,
      message: "Visual event count increased without increasing unique canonical image density.",
    });
  }
  const policy = resolveVeronicaProductionPolicy(input.plan.format).visualBeatPacing;
  if (policy.enabled && (density.uniqueAssetsInFirst5Seconds < policy.openingTargets.first5Seconds[0]
    || density.uniqueAssetsInFirst10Seconds < policy.openingTargets.first10Seconds[0])) {
    findings.push({
      code: "OPENING_STATIC_HOLD",
      severity: "warning",
      sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
      beatId: input.beats[0]?.beatId ?? null,
      message: "Opening unique-image density is below the Veronica Short profile guidance; review whether narration supports another meaningful state.",
    });
  }
  const longOpeningRun = densityEvents.some((event) => event.startMs < 10_000 && event.durationMs >= 8_000);
  if (policy.enabled && longOpeningRun) findings.push({
    code: "LONG_STATIC_OPENING_ASSET_HOLD",
    severity: "warning",
    sceneId: input.plan.scenes[0]?.sceneId ?? input.plan.contentId,
    beatId: input.beats[0]?.beatId ?? null,
    message: "An opening canonical image holds for at least eight seconds and requires explicit editorial justification.",
  });
  return qualitySchema.parse({
    status: findings.some((finding) => finding.severity === "blocker") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS",
    findings,
    beatsInFirst5Seconds,
    beatsInFirst10Seconds,
    beatsInFirst15Seconds,
    density,
  });
}

export function deriveVeronicaVisualBeatPlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly overrides?: VeronicaVisualBeatOverrideArtifact;
}): VeronicaVisualBeatPlanV1 {
  const policy = resolveVeronicaProductionPolicy(input.plan.format).visualBeatPacing;
  if (input.overrides && input.overrides.baseCanonicalImagePlanHash !== input.plan.canonicalImagePlanHash) {
    throw new Error("VERONICA_VISUAL_BEAT_OVERRIDE_STALE");
  }
  const overrideByScene = new Map(input.overrides?.scenes.map((entry) => [entry.sceneId, entry.beats] as const) ?? []);
  const beats = input.plan.scenes.flatMap((scene): VisualBeatTreatmentV1[] => {
    const overrides = overrideByScene.get(scene.sceneId);
    const values = overrides?.map((override) => ({
      version: 1 as const,
      beatId: override.beatId,
      sceneId: scene.sceneId,
      role: override.role as VisualBeatRole,
      narrationRef: narrationRef(scene),
      parentTreatmentHash: scene.treatment.treatmentHash,
      coreMeaning: override.coreMeaning,
      newInformation: override.newInformation,
      viewerShouldUnderstand: override.viewerShouldUnderstand,
      visualThesis: override.visualThesis,
      subject: override.subject,
      action: override.action,
      state: override.state,
      environment: override.environment,
      composition: override.composition,
      continuationOfPreviousBeat: override.continuationOfPreviousBeat,
      referenceRequirements: referenceRequirements(input.plan, scene),
      assetDecision: override.assetDecision as VisualBeatAssetDecision,
      reuseSourceBeatId: override.reuseSourceBeatId,
      timingWeight: override.timingWeight,
      boundaryKind: override.boundaryKind as VisualBeatBoundaryKind,
    })) ?? [defaultBeat(input.plan, scene)];
    return values.map((value) => visualBeatTreatmentV1Schema.parse({
      ...value,
      beatHash: stableHash(value),
    }));
  });
  const quality = validateVeronicaVisualBeatPlan({ plan: input.plan, beats });
  const base = {
    schemaVersion: VERONICA_VISUAL_BEAT_PLAN_VERSION,
    policyVersion: policy.policyVersion,
    contentId: input.plan.contentId,
    semanticSceneCount: input.plan.scenes.length,
    beats,
    quality,
  } as const;
  return veronicaVisualBeatPlanV1Schema.parse({
    ...base,
    beatPlanHash: stableHash(base),
  });
}

function eventKind(beat: VisualBeatTreatmentV1): VisualEventKind {
  if (beat.assetDecision === "reuse-with-crop") return "alternate-crop";
  if (beat.assetDecision === "reuse-with-motion") return "slow-push";
  if (beat.role === "reaction" || beat.role === "payoff") return "reveal";
  if (beat.role === "contrast") return "split-composition";
  return "establishing-crop";
}

function eventParameters(kind: VisualEventKind) {
  return {
    startScale: kind === "alternate-crop" ? 1.08 : 1,
    endScale: kind === "slow-push" ? 1.16 : kind === "reveal" ? 1.08 : 1.04,
    anchor: kind === "alternate-crop" ? "prop" as const : "center" as const,
  };
}

export function materializeVeronicaVisualBeatPlan(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly beatPlan: VeronicaVisualBeatPlanV1;
}): PositioningVisualPlanV2 {
  if (input.beatPlan.quality.status === "FAIL") {
    throw new Error(`VERONICA_VISUAL_BEAT_QUALITY_FAILED:${input.beatPlan.quality.findings.filter((entry) => entry.severity === "blocker").map((entry) => entry.code).join(",")}`);
  }
  const {
    imagePromptCompilation: _staleCompilationTelemetry,
    providerReadiness: _staleProviderReadiness,
    hierarchicalReadiness: _staleHierarchicalReadiness,
    ...sourcePlan
  } = input.plan;
  const assets: GeneratedVisualAsset[] = [];
  const events: VisualEvent[] = [];
  const assetByBeat = new Map<string, GeneratedVisualAsset>();
  const scenes = input.plan.scenes.map((scene) => {
    const sourceAsset = input.plan.assets.find((asset) => asset.sceneId === scene.sceneId);
    if (!sourceAsset) throw new Error(`VERONICA_VISUAL_BEAT_SOURCE_ASSET_MISSING:${scene.sceneId}`);
    const siblings = input.beatPlan.beats.filter((beat) => beat.sceneId === scene.sceneId);
    const totalWeight = siblings.reduce((sum, beat) => sum + beat.timingWeight, 0);
    let cursor = scene.startMs;
    const sceneEventIds: string[] = [];
    siblings.forEach((beat, index) => {
      let asset: GeneratedVisualAsset;
      if (beat.assetDecision === "new-image") {
        const assetId = `${scene.sceneId}-beat-${String(index + 1).padStart(2, "0")}`.toLowerCase();
        const {
          projectionProvenance: _staleProjection,
          promptCompilation: _staleCompilation,
          ...sourceAssetBase
        } = sourceAsset;
        asset = {
          ...sourceAssetBase,
          assetId,
          visualBeatId: beat.beatId,
          visualBeatHash: beat.beatHash,
          visualBeatAssetDecision: beat.assetDecision,
          semanticPurpose: beat.visualThesis,
          prompt: beat.visualThesis,
          semanticFingerprint: stableHash({ sceneId: scene.sceneId, beatHash: beat.beatHash }),
          generatedAssetCacheKey: stableHash({
            sceneId: scene.sceneId,
            beatHash: beat.beatHash,
            parentTreatmentHash: beat.parentTreatmentHash,
            referenceAssetId: sourceAsset.referenceAssetId,
          }),
        };
        assets.push(asset);
        assetByBeat.set(beat.beatId, asset);
      } else {
        const source = beat.reuseSourceBeatId ? assetByBeat.get(beat.reuseSourceBeatId) : undefined;
        if (!source) throw new Error(`VERONICA_VISUAL_BEAT_REUSE_SOURCE_MISSING:${beat.beatId}`);
        asset = source;
        assetByBeat.set(beat.beatId, source);
      }
      const durationMs = index === siblings.length - 1
        ? scene.startMs + scene.durationMs - cursor
        : Math.round(scene.durationMs * (beat.timingWeight / totalWeight));
      const timingProvenanceHash = stableHash({
        sceneId: scene.sceneId,
        beatId: beat.beatId,
        boundaryKind: beat.boundaryKind,
        timingWeight: beat.timingWeight,
      });
      const kind = eventKind(beat);
      const eventBase = {
        eventId: `${beat.beatId}-event`.toLowerCase(),
        sceneId: scene.sceneId,
        assetId: asset.assetId,
        visualBeatId: beat.beatId,
        beatBoundaryKind: beat.boundaryKind,
        timingProvenanceHash,
        kind,
        startMs: cursor,
        durationMs,
        aspectRatio: input.plan.aspectRatio,
        safeRegionIds: ["subject", "overlay", "subtitle"] as const,
        semanticFocus: beat.viewerShouldUnderstand,
        deterministicParameters: eventParameters(kind),
      };
      events.push({ ...eventBase, renderCacheKey: stableHash(eventBase) });
      sceneEventIds.push(eventBase.eventId);
      cursor += durationMs;
    });
    return {
      ...scene,
      assetId: assetByBeat.get(siblings[0]!.beatId)!.assetId,
      eventIds: sceneEventIds,
    };
  });
  const base = {
    ...sourcePlan,
    scenes,
    assets,
    visualEvents: events,
    visualBeatPlan: input.beatPlan,
    canonicalImagePlanHash: stableHash({
      assets: assets.map((asset) => ({
        assetId: asset.assetId,
        beatId: asset.visualBeatId,
        beatHash: asset.visualBeatHash,
        cacheKey: asset.generatedAssetCacheKey,
      })),
    }),
    renderEventPlanHash: stableHash(events),
  };
  return { ...base, planHash: stableHash(base) } as PositioningVisualPlanV2;
}

export async function persistVeronicaVisualBeatPlan(input: {
  readonly path: string;
  readonly plan: VeronicaVisualBeatPlanV1;
}): Promise<void> {
  await writeJsonAtomic(input.path, input.plan);
}
