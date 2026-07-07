import type {
  MotionPreset,
  MotionPresetFamily,
  MotionPresetId,
  MotionRenderConfig,
  MotionStoryBeat,
  MotionVideoKind,
  SelectedMotionPreset,
  ShotMotionContext,
} from "./types.js";
import {
  getMotionPreset,
  isMotionPresetId,
  motionPresets,
} from "./presets.js";
import { resolveMotionRenderConfig } from "./config.js";
import { weightedChoice } from "./seeded.js";

export class MotionPresetSelectionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MotionPresetSelectionError";
  }
}

export const motionFamilyDistributions = Object.freeze({
  full: Object.freeze([
    Object.freeze({ family: "documentary", weight: 0.34 }),
    Object.freeze({ family: "tension", weight: 0.24 }),
    Object.freeze({ family: "reveal", weight: 0.18 }),
    Object.freeze({ family: "ambient", weight: 0.24 }),
  ]),
  short: Object.freeze([
    Object.freeze({ family: "shorts", weight: 0.32 }),
    Object.freeze({ family: "tension", weight: 0.24 }),
    Object.freeze({ family: "reveal", weight: 0.22 }),
    Object.freeze({ family: "documentary", weight: 0.12 }),
    Object.freeze({ family: "ambient", weight: 0.1 }),
  ]),
} satisfies Record<
  MotionVideoKind,
  readonly { readonly family: MotionPresetFamily; readonly weight: number }[]
>);

export function mapVisualPhaseToMotionStoryBeat(
  phase: string | undefined
): MotionStoryBeat {
  switch (phase) {
    case "hook":
    case "setup":
    case "evidence":
    case "escalation":
    case "climax":
    case "callback":
    case "aftermath":
      return phase;
    default:
      return "unknown";
  }
}

export function selectMotionPreset(input: {
  readonly seed: string;
  readonly context: ShotMotionContext;
  readonly config?: Partial<MotionRenderConfig>;
  readonly registry?: readonly MotionPreset[];
}): SelectedMotionPreset {
  const config = resolveMotionRenderConfig(input.config);
  const registry = input.registry ?? motionPresets;
  const context = normalizeContext(input.context);

  if (!config.enabled) {
    return {
      preset: getMotionPreset("ambient_static_hold"),
      seed: input.seed,
      fallbackUsed: true,
      reason: "motion-disabled",
    };
  }

  if (config.explicitPresetId !== undefined) {
    return selectExplicitPreset({
      presetId: config.explicitPresetId,
      context,
      config,
      registry,
      seed: input.seed,
    });
  }

  const candidates = eligiblePresets({ registry, context, config });
  const constrained = applyRepeatPrevention({
    candidates,
    context,
    config,
    registry,
  });
  const family = weightedChoice(
    motionFamilyDistributions[context.videoKind]
      .filter((item) => constrained.some((preset) => preset.family === item.family))
      .map((item) => ({ value: item.family, weight: item.weight })),
    `${input.seed}:family:${context.shotIndex ?? 0}`
  );
  const familyCandidates = constrained.filter((preset) => preset.family === family);
  const chosen = weightedChoice(
    familyCandidates.map((preset) => ({
      value: preset,
      weight: scorePreset(preset, context),
    })),
    `${input.seed}:preset:${context.shotIndex ?? 0}:${family}`
  );
  return {
    preset: chosen,
    seed: input.seed,
    fallbackUsed: false,
    reason: "weighted-selection",
  };
}

function normalizeContext(context: ShotMotionContext): Required<
  Pick<ShotMotionContext, "videoKind" | "storyBeat" | "imageKind">
> &
  ShotMotionContext {
  return {
    ...context,
    storyBeat: mapVisualPhaseToMotionStoryBeat(context.storyBeat),
    imageKind: context.imageKind ?? "unknown",
  };
}

function selectExplicitPreset(input: {
  readonly presetId: MotionPresetId;
  readonly context: ReturnType<typeof normalizeContext>;
  readonly config: MotionRenderConfig;
  readonly registry: readonly MotionPreset[];
  readonly seed: string;
}): SelectedMotionPreset {
  if (!isMotionPresetId(input.presetId)) {
    throw new MotionPresetSelectionError(
      `Unknown explicit motion preset: ${input.presetId}`
    );
  }
  const preset = input.registry.find((item) => item.id === input.presetId);
  if (!preset) {
    throw new MotionPresetSelectionError(
      `Explicit motion preset is not in the active registry: ${input.presetId}`
    );
  }
  if (!isPresetAllowedForVideoKind(preset, input.context, input.config)) {
    throw new MotionPresetSelectionError(
      `Explicit motion preset ${input.presetId} is not allowed for ${input.context.videoKind} video.`
    );
  }
  return {
    preset,
    seed: input.seed,
    fallbackUsed: false,
    reason: "explicit-preset",
  };
}

function eligiblePresets(input: {
  readonly registry: readonly MotionPreset[];
  readonly context: ReturnType<typeof normalizeContext>;
  readonly config: MotionRenderConfig;
}): readonly MotionPreset[] {
  const candidates = input.registry.filter((preset) =>
    isPresetAllowedForVideoKind(preset, input.context, input.config)
  );
  if (candidates.length > 0) {
    return candidates;
  }
  return [getMotionPreset("ambient_static_hold")];
}

function isPresetAllowedForVideoKind(
  preset: MotionPreset,
  context: ReturnType<typeof normalizeContext>,
  config: MotionRenderConfig
): boolean {
  if (
    context.videoKind === "full" &&
    preset.family === "shorts" &&
    !config.allowShortsPresetsForFull
  ) {
    return false;
  }
  return preset.allowedVideoKinds.includes(context.videoKind);
}

function applyRepeatPrevention(input: {
  readonly candidates: readonly MotionPreset[];
  readonly context: ReturnType<typeof normalizeContext>;
  readonly config: MotionRenderConfig;
  readonly registry: readonly MotionPreset[];
}): readonly MotionPreset[] {
  let candidates = [...input.candidates];
  if (input.config.preventSamePresetBackToBack && input.context.previousPresetId) {
    candidates = candidates.filter(
      (preset) => preset.id !== input.context.previousPresetId
    );
  }
  const blockedFamily = blockedRecentFamily(input);
  if (blockedFamily) {
    candidates = candidates.filter((preset) => preset.family !== blockedFamily);
  }
  if (input.config.preventConsecutiveHighIntensity) {
    const previous = input.context.previousPresetId
      ? findPreset(input.registry, input.context.previousPresetId)
      : undefined;
    if (previous?.intensity === "high") {
      candidates = candidates.filter((preset) => preset.intensity !== "high");
    }
  }
  return candidates.length > 0 ? candidates : input.candidates;
}

function blockedRecentFamily(input: {
  readonly context: ShotMotionContext;
  readonly config: MotionRenderConfig;
  readonly registry: readonly MotionPreset[];
}): MotionPresetFamily | undefined {
  const recent = input.context.recentPresetIds ?? [];
  if (recent.length === 0 || input.config.maxSameFamilyRunLength <= 0) {
    return undefined;
  }
  const last = findPreset(input.registry, recent[recent.length - 1]);
  if (!last) {
    return undefined;
  }
  let runLength = 0;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const preset = findPreset(input.registry, recent[index]);
    if (preset?.family !== last.family) {
      break;
    }
    runLength += 1;
  }
  return runLength >= input.config.maxSameFamilyRunLength
    ? last.family
    : undefined;
}

function findPreset(
  registry: readonly MotionPreset[],
  id: MotionPresetId | undefined
): MotionPreset | undefined {
  return id === undefined ? undefined : registry.find((preset) => preset.id === id);
}

function scorePreset(
  preset: MotionPreset,
  context: ReturnType<typeof normalizeContext>
): number {
  const storyBeatWeight =
    context.storyBeat === "unknown" || preset.storyBeats.includes(context.storyBeat)
      ? 1.35
      : 0.7;
  const imageKindWeight =
    context.imageKind === "unknown" || preset.imageKinds.includes(context.imageKind)
      ? 1.2
      : 0.85;
  const durationWeight =
    context.durationSeconds === undefined
      ? 1
      : context.durationSeconds >= preset.durationSeconds.min &&
          context.durationSeconds <= preset.durationSeconds.max
        ? 1.15
        : 0.65;
  return preset.weight * storyBeatWeight * imageKindWeight * durationWeight;
}
