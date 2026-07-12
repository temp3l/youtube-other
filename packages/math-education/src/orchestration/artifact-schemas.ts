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
import { mathMetadataSchema } from "../metadata/math-metadata.js";
import { verifierResponseSchema } from "../verification/protocol-schemas.js";

export const mathArtifactSchemaVersionSchema = z.enum([
  "curriculum-skill.v1",
  "lesson-variants.v1",
  "lesson-spec.v1",
  "math-verifier.v2",
  "math-narration.v1",
  "math-narration.v2",
  "math-timing.v1",
  "math-visual-plan.v1",
  "math-metadata.v1",
  "math-publish-dry-run.v1",
  "math-quality.v1",
]);
export type MathArtifactSchemaVersion = z.infer<
  typeof mathArtifactSchemaVersionSchema
>;

const visualPlanSchema = z.strictObject({
  artifactVersion: z.literal("math-visual-plan.v1"),
  profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  scenes: z.array(
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
        "probability-tree",
        "teacher",
      ]),
      factIds: z.array(z.string()),
      teacherAssetVersion: z.literal("alex.v1-placeholder"),
    })
  ),
});

const publishDryRunSchema = z.strictObject({
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

const schemas: Record<MathArtifactSchemaVersion, z.ZodType> = {
  "curriculum-skill.v1": curriculumSkillSchema,
  "lesson-variants.v1": z.array(lessonVariantSpecificationSchema).length(3),
  "lesson-spec.v1": lessonVariantSpecificationSchema,
  "math-verifier.v2": verifierResponseSchema,
  "math-narration.v1": legacyLocalizedNarrationSchema,
  "math-narration.v2": localizedNarrationSchema,
  "math-timing.v1": timingManifestSchema,
  "math-visual-plan.v1": visualPlanSchema,
  "math-metadata.v1": mathMetadataSchema,
  "math-publish-dry-run.v1": publishDryRunSchema,
  "math-quality.v1": qualitySchema,
};

export function parseMathArtifactPayload(
  schemaVersion: MathArtifactSchemaVersion,
  raw: unknown
): unknown {
  return schemas[schemaVersion].parse(raw);
}
