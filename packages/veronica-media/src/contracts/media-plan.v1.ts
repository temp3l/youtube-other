import { z } from "zod";

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const veronicaIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u);

export const veronicaSchemaVersionSchema = z.literal("veronica-media-plan.v1");
export const veronicaPlannerVersionSchema = z.literal("veronica-media-planner.v1.0");

export const veronicaAspectRatioSchema = z.enum(["16:9", "9:16"]);
export type VeronicaAspectRatio = z.infer<typeof veronicaAspectRatioSchema>;

export const veronicaTransformationLevelSchema = z.enum([
  "preserve",
  "adapt",
  "redesign",
  "summarize",
]);

export const veronicaFallbackRequirementSchema = z.enum([
  "required",
  "preferred",
  "optional",
]);

export const veronicaApprovalSeveritySchema = z.enum([
  "blocking-error",
  "approval-required",
  "non-blocking-warning",
  "informational",
]);

export const veronicaRegenerationScopeSchema = z.enum([
  "re-plan",
  "re-prepare-assets",
  "re-translate",
  "re-align-narration",
  "re-render",
  "full-regeneration",
]);
export type VeronicaRegenerationScope = z.infer<
  typeof veronicaRegenerationScopeSchema
>;

export const veronicaSourceAssetSchema = z.strictObject({
  assetId: veronicaIdSchema,
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  checksum: sha256Schema,
  byteLength: z.number().int().nonnegative(),
  mediaKind: z.enum([
    "pdf",
    "pptx",
    "png",
    "jpeg",
    "webp",
    "svg",
    "mp4",
    "mov",
    "narration",
  ]),
});

export const veronicaSourceReferenceSchema = z.strictObject({
  sourceAssetId: veronicaIdSchema,
  pageNumber: z.number().int().positive().optional(),
  slideNumber: z.number().int().positive().optional(),
  frameStartSeconds: z.number().nonnegative().optional(),
  frameEndSeconds: z.number().nonnegative().optional(),
  region: z
    .strictObject({
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  extractionMethod: z.string().min(1),
});

export const veronicaClaimReferenceSchema = z.strictObject({
  claimId: veronicaIdSchema,
  text: z.string().min(1),
  sourceReferenceIds: z.array(veronicaIdSchema).min(1),
  confidence: z.number().min(0).max(1),
});

export const veronicaNarrationAnchorSchema = z.strictObject({
  anchorId: veronicaIdSchema,
  sceneId: veronicaIdSchema,
  sentenceIndex: z.number().int().nonnegative(),
  exactText: z.string().min(1),
  semanticFingerprint: sha256Schema,
  resolvedStartSeconds: z.number().nonnegative().optional(),
  resolvedEndSeconds: z.number().nonnegative().optional(),
});

export const veronicaNarrationRevisionSchema = z.strictObject({
  revisionId: veronicaIdSchema,
  originalScript: z.string().min(1),
  revisedScript: z.string().min(1),
  mapping: z.array(
    z.strictObject({
      originalSentenceIndex: z.number().int().nonnegative(),
      revisedSentenceIndex: z.number().int().nonnegative(),
      changeKind: z.enum(["unchanged", "clarified", "expanded", "condensed", "localized"]),
    }),
  ),
  originalEstimatedDurationSeconds: z.number().positive(),
  revisedEstimatedDurationSeconds: z.number().positive(),
  allowedVarianceSeconds: z.number().nonnegative(),
  durationStatus: z.enum(["within-variance", "over-variance", "under-variance"]),
});

export const veronicaTranslationStatusSchema = z.strictObject({
  sourceLanguage: z.string().min(2),
  targetLanguage: z.string().min(2),
  status: z.enum(["translated", "pending", "low-confidence", "protected-term", "overflow"]),
  confidence: z.number().min(0).max(1),
  requiresApproval: z.boolean(),
});

export const veronicaProvenanceRecordSchema = z.strictObject({
  provenanceId: veronicaIdSchema,
  sourceAssetId: veronicaIdSchema,
  originalFilename: z.string().min(1),
  checksum: sha256Schema,
  sourceReference: veronicaSourceReferenceSchema,
  transformationChain: z.array(veronicaTransformationLevelSchema),
  language: z.string().min(2),
  attributionMode: z.enum(["on-screen", "voice-over", "metadata-only", "none"]),
  confidence: z.number().min(0).max(1),
  warningCodes: z.array(z.string().min(1)),
});

export const veronicaFallbackPolicySchema = z.strictObject({
  requirement: veronicaFallbackRequirementSchema,
  fallbackAllowed: z.boolean(),
  fallbackAssetId: veronicaIdSchema.optional(),
  fallbackReason: z.string().min(1).optional(),
});

export const veronicaVisualStateSchema = z.strictObject({
  stateId: veronicaIdSchema,
  sourceAssetId: veronicaIdSchema,
  sequenceIndex: z.number().int().nonnegative(),
  treatment: veronicaTransformationLevelSchema,
  focusLabel: z.string().min(1),
  preparedAssetId: veronicaIdSchema.optional(),
  portraitPreparedAssetId: veronicaIdSchema.optional(),
  provenanceId: veronicaIdSchema,
});

export const veronicaPreparedAssetSchema = z.strictObject({
  preparedAssetId: veronicaIdSchema,
  aspectRatio: veronicaAspectRatioSchema,
  checksum: sha256Schema,
  relativePath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  provenanceId: veronicaIdSchema,
  sourceChecksum: sha256Schema.optional(),
  transformationFingerprint: sha256Schema.optional(),
  contentKey: sha256Schema.optional(),
  translationStatus: veronicaTranslationStatusSchema.optional(),
});

export const veronicaMediaPlacementSchema = z.strictObject({
  placementId: veronicaIdSchema,
  anchorId: veronicaIdSchema,
  aspectRatio: veronicaAspectRatioSchema,
  visualStateIds: z.array(veronicaIdSchema).min(1),
  dwellDurationSeconds: z.number().positive(),
  fallback: veronicaFallbackPolicySchema,
  claimIds: z.array(veronicaIdSchema),
});

export const veronicaAspectRatioProfileSchema = z.strictObject({
  aspectRatio: veronicaAspectRatioSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  safeAreas: z.strictObject({
    subtitle: z.strictObject({
      top: z.number().nonnegative(),
      right: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
      left: z.number().nonnegative(),
    }),
    title: z.strictObject({
      top: z.number().nonnegative(),
      right: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
      left: z.number().nonnegative(),
    }),
    lowerThird: z.strictObject({
      top: z.number().nonnegative(),
      right: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
      left: z.number().nonnegative(),
    }),
    platformUi: z.strictObject({
      top: z.number().nonnegative(),
      right: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
      left: z.number().nonnegative(),
    }),
  }),
});

export const veronicaApprovalIssueSchema = z.strictObject({
  code: z.string().min(1),
  severity: veronicaApprovalSeveritySchema,
  message: z.string().min(1),
  placementId: veronicaIdSchema.optional(),
  assetId: veronicaIdSchema.optional(),
});

export const veronicaApprovalEligibilitySchema = z.strictObject({
  renderEligible: z.boolean(),
  contentReviewEligible: z.boolean(),
  productionEligible: z.boolean(),
  issues: z.array(veronicaApprovalIssueSchema),
});

export const veronicaRenderOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("contain"),
    assetPath: z.string().min(1),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal("cover"),
    assetPath: z.string().min(1),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal("crop"),
    assetPath: z.string().min(1),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal("overlay"),
    assetPath: z.string().min(1),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    opacity: z.number().min(0).max(1),
  }),
  z.strictObject({
    kind: z.literal("fade"),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    opacity: z.number().min(0).max(1),
  }),
  z.strictObject({
    kind: z.literal("pip"),
    assetPath: z.string().min(1),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal("loop-video"),
    assetPath: z.string().min(1),
    muteSourceAudio: z.boolean(),
  }),
]);

export const veronicaRenderClipSchema = z.strictObject({
  clipId: veronicaIdSchema,
  placementId: veronicaIdSchema,
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  operations: z.array(veronicaRenderOperationSchema).min(1),
});

export const veronicaRenderManifestSchema = z.strictObject({
  schemaVersion: z.literal("veronica-render-manifest.v1"),
  aspectRatio: veronicaAspectRatioSchema,
  profile: veronicaAspectRatioProfileSchema,
  clips: z.array(veronicaRenderClipSchema).min(1),
  narrationAudioPath: z.string().min(1),
  outputPath: z.string().min(1),
  contentHash: sha256Schema,
});

export const veronicaPlannerMetricsSchema = z.strictObject({
  suppliedAssetUtilizationRatio: z.number().min(0).max(1),
  unusedHighRelevanceAssetCount: z.number().int().nonnegative(),
  repeatedAssetRatio: z.number().min(0).max(1),
  fallbackRatio: z.number().min(0).max(1),
  approvalRequiredRatio: z.number().min(0).max(1),
  lowConfidencePlacementRatio: z.number().min(0).max(1),
  untranslatedTextIncidents: z.number().int().nonnegative(),
  portraitAdaptationFailures: z.number().int().nonnegative(),
  narrationAnchorResolutionFailures: z.number().int().nonnegative(),
  averageVisualDwellDurationSeconds: z.number().nonnegative(),
  semanticCoverageRatio: z.number().min(0).max(1),
  redesignFrequency: z.number().min(0).max(1),
  cacheHitRatio: z.number().min(0).max(1),
});

export const veronicaMediaPlanSchema = z
  .strictObject({
    schemaVersion: veronicaSchemaVersionSchema,
    plannerVersion: veronicaPlannerVersionSchema,
    promptRevision: z.string().min(1),
    modelRevision: z.string().min(1),
    episodeId: veronicaIdSchema,
    narrationRevisionId: veronicaIdSchema,
    sourceChecksums: z.array(sha256Schema),
    designSystemRevision: z.string().min(1),
    rendererProfile: z.string().min(1),
    approvalState: z.enum(["draft", "review", "approved", "blocked"]),
    sourceAssets: z.array(veronicaSourceAssetSchema),
    claims: z.array(veronicaClaimReferenceSchema),
    narrationAnchors: z.array(veronicaNarrationAnchorSchema).min(1),
    narrationRevision: veronicaNarrationRevisionSchema,
    visualStates: z.array(veronicaVisualStateSchema),
    preparedAssets: z.array(veronicaPreparedAssetSchema),
    placements: z.array(veronicaMediaPlacementSchema),
    provenance: z.array(veronicaProvenanceRecordSchema),
    aspectProfiles: z
      .strictObject({
        landscape: veronicaAspectRatioProfileSchema,
        portrait: veronicaAspectRatioProfileSchema,
      })
      .superRefine((profiles, context) => {
        if (profiles.landscape.aspectRatio !== "16:9") {
          context.addIssue({
            code: "custom",
            path: ["landscape", "aspectRatio"],
            message: "Landscape profile must be 16:9.",
          });
        }
        if (profiles.portrait.aspectRatio !== "9:16") {
          context.addIssue({
            code: "custom",
            path: ["portrait", "aspectRatio"],
            message: "Portrait profile must be 9:16.",
          });
        }
      }),
    landscapePlacements: z.array(veronicaMediaPlacementSchema),
    portraitPlacements: z.array(veronicaMediaPlacementSchema),
    approvalEligibility: veronicaApprovalEligibilitySchema,
    metrics: veronicaPlannerMetricsSchema,
    contentHash: sha256Schema,
  })
  .superRefine((plan, context) => {
    const anchorIds = new Set(plan.narrationAnchors.map((anchor) => anchor.anchorId));
    for (const [index, placement] of plan.placements.entries()) {
      if (!anchorIds.has(placement.anchorId)) {
        context.addIssue({
          code: "custom",
          path: ["placements", index, "anchorId"],
          message: `Placement ${placement.placementId} references unknown anchor ${placement.anchorId}.`,
        });
      }
    }
    if (plan.approvalEligibility.renderEligible) {
      const blocking = plan.approvalEligibility.issues.filter(
        (issue) => issue.severity === "blocking-error",
      );
      if (blocking.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["approvalEligibility", "renderEligible"],
          message: "Render eligibility cannot be true while blocking errors exist.",
        });
      }
    }
  });

export type VeronicaMediaPlan = z.infer<typeof veronicaMediaPlanSchema>;
export type VeronicaRenderManifest = z.infer<typeof veronicaRenderManifestSchema>;
export type VeronicaApprovalEligibility = z.infer<
  typeof veronicaApprovalEligibilitySchema
>;

export const VERONICA_DEFAULT_LANDSCAPE_PROFILE = veronicaAspectRatioProfileSchema.parse({
  aspectRatio: "16:9",
  width: 1920,
  height: 1080,
  fps: 30,
  safeAreas: {
    subtitle: { top: 72, right: 96, bottom: 120, left: 96 },
    title: { top: 96, right: 120, bottom: 96, left: 120 },
    lowerThird: { top: 720, right: 120, bottom: 96, left: 120 },
    platformUi: { top: 0, right: 0, bottom: 180, left: 0 },
  },
});

export const VERONICA_DEFAULT_PORTRAIT_PROFILE = veronicaAspectRatioProfileSchema.parse({
  aspectRatio: "9:16",
  width: 1080,
  height: 1920,
  fps: 30,
  safeAreas: {
    subtitle: { top: 120, right: 72, bottom: 180, left: 72 },
    title: { top: 144, right: 96, bottom: 120, left: 96 },
    lowerThird: { top: 1320, right: 96, bottom: 180, left: 96 },
    platformUi: { top: 0, right: 0, bottom: 240, left: 0 },
  },
});
