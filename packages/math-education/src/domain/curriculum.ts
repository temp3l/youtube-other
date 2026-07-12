import { z } from "zod";
import {
  lessonVariantSchema,
  mathGradeSchema,
  skillIdSchema,
} from "./identity.js";

export const processCompetencySchema = z.enum([
  "ARG",
  "PROB",
  "MOD",
  "REP",
  "OBJ",
  "COM",
  "MED",
]);
export const sourceStatusSchema = z.enum([
  "current",
  "phasing_in",
  "phasing_out",
  "superseded",
  "unverified",
]);

export const curriculumSourceSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    jurisdiction: z.string().min(2),
    schoolType: z.string().min(2),
    title: z.string().min(3),
    documentVersion: z.string().min(1),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().optional(),
    cohort: z.string().min(1).optional(),
    status: sourceStatusSchema,
    officialUrls: z.array(z.string().url()).min(1),
    retrievedAt: z.string().date(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    notes: z.string().min(1),
  })
  .superRefine((source, context) => {
    if (
      (source.status === "phasing_in" || source.status === "phasing_out") &&
      !source.cohort
    ) {
      context.addIssue({
        code: "custom",
        path: ["cohort"],
        message: "Phased sources require a cohort.",
      });
    }
    if (source.effectiveTo && source.effectiveTo < source.effectiveFrom) {
      context.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "effectiveTo precedes effectiveFrom.",
      });
    }
  });

export const seedSkillSchema = z.strictObject({
  id: skillIdSchema,
  grade: mathGradeSchema,
  domain: z.string().min(1),
  topic: z.string().min(1),
  skill: z.string().min(1),
  placementConfidence: z.enum(["high", "medium", "low"]),
  variants: z.tuple([
    z.literal("foundation"),
    z.literal("standard"),
    z.literal("challenge"),
  ]),
  durationSeconds: z.strictObject({
    min: z.literal(180),
    target: z.literal(240),
    max: z.literal(300),
  }),
  status: z.literal("normalized-editorial-draft"),
});

export const curriculumSeedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  canonicalLocale: z.literal("de-DE"),
  targetLanguages: z.tuple([
    z.literal("de"),
    z.literal("en"),
    z.literal("es"),
    z.literal("fr"),
    z.literal("pt"),
  ]),
  variants: z.tuple([
    z.literal("foundation"),
    z.literal("standard"),
    z.literal("challenge"),
  ]),
  skills: z.array(seedSkillSchema),
});

export const sourceMappingSchema = z.strictObject({
  sourceId: z.string().min(1),
  section: z.string().min(1),
  coverage: z.enum(["direct", "synthesized", "supporting"]),
  reviewStatus: z.enum(["pending", "reviewed", "rejected"]),
});

export const curriculumSkillSchema = z.strictObject({
  skillId: skillIdSchema,
  canonicalGrade: mathGradeSchema,
  domain: z.string().min(1),
  topic: z.string().min(1),
  learningObjective: z.string().min(1),
  placementConfidence: z.enum(["high", "medium", "low"]),
  processCompetencies: z.array(processCompetencySchema).min(1),
  sourceMappings: z.array(sourceMappingSchema).min(1),
  durationSeconds: z.union([z.literal(180), z.literal(240), z.literal(300)]),
  allowedVariants: z.array(lessonVariantSchema).length(3),
  editorialStatus: z.enum(["draft", "reviewed", "published", "superseded"]),
  prerequisiteIds: z.array(skillIdSchema),
  seedOrder: z.number().int().nonnegative(),
});

export const statePlacementOverrideSchema = z
  .strictObject({
    overrideId: z.string().regex(/^[a-z0-9-]+$/u),
    skillId: skillIdSchema,
    sourceMapping: sourceMappingSchema,
    jurisdiction: z.string().min(2),
    grade: mathGradeSchema.optional(),
    gradeBand: z.string().min(1).optional(),
    level: z.string().min(1).optional(),
    cohort: z.string().min(1).optional(),
    binding: z.enum(["binding", "recommended", "unverified"]),
    effectiveFrom: z.string().date().optional(),
    effectiveTo: z.string().date().optional(),
    comment: z.string().min(1),
  })
  .superRefine((override, context) => {
    if (
      override.effectiveFrom &&
      override.effectiveTo &&
      override.effectiveTo < override.effectiveFrom
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "effectiveTo precedes effectiveFrom.",
      });
    }
    if (
      override.binding === "binding" &&
      !override.grade &&
      !override.gradeBand &&
      !override.level
    ) {
      context.addIssue({
        code: "custom",
        path: ["binding"],
        message: "Binding overrides require an explicit placement.",
      });
    }
  });

export type CurriculumSkill = z.infer<typeof curriculumSkillSchema>;
export type CurriculumSource = z.infer<typeof curriculumSourceSchema>;
