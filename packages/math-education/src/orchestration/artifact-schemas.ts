import { z } from "zod";
import {
  curriculumSkillSchema,
  lessonVariantSpecificationSchema,
  mathProductionStatusSchema,
} from "../domain/index.js";
import { timingManifestSchema } from "../lesson/timing.js";
import {
  legacyLocalizedNarrationSchema,
  localizedNarrationSchema,
} from "../localization/localization.js";
import {
  mathMetadataSchema,
  mathPlaylistCatalogSchema,
} from "../metadata/math-metadata.js";
import { mathPublishDryRunSchema } from "../publishing/dry-run-manifest.js";
import { verifierResponseSchema } from "../verification/protocol-schemas.js";
import {
  mathMinorEditApprovalSchema,
  mathQualityReportSchema,
} from "./quality-gate.js";
import { educationalSpeechWorkflowLogSchema } from "@mediaforge/speech";
import { mathPresentationSyncSchema } from "../lesson/educational-speech-sync.js";
import { educationalVisualStyleManifestSchema } from "../profile-contracts.js";

export const mathArtifactSchemaVersionSchema = z.enum([
  "curriculum-skill.v1",
  "lesson-variants.v1",
  "lesson-spec.v1",
  "math-verifier.v3",
  "math-narration.v1",
  "math-narration.v2",
  "math-timing.v1",
  "math-visual-plan.v1",
  "math.educational-visual-style.v1",
  "math-metadata.v1",
  "math-metadata.v2",
  "math-playlist-catalog.v1",
  "math-thumbnail.v1",
  "math-thumbnail-binary.v1",
  "math-final-media.v1",
  "math-final-media-binary.v1",
  "educational-speech.v1",
  "math-speech-binary.v1",
  "math-presentation-sync.v1",
  "math-brand-policy.v1",
  "math-publish-dry-run.v1",
  "math-publish-dry-run.v2",
  "math-quality.v1",
  "math-quality.v2",
  "math-minor-approval.v1",
]);
export type MathArtifactSchemaVersion = z.infer<
  typeof mathArtifactSchemaVersionSchema
>;

export const mathVisualPlanSchema = z
  .strictObject({
    artifactVersion: z.literal("math-visual-plan.v1"),
    profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
    scenes: z
      .array(
        z.strictObject({
          sceneId: z.string().regex(/^scene-\d{3}$/u),
          component: z.enum([
            "formula",
            "place-value-chart",
            "fraction-model",
            "number-line",
            "coordinate-plane",
            "function-graph",
            "geometry",
            "measurement",
            "data-table",
            "bar-chart",
            "probability-tree",
            "teacher",
          ]),
          factIds: z.array(z.string()),
          teacherAssetVersion: z.literal("alex.v1-placeholder"),
        })
      )
      .length(9),
  })
  .superRefine((plan, context) => {
    const seenSceneIds = new Set<string>();
    for (const [index, scene] of plan.scenes.entries()) {
      if (seenSceneIds.has(scene.sceneId))
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "sceneId"],
          message: `Visual-plan scene ID ${scene.sceneId} is duplicated.`,
        });
      seenSceneIds.add(scene.sceneId);
      if (new Set(scene.factIds).size !== scene.factIds.length)
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "factIds"],
          message: `Visual-plan scene ${scene.sceneId} contains duplicated fact IDs.`,
        });
    }
  });

const legacyMathPublishDryRunSchema = z.strictObject({
  artifactVersion: z.literal("math-publish-dry-run.v1"),
  lessonId: z.string().min(1),
  language: z.enum(["de", "en", "es", "fr", "pt"]),
  privacyStatus: z.literal("private"),
  playlistKeys: z.array(z.string().min(1)),
  dispatchAllowed: z.literal(false),
  paidProviderCalled: z.literal(false),
});

const qualitySchema = z.strictObject({
  artifactVersion: z.literal("math-quality.v1"),
  status: mathProductionStatusSchema,
  publishable: z.boolean(),
  checks: z.array(
    z.strictObject({
      checkId: z.string().min(1),
      status: mathProductionStatusSchema,
      passed: z.boolean(),
      message: z.string().min(1),
    })
  ),
});

const thumbnailHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const thumbnailSourceSchema = <
  TStage extends
    | "lesson-spec"
    | "math-verification"
    | "localization"
    | "metadata-playlists",
  TSchema extends
    | "lesson-spec.v1"
    | "math-verifier.v3"
    | "math-narration.v2"
    | "math-metadata.v2",
>(
  stage: TStage,
  schemaVersion: TSchema
) =>
  z.strictObject({
    stage: z.literal(stage),
    relativePath: z.string().min(1),
    schemaVersion: z.literal(schemaVersion),
    contentHash: thumbnailHashSchema,
    producer: z.string().min(1),
    producerVersion: z.string().min(1),
    parentFingerprints: z.array(thumbnailHashSchema).length(1),
  });

export const mathThumbnailArtifactSchema = z.strictObject({
  artifactVersion: z.literal("math-thumbnail.v1"),
  identity: z.strictObject({
    lessonId: z.string().min(1),
    skillId: z.string().min(1),
    language: z.enum(["de", "en", "es", "fr", "pt"]),
    variant: z.enum(["foundation", "standard", "challenge"]),
    grade: z.number().int().min(5).max(10),
    curriculumReleaseId: z.string().min(1),
    curriculumReleaseHash: z.string().regex(/^[a-f0-9]{64}$/u),
    localizationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  specVersion: z.literal("math-thumbnail-spec.v2"),
  rendererVersion: z.literal("math-thumbnail-renderer.v3"),
  fontProfile: z.strictObject({
    id: z.literal("math-thumbnail-fonts.v1"),
    textFamily: z.literal("MathThumbnailText"),
    formulaFamily: z.literal("MathThumbnailFormula"),
    textFontFile: z.literal("KaTeX_SansSerif-Bold.woff2"),
    formulaFontFile: z.literal("KaTeX_Main-Regular.woff2"),
    textFontHash: thumbnailHashSchema,
    formulaFontHash: thumbnailHashSchema,
    measurementModel: z.literal("unicode-conservative.v1"),
  }),
  profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  teacherVersion: z.string().min(1),
  teacherManifestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  teacherPoseId: z.string().min(1),
  teacherPoseHash: z.string().regex(/^[a-f0-9]{64}$/u),
  artwork: z
    .strictObject({
      status: z.enum(["simulation-placeholder", "approved-publish-artwork"]),
      publishReady: z.boolean(),
      blockers: z.array(z.string().min(1)),
      license: z.string().min(1),
      provenance: z.string().min(1),
    })
    .superRefine((artwork, context) => {
      if (artwork.status === "simulation-placeholder") {
        if (artwork.publishReady)
          context.addIssue({
            code: "custom",
            path: ["publishReady"],
            message: "Simulation placeholders cannot be publish-ready.",
          });
        if (artwork.blockers.length === 0)
          context.addIssue({
            code: "custom",
            path: ["blockers"],
            message:
              "Simulation placeholders require an explicit publish blocker.",
          });
      }
      if (artwork.status === "approved-publish-artwork") {
        if (!artwork.publishReady)
          context.addIssue({
            code: "custom",
            path: ["publishReady"],
            message: "Approved artwork must be publish-ready.",
          });
        if (artwork.blockers.length !== 0)
          context.addIssue({
            code: "custom",
            path: ["blockers"],
            message: "Approved artwork cannot carry publish blockers.",
          });
      }
    }),
  inputHashes: z.strictObject({
    lessonContent: z.string().regex(/^[a-f0-9]{64}$/u),
    metadata: z.string().regex(/^[a-f0-9]{64}$/u),
    fact: z.string().regex(/^[a-f0-9]{64}$/u),
    verification: z.string().regex(/^[a-f0-9]{64}$/u),
    spec: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  dimensions: z.strictObject({
    width: z.literal(1920),
    height: z.literal(1080),
    aspectRatio: z.literal("16:9"),
  }),
  safeArea: z.strictObject({
    x: z.literal(96),
    y: z.literal(54),
    width: z.literal(1728),
    height: z.literal(972),
  }),
  readability: z.strictObject({
    wordCount: z.number().int().min(2).max(5),
    textFontPx: z.number().min(64),
    formulaFontPx: z.number().min(58),
    measuredTextWidth: z.number().positive().max(1200),
    measuredFormulaWidth: z.number().positive().max(1120),
    measuredFormulaHeight: z.number().positive().max(260),
    mobileReadable: z.literal(true),
  }),
  teacherAreaRatio: z.number().positive().max(0.25),
  formulaPriority: z.literal(true),
  factId: z.string().min(1),
  factSemanticHash: z.string().regex(/^[a-f0-9]{64}$/u),
  verification: z.strictObject({
    requestId: z.string().min(1),
    requestContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    responseContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    referencedFactIds: z.array(z.string().min(1)).length(1),
    referencedCheckIds: z.array(z.string().min(1)).length(1),
  }),
  sourceLineage: z.strictObject({
    lesson: thumbnailSourceSchema("lesson-spec", "lesson-spec.v1").extend({
      relativePath: z.literal("canonical/lesson-spec.json"),
      producer: z.literal("lesson-specification-builder"),
      producerVersion: z.literal("reviewed-fixtures.v1"),
    }),
    verification: thumbnailSourceSchema(
      "math-verification",
      "math-verifier.v3"
    ).extend({
      relativePath: z.literal("canonical/verification.json"),
      producer: z.literal("sympy-verifier-adapter"),
      producerVersion: z.literal("3.0.0"),
    }),
    localization: thumbnailSourceSchema(
      "localization",
      "math-narration.v2"
    ).extend({
      producer: z.literal("locked-fact-localizer"),
      producerVersion: z.literal("locked-facts.v2"),
    }),
    localizedVerification: thumbnailSourceSchema(
      "localization",
      "math-verifier.v3"
    ).extend({
      producer: z.literal("sympy-verifier-adapter"),
      producerVersion: z.literal("3.0.0"),
    }),
    metadata: thumbnailSourceSchema(
      "metadata-playlists",
      "math-metadata.v2"
    ).extend({
      producer: z.literal("math-metadata-generator"),
      producerVersion: z.literal("math-metadata-generator.v3"),
    }),
  }),
  workflow: z.strictObject({
    owningStage: z.literal("metadata-playlists"),
    producer: z.literal("math-thumbnail-renderer"),
    producerVersion: z.literal("math-thumbnail-renderer.v3"),
    parentFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).length(1),
  }),
  outputPath: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  byteLength: z.number().int().positive(),
});

export const mathFinalMediaEvidenceSchema = z.strictObject({
  artifactVersion: z.literal("math-final-media.v1"),
  owningStage: z.literal("render"),
  producer: z.literal("provider-free-media"),
  producerVersion: z.literal("provider-free-media.v1"),
  parentFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).length(1),
  identity: z.strictObject({
    lessonId: z.string().min(1),
    skillId: z.string().min(1),
    language: z.enum(["de", "en", "es", "fr", "pt"]),
    variant: z.enum(["foundation", "standard", "challenge"]),
  }),
  mediaPath: z.string().min(1),
  mediaHash: z.string().regex(/^[a-f0-9]{64}$/u),
  mediaByteLength: z.number().int().positive(),
  qualityEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  width: z.literal(1920),
  height: z.literal(1080),
  durationSeconds: z.number().min(180).max(300),
  mediaQaPassed: z.literal(true),
});

export const mathBrandPolicyArtifactSchema = z.strictObject({
  artifactVersion: z.literal("math-brand-policy.v1"),
  privacyStatus: z.literal("private"),
  madeForKids: z.boolean(),
  containsSyntheticMedia: z.boolean(),
  channels: z
    .array(
      z.strictObject({
        language: z.enum(["de", "en", "es", "fr", "pt"]),
        channelId: z.string().min(1),
        playlists: z.record(z.string(), z.string().min(1)),
      })
    )
    .length(5),
});

const schemas: Record<MathArtifactSchemaVersion, z.ZodType> = {
  "curriculum-skill.v1": curriculumSkillSchema,
  "lesson-variants.v1": z.array(lessonVariantSpecificationSchema).length(3),
  "lesson-spec.v1": lessonVariantSpecificationSchema,
  "math-verifier.v3": verifierResponseSchema,
  "math-narration.v1": legacyLocalizedNarrationSchema,
  "math-narration.v2": localizedNarrationSchema,
  "math-timing.v1": timingManifestSchema,
  "math-visual-plan.v1": mathVisualPlanSchema,
  "math.educational-visual-style.v1": educationalVisualStyleManifestSchema,
  "math-metadata.v1": mathMetadataSchema,
  "math-metadata.v2": mathMetadataSchema,
  "math-playlist-catalog.v1": mathPlaylistCatalogSchema,
  "math-thumbnail.v1": mathThumbnailArtifactSchema,
  "math-thumbnail-binary.v1": z.never(),
  "math-final-media.v1": mathFinalMediaEvidenceSchema,
  "math-final-media-binary.v1": z.never(),
  "educational-speech.v1": educationalSpeechWorkflowLogSchema,
  "math-speech-binary.v1": z.never(),
  "math-presentation-sync.v1": mathPresentationSyncSchema,
  "math-brand-policy.v1": mathBrandPolicyArtifactSchema,
  "math-publish-dry-run.v1": legacyMathPublishDryRunSchema,
  "math-publish-dry-run.v2": mathPublishDryRunSchema,
  "math-quality.v1": qualitySchema,
  "math-quality.v2": mathQualityReportSchema,
  "math-minor-approval.v1": mathMinorEditApprovalSchema,
};

export function parseMathArtifactPayload(
  schemaVersion: MathArtifactSchemaVersion,
  raw: unknown
): unknown {
  return schemas[schemaVersion].parse(raw);
}

export function isBinaryMathArtifactSchemaVersion(
  schemaVersion: MathArtifactSchemaVersion
): schemaVersion is
  | "math-thumbnail-binary.v1"
  | "math-final-media-binary.v1"
  | "math-speech-binary.v1" {
  return (
    schemaVersion === "math-thumbnail-binary.v1" ||
    schemaVersion === "math-final-media-binary.v1" ||
    schemaVersion === "math-speech-binary.v1"
  );
}
