import { z } from "zod";

const episodeIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const sceneIdPattern = /^scene-[0-9]{3}$/;
const artifactIdPattern = /^artifact-[a-z0-9][a-z0-9-]*$/;
const pipelineRunIdPattern = /^run-[a-z0-9][a-z0-9-]*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const shotIdPattern = /^scene-[0-9]{3}-shot-[0-9]{3}$/;
const visualRetentionIdPattern =
  /^[a-z0-9][a-z0-9-]*$/;

export const episodeIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(episodeIdPattern)
  .brand<"EpisodeId">();
export type EpisodeId = z.infer<typeof episodeIdSchema>;

export const sceneIdSchema = z.string().regex(sceneIdPattern).brand<"SceneId">();
export type SceneId = z.infer<typeof sceneIdSchema>;

export const artifactIdSchema = z
  .string()
  .regex(artifactIdPattern)
  .brand<"ArtifactId">();
export type ArtifactId = z.infer<typeof artifactIdSchema>;

export const pipelineRunIdSchema = z
  .string()
  .regex(pipelineRunIdPattern)
  .brand<"PipelineRunId">();
export type PipelineRunId = z.infer<typeof pipelineRunIdSchema>;

function createVisualRetentionIdSchema<TBrand extends string>(brand: TBrand) {
  return z.string().regex(visualRetentionIdPattern).brand<TBrand>();
}

const normalizedUnitIntervalSchema = z.number().finite().min(0).max(1);
const nonNegativeFiniteNumberSchema = z.number().finite().nonnegative();
const positiveFiniteNumberSchema = z.number().finite().positive();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
export const aspectRatioSchema = z.enum(["16:9", "9:16"]);
const contentVariantSchema = z.enum(["full", "short"]);
const sha256Schema = z.string().regex(sha256Pattern);

const normalizedPointSchema = z.object({
  x: normalizedUnitIntervalSchema,
  y: normalizedUnitIntervalSchema,
});

export const durationRangeSchema = z
  .object({
    minMs: nonNegativeIntegerSchema,
    maxMs: nonNegativeIntegerSchema,
  })
  .superRefine((value, ctx) => {
    if (value.minMs > value.maxMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minMs"],
        message: "Minimum duration must not exceed maximum duration.",
      });
    }
  });

const integerRangeSchema = z
  .object({
    min: nonNegativeIntegerSchema,
    max: nonNegativeIntegerSchema,
  })
  .superRefine((value, ctx) => {
    if (value.min > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min"],
        message: "Minimum value must not exceed maximum value.",
      });
    }
  });

const positiveNumberRangeSchema = z
  .object({
    min: positiveFiniteNumberSchema,
    max: positiveFiniteNumberSchema,
  })
  .superRefine((value, ctx) => {
    if (value.min > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min"],
        message: "Minimum value must not exceed maximum value.",
      });
    }
  });

const signedNumberRangeSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
  })
  .superRefine((value, ctx) => {
    if (value.min > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min"],
        message: "Minimum value must not exceed maximum value.",
      });
    }
  });

export const sourcePlatformSchema = z.enum(["youtube", "tiktok", "local-file"]);
export type SourcePlatform = z.infer<typeof sourcePlatformSchema>;

export const sourceUrlSchema = z.string().url().brand<"SourceUrl">();
export type SourceUrl = z.infer<typeof sourceUrlSchema>;

export const acquisitionStrategySchema = z.enum([
  "manual-subtitle",
  "creator-subtitle",
  "platform-subtitle",
  "authorized-transcription",
  "sidecar-subtitle",
  "mock"
]);
export type AcquisitionStrategy = z.infer<typeof acquisitionStrategySchema>;

export const sourceMetadataSchema = z.object({
  platform: sourcePlatformSchema,
  sourceUrl: z.string().url().optional(),
  title: z.string(),
  author: z.string().optional(),
  durationSeconds: z.number().nonnegative(),
  acquisitionStrategy: acquisitionStrategySchema,
  localPath: z.string().optional(),
  subtitleLanguage: z.string().optional(),
  transcriptUrl: z.string().optional(),
  notes: z.string().optional()
});
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;

export const sourceMediaSchema = z.object({
  path: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  checksumSha256: z.string().optional()
});
export type SourceMedia = z.infer<typeof sourceMediaSchema>;

export const rawTimedWordSchema = z.object({
  text: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  probability: z.number().min(0).max(1).optional()
});
export type RawTimedWord = z.infer<typeof rawTimedWordSchema>;

export const timestampedWordSchema = z.object({
  text: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  probability: z.number().min(0).max(1).optional()
});
export type TimestampedWord = z.infer<typeof timestampedWordSchema>;

export const transcriptWordSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  text: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional()
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const segmentBoundaryReasonSchema = z.enum(["sentence", "silence", "max-duration", "end-of-transcript"]);
export type SegmentBoundaryReason = z.infer<typeof segmentBoundaryReasonSchema>;

const transcriptSegmentIdSchema = z
  .string()
  .regex(/^(?:scene|segment)-[0-9]{3}$/u)
  .brand<"TranscriptSegmentId">();
export { transcriptSegmentIdSchema };
export type TranscriptSegmentId = z.infer<typeof transcriptSegmentIdSchema>;

export const sentenceSegmentationOptionsSchema = z.object({
  minDurationSeconds: z.number().positive(),
  maxDurationSeconds: z.number().positive(),
  maxSilenceSeconds: z.number().nonnegative(),
  timestampPrecision: z.number().int().min(0).max(6),
  maxSingleWordDurationSeconds: z.number().positive(),
  boundaryLookbackWords: z.number().int().nonnegative()
});
export type SentenceSegmentationOptions = z.infer<typeof sentenceSegmentationOptionsSchema>;

export const transcriptSegmentSchema = z.object({
  id: transcriptSegmentIdSchema,
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string(),
  words: z.array(timestampedWordSchema).default([]),
  boundaryReason: segmentBoundaryReasonSchema.optional()
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const subtitleSegmentSchema = transcriptSegmentSchema;
export type SubtitleSegment = z.infer<typeof subtitleSegmentSchema>;

export const transcriptSchema = z.object({
  sourceId: episodeIdSchema,
  language: z.string().min(1),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema),
  words: z.array(timestampedWordSchema).default([])
});
export type Transcript = z.infer<typeof transcriptSchema>;

export const normalizedTranscriptSchema = z.object({
  schemaVersion: z.literal(1),
  sourceId: episodeIdSchema,
  language: z.string().min(1),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema),
  words: z.array(timestampedWordSchema),
  generation: z.object({
    provider: z.string(),
    model: z.string(),
    generatedAt: z.string(),
    wordTimestamps: z.literal(true)
  })
});
export type NormalizedTranscript = z.infer<typeof normalizedTranscriptSchema>;

export const transcriptCorrectionSchema = z.object({
  originalText: z.string(),
  correctedText: z.string(),
  confidence: z.number().min(0).max(1),
  category: z.enum(["spelling", "punctuation", "grammar", "repetition", "filler-word", "other"]),
  reason: z.string(),
  humanReviewRecommended: z.boolean()
});
export type TranscriptCorrection = z.infer<typeof transcriptCorrectionSchema>;

export const uncertainTermSchema = z.object({
  originalText: z.string(),
  suggestedText: z.string().optional(),
  reason: z.string()
});
export type UncertainTerm = z.infer<typeof uncertainTermSchema>;

export const cleanedTranscriptSchema = z.object({
  sourceId: episodeIdSchema,
  language: z.string().min(1),
  originalText: z.string(),
  cleanedText: z.string(),
  segments: z.array(transcriptSegmentSchema),
  corrections: z.array(transcriptCorrectionSchema),
  uncertainTerms: z.array(uncertainTermSchema)
});
export type CleanedTranscript = z.infer<typeof cleanedTranscriptSchema>;

export const rewrittenScriptSectionSchema = z.object({
  sectionId: z.string(),
  transcriptSegmentIds: z.array(transcriptSegmentIdSchema),
  text: z.string(),
  claims: z.array(z.string()).default([])
});
export type RewrittenScriptSection = z.infer<typeof rewrittenScriptSectionSchema>;

export const rewrittenScriptSchema = z.object({
  sourceId: episodeIdSchema,
  audience: z.string().min(1),
  text: z.string(),
  sections: z.array(rewrittenScriptSectionSchema),
  claims: z.array(
    z.object({
      text: z.string(),
      reviewRequired: z.boolean(),
      reason: z.string().optional()
    })
  )
});
export type RewrittenScript = z.infer<typeof rewrittenScriptSchema>;

export const claimSchema = z.object({
  text: z.string(),
  sourceSegmentIds: z.array(transcriptSegmentIdSchema),
  reviewRequired: z.boolean(),
  reason: z.string().optional()
});
export type Claim = z.infer<typeof claimSchema>;

export const sceneTimingSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative()
});
export type SceneTiming = z.infer<typeof sceneTimingSchema>;

function normalizeSceneText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

const sceneTextRequirementDisabledSchema = z.object({
  required: z.literal(false),
  reason: z.string().optional(),
});

const sceneTextRequirementEnabledSchema = z.object({
  required: z.literal(true),
  text: z.string().min(1),
  placement: z.string().min(1).optional(),
  reason: z.string().min(1),
}).superRefine((value, ctx) => {
  const text = normalizeSceneText(value.text);
  const placement = value.placement ? normalizeSceneText(value.placement) : undefined;
  const reason = normalizeSceneText(value.reason);
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/u).length;
  if (text.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Required scene text must not be empty.",
    });
  }
  if (reason.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "Required scene text must include a reason.",
    });
  }
  if (text.length > 40) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Required scene text must be 40 characters or fewer.",
    });
  }
  if (wordCount > 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Required scene text must be 5 words or fewer.",
    });
  }
  if (placement !== undefined && placement.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["placement"],
      message: "Required scene text placement must not be empty when provided.",
    });
  }
});

export const sceneTextRequirementSchema = z.union([
  sceneTextRequirementDisabledSchema,
  sceneTextRequirementEnabledSchema.transform((value) => ({
    required: true as const,
    text: normalizeSceneText(value.text),
    ...(value.placement ? { placement: normalizeSceneText(value.placement) } : {}),
    reason: normalizeSceneText(value.reason),
  })),
]).default({ required: false });
export type SceneTextRequirement = z.infer<typeof sceneTextRequirementSchema>;

export function requiresSceneText(
  requirement: SceneTextRequirement
): requirement is Extract<SceneTextRequirement, { required: true }> {
  return requirement.required;
}

const sceneTextContextPattern =
  /\b(badge|id card|mailbox|door|room|sign|warning sign|storefront|headline|newspaper|screen|monitor|document|file|record|label|number|code|date|message|note|handwritten|placard|nameplate|ticket|board|email)\b/u;
const quotedSceneTextPattern =
  /(?:["“])([^"\n“”]{1,40})(?:["”])/u;
const explicitSceneTextPattern =
  /\b(?:reads?|says?|shows?|states?|marks?|labels?|labels?|bears?|displays?|displaying|written|writing)\s+([A-Z0-9][A-Z0-9 .,'’()\-/:]{0,39})/u;
const roomNumberTextPattern =
  /\b(room|suite|gate|platform|route|flight|train|bus)\s+([A-Z0-9-]{1,12})\b/u;
const codeTextPattern =
  /\b(?:code|pin|case\s*no\.?|record\s*no\.?|ref(?:erence)?\.?|item\s*#)\s+([A-Z0-9-]{1,20})\b/u;
const dateTextPattern =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/u;

export function inferSceneTextRequirement(
  narration: string
): SceneTextRequirement {
  const normalizedNarration = normalizeSceneText(narration);
  if (normalizedNarration.length === 0) {
    return { required: false };
  }

  const lowerNarration = normalizedNarration.toLowerCase();
  if (!sceneTextContextPattern.test(lowerNarration)) {
    return { required: false };
  }

  const quotedMatch = quotedSceneTextPattern.exec(normalizedNarration);
  const roomMatch = roomNumberTextPattern.exec(normalizedNarration);
  const codeMatch = codeTextPattern.exec(normalizedNarration);
  const dateMatch = dateTextPattern.exec(normalizedNarration);
  const explicitMatch = explicitSceneTextPattern.exec(normalizedNarration);

  const candidate =
    quotedMatch?.[1] ??
    (roomMatch ? `ROOM ${roomMatch[2]}` : undefined) ??
    codeMatch?.[1] ??
    dateMatch?.[0] ??
    explicitMatch?.[1];

  if (!candidate) {
    return { required: false };
  }

  const text = normalizeSceneText(candidate.replace(/[.?!,:;]+$/u, ""));
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/u).length;
  if (text.length === 0 || wordCount > 5 || text.length > 40) {
    return { required: false };
  }

  return {
    required: true,
    text,
    reason: "The narration depends on a short piece of visible written information.",
  };
}

export const imagePromptSchema = z.object({
  sceneId: sceneIdSchema,
  sequenceNumber: z.number().int().positive(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  timestampStart: z.number().nonnegative(),
  timestampEnd: z.number().nonnegative(),
  visualPurpose: z.string(),
  prompt: z.string(),
  negativePrompt: z.string(),
  continuity: z.string().default(""),
  expectedFilename: z.string()
});
export type ImagePrompt = z.infer<typeof imagePromptSchema>;

export const sceneSchema = z.object({
  id: sceneIdSchema,
  sequenceNumber: z.number().int().positive(),
  canonicalNarration: z.string(),
  sourceSegmentIds: z.array(transcriptSegmentIdSchema),
  estimatedDurationSeconds: z.number().nonnegative(),
  actualAudioDurationSeconds: z.number().nonnegative().optional(),
  timing: sceneTimingSchema,
  visualPurpose: z.string(),
  textRequirement: sceneTextRequirementSchema,
  subject: z.string(),
  action: z.string(),
  setting: z.string(),
  composition: z.string(),
  cameraFraming: z.string(),
  mood: z.string(),
  continuityReferences: z.array(z.string()).default([]),
  onScreenText: z.string().default(""),
  negativeConstraints: z.array(z.string()).default([]),
  aspectRatios: z.array(z.enum(["16:9", "9:16"])),
  imagePrompt: z.string(),
  expectedImageFilenames: z.array(z.string()),
  qualityStatus: z.enum(["draft", "approved", "rejected"])
});
export type Scene = z.infer<typeof sceneSchema>;

export const scenePlanSchema = z.object({
  sourceId: episodeIdSchema,
  scenes: z.array(sceneSchema)
});
export type ScenePlan = z.infer<typeof scenePlanSchema>;

export const shotIdSchema = z.string().regex(shotIdPattern).brand<"ShotId">();
export type ShotId = z.infer<typeof shotIdSchema>;

export const sourceSceneIdSchema =
  createVisualRetentionIdSchema("SourceSceneId");
export type SourceSceneId = z.infer<typeof sourceSceneIdSchema>;

export const sourceImageIdSchema =
  createVisualRetentionIdSchema("SourceImageId");
export type SourceImageId = z.infer<typeof sourceImageIdSchema>;

export const focalRegionIdSchema =
  createVisualRetentionIdSchema("FocalRegionId");
export type FocalRegionId = z.infer<typeof focalRegionIdSchema>;

export const shotOverlayIdSchema =
  createVisualRetentionIdSchema("ShotOverlayId");
export type ShotOverlayId = z.infer<typeof shotOverlayIdSchema>;

export const shotTreatmentIdSchema =
  createVisualRetentionIdSchema("ShotTreatmentId");
export type ShotTreatmentId = z.infer<typeof shotTreatmentIdSchema>;

export const visualPacingProfileIdSchema = z.enum([
  "atmospheric",
  "balanced",
  "high-retention",
  "shorts-aggressive",
]);
export type VisualPacingProfileId = z.infer<
  typeof visualPacingProfileIdSchema
>;

export const normalizedCropSchema = z
  .object({
    // Normalized left coordinate in the inclusive [0, 1] source-image range.
    x: normalizedUnitIntervalSchema,
    // Normalized top coordinate in the inclusive [0, 1] source-image range.
    y: normalizedUnitIntervalSchema,
    // Normalized crop width as a fraction of the source image.
    width: positiveFiniteNumberSchema.max(1),
    // Normalized crop height as a fraction of the source image.
    height: positiveFiniteNumberSchema.max(1),
  })
  .superRefine((value, ctx) => {
    if (value.x + value.width > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "Crop width must stay within the normalized source bounds.",
      });
    }
    if (value.y + value.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "Crop height must stay within the normalized source bounds.",
      });
    }
  });
export type NormalizedCrop = z.infer<typeof normalizedCropSchema>;

export const focalRegionKindSchema = z.enum([
  "primary-subject",
  "secondary-subject",
  "face",
  "evidence-object",
  "safe-crop-region",
  "caption-safe-negative-space",
  "foreground",
  "background",
  "depth-hint",
]);
export type FocalRegionKind = z.infer<typeof focalRegionKindSchema>;

export const focalRegionSchema = z.object({
  id: focalRegionIdSchema,
  kind: focalRegionKindSchema,
  bounds: normalizedCropSchema,
  confidence: z.number().finite().min(0).max(1).optional(),
  label: z.string().min(1).optional(),
  depthLayer: z.enum(["foreground", "midground", "background"]).optional(),
});
export type FocalRegion = z.infer<typeof focalRegionSchema>;

export const focalMetadataOriginSchema = z.enum([
  "planner-provided",
  "imported",
  "local-fallback",
  "legacy-unknown",
]);
export type FocalMetadataOrigin = z.infer<typeof focalMetadataOriginSchema>;

export const sourceImageFocalMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisVersion: z.string().min(1),
    sourceImageId: sourceImageIdSchema,
    sourceImagePath: z.string().min(1),
    sourceImageSha256: sha256Schema.optional(),
    imageWidth: positiveIntegerSchema,
    imageHeight: positiveIntegerSchema,
    origin: focalMetadataOriginSchema,
    focalRegions: z.array(focalRegionSchema),
    warnings: z.array(z.string().min(1)).default([]),
    limitations: z.array(z.string().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    const regionIds = new Set<string>();
    for (const [index, region] of value.focalRegions.entries()) {
      if (regionIds.has(region.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["focalRegions", index, "id"],
          message: "Focal metadata requires unique region identifiers.",
        });
      }
      regionIds.add(region.id);
    }
  });
export type SourceImageFocalMetadata = z.infer<
  typeof sourceImageFocalMetadataSchema
>;

export const episodeFocalMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    analysisVersion: z.string().min(1),
    images: z.array(sourceImageFocalMetadataSchema),
  })
  .superRefine((value, ctx) => {
    const sourceImageIds = new Set<string>();
    for (const [index, image] of value.images.entries()) {
      if (sourceImageIds.has(image.sourceImageId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images", index, "sourceImageId"],
          message:
            "Episode focal metadata requires unique source-image identifiers.",
        });
      }
      sourceImageIds.add(image.sourceImageId);
    }
  });
export type EpisodeFocalMetadata = z.infer<typeof episodeFocalMetadataSchema>;

export const cameraMotionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("none"),
  }),
  z
    .object({
      kind: z.literal("push-in"),
      startScale: positiveFiniteNumberSchema,
      endScale: positiveFiniteNumberSchema,
      anchor: normalizedPointSchema.optional(),
    })
    .superRefine((value, ctx) => {
      if (value.endScale <= value.startScale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endScale"],
          message: "Push-in motion must end at a larger scale than it starts.",
        });
      }
    }),
  z
    .object({
      kind: z.literal("pull-out"),
      startScale: positiveFiniteNumberSchema,
      endScale: positiveFiniteNumberSchema,
      anchor: normalizedPointSchema.optional(),
    })
    .superRefine((value, ctx) => {
      if (value.endScale >= value.startScale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endScale"],
          message: "Pull-out motion must end at a smaller scale than it starts.",
        });
      }
    }),
  z.object({
    kind: z.literal("pan"),
    startCenter: normalizedPointSchema,
    endCenter: normalizedPointSchema,
  }),
  z.object({
    kind: z.literal("pan-and-zoom"),
    startCenter: normalizedPointSchema,
    endCenter: normalizedPointSchema,
    startScale: positiveFiniteNumberSchema,
    endScale: positiveFiniteNumberSchema,
  }),
  z.object({
    kind: z.literal("drift"),
    deltaX: z.number().finite().min(-1).max(1),
    deltaY: z.number().finite().min(-1).max(1),
    rotationDegrees: z.number().finite().optional(),
  }),
]);
export type CameraMotion = z.infer<typeof cameraMotionSchema>;

export const shotTreatmentFamilySchema = z.enum([
  "framing",
  "adaptation",
  "style",
  "depth",
]);
export type ShotTreatmentFamily = z.infer<typeof shotTreatmentFamilySchema>;

export const shotTreatmentSchema = z.discriminatedUnion("family", [
  z.object({
    family: z.literal("framing"),
    catalogVersion: z.string().min(1),
    treatmentId: shotTreatmentIdSchema,
    variant: z.enum([
      "establishing-wide-crop",
      "medium-crop",
      "face-close-up",
      "object-detail-crop",
      "caption-safe-negative-space-crop",
    ]),
    preserveCaptionSafeArea: z.boolean().optional(),
  }),
  z.object({
    family: z.literal("adaptation"),
    catalogVersion: z.string().min(1),
    treatmentId: shotTreatmentIdSchema,
    variant: z.enum([
      "smart-crop",
      "pan-and-scan",
      "blurred-fill",
      "mirrored-edge-fill",
      "split-framing",
    ]),
    fallbackBehavior: z.enum(["none", "widen-crop", "blurred-fill"]).optional(),
  }),
  z.object({
    family: z.literal("style"),
    catalogVersion: z.string().min(1),
    treatmentId: shotTreatmentIdSchema,
    variant: z.enum([
      "standard",
      "surveillance",
      "archive-photo",
      "recording-ui",
      "declassified-file",
      "blackout",
      "exposure-flash",
    ]),
    intensity: normalizedUnitIntervalSchema.optional(),
  }),
  z.object({
    family: z.literal("depth"),
    catalogVersion: z.string().min(1),
    treatmentId: shotTreatmentIdSchema,
    variant: z.enum([
      "background-drift",
      "focus-breathing",
      "parallax",
      "rack-focus",
    ]),
    cacheRequired: z.boolean().optional(),
  }),
]);
export type ShotTreatment = z.infer<typeof shotTreatmentSchema>;

export const overlayPlacementSchema = z.object({
  anchor: z.enum([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
  ]),
  safeAreaAware: z.boolean(),
});
export type OverlayPlacement = z.infer<typeof overlayPlacementSchema>;

export const overlayAssetReferenceSchema = z.object({
  assetId: createVisualRetentionIdSchema("OverlayAssetId"),
  path: z.string().optional(),
  checksumSha256: sha256Schema.optional(),
});
export type OverlayAssetReference = z.infer<typeof overlayAssetReferenceSchema>;

export const shotOverlaySchema = z.discriminatedUnion("kind", [
  z.object({
    id: shotOverlayIdSchema,
    kind: z.literal("evidence-insert"),
    asset: overlayAssetReferenceSchema,
    placement: overlayPlacementSchema.optional(),
    sourceFactId: z.string().min(1).optional(),
  }),
  z.object({
    id: shotOverlayIdSchema,
    kind: z.literal("recording-ui"),
    style: z.enum(["timestamp", "surveillance", "camcorder"]),
    asset: overlayAssetReferenceSchema.optional(),
    timestampText: z.string().min(1).optional(),
    placement: overlayPlacementSchema.optional(),
  }),
  z.object({
    id: shotOverlayIdSchema,
    kind: z.literal("texture"),
    asset: overlayAssetReferenceSchema,
    blendMode: z.enum(["overlay", "screen", "multiply"]).optional(),
    opacity: normalizedUnitIntervalSchema.optional(),
  }),
  z.object({
    id: shotOverlayIdSchema,
    kind: z.literal("branding"),
    asset: overlayAssetReferenceSchema,
    placement: overlayPlacementSchema,
  }),
]);
export type ShotOverlay = z.infer<typeof shotOverlaySchema>;

export const shotTransitionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hard-cut"),
    durationMs: z.literal(0),
  }),
  z.object({
    kind: z.literal("dissolve"),
    durationMs: positiveIntegerSchema,
  }),
  z.object({
    kind: z.literal("fade"),
    durationMs: positiveIntegerSchema,
    mode: z.enum(["fade-to-black", "fade-from-black", "dip-to-black"]),
  }),
]);
export type ShotTransition = z.infer<typeof shotTransitionSchema>;

export const visualNarrativePhaseSchema = z.enum([
  "hook",
  "setup",
  "evidence",
  "escalation",
  "climax",
  "callback",
  "aftermath",
]);
export type VisualNarrativePhase = z.infer<typeof visualNarrativePhaseSchema>;

export const visualPacingProfileSchema = z.object({
  id: visualPacingProfileIdSchema,
  shotDurationMs: durationRangeSchema,
  staticShotDurationMs: durationRangeSchema,
  movingShotDurationMs: durationRangeSchema,
  openingCadenceMs: durationRangeSchema,
  climaxCadenceMs: durationRangeSchema,
});
export type VisualPacingProfile = z.infer<typeof visualPacingProfileSchema>;

export const visualEffectScopeSchema = z.enum([
  "video",
  "rolling-duration",
  "intense-sequence",
]);
export type VisualEffectScope = z.infer<typeof visualEffectScopeSchema>;

export const visualEffectCapSchema = z
  .object({
    effect: z.enum([
      "blurred-fill",
      "surveillance",
      "glitch",
      "surveillance-glitch-static-combined",
      "parallax",
      "exposure-flash",
      "blackout",
      "fast-zoom",
    ]),
    maxCount: nonNegativeIntegerSchema.optional(),
    maxShare: z.number().finite().min(0).max(1).optional(),
    scope: visualEffectScopeSchema.default("video"),
    scopeDurationMs: positiveIntegerSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.maxCount === undefined && value.maxShare === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effect"],
        message: "Effect caps require at least one count or share limit.",
      });
    }
    if (value.scope === "rolling-duration") {
      if (value.maxCount === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxCount"],
          message: "Rolling-duration effect caps require a count limit.",
        });
      }
      if (value.scopeDurationMs === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scopeDurationMs"],
          message:
            "Rolling-duration effect caps require a duration window in milliseconds.",
        });
      }
    } else if (value.scopeDurationMs !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeDurationMs"],
        message:
          "Effect cap duration windows are only valid for rolling-duration scopes.",
      });
    }
  });
export type VisualEffectCap = z.infer<typeof visualEffectCapSchema>;

export const visualCropLimitsSchema = z.object({
  minCropArea: positiveFiniteNumberSchema.max(1),
  minFaceMargin: normalizedUnitIntervalSchema,
  maxCropZoom: positiveFiniteNumberSchema,
  minOutputHeightPx: positiveIntegerSchema,
  maxAdjacentSameImageCropIou: normalizedUnitIntervalSchema,
});
export type VisualCropLimits = z.infer<typeof visualCropLimitsSchema>;

export const visualMotionLimitsSchema = z.object({
  minShotDurationMs: positiveIntegerSchema,
  pushInScaleRange: positiveNumberRangeSchema,
  fastPushInScaleRange: positiveNumberRangeSchema,
  panTravelFractionOfImage: positiveNumberRangeSchema,
  rotationDegreesRange: signedNumberRangeSchema,
  dissolveDurationMs: durationRangeSchema,
  dipToBlackDurationMs: durationRangeSchema,
});
export type VisualMotionLimits = z.infer<typeof visualMotionLimitsSchema>;

export const visualBudgetSchema = z
  .object({
    sourceImageCount: integerRangeSchema,
    shotCount: integerRangeSchema,
    shotsPerImage: integerRangeSchema.optional(),
    maxConsecutiveSourceImageUses: nonNegativeIntegerSchema,
    maxTotalSourceImageUses: nonNegativeIntegerSchema,
    cropLimits: visualCropLimitsSchema,
    motionLimits: visualMotionLimitsSchema,
    effectCaps: z.array(visualEffectCapSchema),
  })
  .superRefine((value, ctx) => {
    if (
      value.maxConsecutiveSourceImageUses > value.maxTotalSourceImageUses
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxConsecutiveSourceImageUses"],
        message:
          "Maximum consecutive source-image reuse must not exceed the total reuse cap.",
      });
    }
  });
export type VisualBudget = z.infer<typeof visualBudgetSchema>;

export const visualSourceSceneSchema = z
  .object({
    sourceSceneId: sourceSceneIdSchema,
    sceneId: sceneIdSchema,
    // Narration timing in milliseconds for shot-planning and render alignment.
    narrationStartMs: nonNegativeIntegerSchema,
    // Narration timing in milliseconds for shot-planning and render alignment.
    narrationEndMs: nonNegativeIntegerSchema,
    sourceImageId: sourceImageIdSchema,
    sourceImagePath: z.string(),
    sourceImageSha256: sha256Schema,
    importance: visualNarrativePhaseSchema,
    focalRegions: z.array(focalRegionSchema),
  })
  .superRefine((value, ctx) => {
    if (value.narrationEndMs <= value.narrationStartMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["narrationEndMs"],
        message:
          "Visual source scenes must end after their narration start time.",
      });
    }
  });
export type VisualSourceScene = z.infer<typeof visualSourceSceneSchema>;

export const renderShotSchema = z
  .object({
    shotId: shotIdSchema,
    sourceSceneId: sourceSceneIdSchema,
    sceneId: sceneIdSchema,
    sourceImageId: sourceImageIdSchema,
    // Absolute render timing in milliseconds.
    startMs: nonNegativeIntegerSchema,
    // Absolute render timing in milliseconds.
    endMs: nonNegativeIntegerSchema,
    treatment: shotTreatmentSchema,
    crop: normalizedCropSchema.optional(),
    motion: cameraMotionSchema.optional(),
    overlays: z.array(shotOverlaySchema).default([]),
    transition: shotTransitionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endMs <= value.startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endMs"],
        message: "Render shots must end after they start.",
      });
    }
  });
export type RenderShot = z.infer<typeof renderShotSchema>;

export const shotPlanPacingProfileSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("reference"),
    profileId: createVisualRetentionIdSchema("VisualPacingProfileReferenceId"),
  }),
  z.object({
    mode: z.literal("inline"),
    profile: visualPacingProfileSchema,
  }),
]);
export type ShotPlanPacingProfile = z.infer<typeof shotPlanPacingProfileSchema>;

export const shotPlanValidationIssueCodeSchema = z.enum([
  "VISUAL_CHANGE_RATE_TOO_LOW",
  "OPENING_VISUAL_VARIETY_TOO_LOW",
  "STATIC_SHOT_TOO_LONG",
  "SOURCE_IMAGE_OVERUSED",
  "CONSECUTIVE_SOURCE_IMAGE_REUSE_TOO_HIGH",
  "CONSECUTIVE_CROP_TOO_SIMILAR",
  "REPEATED_MOTION_PATTERN",
  "CLIMAX_PACING_TOO_SLOW",
  "SHOT_BUDGET_EXCEEDED",
  "SOURCE_IMAGE_BUDGET_EXCEEDED",
  "FINAL_CALLBACK_SHOT_MISSING",
  "BLURRED_FILL_OVERUSED",
  "SURVEILLANCE_EFFECT_OVERUSED",
  "PARALLAX_EFFECT_OVERUSED",
  "CAPTION_VISUAL_COLLISION",
  "EVIDENCE_PROVENANCE_MISSING",
  "LOW_RESOLUTION_CROP_RISK",
  "FACE_CLIPPING_RISK",
]);
export type ShotPlanValidationIssueCode = z.infer<
  typeof shotPlanValidationIssueCodeSchema
>;

export const shotPlanValidationIssueSeveritySchema = z.enum([
  "warning",
  "error",
]);
export type ShotPlanValidationIssueSeverity = z.infer<
  typeof shotPlanValidationIssueSeveritySchema
>;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const shotPlanValidationIssueSchema = z.object({
  code: shotPlanValidationIssueCodeSchema,
  severity: shotPlanValidationIssueSeveritySchema,
  message: z.string().min(1),
  shotId: shotIdSchema.optional(),
  sceneId: sceneIdSchema.optional(),
  details: z.record(z.string(), jsonValueSchema).optional(),
});
export type ShotPlanValidationIssue = z.infer<
  typeof shotPlanValidationIssueSchema
>;

const evidenceInsertIdPattern = /^evidence-insert-[a-z0-9][a-z0-9-]*$/;
const localeTagPattern = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/iu;

export const evidenceInsertIdSchema = z
  .string()
  .regex(evidenceInsertIdPattern)
  .brand<"EvidenceInsertId">();
export type EvidenceInsertId = z.infer<typeof evidenceInsertIdSchema>;

export const sourceFactIdSchema =
  createVisualRetentionIdSchema("SourceFactId");
export type SourceFactId = z.infer<typeof sourceFactIdSchema>;

export const evidenceInsertLocaleSchema = z
  .string()
  .trim()
  .regex(localeTagPattern)
  .brand<"EvidenceInsertLocale">();
export type EvidenceInsertLocale = z.infer<typeof evidenceInsertLocaleSchema>;

export const evidenceInsertKindSchema = z.enum([
  "clock",
  "date",
  "document",
  "recording",
  "audio-waveform",
  "message",
  "timestamp",
  "location-label",
  "room-number",
  "terminal-log",
  "medical-reading",
  "handwritten-note",
  "newspaper-heading",
]);
export type EvidenceInsertKind = z.infer<typeof evidenceInsertKindSchema>;

export const evidenceInsertAnchorSchema = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);
export type EvidenceInsertAnchor = z.infer<typeof evidenceInsertAnchorSchema>;

export const evidenceInsertDimensionsSchema = z
  .object({
    widthPx: positiveIntegerSchema,
    heightPx: positiveIntegerSchema,
    aspectRatio: aspectRatioSchema,
  })
  .strict();
export type EvidenceInsertDimensions = z.infer<
  typeof evidenceInsertDimensionsSchema
>;

export const evidenceInsertLayoutSchema = z
  .object({
    bounds: normalizedCropSchema,
    preferredAnchor: evidenceInsertAnchorSchema,
    captionSafeExclusion: normalizedCropSchema.optional(),
    textSafePadding: normalizedUnitIntervalSchema,
    minReadableHeight: normalizedUnitIntervalSchema,
    protectedSubregions: z.array(normalizedCropSchema).default([]),
    compatibleAspectRatios: z.array(aspectRatioSchema).min(1),
  })
  .strict();
export type EvidenceInsertLayout = z.infer<typeof evidenceInsertLayoutSchema>;

const evidenceInsertBaseSchema = z
  .object({
    id: evidenceInsertIdSchema,
    sourceFactId: sourceFactIdSchema,
    locale: evidenceInsertLocaleSchema,
    sourceSceneId: sourceSceneIdSchema.optional(),
    shotId: shotIdSchema.optional(),
    startMs: nonNegativeIntegerSchema.optional(),
    endMs: nonNegativeIntegerSchema.optional(),
    templateVersion: z.string().trim().min(1),
    dimensions: evidenceInsertDimensionsSchema,
    layout: evidenceInsertLayoutSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startMs !== undefined &&
      value.endMs !== undefined &&
      value.endMs <= value.startMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endMs"],
        message: "Evidence insert end time must be after start time.",
      });
    }
  });

export const clockEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("clock"),
  content: z
    .object({
      timeText: z.string().trim().min(1),
      label: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const dateEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("date"),
  content: z
    .object({
      dateText: z.string().trim().min(1),
      calendar: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const documentEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("document"),
  content: z
    .object({
      heading: z.string().trim().min(1),
      body: z.string().trim().min(1).optional(),
      classification: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const recordingEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("recording"),
  content: z
    .object({
      label: z.string().trim().min(1),
      timecode: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const audioWaveformEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("audio-waveform"),
  content: z
    .object({
      label: z.string().trim().min(1),
      sampleBuckets: z.array(normalizedUnitIntervalSchema).min(4).max(64),
    })
    .strict(),
});
export const messageEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("message"),
  content: z
    .object({
      sender: z.string().trim().min(1).optional(),
      messageText: z.string().trim().min(1),
      timestampText: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const timestampEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("timestamp"),
  content: z
    .object({
      timestampText: z.string().trim().min(1),
      label: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const locationLabelEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("location-label"),
  content: z
    .object({
      label: z.string().trim().min(1),
      coordinatesText: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const roomNumberEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("room-number"),
  content: z
    .object({
      roomNumber: z.string().trim().min(1),
      label: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const terminalLogEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("terminal-log"),
  content: z
    .object({
      command: z.string().trim().min(1).optional(),
      outputLine: z.string().trim().min(1),
    })
    .strict(),
});
export const medicalReadingEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("medical-reading"),
  content: z
    .object({
      metric: z.string().trim().min(1),
      value: z.string().trim().min(1),
      unit: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const handwrittenNoteEvidenceInsertSchema = evidenceInsertBaseSchema.extend({
  kind: z.literal("handwritten-note"),
  content: z
    .object({
      noteText: z.string().trim().min(1),
      attribution: z.string().trim().min(1).optional(),
    })
    .strict(),
});
export const newspaperHeadingEvidenceInsertSchema =
  evidenceInsertBaseSchema.extend({
    kind: z.literal("newspaper-heading"),
    content: z
      .object({
        headline: z.string().trim().min(1),
        publication: z.string().trim().min(1).optional(),
        dateText: z.string().trim().min(1).optional(),
      })
      .strict(),
  });

export const evidenceInsertSchema = z.discriminatedUnion("kind", [
  clockEvidenceInsertSchema,
  dateEvidenceInsertSchema,
  documentEvidenceInsertSchema,
  recordingEvidenceInsertSchema,
  audioWaveformEvidenceInsertSchema,
  messageEvidenceInsertSchema,
  timestampEvidenceInsertSchema,
  locationLabelEvidenceInsertSchema,
  roomNumberEvidenceInsertSchema,
  terminalLogEvidenceInsertSchema,
  medicalReadingEvidenceInsertSchema,
  handwrittenNoteEvidenceInsertSchema,
  newspaperHeadingEvidenceInsertSchema,
]);
export type EvidenceInsert = z.infer<typeof evidenceInsertSchema>;

export const evidenceInsertArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: episodeIdSchema,
    locale: evidenceInsertLocaleSchema,
    variant: contentVariantSchema,
    inserts: z.array(evidenceInsertSchema),
  })
  .strict();
export type EvidenceInsertArtifact = z.infer<
  typeof evidenceInsertArtifactSchema
>;

export const shotPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: episodeIdSchema,
    locale: z.string().min(1).optional(),
    variant: contentVariantSchema,
    aspectRatio: aspectRatioSchema,
    sourceScenes: z.array(visualSourceSceneSchema),
    shots: z.array(renderShotSchema),
    pacingProfile: shotPlanPacingProfileSchema,
    visualBudget: visualBudgetSchema,
    planningSeed: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const sourceSceneIds = new Set<string>();
    for (const [index, sourceScene] of value.sourceScenes.entries()) {
      if (sourceSceneIds.has(sourceScene.sourceSceneId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceScenes", index, "sourceSceneId"],
          message: "Shot plans require unique source scene identifiers.",
        });
      }
      sourceSceneIds.add(sourceScene.sourceSceneId);
    }

    const sourceSceneMap = new Map(
      value.sourceScenes.map((sourceScene) => [
        sourceScene.sourceSceneId,
        sourceScene,
      ]),
    );

    const shotIds = new Set<string>();
    let previousShot: RenderShot | undefined;
    for (const [index, shot] of value.shots.entries()) {
      if (shotIds.has(shot.shotId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shots", index, "shotId"],
          message: "Shot plans require unique shot identifiers.",
        });
      }
      shotIds.add(shot.shotId);

      const sourceScene = sourceSceneMap.get(shot.sourceSceneId);
      if (!sourceScene) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shots", index, "sourceSceneId"],
          message:
            "Each render shot must reference an existing visual source scene.",
        });
        continue;
      }
      if (shot.sceneId !== sourceScene.sceneId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shots", index, "sceneId"],
          message:
            "Render shot scene ownership must match its referenced source scene.",
        });
      }
      if (shot.sourceImageId !== sourceScene.sourceImageId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shots", index, "sourceImageId"],
          message:
            "Render shot source-image ownership must match its referenced source scene.",
        });
      }

      if (previousShot) {
        if (shot.startMs < previousShot.startMs) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shots", index, "startMs"],
            message: "Render shots must be ordered by ascending start time.",
          });
        }

        const overlapMs = previousShot.endMs - shot.startMs;
        if (overlapMs > 0) {
          const transition = previousShot.transition;
          const allowsOverlap =
            transition !== undefined &&
            transition.kind !== "hard-cut" &&
            transition.durationMs === overlapMs;
          if (!allowsOverlap) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shots", index, "startMs"],
              message:
                "Render shots must not overlap unless the previous shot declares a matching transition overlap.",
            });
          }
        }
      }

      previousShot = shot;
    }
  });
export type ShotPlan = z.infer<typeof shotPlanSchema>;

export const visualSceneSchema = z.object({
  id: sceneIdSchema,
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  narration: z.string(),
  sourceSegmentIds: z.array(transcriptSegmentIdSchema)
});
export type VisualScene = z.infer<typeof visualSceneSchema>;

export const voiceProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  gender: z.enum(["male", "female", "neutral"]),
  style: z.string(),
  paceWpm: z.number().positive(),
  providerVoiceId: z.string().optional()
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const audioSegmentSchema = z.object({
  sceneId: sceneIdSchema,
  filePath: z.string(),
  durationSeconds: z.number().nonnegative()
});
export type AudioSegment = z.infer<typeof audioSegmentSchema>;

export const wordTimingSchema = z.object({
  word: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional()
});
export type WordTiming = z.infer<typeof wordTimingSchema>;

export const alignmentResultSchema = z.object({
  sceneId: sceneIdSchema,
  words: z.array(wordTimingSchema),
  lowConfidenceRanges: z.array(
    z.object({
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative(),
      reason: z.string()
    })
  )
});
export type AlignmentResult = z.infer<typeof alignmentResultSchema>;

export const captionSegmentSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string()
});
export type CaptionSegment = z.infer<typeof captionSegmentSchema>;

export const imageAssetSchema = z.object({
  sceneId: sceneIdSchema,
  sourcePath: z.string(),
  renderedPath: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.string(),
  checksumSha256: z.string(),
  duplicateOf: z.string().optional(),
  validated: z.boolean(),
  originalImagePrompt: z.string().optional(),
  optimizedImagePrompt: z.string().optional(),
  optimizedImagePromptPath: z.string().optional(),
  optimizedImagePromptHash: z.string().optional(),
  generationStatus: z
    .enum(["pending", "prompt-optimized", "generating", "generated", "validated", "failed", "skipped-cache-hit"])
    .optional(),
  provenance: z
    .object({
      schemaVersion: z.literal(1),
      episodeSlug: z.string(),
      sceneId: sceneIdSchema,
      sequence: z.number().int().positive(),
      sourceSceneHash: z.string(),
      originalPromptHash: z.string(),
      optimizedPromptHash: z.string(),
      optimizerVersion: z.string(),
      optimizerModel: z.string().optional(),
      optimizedAt: z.string(),
      metrics: z.object({
        originalCharacters: z.number().int().nonnegative(),
        optimizedCharacters: z.number().int().nonnegative(),
        reductionCharacters: z.number().int().nonnegative(),
        reductionPercent: z.number().nonnegative(),
        originalEstimatedTokens: z.number().int().nonnegative(),
        optimizedEstimatedTokens: z.number().int().nonnegative()
      }),
      preservedRequirements: z.array(z.string()),
      omittedNonVisualContent: z.array(z.string()),
      warnings: z.array(z.string()),
      model: z.string().optional(),
      referenceMode: z.enum(["none", "canonical", "previous"]).optional(),
      referenceImagePath: z.string().optional(),
      referenceImageHash: z.string().optional(),
      referenceImageSource: z.enum(["canonical", "previous", "none", "fallback"]).optional(),
      size: z.string(),
      quality: z.string(),
      outputFormat: z.enum(["png", "webp", "jpeg"]),
      candidateCount: z.number().int().positive(),
      cacheKey: z.string(),
      requestId: z.string().optional(),
      generatedAt: z.string().optional(),
      validatedAt: z.string().optional(),
      validation: z
        .object({
          valid: z.boolean(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional(),
          checksumSha256: z.string().optional(),
          warnings: z.array(z.string()).default([])
        })
        .optional(),
      failure: z
        .object({
          failedStage: z.enum(["load", "optimize", "prompt-validation", "generate", "image-validation", "write"]),
          retryable: z.boolean(),
          errorCode: z.string(),
          errorMessage: z.string()
        })
        .optional()
    })
    .optional()
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

export const renderProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  burnCaptions: z.boolean()
});
export type RenderProfile = z.infer<typeof renderProfileSchema>;

export const publishingMetadataSchema = z.object({
  sourceId: episodeIdSchema,
  platform: z.enum(["youtube", "tiktok"]),
  language: z.string().min(1).optional(),
  titleCandidates: z.array(z.string()),
  recommendedTitle: z.string(),
  description: z.string(),
  caption: z.string().optional(),
  tags: z.array(z.string()),
  hashtags: z.array(z.string()),
  chapters: z.array(
    z.object({
      timestampSeconds: z.number().nonnegative(),
      title: z.string()
    })
  ),
  thumbnailTextCandidates: z.array(z.string()),
  coverTextCandidates: z.array(z.string()),
  pinnedComment: z.string().optional(),
  summary: z.string(),
  primaryKeyword: z.string(),
  secondaryKeywords: z.array(z.string()),
  warnings: z.array(z.string())
});
export type PublishingMetadata = z.infer<typeof publishingMetadataSchema>;

export const artifactReferenceSchema = z.object({
  id: artifactIdSchema,
  kind: z.string(),
  path: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string(),
  createdAt: z.string()
});
export type ArtifactReference = z.infer<typeof artifactReferenceSchema>;

export const providerUsageSchema = z.object({
  provider: z.string(),
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  creditsUsed: z.number().nonnegative().default(0)
});
export type ProviderUsage = z.infer<typeof providerUsageSchema>;

export const pipelineErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  step: z.string().optional(),
  episodeId: episodeIdSchema.optional(),
  sceneId: sceneIdSchema.optional(),
  remediation: z.string().optional()
});
export type PipelineError = z.infer<typeof pipelineErrorSchema>;

export const pipelineStepRunSchema = z.object({
  name: z.string(),
  version: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  cacheKey: z.string(),
  cacheHit: z.boolean(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  outputArtifactIds: z.array(artifactIdSchema).default([]),
  providerUsage: providerUsageSchema.optional(),
  error: pipelineErrorSchema.optional()
});
export type PipelineStepRun = z.infer<typeof pipelineStepRunSchema>;

export const pipelineRunSchema = z.object({
  id: pipelineRunIdSchema,
  episodeId: episodeIdSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["running", "succeeded", "failed", "cancelled"]),
  steps: z.array(pipelineStepRunSchema).default([])
});
export type PipelineRun = z.infer<typeof pipelineRunSchema>;

export const episodeManifestSchema = z.object({
  episodeId: episodeIdSchema,
  slug: z.string(),
  source: z.object({
    platform: sourcePlatformSchema,
    url: z.string().optional(),
    filePath: z.string().optional(),
    transcriptPath: z.string().optional(),
    mediaPath: z.string().optional()
  }),
  sourceMetadata: z.any().optional(),
  sourceMedia: z.any().optional(),
  transcript: transcriptSchema.optional(),
  cleanedTranscript: cleanedTranscriptSchema.optional(),
  rewrittenScript: rewrittenScriptSchema.optional(),
  scenePlan: scenePlanSchema.optional(),
  alignment: alignmentResultSchema.optional(),
  captions: z.object({
    srtPath: z.string().optional(),
    vttPath: z.string().optional(),
    assPath: z.string().optional()
  }).optional(),
  images: z.array(imageAssetSchema).default([]),
  publishingMetadata: publishingMetadataSchema.optional(),
  artifacts: z.array(artifactReferenceSchema).default([]),
  pipelineRuns: z.array(pipelineRunSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type EpisodeManifest = z.infer<typeof episodeManifestSchema>;

export interface PipelineContext {
  readonly episodeId: EpisodeId;
  readonly episodeSlug: string;
  readonly workspaceDir: string;
  readonly episodeDir: string;
  readonly manifestPath: string;
  readonly logger?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
    debug: (obj: Record<string, unknown>, msg?: string) => void;
  };
}

export interface PipelineStep<TInput, TOutput> {
  readonly name: string;
  readonly version: string;

  execute(
    context: PipelineContext,
    input: TInput,
    signal: AbortSignal
  ): Promise<TOutput>;

  calculateCacheKey(input: TInput): Promise<string>;
}

export class ValidationError extends Error {
  public readonly retryable = false;

  public constructor(
    message: string,
    public readonly remediation = "Fix the invalid input and retry.",
    public readonly step?: string,
    public readonly episodeId?: EpisodeId,
    public readonly sceneId?: SceneId,
    public readonly internalCause?: unknown
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConfigurationError extends Error {
  public readonly retryable = false;

  public constructor(message: string, public readonly remediation = "Review configuration and environment variables.") {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class UnsupportedSourceError extends Error {
  public readonly retryable = false;

  public constructor(message: string, public readonly remediation = "Use a supported local file or authorized source.") {
    super(message);
    this.name = "UnsupportedSourceError";
  }
}

export class SourceAcquisitionError extends Error {
  public readonly retryable = false;

  public constructor(message: string, public readonly remediation = "Verify the source file or transcript and try again.") {
    super(message);
    this.name = "SourceAcquisitionError";
  }
}

export class ProviderAuthenticationError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Add the required provider credentials.") {
    super(message);
    this.name = "ProviderAuthenticationError";
  }
}

export class ProviderRateLimitError extends Error {
  public readonly retryable = true;
  public constructor(message: string, public readonly remediation = "Retry later or reduce request volume.") {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

export class ProviderResponseError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Inspect the provider response and adjust the request.") {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export class ProcessExecutionError extends Error {
  public readonly retryable = true;
  public constructor(message: string, public readonly remediation = "Inspect the command output and rerun if the failure was transient.") {
    super(message);
    this.name = "ProcessExecutionError";
  }
}

export class MediaValidationError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Replace or repair the media artifact.") {
    super(message);
    this.name = "MediaValidationError";
  }
}

export class ArtifactNotFoundError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Regenerate the missing artifact or re-import it.") {
    super(message);
    this.name = "ArtifactNotFoundError";
  }
}

export class PipelineInvariantError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Review the manifest and pipeline step sequencing.") {
    super(message);
    this.name = "PipelineInvariantError";
  }
}

export class HumanActionRequiredError extends Error {
  public readonly retryable = false;
  public constructor(message: string, public readonly remediation = "Complete the required human action and rerun the command.") {
    super(message);
    this.name = "HumanActionRequiredError";
  }
}
