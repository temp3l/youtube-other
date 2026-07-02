import path from "node:path";
import {
  hashText,
  normalizeWhitespace,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type NarrationChunk,
  type NarrationChunkManifest,
  type NarrationDirection,
  type NarrationDirectionSet,
  type NarrationFlowIntent,
  type NarrationMood,
  type NarrationPace,
  type NarrationRole,
  type NarrationVariant,
  narrationDirectionSetSchema,
} from "./narration-schemas.js";
import {
  createNarrationArtifactPaths,
  type NarrationArtifactPathSet,
} from "./narration-paths.js";

export const PERFORMANCE_DIRECTION_PLANNER_VERSION = "performance-direction-v1" as const;
export const PERFORMANCE_DIRECTION_PROMPT_VERSION = "performance-direction-openai-v1" as const;

export interface PerformancePlannerConfig {
  readonly mode?: "deterministic" | "openai-assisted";
  readonly fallbackToDeterministic?: boolean;
  readonly plannerVersion?: string;
  readonly promptVersion?: string;
  readonly model?: string;
  readonly negativeConstraints?: readonly string[];
  readonly maxDeliveryNoteChars?: number;
  readonly maxPauseMs?: number;
}

export interface BuildPerformanceDirectionsRequest {
  readonly episodeDir: string;
  readonly manifest: NarrationChunkManifest;
  readonly language: string;
  readonly locale?: string;
  readonly variant?: NarrationVariant;
  readonly outputPath?: string;
  readonly createdAt?: string;
  readonly config?: PerformancePlannerConfig;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

export interface PerformanceDirectionPlannerRequest {
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: typeof NARRATION_ARTIFACT_SCHEMA_VERSION;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly manifestFingerprint: string;
  readonly instructions: string;
  readonly chunks: readonly {
    readonly chunkId: string;
    readonly sequence: number;
    readonly role: NarrationRole;
    readonly flowIntent: NarrationFlowIntent;
    readonly text: string;
  }[];
  readonly requestFingerprint: string;
}

export interface BuildPerformanceDirectionsResult {
  readonly directionSet: NarrationDirectionSet;
  readonly paths: NarrationArtifactPathSet;
  readonly plannerRequest?: PerformanceDirectionPlannerRequest;
}

interface DirectionDefaults {
  readonly mood: NarrationMood;
  readonly pace: NarrationPace;
  readonly intensity: number;
  readonly restraint: number;
  readonly pauseBeforeMs: number;
  readonly pauseAfterMs: number;
}

const baseNegativeConstraints = [
  "No movie-trailer voice.",
  "No radio-announcer cadence.",
  "No upbeat explainer tone.",
  "No exaggerated suspense.",
  "No identical emphasis on every sentence.",
  "No dramatic pause after every clause.",
  "No constant breathiness.",
  "No sing-song sentence endings.",
] as const;

const roleDefaults: Record<NarrationRole, DirectionDefaults> = {
  hook: {
    mood: "intimate",
    pace: "measured",
    intensity: 0.42,
    restraint: 0.82,
    pauseBeforeMs: 0,
    pauseAfterMs: 320,
  },
  setup: {
    mood: "curious",
    pace: "normal",
    intensity: 0.35,
    restraint: 0.78,
    pauseBeforeMs: 80,
    pauseAfterMs: 260,
  },
  discovery: {
    mood: "uneasy",
    pace: "measured",
    intensity: 0.58,
    restraint: 0.76,
    pauseBeforeMs: 120,
    pauseAfterMs: 360,
  },
  escalation: {
    mood: "urgent",
    pace: "brisk",
    intensity: 0.68,
    restraint: 0.7,
    pauseBeforeMs: 80,
    pauseAfterMs: 280,
  },
  climax: {
    mood: "restrained",
    pace: "measured",
    intensity: 0.82,
    restraint: 0.86,
    pauseBeforeMs: 180,
    pauseAfterMs: 500,
  },
  reveal: {
    mood: "disturbed",
    pace: "measured",
    intensity: 0.78,
    restraint: 0.88,
    pauseBeforeMs: 160,
    pauseAfterMs: 520,
  },
  aftermath: {
    mood: "reflective",
    pace: "slow",
    intensity: 0.44,
    restraint: 0.84,
    pauseBeforeMs: 180,
    pauseAfterMs: 420,
  },
  closing: {
    mood: "intimate",
    pace: "slow",
    intensity: 0.38,
    restraint: 0.9,
    pauseBeforeMs: 200,
    pauseAfterMs: 650,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function variantAdjustedDefaults(defaults: DirectionDefaults, variant: NarrationVariant): DirectionDefaults {
  if (variant === "short") {
    return {
      ...defaults,
      pace: defaults.pace === "slow" ? "measured" : defaults.pace === "measured" ? "normal" : defaults.pace,
      intensity: clamp(defaults.intensity + 0.08, 0, 1),
      pauseBeforeMs: Math.round(defaults.pauseBeforeMs * 0.65),
      pauseAfterMs: Math.round(defaults.pauseAfterMs * 0.75),
    };
  }
  return defaults;
}

function flowAdjustedPauseAfter(defaults: DirectionDefaults, flowIntent: NarrationFlowIntent): number {
  if (flowIntent === "concludes") {
    return defaults.pauseAfterMs + 200;
  }
  if (flowIntent === "unresolved_reveal") {
    return defaults.pauseAfterMs + 120;
  }
  if (flowIntent === "leads_next") {
    return Math.max(120, defaults.pauseAfterMs - 80);
  }
  return defaults.pauseAfterMs;
}

function deliveryNoteFor(chunk: NarrationChunk, defaults: DirectionDefaults): string {
  const punctuation = /[?!…]$/u.test(chunk.text.trim())
    ? "Honor the final punctuation without adding theatrical suspense."
    : "Keep sentence endings natural and grounded.";
  return [
    `Use a ${defaults.mood} mood with ${defaults.pace} pacing.`,
    `Intensity ${defaults.intensity.toFixed(2)} and restraint ${defaults.restraint.toFixed(2)}.`,
    punctuation,
  ].join(" ");
}

function continuityFor(chunk: NarrationChunk): string {
  if (chunk.flowIntent === "concludes") {
    return "Let the thought resolve cleanly without adding extra words.";
  }
  if (chunk.flowIntent === "unresolved_reveal") {
    return "Carry unresolved tension into the next chunk without speaking the context.";
  }
  return "Maintain continuity into the next chunk while speaking only the current input.";
}

function tokenPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu");
}

export function validateEmphasisTargets(
  chunk: NarrationChunk,
  targets: readonly string[]
): readonly string[] {
  const normalizedText = normalizeWhitespace(chunk.text);
  const invalid = targets
    .map((target) => normalizeWhitespace(target))
    .filter((target) => target.length > 0)
    .filter((target) => !tokenPattern(target).test(normalizedText));
  return [...new Set(invalid)];
}

function deterministicEmphasisTargets(chunk: NarrationChunk): readonly string[] {
  const candidates = [...chunk.text.matchAll(/\b[\p{Lu}][\p{L}\p{N}'-]{2,}\b/gu)]
    .map((match) => match[0] ?? "")
    .filter((value) => value.length > 0);
  return [...new Set(candidates)].slice(0, 3);
}

function buildDirection(
  chunk: NarrationChunk,
  variant: NarrationVariant,
  config: PerformancePlannerConfig,
  warnings: { code: string; message: string; chunkId?: string }[]
): NarrationDirection {
  const maxPauseMs = config.maxPauseMs ?? 1_500;
  const maxDeliveryNoteChars = config.maxDeliveryNoteChars ?? 700;
  const defaults = variantAdjustedDefaults(roleDefaults[chunk.role], variant);
  const emphasisTargets = deterministicEmphasisTargets(chunk);
  const invalidEmphasis = validateEmphasisTargets(chunk, emphasisTargets);
  if (invalidEmphasis.length > 0) {
    warnings.push({
      code: "DIRECTION_EMPHASIS_INVALID",
      message: `Removed emphasis targets not present in chunk text: ${invalidEmphasis.join(", ")}.`,
      chunkId: chunk.chunkId,
    });
  }
  return {
    chunkId: chunk.chunkId,
    role: chunk.role,
    mood: defaults.mood,
    pace: defaults.pace,
    intensity: clamp(defaults.intensity, 0, 1),
    restraint: clamp(defaults.restraint, 0, 1),
    pauseBeforeMs: clamp(defaults.pauseBeforeMs, 0, maxPauseMs),
    pauseAfterMs: clamp(flowAdjustedPauseAfter(defaults, chunk.flowIntent), 0, maxPauseMs),
    emphasisTargets: emphasisTargets.filter((target) => !invalidEmphasis.includes(target)),
    deliveryNote: deliveryNoteFor(chunk, defaults).slice(0, maxDeliveryNoteChars),
    negativeConstraints: [...baseNegativeConstraints, ...(config.negativeConstraints ?? [])],
    continuityGuidance: continuityFor(chunk),
    flowIntent: chunk.flowIntent,
  };
}

function setFingerprintInput(value: Omit<NarrationDirectionSet, "setFingerprint">): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    manifestFingerprint: value.manifestFingerprint,
    plannerMode: value.plannerMode,
    plannerVersion: value.plannerVersion,
    promptVersion: value.promptVersion ?? null,
    schemaVersionFingerprint: value.schemaVersionFingerprint ?? null,
    plannerRequestFingerprint: value.plannerRequestFingerprint ?? null,
    sourceFingerprint: value.sourceFingerprint ?? null,
    fallbackUsage: value.fallbackUsage,
    warnings: value.warnings ?? [],
    directions: value.directions,
    createdAt: value.createdAt,
  });
}

export function buildPerformancePlannerRequest(input: {
  readonly manifest: NarrationChunkManifest;
  readonly language: string;
  readonly locale?: string;
  readonly variant?: NarrationVariant;
  readonly config?: PerformancePlannerConfig;
}): PerformanceDirectionPlannerRequest {
  const locale = input.locale ?? input.manifest.locale;
  const variant = input.variant ?? input.manifest.variant;
  const promptVersion = input.config?.promptVersion ?? PERFORMANCE_DIRECTION_PROMPT_VERSION;
  const model = input.config?.model ?? "gpt-4.1-mini";
  const requestWithoutFingerprint = {
    model,
    promptVersion,
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    language: input.language,
    locale,
    variant,
    manifestFingerprint: input.manifest.manifestFingerprint,
    instructions: [
      "Plan delivery directions for this narration variant in one structured response.",
      "Return one direction per chunk ID.",
      "Do not rewrite narration text or synthesize audio.",
      "Every emphasis target must appear in that chunk text.",
      "Every direction must include inherited negative constraints.",
    ].join(" "),
    chunks: input.manifest.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      sequence: chunk.sequence,
      role: chunk.role,
      flowIntent: chunk.flowIntent,
      text: chunk.text,
    })),
  };
  return {
    ...requestWithoutFingerprint,
    requestFingerprint: hashText(JSON.stringify(requestWithoutFingerprint)),
  };
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

export async function buildPerformanceDirections(
  request: BuildPerformanceDirectionsRequest
): Promise<BuildPerformanceDirectionsResult> {
  const locale = request.locale ?? request.manifest.locale;
  const variant = request.variant ?? request.manifest.variant;
  const paths = createNarrationArtifactPaths({
    episodeId: request.manifest.episodeId,
    locale,
    variant,
    episodeRoot: request.episodeDir,
  });
  const config = request.config ?? {};
  const warnings: { code: string; message: string; chunkId?: string }[] = [];
  const plannerRequest =
    config.mode === "openai-assisted"
      ? buildPerformancePlannerRequest({
          manifest: request.manifest,
          language: request.language,
          locale,
          variant,
          config,
        })
      : undefined;
  const fallbackUsed = config.mode === "openai-assisted" && config.fallbackToDeterministic !== false;
  const directions = request.manifest.chunks.map((chunk) => buildDirection(chunk, variant, config, warnings));
  const sourceFingerprint = hashText(
    JSON.stringify({
      manifestFingerprint: request.manifest.manifestFingerprint,
      chunkTextHashes: request.manifest.chunks.map((chunk) => [chunk.chunkId, chunk.textHash]),
      language: request.language,
      locale,
      variant,
    })
  );
  const withoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    manifestFingerprint: request.manifest.manifestFingerprint,
    plannerMode: config.mode ?? "deterministic",
    plannerVersion: config.plannerVersion ?? PERFORMANCE_DIRECTION_PLANNER_VERSION,
    promptVersion: config.promptVersion ?? PERFORMANCE_DIRECTION_PROMPT_VERSION,
    schemaVersionFingerprint: hashText(NARRATION_ARTIFACT_SCHEMA_VERSION),
    ...(plannerRequest ? { plannerRequestFingerprint: plannerRequest.requestFingerprint } : {}),
    sourceFingerprint,
    fallbackUsage: {
      used: fallbackUsed,
      ...(fallbackUsed ? { reason: "OpenAI-assisted planning is not executed in deterministic fallback mode.", from: "openai-assisted", to: "deterministic" } : {}),
    },
    ...(warnings.length > 0 ? { warnings } : {}),
    directions,
    createdAt: request.createdAt ?? new Date().toISOString(),
  } satisfies Omit<NarrationDirectionSet, "setFingerprint">;
  const directionSet = narrationDirectionSetSchema.parse({
    ...withoutFingerprint,
    setFingerprint: hashText(setFingerprintInput(withoutFingerprint)),
  });
  const outputPath = request.outputPath ?? paths.performanceDirections;
  await writeJsonAtomic(outputPath, directionSet);
  request.logger?.info(
    {
      plannerMode: directionSet.plannerMode,
      fallbackUsed: directionSet.fallbackUsage.used,
      chunkCount: directionSet.directions.length,
      warningCount: directionSet.warnings?.length ?? 0,
      directionSetFingerprint: directionSet.setFingerprint,
      outputPath: relative(request.episodeDir, outputPath),
    },
    "Built narration performance directions."
  );
  return {
    directionSet,
    paths,
    ...(plannerRequest ? { plannerRequest } : {}),
  };
}
