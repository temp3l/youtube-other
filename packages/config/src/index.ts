import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  visualBudgetSchema,
  visualPacingProfileIdSchema,
  visualPacingProfileSchema,
} from "@mediaforge/domain";
import { z } from "zod";
import { configurationErrorFromUnknown } from "./internal.js";

const visualRetentionPresetSchema = z.strictObject({
  id: z.enum(["short-45-60", "short-60-75", "full-4-6m"]),
  pacingProfileId: visualPacingProfileIdSchema,
  narrationDurationMs: z.object({
    minMs: z.number().int().nonnegative(),
    maxMs: z.number().int().nonnegative(),
  }).superRefine((value, ctx) => {
    if (value.minMs > value.maxMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minMs"],
        message: "Minimum duration must not exceed maximum duration.",
      });
    }
  }),
  budget: visualBudgetSchema,
});

const visualRetentionPresetOverrideSchema =
  visualRetentionPresetSchema.partial();

const visualRetentionConfigSchema = z.strictObject({
  pacingProfiles: z
    .strictObject({
      atmospheric: visualPacingProfileSchema,
      balanced: visualPacingProfileSchema,
      "high-retention": visualPacingProfileSchema,
      "shorts-aggressive": visualPacingProfileSchema,
    })
    .superRefine((value, ctx) => {
      for (const [profileId, profile] of Object.entries(value)) {
        if (profile.id !== profileId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [profileId, "id"],
            message: "Pacing profile ids must match their configuration key.",
          });
        }
      }
    }),
  defaults: z.strictObject({
    short: z.array(visualRetentionPresetSchema).min(1),
    full: z.array(visualRetentionPresetSchema).min(1),
  }),
});

const visualRetentionConfigOverrideSchema = z.strictObject({
  pacingProfiles: z
    .strictObject({
      atmospheric: visualPacingProfileSchema.partial().optional(),
      balanced: visualPacingProfileSchema.partial().optional(),
      "high-retention": visualPacingProfileSchema.partial().optional(),
      "shorts-aggressive": visualPacingProfileSchema.partial().optional(),
    })
    .optional(),
  defaults: z
    .strictObject({
      short: z.array(visualRetentionPresetOverrideSchema).optional(),
      full: z.array(visualRetentionPresetOverrideSchema).optional(),
    })
    .optional(),
});

const narrationMasteringProfileSchema = z.strictObject({
  id: z.enum(["clean", "render-ready", "shorts", "full-length"]),
  version: z.string().min(1).max(80),
  enabled: z.boolean(),
  sampleRate: z.number().int().min(16_000).max(96_000),
  codec: z.literal("pcm_s16le"),
  targetLoudnessLufs: z.number().min(-24).max(-12),
  truePeakLimitDb: z.number().min(-6).max(-1),
  highPassHz: z.number().min(20).max(120).optional(),
  correctiveEq: z
    .strictObject({
      frequencyHz: z.number().min(100).max(8_000),
      gainDb: z.number().min(-3).max(3),
      width: z.number().min(0.1).max(3).optional(),
    })
    .optional(),
  compression: z
    .strictObject({
      thresholdDb: z.number().min(-30).max(-10),
      ratio: z.number().min(1).max(2.5),
      attackMs: z.number().min(1).max(50),
      releaseMs: z.number().min(40).max(300),
    })
    .optional(),
  deEss: z
    .strictObject({
      enabled: z.boolean(),
      frequencyHz: z.number().min(4_000).max(10_000),
      width: z.number().min(0.1).max(2),
      reductionDb: z.number().min(-3).max(0),
    })
    .optional(),
});

const narrationMasteringProfileOverrideSchema =
  narrationMasteringProfileSchema.partial().extend({
    id: narrationMasteringProfileSchema.shape.id,
  });

const narrationMasteringConfigSchema = z.strictObject({
  profiles: z.array(narrationMasteringProfileSchema).min(1).superRefine((profiles, ctx) => {
    const ids = profiles.map((profile) => profile.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Narration mastering profile ids must be unique.",
      });
    }
  }),
  defaultProfileByVariant: z.strictObject({
    full: z.enum(["clean", "render-ready", "shorts", "full-length"]),
    short: z.enum(["clean", "render-ready", "shorts", "full-length"]),
  }),
});

const narrationMasteringConfigOverrideSchema = z.strictObject({
  profiles: z.array(narrationMasteringProfileOverrideSchema).optional(),
  defaultProfileByVariant: z
    .strictObject({
      full: z.enum(["clean", "render-ready", "shorts", "full-length"]).optional(),
      short: z.enum(["clean", "render-ready", "shorts", "full-length"]).optional(),
    })
    .optional(),
});

const defaultNarrationMasteringConfig = narrationMasteringConfigSchema.parse({
  profiles: [
    {
      id: "clean",
      version: "mastering-clean-v1",
      enabled: false,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -18,
      truePeakLimitDb: -2,
    },
    {
      id: "render-ready",
      version: "mastering-render-ready-v1",
      enabled: true,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -16,
      truePeakLimitDb: -1.5,
      highPassHz: 70,
      correctiveEq: { frequencyHz: 250, gainDb: -1.5, width: 1.2 },
      compression: { thresholdDb: -18, ratio: 1.6, attackMs: 12, releaseMs: 120 },
      deEss: { enabled: false, frequencyHz: 6_500, width: 0.8, reductionDb: -1.5 },
    },
    {
      id: "shorts",
      version: "mastering-shorts-v1",
      enabled: true,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -15,
      truePeakLimitDb: -1.5,
      highPassHz: 80,
      correctiveEq: { frequencyHz: 220, gainDb: -1, width: 1 },
      compression: { thresholdDb: -20, ratio: 1.8, attackMs: 10, releaseMs: 100 },
      deEss: { enabled: true, frequencyHz: 6_500, width: 0.7, reductionDb: -1.5 },
    },
    {
      id: "full-length",
      version: "mastering-full-length-v1",
      enabled: true,
      sampleRate: 48_000,
      codec: "pcm_s16le",
      targetLoudnessLufs: -17,
      truePeakLimitDb: -2,
      highPassHz: 65,
      correctiveEq: { frequencyHz: 260, gainDb: -1, width: 1.1 },
      compression: { thresholdDb: -18, ratio: 1.4, attackMs: 15, releaseMs: 150 },
      deEss: { enabled: false, frequencyHz: 6_500, width: 0.8, reductionDb: -1 },
    },
  ],
  defaultProfileByVariant: {
    full: "render-ready",
    short: "shorts",
  },
});

const defaultVisualRetentionConfig = visualRetentionConfigSchema.parse({
  pacingProfiles: {
    atmospheric: {
      id: "atmospheric",
      shotDurationMs: { minMs: 2_000, maxMs: 12_000 },
      staticShotDurationMs: { minMs: 2_000, maxMs: 5_000 },
      movingShotDurationMs: { minMs: 2_000, maxMs: 12_000 },
      openingCadenceMs: { minMs: 3_000, maxMs: 6_000 },
      climaxCadenceMs: { minMs: 2_000, maxMs: 5_000 },
    },
    balanced: {
      id: "balanced",
      shotDurationMs: { minMs: 2_000, maxMs: 8_000 },
      staticShotDurationMs: { minMs: 2_000, maxMs: 5_000 },
      movingShotDurationMs: { minMs: 2_000, maxMs: 10_000 },
      openingCadenceMs: { minMs: 3_000, maxMs: 6_000 },
      climaxCadenceMs: { minMs: 2_000, maxMs: 5_000 },
    },
    "high-retention": {
      id: "high-retention",
      shotDurationMs: { minMs: 1_500, maxMs: 6_000 },
      staticShotDurationMs: { minMs: 1_500, maxMs: 4_000 },
      movingShotDurationMs: { minMs: 1_500, maxMs: 8_000 },
      openingCadenceMs: { minMs: 1_500, maxMs: 4_000 },
      climaxCadenceMs: { minMs: 1_500, maxMs: 3_500 },
    },
    "shorts-aggressive": {
      id: "shorts-aggressive",
      shotDurationMs: { minMs: 1_000, maxMs: 5_000 },
      staticShotDurationMs: { minMs: 1_000, maxMs: 3_000 },
      movingShotDurationMs: { minMs: 1_000, maxMs: 6_000 },
      openingCadenceMs: { minMs: 1_500, maxMs: 3_500 },
      climaxCadenceMs: { minMs: 1_000, maxMs: 3_000 },
    },
  },
  defaults: {
    short: [
      {
        id: "short-45-60",
        pacingProfileId: "shorts-aggressive",
        narrationDurationMs: { minMs: 45_000, maxMs: 60_000 },
        budget: {
          sourceImageCount: { min: 5, max: 9 },
          shotCount: { min: 15, max: 28 },
          shotsPerImage: { min: 2, max: 4 },
          maxConsecutiveSourceImageUses: 3,
          maxTotalSourceImageUses: 5,
          cropLimits: {
            minCropArea: 0.35,
            minFaceMargin: 0.08,
            maxCropZoom: 2,
            minOutputHeightPx: 1080,
            maxAdjacentSameImageCropIou: 0.82,
          },
          motionLimits: {
            minShotDurationMs: 1_000,
            pushInScaleRange: { min: 1.03, max: 1.14 },
            fastPushInScaleRange: { min: 1.08, max: 1.22 },
            panTravelFractionOfImage: { min: 0.03, max: 0.12 },
            rotationDegreesRange: { min: -1, max: 1 },
            dissolveDurationMs: { minMs: 120, maxMs: 250 },
            dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
          },
          effectCaps: [
            { effect: "blurred-fill", maxShare: 0.2, scope: "video" },
            {
              effect: "surveillance-glitch-static-combined",
              maxShare: 0.15,
              scope: "video",
            },
            { effect: "parallax", maxCount: 1, scope: "video" },
            { effect: "exposure-flash", maxCount: 3, scope: "video" },
            { effect: "blackout", maxCount: 2, scope: "video" },
            { effect: "fast-zoom", maxCount: 3, scope: "video" },
          ],
        },
      },
      {
        id: "short-60-75",
        pacingProfileId: "shorts-aggressive",
        narrationDurationMs: { minMs: 60_000, maxMs: 75_000 },
        budget: {
          sourceImageCount: { min: 7, max: 12 },
          shotCount: { min: 20, max: 35 },
          shotsPerImage: { min: 2, max: 4 },
          maxConsecutiveSourceImageUses: 3,
          maxTotalSourceImageUses: 5,
          cropLimits: {
            minCropArea: 0.35,
            minFaceMargin: 0.08,
            maxCropZoom: 2,
            minOutputHeightPx: 1080,
            maxAdjacentSameImageCropIou: 0.82,
          },
          motionLimits: {
            minShotDurationMs: 1_000,
            pushInScaleRange: { min: 1.03, max: 1.14 },
            fastPushInScaleRange: { min: 1.08, max: 1.22 },
            panTravelFractionOfImage: { min: 0.03, max: 0.12 },
            rotationDegreesRange: { min: -1, max: 1 },
            dissolveDurationMs: { minMs: 120, maxMs: 250 },
            dipToBlackDurationMs: { minMs: 100, maxMs: 500 },
          },
          effectCaps: [
            { effect: "blurred-fill", maxShare: 0.2, scope: "video" },
            {
              effect: "surveillance-glitch-static-combined",
              maxShare: 0.15,
              scope: "video",
            },
            { effect: "parallax", maxCount: 1, scope: "video" },
            { effect: "exposure-flash", maxCount: 3, scope: "video" },
            { effect: "blackout", maxCount: 2, scope: "video" },
            { effect: "fast-zoom", maxCount: 3, scope: "video" },
          ],
        },
      },
    ],
    full: [
      {
        id: "full-4-6m",
        pacingProfileId: "balanced",
        narrationDurationMs: { minMs: 240_000, maxMs: 360_000 },
        budget: {
          sourceImageCount: { min: 18, max: 35 },
          shotCount: { min: 45, max: 85 },
          shotsPerImage: { min: 2, max: 3 },
          maxConsecutiveSourceImageUses: 3,
          maxTotalSourceImageUses: 6,
          cropLimits: {
            minCropArea: 0.35,
            minFaceMargin: 0.08,
            maxCropZoom: 1.7,
            minOutputHeightPx: 1080,
            maxAdjacentSameImageCropIou: 0.82,
          },
          motionLimits: {
            minShotDurationMs: 2_000,
            pushInScaleRange: { min: 1.02, max: 1.1 },
            fastPushInScaleRange: { min: 1.06, max: 1.16 },
            panTravelFractionOfImage: { min: 0.02, max: 0.08 },
            rotationDegreesRange: { min: -0.5, max: 0.5 },
            dissolveDurationMs: { minMs: 200, maxMs: 500 },
            dipToBlackDurationMs: { minMs: 200, maxMs: 800 },
          },
          effectCaps: [
            { effect: "blurred-fill", maxShare: 0.15, scope: "video" },
            {
              effect: "surveillance-glitch-static-combined",
              maxShare: 0.1,
              scope: "video",
            },
            { effect: "parallax", maxCount: 3, scope: "video" },
            {
              effect: "exposure-flash",
              maxCount: 1,
              scope: "rolling-duration",
              scopeDurationMs: 60_000,
            },
            {
              effect: "blackout",
              maxCount: 1,
              scope: "intense-sequence",
            },
            {
              effect: "fast-zoom",
              maxCount: 1,
              scope: "rolling-duration",
              scopeDurationMs: 60_000,
            },
          ],
        },
      },
    ],
  },
});

type VisualRetentionConfig = z.infer<typeof visualRetentionConfigSchema>;
type VisualRetentionConfigOverride = z.infer<
  typeof visualRetentionConfigOverrideSchema
>;
type VisualRetentionPacingProfiles = VisualRetentionConfig["pacingProfiles"];
type VisualRetentionPacingProfilesOverride = NonNullable<
  VisualRetentionConfigOverride["pacingProfiles"]
>;
type VisualRetentionProfile = VisualRetentionPacingProfiles["atmospheric"];
type VisualRetentionProfileOverride =
  VisualRetentionPacingProfilesOverride["atmospheric"];
type NarrationMasteringConfig = z.infer<typeof narrationMasteringConfigSchema>;
type NarrationMasteringConfigOverride = z.infer<
  typeof narrationMasteringConfigOverrideSchema
>;

function mergeVisualRetentionProfile(
  baseProfile: VisualRetentionProfile,
  override: VisualRetentionProfileOverride | undefined,
) {
  return override === undefined ? baseProfile : { ...baseProfile, ...override };
}

function mergeVisualRetentionConfig(
  overrides: VisualRetentionConfigOverride | undefined,
  episodeOverrides: VisualRetentionConfigOverride | undefined,
) {
  const merged =
    episodeOverrides === undefined && overrides === undefined
      ? defaultVisualRetentionConfig
      : {
          pacingProfiles: {
            atmospheric: mergeVisualRetentionProfile(
              defaultVisualRetentionConfig.pacingProfiles.atmospheric,
              overrides?.pacingProfiles?.atmospheric ??
                episodeOverrides?.pacingProfiles?.atmospheric,
            ),
            balanced: mergeVisualRetentionProfile(
              defaultVisualRetentionConfig.pacingProfiles.balanced,
              overrides?.pacingProfiles?.balanced ??
                episodeOverrides?.pacingProfiles?.balanced,
            ),
            "high-retention": mergeVisualRetentionProfile(
              defaultVisualRetentionConfig.pacingProfiles["high-retention"],
              overrides?.pacingProfiles?.["high-retention"] ??
                episodeOverrides?.pacingProfiles?.["high-retention"],
            ),
            "shorts-aggressive": mergeVisualRetentionProfile(
              defaultVisualRetentionConfig.pacingProfiles["shorts-aggressive"],
              overrides?.pacingProfiles?.["shorts-aggressive"] ??
                episodeOverrides?.pacingProfiles?.["shorts-aggressive"],
            ),
          },
          defaults: {
            short:
              overrides?.defaults?.short ??
              episodeOverrides?.defaults?.short ??
              defaultVisualRetentionConfig.defaults.short,
            full:
              overrides?.defaults?.full ??
              episodeOverrides?.defaults?.full ??
              defaultVisualRetentionConfig.defaults.full,
          },
        };

  return visualRetentionConfigSchema.parse(merged);
}

function mergeNarrationMasteringConfig(
  overrides: NarrationMasteringConfigOverride | undefined,
  episodeOverrides: NarrationMasteringConfigOverride | undefined,
): NarrationMasteringConfig {
  const profileOverrides = [
    ...(episodeOverrides?.profiles ?? []),
    ...(overrides?.profiles ?? []),
  ];
  const profiles = defaultNarrationMasteringConfig.profiles.map((baseProfile) => {
    const matchingOverrides = profileOverrides.filter((override) => override.id === baseProfile.id);
    return matchingOverrides.reduce(
      (current, override) => ({ ...current, ...override }),
      baseProfile,
    );
  });
  return narrationMasteringConfigSchema.parse({
    profiles,
    defaultProfileByVariant: {
      ...defaultNarrationMasteringConfig.defaultProfileByVariant,
      ...(episodeOverrides?.defaultProfileByVariant ?? {}),
      ...(overrides?.defaultProfileByVariant ?? {}),
    },
  });
}

const configSchema = z.object({
  workspaceDir: z.string().min(1),
  dbPath: z.string().min(1),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
  defaultAspectRatio: z.enum(["16:9", "9:16"]),
  openArtBatchSize: z.number().int().positive(),
  ttsProvider: z.enum(["mock", "openai-compatible"]),
  transcriptionProvider: z.enum(["mock", "whisper.cpp", "openai-compatible"]),
  imageProvider: z.enum(["mock", "placeholder"]),
  textProvider: z.enum(["mock", "openai-compatible"]),
  whisperBin: z.string().min(1),
  whisperModel: z.string().optional(),
  whisperLanguage: z.string().optional(),
  whisperThreads: z.number().int().positive().optional(),
  whisperProcessors: z.number().int().positive().optional(),
  whisperTimeoutMs: z.number().int().positive().optional(),
  whisperMaxDurationSeconds: z.number().int().positive().optional(),
  whisperWordTimestamps: z.boolean(),
  transcriptMinSegmentSeconds: z.number().positive(),
  transcriptMaxSegmentSeconds: z.number().positive(),
  transcriptMaxSilenceSeconds: z.number().nonnegative(),
  transcriptTimestampPrecision: z.number().int().min(0).max(6),
  transcriptMaxWordDurationSeconds: z.number().positive(),
  transcriptBoundaryLookbackWords: z.number().int().nonnegative(),
  visualSceneTargetPer10Minutes: z.number().positive(),
  visualSceneMinSeconds: z.number().positive(),
  visualSceneMaxSeconds: z.number().positive(),
  trailingSilenceRatio: z.number().min(0).max(1),
  trailingSilenceBufferSeconds: z.number().min(0),
  openAiTranscriptionModel: z.string().optional(),
  openAiTranscriptionLanguage: z.string().optional(),
  openAiTranscriptionPrompt: z.string().optional(),
  openAiStoryModel: z.string().optional(),
  openAiStoryTemperature: z.number().min(0).max(2).optional(),
  openAiStoryReasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  openAiStoryMaxOutputTokens: z.number().int().positive().optional(),
  openAiStoryRetryMaxOutputTokens: z.number().int().positive().optional(),
  openAiLocalizationModel: z.string().optional(),
  openAiLocalizationReasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  openAiLocalizationMaxOutputTokens: z.number().int().positive().optional(),
  openAiShortModel: z.string().optional(),
  openAiShortReasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  openAiShortRewriteMaxOutputTokens: z.number().int().positive().optional(),
  openAiShortRewriteRetryMaxOutputTokens: z.number().int().positive().optional(),
  openAiShortMaxOutputTokens: z.number().int().positive().optional(),
  openAiValidatorModel: z.string().optional(),
  openAiValidatorReasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  openAiValidatorMaxOutputTokens: z.number().int().positive().optional(),
  openAiMetadataModel: z.string().optional(),
  openAiMetadataReasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  openAiMetadataMaxOutputTokens: z.number().int().positive().optional(),
  openAiMetadataMaxRetries: z.number().int().positive().optional(),
  openAiMetadataKeepFile: z.boolean(),
  openAiMetadataTimeoutMs: z.number().int().positive().optional(),
  youtubeMetadataLanguage: z.string().regex(/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu).optional(),
  openAiCompatibleBaseUrl: z.string().url().optional(),
  openAiCompatibleApiKey: z.string().optional(),
  openAiCompatibleOrganization: z.string().optional(),
  openAiCompatibleProject: z.string().optional(),
  openAiCompatibleModel: z.string().optional(),
  openAiCompatibleTtsVoice: z.string().optional(),
  openAiSpeechModel: z.string().optional(),
  openAiSpeechVoice: z.string().optional(),
  speechVoicePreset: z.enum(["slow", "fast", "very-fast"]).optional(),
  narrationPipelineMode: z.enum(["legacy", "shadow", "new"]),
  scriptLanguage: z.string().regex(/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu).optional(),
  youtubeClientId: z.string().optional(),
  youtubeClientSecret: z.string().optional(),
  youtubeRefreshToken: z.string().optional(),
  youtubeRefreshTokenGerman: z.string().optional(),
  youtubeRefreshTokenSpanish: z.string().optional(),
  youtubeRefreshTokenFrench: z.string().optional(),
  youtubeRedirectUri: z.string().url().optional(),
  youtubeChannelId: z.string().optional(),
  youtubeChannelIdGerman: z.string().optional(),
  youtubeChannelIdSpanish: z.string().optional(),
  youtubeChannelIdFrench: z.string().optional(),
  apiPort: z.number().int().positive(),
  remoteRenderEnabled: z.boolean(),
  remoteRenderHost: z.string().min(1),
  remoteRenderUser: z.string().min(1),
  remoteRenderPort: z.number().int().min(1).max(65535),
  remoteRenderBaseDir: z.string().min(1),
  remoteRenderConcurrency: z.number().int().positive(),
  remoteRenderConnectTimeoutSeconds: z.number().int().positive(),
  remoteRenderCommandTimeoutSeconds: z.number().int().positive(),
  remoteRenderMaxRetries: z.number().int().nonnegative(),
  remoteRenderFallbackToLocal: z.boolean(),
  remoteRenderKeepFiles: z.boolean(),
  remoteRenderVerifyHostKey: z.boolean(),
  remoteRenderKnownHostsFile: z.string().optional(),
  remoteRenderSshPrivateKey: z.string().optional(),
  remoteRenderUploadMethod: z.enum(["rsync"]),
  localRenderConcurrency: z.number().int().positive().optional(),
  remoteRenderCleanupMaxAgeHours: z.number().int().positive(),
  visualRetention: visualRetentionConfigSchema,
  narrationMastering: narrationMasteringConfigSchema,
});
export type RuntimeConfig = z.infer<typeof configSchema>;
export const runtimeConfigOverridesSchema = configSchema.partial().extend({
  visualRetention: visualRetentionConfigOverrideSchema.optional(),
  narrationMastering: narrationMasteringConfigOverrideSchema.optional(),
});
export type RuntimeConfigOverrides = z.infer<typeof runtimeConfigOverridesSchema>;
export const episodeConfigSchema: z.ZodType<RuntimeConfigOverrides> =
  runtimeConfigOverridesSchema;
export type EpisodeConfig = z.infer<typeof episodeConfigSchema>;

function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (key.length === 0) {
      continue;
    }
    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    values[key] = quoted.replace(/\\n/gu, "\n");
  }
  return values;
}

async function loadDotEnvValues(cwd: string): Promise<Record<string, string>> {
  const dotenvPath = path.join(cwd, ".env");
  try {
    const raw = await fs.readFile(dotenvPath, "utf8");
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

const envSchema = z.object({
  MEDIAFORGE_WORKSPACE: z.string().optional(),
  MEDIAFORGE_DB_PATH: z.string().optional(),
  MEDIAFORGE_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
  MEDIAFORGE_DEFAULT_ASPECT_RATIO: z.enum(["16:9", "9:16"]).optional(),
  MEDIAFORGE_OPENART_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_TTS_PROVIDER: z.enum(["mock", "openai-compatible"]).optional(),
  MEDIAFORGE_TRANSCRIPTION_PROVIDER: z.enum(["mock", "whisper.cpp", "openai-compatible"]).optional(),
  MEDIAFORGE_IMAGE_PROVIDER: z.enum(["mock", "placeholder"]).optional(),
  MEDIAFORGE_TEXT_PROVIDER: z.enum(["mock", "openai-compatible"]).optional(),
  MEDIAFORGE_WHISPER_BIN: z.string().optional(),
  MEDIAFORGE_WHISPER_MODEL: z.string().optional(),
  MEDIAFORGE_WHISPER_LANGUAGE: z.string().optional(),
  MEDIAFORGE_WHISPER_THREADS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_WHISPER_PROCESSORS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_WHISPER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_WHISPER_MAX_DURATION_SECONDS: z.coerce.number().int().positive().optional(),
  WHISPER_WORD_TIMESTAMPS: z.string().optional(),
  TRANSCRIPT_MIN_SEGMENT_SECONDS: z.coerce.number().positive().optional(),
  TRANSCRIPT_MAX_SEGMENT_SECONDS: z.coerce.number().positive().optional(),
  TRANSCRIPT_MAX_SILENCE_SECONDS: z.coerce.number().nonnegative().optional(),
  TRANSCRIPT_TIMESTAMP_PRECISION: z.coerce.number().int().min(0).max(6).optional(),
  TRANSCRIPT_MAX_WORD_DURATION_SECONDS: z.coerce.number().positive().optional(),
  TRANSCRIPT_BOUNDARY_LOOKBACK_WORDS: z.coerce.number().int().nonnegative().optional(),
  VISUAL_SCENE_TARGET_PER_10_MINUTES: z.coerce.number().positive().optional(),
  VISUAL_SCENE_MIN_SECONDS: z.coerce.number().positive().optional(),
  VISUAL_SCENE_MAX_SECONDS: z.coerce.number().positive().optional(),
  MEDIAFORGE_TRAILING_SILENCE_RATIO: z.coerce.number().min(0).max(1).optional(),
  MEDIAFORGE_TRAILING_SILENCE_BUFFER_SECONDS: z.coerce.number().min(0).optional(),
  MEDIAFORGE_OPENAI_TRANSCRIPTION_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_TRANSCRIPTION_LANGUAGE: z.string().optional(),
  MEDIAFORGE_OPENAI_TRANSCRIPTION_PROMPT: z.string().optional(),
  MEDIAFORGE_OPENAI_STORY_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_STORY_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_LOCALIZATION_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_SHORT_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_VALIDATOR_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_STORY_MODEL: z.string().optional(),
  OPENAI_STORY_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  OPENAI_STORY_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  OPENAI_STORY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_LOCALIZATION_MODEL: z.string().optional(),
  OPENAI_LOCALIZATION_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_SHORT_MODEL: z.string().optional(),
  OPENAI_SHORT_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  OPENAI_SHORT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_VALIDATOR_MODEL: z.string().optional(),
  OPENAI_VALIDATOR_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  MEDIAFORGE_OPENAI_METADATA_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_METADATA_MODEL: z.string().optional(),
  OPENAI_METADATA_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  OPENAI_METADATA_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  OPENAI_METADATA_MAX_RETRIES: z.coerce.number().int().positive().optional(),
  OPENAI_METADATA_KEEP_FILE: z.string().optional(),
  OPENAI_METADATA_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  YOUTUBE_METADATA_LANGUAGE: z.string().regex(/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu).optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_ORGANIZATION: z.string().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_PROJECT: z.string().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_COMPATIBLE_TTS_VOICE: z.string().optional(),
  MEDIAFORGE_OPENAI_SPEECH_MODEL: z.string().optional(),
  MEDIAFORGE_OPENAI_SPEECH_VOICE: z.string().optional(),
  MEDIAFORGE_SPEECH_VOICE_PRESET: z.enum(["slow", "fast", "very-fast"]).optional(),
  MEDIAFORGE_NARRATION_PIPELINE_MODE: z.enum(["legacy", "shadow", "new"]).optional(),
  MEDIAFORGE_SCRIPT_LANGUAGE: z.string().regex(/^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu).optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN_GERMAN: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN_SPANISH: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN_FRENCH: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().url().optional(),
  YOUTUBE_CHANNEL_ID: z.string().optional(),
  YOUTUBE_CHANNEL_ID_GERMAN: z.string().optional(),
  YOUTUBE_CHANNEL_ID_SPANISH: z.string().optional(),
  YOUTUBE_CHANNEL_ID_FRENCH: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
  OPENAI_PROJECT: z.string().optional(),
  OPENAI_SPEECH_MODEL: z.string().optional(),
  OPENAI_SPEECH_VOICE: z.string().optional(),
  MEDIAFORGE_API_PORT: z.coerce.number().int().positive().optional(),
  REMOTE_RENDER_ENABLED: z.string().optional(),
  REMOTE_RENDER_HOST: z.string().optional(),
  REMOTE_RENDER_USER: z.string().optional(),
  REMOTE_RENDER_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  REMOTE_RENDER_BASE_DIR: z.string().optional(),
  REMOTE_RENDER_CONCURRENCY: z.coerce.number().int().positive().optional(),
  REMOTE_RENDER_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().positive().optional(),
  REMOTE_RENDER_COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().positive().optional(),
  REMOTE_RENDER_MAX_RETRIES: z.coerce.number().int().nonnegative().optional(),
  REMOTE_RENDER_FALLBACK_TO_LOCAL: z.string().optional(),
  REMOTE_RENDER_KEEP_FILES: z.string().optional(),
  REMOTE_RENDER_VERIFY_HOST_KEY: z.string().optional(),
  REMOTE_RENDER_KNOWN_HOSTS_FILE: z.string().optional(),
  REMOTE_RENDER_SSH_PRIVATE_KEY: z.string().optional(),
  REMOTE_RENDER_UPLOAD_METHOD: z.enum(["rsync"]).optional(),
  LOCAL_RENDER_CONCURRENCY: z.string().optional(),
  REMOTE_RENDER_CLEANUP_MAX_AGE_HOURS: z.coerce.number().int().positive().optional()
});

export async function loadPackageJsonConfig(configPath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseStrictBooleanEnv(value: string | undefined, variableName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseBooleanEnv(value);
  if (parsed === undefined) {
    throw new Error(`Invalid boolean value for ${variableName}: ${value}`);
  }
  return parsed;
}

function parseOptionalPositiveIntEnv(
  value: string | undefined,
  variableName: string
): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value for ${variableName}: ${value}`);
  }
  return parsed;
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

export async function loadRuntimeConfig(
  overrides: RuntimeConfigOverrides = {},
  episodeOverrides: RuntimeConfigOverrides = {}
): Promise<RuntimeConfig> {
  const dotenvValues = await loadDotEnvValues(process.cwd());
  const env = envSchema.parse({
    ...dotenvValues,
    ...process.env
  });
  const availableCpuCores = Math.max(1, os.cpus().length);
  const workspaceDir = overrides.workspaceDir ?? env.MEDIAFORGE_WORKSPACE ?? "./episodes";
  const dbPath = overrides.dbPath ?? env.MEDIAFORGE_DB_PATH ?? "./.mediaforge.sqlite";
  const transcriptionProvider = overrides.transcriptionProvider ?? episodeOverrides.transcriptionProvider ?? env.MEDIAFORGE_TRANSCRIPTION_PROVIDER ?? "mock";
  const localWhisperBin = path.resolve("tools/whisper.cpp/build/bin/whisper-cli");
  const preferredWhisperModels = [
    path.resolve("tools/whisper.cpp/models/ggml-small.bin"),
    path.resolve("tools/whisper.cpp/models/ggml-medium.bin"),
    path.resolve("tools/whisper.cpp/models/ggml-base.bin"),
    path.resolve("tools/whisper.cpp/models/ggml-base.en.bin")
  ];
  const whisperBin = overrides.whisperBin ?? env.MEDIAFORGE_WHISPER_BIN ?? (await fs.stat(localWhisperBin).then(() => localWhisperBin).catch(() => "whisper-cli"));
  const whisperModel =
    overrides.whisperModel ??
    env.MEDIAFORGE_WHISPER_MODEL ??
    (await (async () => {
      for (const candidate of preferredWhisperModels) {
        if (await fs.stat(candidate).then(() => true).catch(() => false)) {
          return candidate;
        }
      }
      return undefined;
    })());
  const mergedSpeechProvider = overrides.ttsProvider ?? episodeOverrides.ttsProvider;
  const mergedOpenAiBaseUrl = overrides.openAiCompatibleBaseUrl ?? episodeOverrides.openAiCompatibleBaseUrl ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_BASE_URL ?? env.OPENAI_BASE_URL;
  const mergedOpenAiApiKey = overrides.openAiCompatibleApiKey ?? episodeOverrides.openAiCompatibleApiKey ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_API_KEY ?? env.OPENAI_API_KEY;
  const mergedOpenAiOrganization =
    overrides.openAiCompatibleOrganization ??
    episodeOverrides.openAiCompatibleOrganization ??
    env.MEDIAFORGE_OPENAI_COMPATIBLE_ORGANIZATION ??
    env.OPENAI_ORGANIZATION;
  const mergedOpenAiProject =
    overrides.openAiCompatibleProject ?? episodeOverrides.openAiCompatibleProject ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_PROJECT ?? env.OPENAI_PROJECT;
  const config = configSchema.parse({
    workspaceDir: path.resolve(workspaceDir),
    dbPath: path.resolve(dbPath),
    logLevel: overrides.logLevel ?? env.MEDIAFORGE_LOG_LEVEL ?? "info",
    defaultAspectRatio: overrides.defaultAspectRatio ?? env.MEDIAFORGE_DEFAULT_ASPECT_RATIO ?? "16:9",
    openArtBatchSize: overrides.openArtBatchSize ?? env.MEDIAFORGE_OPENART_BATCH_SIZE ?? 8,
    ttsProvider: mergedSpeechProvider ?? env.MEDIAFORGE_TTS_PROVIDER ?? (mergedOpenAiApiKey ? "openai-compatible" : env.MEDIAFORGE_TTS_PROVIDER ?? "mock"),
    transcriptionProvider,
    imageProvider: overrides.imageProvider ?? episodeOverrides.imageProvider ?? env.MEDIAFORGE_IMAGE_PROVIDER ?? "placeholder",
    textProvider: overrides.textProvider ?? episodeOverrides.textProvider ?? env.MEDIAFORGE_TEXT_PROVIDER ?? "mock",
    whisperBin,
    whisperModel,
    whisperLanguage: overrides.whisperLanguage ?? episodeOverrides.whisperLanguage ?? env.MEDIAFORGE_WHISPER_LANGUAGE,
    whisperThreads: overrides.whisperThreads ?? episodeOverrides.whisperThreads ?? env.MEDIAFORGE_WHISPER_THREADS ?? (transcriptionProvider === "whisper.cpp" ? availableCpuCores : undefined),
    whisperProcessors: overrides.whisperProcessors ?? episodeOverrides.whisperProcessors ?? env.MEDIAFORGE_WHISPER_PROCESSORS ?? (transcriptionProvider === "whisper.cpp" ? 1 : undefined),
    whisperTimeoutMs: overrides.whisperTimeoutMs ?? episodeOverrides.whisperTimeoutMs ?? env.MEDIAFORGE_WHISPER_TIMEOUT_MS,
    whisperMaxDurationSeconds: overrides.whisperMaxDurationSeconds ?? episodeOverrides.whisperMaxDurationSeconds ?? env.MEDIAFORGE_WHISPER_MAX_DURATION_SECONDS,
    whisperWordTimestamps:
      overrides.whisperWordTimestamps ?? episodeOverrides.whisperWordTimestamps ?? parseBooleanEnv(env.WHISPER_WORD_TIMESTAMPS) ?? true,
    transcriptMinSegmentSeconds:
      overrides.transcriptMinSegmentSeconds ?? episodeOverrides.transcriptMinSegmentSeconds ?? env.TRANSCRIPT_MIN_SEGMENT_SECONDS ?? 2,
    transcriptMaxSegmentSeconds:
      overrides.transcriptMaxSegmentSeconds ?? episodeOverrides.transcriptMaxSegmentSeconds ?? env.TRANSCRIPT_MAX_SEGMENT_SECONDS ?? 15,
    transcriptMaxSilenceSeconds:
      overrides.transcriptMaxSilenceSeconds ?? episodeOverrides.transcriptMaxSilenceSeconds ?? env.TRANSCRIPT_MAX_SILENCE_SECONDS ?? 1.25,
    transcriptTimestampPrecision:
      overrides.transcriptTimestampPrecision ?? episodeOverrides.transcriptTimestampPrecision ?? env.TRANSCRIPT_TIMESTAMP_PRECISION ?? 3,
    transcriptMaxWordDurationSeconds:
      overrides.transcriptMaxWordDurationSeconds ?? episodeOverrides.transcriptMaxWordDurationSeconds ?? env.TRANSCRIPT_MAX_WORD_DURATION_SECONDS ?? 5,
    transcriptBoundaryLookbackWords:
      overrides.transcriptBoundaryLookbackWords ?? episodeOverrides.transcriptBoundaryLookbackWords ?? env.TRANSCRIPT_BOUNDARY_LOOKBACK_WORDS ?? 6,
    visualSceneTargetPer10Minutes:
      overrides.visualSceneTargetPer10Minutes ?? episodeOverrides.visualSceneTargetPer10Minutes ?? env.VISUAL_SCENE_TARGET_PER_10_MINUTES ?? 100,
    visualSceneMinSeconds:
      overrides.visualSceneMinSeconds ?? episodeOverrides.visualSceneMinSeconds ?? env.VISUAL_SCENE_MIN_SECONDS ?? 5,
    visualSceneMaxSeconds:
      overrides.visualSceneMaxSeconds ?? episodeOverrides.visualSceneMaxSeconds ?? env.VISUAL_SCENE_MAX_SECONDS ?? 6,
    trailingSilenceRatio:
      overrides.trailingSilenceRatio ?? episodeOverrides.trailingSilenceRatio ?? env.MEDIAFORGE_TRAILING_SILENCE_RATIO ?? 1,
    trailingSilenceBufferSeconds:
      overrides.trailingSilenceBufferSeconds ?? episodeOverrides.trailingSilenceBufferSeconds ?? env.MEDIAFORGE_TRAILING_SILENCE_BUFFER_SECONDS ?? 0,
    openAiTranscriptionModel:
      overrides.openAiTranscriptionModel ?? episodeOverrides.openAiTranscriptionModel ?? env.MEDIAFORGE_OPENAI_TRANSCRIPTION_MODEL,
    openAiTranscriptionLanguage:
      overrides.openAiTranscriptionLanguage ?? episodeOverrides.openAiTranscriptionLanguage ?? env.MEDIAFORGE_OPENAI_TRANSCRIPTION_LANGUAGE,
    openAiTranscriptionPrompt:
      overrides.openAiTranscriptionPrompt ?? episodeOverrides.openAiTranscriptionPrompt ?? env.MEDIAFORGE_OPENAI_TRANSCRIPTION_PROMPT,
    openAiStoryModel:
      overrides.openAiStoryModel ??
      episodeOverrides.openAiStoryModel ??
      env.MEDIAFORGE_OPENAI_STORY_MODEL ??
      env.OPENAI_STORY_MODEL ??
      "gpt-5.5",
    openAiStoryTemperature:
      overrides.openAiStoryTemperature ??
      episodeOverrides.openAiStoryTemperature ??
      env.MEDIAFORGE_OPENAI_STORY_TEMPERATURE ??
      env.OPENAI_STORY_TEMPERATURE ??
      0.5,
    openAiStoryReasoningEffort:
      overrides.openAiStoryReasoningEffort ??
      episodeOverrides.openAiStoryReasoningEffort ??
      env.MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT ??
      env.OPENAI_STORY_REASONING_EFFORT ??
      "high",
    openAiStoryMaxOutputTokens:
      overrides.openAiStoryMaxOutputTokens ??
      episodeOverrides.openAiStoryMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS ??
      env.OPENAI_STORY_MAX_OUTPUT_TOKENS ??
      25_000,
    openAiStoryRetryMaxOutputTokens:
      overrides.openAiStoryRetryMaxOutputTokens ??
      episodeOverrides.openAiStoryRetryMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS ??
      env.OPENAI_STORY_RETRY_MAX_OUTPUT_TOKENS ??
      25_000,
    openAiLocalizationModel:
      overrides.openAiLocalizationModel ??
      episodeOverrides.openAiLocalizationModel ??
      env.MEDIAFORGE_OPENAI_LOCALIZATION_MODEL ??
      env.OPENAI_LOCALIZATION_MODEL ??
      env.MEDIAFORGE_OPENAI_STORY_MODEL ??
      env.OPENAI_STORY_MODEL ??
      "gpt-5.5",
    openAiLocalizationReasoningEffort:
      overrides.openAiLocalizationReasoningEffort ??
      episodeOverrides.openAiLocalizationReasoningEffort ??
      env.MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT ??
      env.OPENAI_LOCALIZATION_REASONING_EFFORT ??
      env.MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT ??
      env.OPENAI_STORY_REASONING_EFFORT ??
      "high",
    openAiLocalizationMaxOutputTokens:
      overrides.openAiLocalizationMaxOutputTokens ??
      episodeOverrides.openAiLocalizationMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS ??
      env.OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS ??
      env.MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS ??
      env.OPENAI_STORY_MAX_OUTPUT_TOKENS ??
      25_000,
    openAiShortModel:
      overrides.openAiShortModel ??
      episodeOverrides.openAiShortModel ??
      env.MEDIAFORGE_OPENAI_SHORT_MODEL ??
      env.OPENAI_SHORT_MODEL ??
      env.MEDIAFORGE_OPENAI_STORY_MODEL ??
      env.OPENAI_STORY_MODEL ??
      "gpt-5.5",
    openAiShortReasoningEffort:
      overrides.openAiShortReasoningEffort ??
      episodeOverrides.openAiShortReasoningEffort ??
      env.MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT ??
      env.OPENAI_SHORT_REASONING_EFFORT ??
      env.MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT ??
      env.OPENAI_STORY_REASONING_EFFORT ??
      "high",
    openAiShortRewriteMaxOutputTokens:
      overrides.openAiShortRewriteMaxOutputTokens ??
      episodeOverrides.openAiShortRewriteMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS ??
      env.OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS ??
      16_000,
    openAiShortMaxOutputTokens:
      overrides.openAiShortMaxOutputTokens ??
      episodeOverrides.openAiShortMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS ??
      env.OPENAI_SHORT_MAX_OUTPUT_TOKENS ??
      env.MEDIAFORGE_OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS ??
      env.OPENAI_SHORT_REWRITE_MAX_OUTPUT_TOKENS ??
      4_000,
    openAiShortRewriteRetryMaxOutputTokens:
      overrides.openAiShortRewriteRetryMaxOutputTokens ??
      episodeOverrides.openAiShortRewriteRetryMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS ??
      env.OPENAI_SHORT_REWRITE_RETRY_MAX_OUTPUT_TOKENS ??
      25_000,
    openAiValidatorModel:
      overrides.openAiValidatorModel ??
      episodeOverrides.openAiValidatorModel ??
      env.MEDIAFORGE_OPENAI_VALIDATOR_MODEL ??
      env.OPENAI_VALIDATOR_MODEL ??
      env.MEDIAFORGE_OPENAI_METADATA_MODEL ??
      env.OPENAI_METADATA_MODEL ??
      env.MEDIAFORGE_OPENAI_SHORT_MODEL ??
      env.OPENAI_SHORT_MODEL ??
      "gpt-5.4-mini",
    openAiValidatorReasoningEffort:
      overrides.openAiValidatorReasoningEffort ??
      episodeOverrides.openAiValidatorReasoningEffort ??
      env.MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT ??
      env.OPENAI_VALIDATOR_REASONING_EFFORT ??
      env.MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT ??
      env.OPENAI_METADATA_REASONING_EFFORT ??
      "low",
    openAiValidatorMaxOutputTokens:
      overrides.openAiValidatorMaxOutputTokens ??
      episodeOverrides.openAiValidatorMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS ??
      env.OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS ??
      env.MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS ??
      env.OPENAI_METADATA_MAX_OUTPUT_TOKENS ??
      2_000,
    openAiMetadataModel:
      overrides.openAiMetadataModel ??
      episodeOverrides.openAiMetadataModel ??
      env.MEDIAFORGE_OPENAI_METADATA_MODEL ??
      env.OPENAI_METADATA_MODEL ??
      "gpt-5.4-mini",
    openAiMetadataReasoningEffort:
      overrides.openAiMetadataReasoningEffort ??
      episodeOverrides.openAiMetadataReasoningEffort ??
      env.MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT ??
      env.OPENAI_METADATA_REASONING_EFFORT ??
      "low",
    openAiMetadataMaxOutputTokens:
      overrides.openAiMetadataMaxOutputTokens ??
      episodeOverrides.openAiMetadataMaxOutputTokens ??
      env.MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS ??
      env.OPENAI_METADATA_MAX_OUTPUT_TOKENS ??
      3_000,
    openAiMetadataMaxRetries:
      overrides.openAiMetadataMaxRetries ?? episodeOverrides.openAiMetadataMaxRetries ?? env.OPENAI_METADATA_MAX_RETRIES ?? 3,
    openAiMetadataKeepFile:
      overrides.openAiMetadataKeepFile ?? episodeOverrides.openAiMetadataKeepFile ?? parseBooleanEnv(env.OPENAI_METADATA_KEEP_FILE) ?? false,
    openAiMetadataTimeoutMs:
      overrides.openAiMetadataTimeoutMs ?? episodeOverrides.openAiMetadataTimeoutMs ?? env.OPENAI_METADATA_TIMEOUT_MS ?? 120000,
    youtubeMetadataLanguage:
      overrides.youtubeMetadataLanguage ??
      episodeOverrides.youtubeMetadataLanguage ??
      env.YOUTUBE_METADATA_LANGUAGE ??
      overrides.scriptLanguage ??
      episodeOverrides.scriptLanguage ??
      env.MEDIAFORGE_SCRIPT_LANGUAGE ??
      "en",
    openAiCompatibleBaseUrl: mergedOpenAiBaseUrl,
    openAiCompatibleApiKey: mergedOpenAiApiKey,
    openAiCompatibleOrganization: mergedOpenAiOrganization,
    openAiCompatibleProject: mergedOpenAiProject,
    openAiCompatibleModel: overrides.openAiCompatibleModel ?? episodeOverrides.openAiCompatibleModel ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_MODEL,
    openAiCompatibleTtsVoice:
      overrides.openAiCompatibleTtsVoice ?? episodeOverrides.openAiCompatibleTtsVoice ?? env.MEDIAFORGE_OPENAI_COMPATIBLE_TTS_VOICE ?? env.OPENAI_SPEECH_VOICE,
    openAiSpeechModel: overrides.openAiSpeechModel ?? episodeOverrides.openAiSpeechModel ?? env.MEDIAFORGE_OPENAI_SPEECH_MODEL ?? env.OPENAI_SPEECH_MODEL,
    openAiSpeechVoice: overrides.openAiSpeechVoice ?? episodeOverrides.openAiSpeechVoice ?? env.MEDIAFORGE_OPENAI_SPEECH_VOICE ?? env.OPENAI_SPEECH_VOICE,
    speechVoicePreset: overrides.speechVoicePreset ?? episodeOverrides.speechVoicePreset ?? env.MEDIAFORGE_SPEECH_VOICE_PRESET ?? "fast",
    narrationPipelineMode:
      overrides.narrationPipelineMode ??
      episodeOverrides.narrationPipelineMode ??
      env.MEDIAFORGE_NARRATION_PIPELINE_MODE ??
      "legacy",
    scriptLanguage: overrides.scriptLanguage ?? episodeOverrides.scriptLanguage ?? env.MEDIAFORGE_SCRIPT_LANGUAGE ?? "en",
    youtubeClientId: overrides.youtubeClientId ?? episodeOverrides.youtubeClientId ?? env.YOUTUBE_CLIENT_ID,
    youtubeClientSecret: overrides.youtubeClientSecret ?? episodeOverrides.youtubeClientSecret ?? env.YOUTUBE_CLIENT_SECRET,
    youtubeRefreshToken: overrides.youtubeRefreshToken ?? episodeOverrides.youtubeRefreshToken ?? env.YOUTUBE_REFRESH_TOKEN,
    youtubeRefreshTokenGerman:
      overrides.youtubeRefreshTokenGerman ??
      episodeOverrides.youtubeRefreshTokenGerman ??
      env.YOUTUBE_REFRESH_TOKEN_GERMAN,
    youtubeRefreshTokenSpanish:
      overrides.youtubeRefreshTokenSpanish ??
      episodeOverrides.youtubeRefreshTokenSpanish ??
      env.YOUTUBE_REFRESH_TOKEN_SPANISH,
    youtubeRefreshTokenFrench:
      overrides.youtubeRefreshTokenFrench ??
      episodeOverrides.youtubeRefreshTokenFrench ??
      env.YOUTUBE_REFRESH_TOKEN_FRENCH,
    youtubeRedirectUri: overrides.youtubeRedirectUri ?? episodeOverrides.youtubeRedirectUri ?? env.YOUTUBE_REDIRECT_URI,
    youtubeChannelId: overrides.youtubeChannelId ?? episodeOverrides.youtubeChannelId ?? env.YOUTUBE_CHANNEL_ID,
    youtubeChannelIdGerman:
      overrides.youtubeChannelIdGerman ??
      episodeOverrides.youtubeChannelIdGerman ??
      env.YOUTUBE_CHANNEL_ID_GERMAN,
    youtubeChannelIdSpanish:
      overrides.youtubeChannelIdSpanish ??
      episodeOverrides.youtubeChannelIdSpanish ??
      env.YOUTUBE_CHANNEL_ID_SPANISH,
    youtubeChannelIdFrench:
      overrides.youtubeChannelIdFrench ??
      episodeOverrides.youtubeChannelIdFrench ??
      env.YOUTUBE_CHANNEL_ID_FRENCH,
    apiPort: overrides.apiPort ?? episodeOverrides.apiPort ?? env.MEDIAFORGE_API_PORT ?? 3333,
    remoteRenderEnabled:
      overrides.remoteRenderEnabled ??
      episodeOverrides.remoteRenderEnabled ??
      parseStrictBooleanEnv(env.REMOTE_RENDER_ENABLED, "REMOTE_RENDER_ENABLED") ??
      false,
    remoteRenderHost:
      overrides.remoteRenderHost ??
      episodeOverrides.remoteRenderHost ??
      env.REMOTE_RENDER_HOST ??
      "2.24.81.148",
    remoteRenderUser:
      overrides.remoteRenderUser ??
      episodeOverrides.remoteRenderUser ??
      env.REMOTE_RENDER_USER ??
      "box",
    remoteRenderPort:
      overrides.remoteRenderPort ??
      episodeOverrides.remoteRenderPort ??
      env.REMOTE_RENDER_PORT ??
      22,
    remoteRenderBaseDir:
      overrides.remoteRenderBaseDir ??
      episodeOverrides.remoteRenderBaseDir ??
      env.REMOTE_RENDER_BASE_DIR ??
      "/home/box/youtube-render-worker",
    remoteRenderConcurrency:
      overrides.remoteRenderConcurrency ??
      episodeOverrides.remoteRenderConcurrency ??
      env.REMOTE_RENDER_CONCURRENCY ??
      1,
    remoteRenderConnectTimeoutSeconds:
      overrides.remoteRenderConnectTimeoutSeconds ??
      episodeOverrides.remoteRenderConnectTimeoutSeconds ??
      env.REMOTE_RENDER_CONNECT_TIMEOUT_SECONDS ??
      10,
    remoteRenderCommandTimeoutSeconds:
      overrides.remoteRenderCommandTimeoutSeconds ??
      episodeOverrides.remoteRenderCommandTimeoutSeconds ??
      env.REMOTE_RENDER_COMMAND_TIMEOUT_SECONDS ??
      1800,
    remoteRenderMaxRetries:
      overrides.remoteRenderMaxRetries ??
      episodeOverrides.remoteRenderMaxRetries ??
      env.REMOTE_RENDER_MAX_RETRIES ??
      2,
    remoteRenderFallbackToLocal:
      overrides.remoteRenderFallbackToLocal ??
      episodeOverrides.remoteRenderFallbackToLocal ??
      parseStrictBooleanEnv(env.REMOTE_RENDER_FALLBACK_TO_LOCAL, "REMOTE_RENDER_FALLBACK_TO_LOCAL") ??
      true,
    remoteRenderKeepFiles:
      overrides.remoteRenderKeepFiles ??
      episodeOverrides.remoteRenderKeepFiles ??
      parseStrictBooleanEnv(env.REMOTE_RENDER_KEEP_FILES, "REMOTE_RENDER_KEEP_FILES") ??
      false,
    remoteRenderVerifyHostKey:
      overrides.remoteRenderVerifyHostKey ??
      episodeOverrides.remoteRenderVerifyHostKey ??
      parseStrictBooleanEnv(env.REMOTE_RENDER_VERIFY_HOST_KEY, "REMOTE_RENDER_VERIFY_HOST_KEY") ??
      true,
    remoteRenderKnownHostsFile:
      overrides.remoteRenderKnownHostsFile ??
      episodeOverrides.remoteRenderKnownHostsFile ??
      normalizeOptionalPath(env.REMOTE_RENDER_KNOWN_HOSTS_FILE),
    remoteRenderSshPrivateKey:
      overrides.remoteRenderSshPrivateKey ??
      episodeOverrides.remoteRenderSshPrivateKey ??
      normalizeOptionalPath(env.REMOTE_RENDER_SSH_PRIVATE_KEY),
    remoteRenderUploadMethod:
      overrides.remoteRenderUploadMethod ??
      episodeOverrides.remoteRenderUploadMethod ??
      env.REMOTE_RENDER_UPLOAD_METHOD ??
      "rsync",
    localRenderConcurrency:
      overrides.localRenderConcurrency ??
      episodeOverrides.localRenderConcurrency ??
      parseOptionalPositiveIntEnv(env.LOCAL_RENDER_CONCURRENCY, "LOCAL_RENDER_CONCURRENCY"),
    remoteRenderCleanupMaxAgeHours:
      overrides.remoteRenderCleanupMaxAgeHours ??
      episodeOverrides.remoteRenderCleanupMaxAgeHours ??
      env.REMOTE_RENDER_CLEANUP_MAX_AGE_HOURS ??
      24,
    visualRetention: mergeVisualRetentionConfig(
      overrides.visualRetention,
      episodeOverrides.visualRetention,
    ),
    narrationMastering: mergeNarrationMasteringConfig(
      overrides.narrationMastering,
      episodeOverrides.narrationMastering,
    ),
  });
  return config;
}

function normalizeLanguageCode(language: string | undefined): string | undefined {
  if (!language) {
    return undefined;
  }
  return language.trim().toLowerCase();
}

export function resolveYoutubeChannelIdForLanguage(
  config: RuntimeConfig,
  language: string | undefined
): string | undefined {
  const normalized = normalizeLanguageCode(language);
  if (!normalized) {
    return config.youtubeChannelId;
  }
  const languagePrefix = normalized.split("-")[0];
  if (languagePrefix === "de") {
    return config.youtubeChannelIdGerman ?? config.youtubeChannelId;
  }
  if (languagePrefix === "es") {
    return config.youtubeChannelIdSpanish ?? config.youtubeChannelId;
  }
  if (languagePrefix === "fr") {
    return config.youtubeChannelIdFrench ?? config.youtubeChannelId;
  }
  return config.youtubeChannelId;
}

export async function loadEpisodeConfig(episodeDir: string): Promise<EpisodeConfig | null> {
  const raw = await loadPackageJsonConfig(path.join(episodeDir, "episode.config.json"));
  if (!raw) {
    return null;
  }
  return episodeConfigSchema.parse(raw);
}

export function mergeConfig<T extends Record<string, unknown>>(defaults: T, ...layers: Array<Partial<T> | null | undefined>): T {
  return Object.assign({}, defaults, ...layers.filter((layer): layer is Partial<T> => layer !== null && layer !== undefined));
}

export function configError(message: string): Error {
  return configurationErrorFromUnknown(message);
}
