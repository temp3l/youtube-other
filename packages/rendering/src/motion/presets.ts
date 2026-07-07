import type {
  MotionPreset,
  MotionPresetFamily,
  MotionPresetId,
  MotionVideoKind,
} from "./types.js";

export class MotionPresetRegistryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MotionPresetRegistryError";
  }
}

const expectedPresetCount = 15;

function freezePreset(preset: MotionPreset): MotionPreset {
  return Object.freeze({
    ...preset,
    allowedVideoKinds: Object.freeze([...preset.allowedVideoKinds]),
    storyBeats: Object.freeze([...preset.storyBeats]),
    imageKinds: Object.freeze([...preset.imageKinds]),
    durationSeconds: Object.freeze({ ...preset.durationSeconds }),
  });
}

function preset(value: MotionPreset): MotionPreset {
  return freezePreset(value);
}

export const motionPresets = Object.freeze([
  preset({
    id: "doc_slow_push_in",
    family: "documentary",
    label: "Documentary slow push in",
    intensity: "low",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["setup", "callback", "aftermath"],
    imageKinds: ["wide", "subject", "environment"],
    durationSeconds: { min: 2, max: 12 },
    weight: 1.2,
  }),
  preset({
    id: "doc_slow_pull_back",
    family: "documentary",
    label: "Documentary slow pull back",
    intensity: "low",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["aftermath", "callback", "setup"],
    imageKinds: ["wide", "environment", "subject"],
    durationSeconds: { min: 2, max: 12 },
    weight: 0.9,
  }),
  preset({
    id: "doc_left_drift",
    family: "documentary",
    label: "Documentary left drift",
    intensity: "low",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["setup", "evidence", "aftermath"],
    imageKinds: ["wide", "environment", "texture"],
    durationSeconds: { min: 2, max: 10 },
    weight: 1,
  }),
  preset({
    id: "tension_creep_zoom",
    family: "tension",
    label: "Tension creep zoom",
    intensity: "medium",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["escalation", "climax", "hook"],
    imageKinds: ["subject", "detail", "environment"],
    durationSeconds: { min: 1.5, max: 8 },
    weight: 1.1,
  }),
  preset({
    id: "tension_breathing_frame",
    family: "tension",
    label: "Tension breathing frame",
    intensity: "medium",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["escalation", "climax"],
    imageKinds: ["subject", "texture", "environment"],
    durationSeconds: { min: 1.5, max: 8 },
    weight: 0.8,
  }),
  preset({
    id: "tension_shadow_push",
    family: "tension",
    label: "Tension shadow push",
    intensity: "high",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["climax", "escalation", "hook"],
    imageKinds: ["subject", "detail", "texture"],
    durationSeconds: { min: 1, max: 5 },
    weight: 0.55,
  }),
  preset({
    id: "reveal_pan_to_subject",
    family: "reveal",
    label: "Reveal pan to subject",
    intensity: "medium",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["evidence", "hook", "climax"],
    imageKinds: ["wide", "subject", "detail"],
    durationSeconds: { min: 1.5, max: 8 },
    weight: 0.95,
  }),
  preset({
    id: "reveal_zoom_to_detail",
    family: "reveal",
    label: "Reveal zoom to detail",
    intensity: "medium",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["evidence", "climax", "hook"],
    imageKinds: ["detail", "subject"],
    durationSeconds: { min: 1.2, max: 6 },
    weight: 1,
  }),
  preset({
    id: "reveal_from_darkness",
    family: "reveal",
    label: "Reveal from darkness",
    intensity: "high",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["hook", "climax"],
    imageKinds: ["subject", "detail", "environment"],
    durationSeconds: { min: 1, max: 5 },
    weight: 0.45,
  }),
  preset({
    id: "short_fast_push",
    family: "shorts",
    label: "Short fast push",
    intensity: "medium",
    allowedVideoKinds: ["short"],
    storyBeats: ["hook", "escalation", "climax"],
    imageKinds: ["subject", "detail"],
    durationSeconds: { min: 0.6, max: 3 },
    weight: 1.2,
  }),
  preset({
    id: "short_snap_zoom",
    family: "shorts",
    label: "Short snap zoom",
    intensity: "high",
    allowedVideoKinds: ["short"],
    storyBeats: ["hook", "climax"],
    imageKinds: ["subject", "detail"],
    durationSeconds: { min: 0.4, max: 2 },
    weight: 0.8,
  }),
  preset({
    id: "short_impact_shake",
    family: "shorts",
    label: "Short impact shake",
    intensity: "high",
    allowedVideoKinds: ["short"],
    storyBeats: ["climax", "hook"],
    imageKinds: ["subject", "texture", "detail"],
    durationSeconds: { min: 0.4, max: 2 },
    weight: 0.55,
  }),
  preset({
    id: "ambient_fog_drift",
    family: "ambient",
    label: "Ambient fog drift",
    intensity: "low",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["setup", "aftermath", "callback"],
    imageKinds: ["wide", "environment", "texture"],
    durationSeconds: { min: 2, max: 12 },
    weight: 0.9,
  }),
  preset({
    id: "ambient_light_flicker",
    family: "ambient",
    label: "Ambient light flicker",
    intensity: "medium",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["setup", "escalation", "evidence"],
    imageKinds: ["environment", "texture", "subject"],
    durationSeconds: { min: 1, max: 6 },
    weight: 0.7,
  }),
  preset({
    id: "ambient_static_hold",
    family: "ambient",
    label: "Ambient static hold",
    intensity: "low",
    allowedVideoKinds: ["full", "short"],
    storyBeats: ["setup", "evidence", "aftermath"],
    imageKinds: ["wide", "environment", "unknown"],
    durationSeconds: { min: 1, max: 12 },
    weight: 0.75,
  }),
] satisfies readonly MotionPreset[]);

const presetById = new Map<MotionPresetId, MotionPreset>(
  motionPresets.map((item) => [item.id, item])
);

export function isMotionPresetId(value: string): value is MotionPresetId {
  return presetById.has(value as MotionPresetId);
}

export function getMotionPreset(id: MotionPresetId): MotionPreset {
  const match = presetById.get(id);
  if (!match) {
    throw new MotionPresetRegistryError(`Unknown motion preset id: ${id}`);
  }
  return match;
}

export function validateMotionPresetRegistry(
  registry: readonly MotionPreset[],
  options: {
    readonly expectedCount?: number;
    readonly allowShortsPresetsForFull?: boolean;
  } = {}
): void {
  const expectedCount = options.expectedCount ?? expectedPresetCount;
  if (registry.length !== expectedCount) {
    throw new MotionPresetRegistryError(
      `Motion preset registry must contain exactly ${expectedCount} presets.`
    );
  }
  const ids = new Set<MotionPresetId>();
  for (const item of registry) {
    if (ids.has(item.id)) {
      throw new MotionPresetRegistryError(`Duplicate motion preset id: ${item.id}`);
    }
    ids.add(item.id);
    assertKnownFamily(item.family);
    assertVideoKinds(item.allowedVideoKinds, item.family, options);
    if (!["low", "medium", "high"].includes(item.intensity)) {
      throw new MotionPresetRegistryError(
        `Invalid intensity for motion preset ${item.id}.`
      );
    }
    if (!Number.isFinite(item.weight) || item.weight <= 0) {
      throw new MotionPresetRegistryError(
        `Invalid weight for motion preset ${item.id}.`
      );
    }
    if (
      !Number.isFinite(item.durationSeconds.min) ||
      !Number.isFinite(item.durationSeconds.max) ||
      item.durationSeconds.min <= 0 ||
      item.durationSeconds.max < item.durationSeconds.min
    ) {
      throw new MotionPresetRegistryError(
        `Invalid duration range for motion preset ${item.id}.`
      );
    }
    if (item.storyBeats.length === 0 || item.imageKinds.length === 0) {
      throw new MotionPresetRegistryError(
        `Motion preset ${item.id} requires story beat and image kind metadata.`
      );
    }
  }
}

function assertKnownFamily(family: MotionPresetFamily): void {
  if (
    !["documentary", "tension", "reveal", "shorts", "ambient"].includes(family)
  ) {
    throw new MotionPresetRegistryError(`Invalid motion preset family: ${family}`);
  }
}

function assertVideoKinds(
  kinds: readonly MotionVideoKind[],
  family: MotionPresetFamily,
  options: { readonly allowShortsPresetsForFull?: boolean }
): void {
  if (kinds.length === 0) {
    throw new MotionPresetRegistryError(
      "Motion preset requires at least one allowed video kind."
    );
  }
  for (const kind of kinds) {
    if (!["full", "short"].includes(kind)) {
      throw new MotionPresetRegistryError(`Invalid motion video kind: ${kind}`);
    }
  }
  if (
    family === "shorts" &&
    options.allowShortsPresetsForFull !== true &&
    (kinds.length !== 1 || kinds[0] !== "short")
  ) {
    throw new MotionPresetRegistryError(
      "Shorts motion presets must be short-only by default."
    );
  }
}

validateMotionPresetRegistry(motionPresets);
