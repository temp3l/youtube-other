import crypto from "node:crypto";

import {
  contentLocaleSchema,
  contentVariantSchema,
  mathematicsEducationContentProfileSchema,
} from "@mediaforge/domain";
import { z } from "zod";

import {
  lessonIdSchema,
  lessonVariantSchema,
  mathGradeSchema,
  skillIdSchema,
} from "./domain/index.js";

export const MATH_PROFILE_MANIFEST_VERSION =
  "math.profile-manifest.v1" as const;
export const EDUCATIONAL_VISUAL_STYLE_MANIFEST_VERSION =
  "math.educational-visual-style.v1" as const;
export const MATH_PROFILE_CONTRACT_VERSION = "math.profile.v1" as const;

const nonEmpty = z.string().trim().min(1);
const revision = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.iso.datetime({ offset: true });
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);

export const mathProfileApprovalSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "revoked"]),
    actor: nonEmpty,
    reason: nonEmpty,
    createdAt: instant,
    expiresAt: instant.optional(),
    boundRevision: revision,
    contentHash: sha256,
  })
  .strict();
export type MathProfileApproval = z.infer<typeof mathProfileApprovalSchema>;

export const mathLessonProfileManifestSchema = z
  .object({
    schemaVersion: z.literal(MATH_PROFILE_MANIFEST_VERSION),
    contractVersion: z.literal(MATH_PROFILE_CONTRACT_VERSION),
    profileId: z.literal("mathematics-education"),
    revision,
    contentHash: sha256,
    createdAt: instant,
    updatedAt: instant,
    lessonId: lessonIdSchema,
    skillId: skillIdSchema,
    lessonVariant: lessonVariantSchema,
    contentVariant: contentVariantSchema,
    outputAudience: z.enum(["student", "teacher"]),
    locale: contentLocaleSchema,
    jurisdiction: nonEmpty,
    stateOrRegion: nonEmpty,
    curriculum: z
      .object({
        sourceId: identifier,
        releaseId: identifier,
        revision,
        releaseHash: sha256,
        status: z.enum(["draft", "reviewed", "published", "superseded"]),
        schoolType: nonEmpty,
        grade: mathGradeSchema,
        sourceUrls: z.array(z.string().url()).min(1),
        reviewedAt: instant.optional(),
      })
      .strict(),
    audience: z
      .object({
        ageMinimum: z.number().int().min(5).max(20),
        ageMaximum: z.number().int().min(5).max(20),
        priorKnowledge: z.array(nonEmpty),
        accessibilityNeeds: z.array(nonEmpty),
        languageLevel: nonEmpty,
      })
      .strict(),
    lessonLengthSeconds: z.number().int().min(15).max(3_600),
    learningObjective: nonEmpty,
    prerequisiteSkillIds: z.array(skillIdSchema),
    misconceptionInventory: z.array(nonEmpty).min(1),
    pedagogicalStrategy: z.array(nonEmpty).min(1),
    deterministicVerificationRequired: z.literal(true),
    profile: mathematicsEducationContentProfileSchema,
    approval: mathProfileApprovalSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.audience.ageMinimum > value.audience.ageMaximum) {
      context.addIssue({
        code: "custom",
        path: ["audience", "ageMinimum"],
        message: "Audience minimum age must not exceed maximum age.",
      });
    }
    if (value.profile.grade !== value.curriculum.grade) {
      context.addIssue({
        code: "custom",
        path: ["profile", "grade"],
        message: "Profile and curriculum grades must match.",
      });
    }
    if (value.profile.curriculumRevision !== value.curriculum.revision) {
      context.addIssue({
        code: "custom",
        path: ["profile", "curriculumRevision"],
        message: "Profile and curriculum revisions must match.",
      });
    }
    if (
      value.curriculum.status === "draft" ||
      value.curriculum.status === "superseded"
    ) {
      context.addIssue({
        code: "custom",
        path: ["curriculum", "status"],
        message:
          "A lesson profile requires a reviewed or published curriculum release.",
      });
    }
    if (
      value.approval &&
      (value.approval.boundRevision !== value.revision ||
        value.approval.contentHash !== value.contentHash)
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval"],
        message:
          "Approval must bind the current lesson-profile revision and hash.",
      });
    }
  });
export type MathLessonProfileManifest = z.infer<
  typeof mathLessonProfileManifestSchema
>;

const visualReferenceSchema = z
  .object({
    id: identifier,
    revision,
    role: z.enum(["mascot", "teacher", "scenario", "environment", "thumbnail"]),
    required: z.boolean(),
    relativePath: nonEmpty,
    checksumSha256: sha256,
    license: nonEmpty,
    provenance: nonEmpty,
    approval: mathProfileApprovalSchema.optional(),
  })
  .strict();

export const educationalVisualStyleManifestSchema = z
  .object({
    schemaVersion: z.literal(EDUCATIONAL_VISUAL_STYLE_MANIFEST_VERSION),
    profileId: z.literal("mathematics-education"),
    revision,
    profileRevision: revision,
    curriculumRevision: revision,
    contentHash: sha256,
    createdAt: instant,
    updatedAt: instant,
    canvas: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        aspectRatio: nonEmpty,
        layoutTemplates: z.array(identifier).min(1),
      })
      .strict(),
    typography: z
      .object({
        textFontFamily: nonEmpty,
        mathFontFamily: nonEmpty,
        fontMetricsRevision: revision,
        minimumVisibleFontPx: z.number().int().min(24),
        minimumCaptionFontPx: z.number().int().min(24),
      })
      .strict(),
    palette: z
      .object({
        colors: z.record(identifier, z.string().regex(/^#[a-fA-F0-9]{6}$/u)),
        semanticEncodings: z
          .array(
            z
              .object({
                meaning: nonEmpty,
                colorToken: identifier,
                colorIndependentCue: nonEmpty,
              })
              .strict()
          )
          .min(1),
      })
      .strict(),
    rules: z
      .object({
        diagrams: z.array(nonEmpty).min(1),
        graphs: z.array(nonEmpty).min(1),
        coordinateSystems: z.array(nonEmpty).min(1),
        geometry: z.array(nonEmpty).min(1),
        symbolicRendering: z.array(nonEmpty).min(1),
        notToScaleLabelRequired: z.literal(true),
      })
      .strict(),
    animation: z
      .object({
        minimumStepDurationMs: z.number().int().positive(),
        maximumStepDurationMs: z.number().int().positive(),
        transformationConvention: nonEmpty,
        transientMeaningRequiresPersistentEquivalent: z.literal(true),
      })
      .strict(),
    safeRegions: z
      .object({
        captions: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
          })
          .strict(),
        accessibility: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
          })
          .strict(),
      })
      .strict(),
    rendererVersions: z.record(identifier, revision),
    references: z.array(visualReferenceSchema),
    localeVisibleLabels: z
      .array(
        z
          .object({
            locale: contentLocaleSchema,
            policyRevision: revision,
            decimalSeparator: z.enum(["comma", "point"]),
            labelsLocalized: z.literal(true),
            mathematicalSemanticsLocked: z.literal(true),
          })
          .strict()
      )
      .min(1),
    validation: z
      .object({
        status: z.enum(["pending", "passed", "failed"]),
        checkedAt: instant.optional(),
        checks: z
          .array(
            z
              .object({
                id: identifier,
                status: z.enum(["passed", "failed"]),
                evidence: nonEmpty,
              })
              .strict()
          )
          .min(1),
        issues: z.array(nonEmpty),
      })
      .strict(),
    approval: mathProfileApprovalSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.animation.minimumStepDurationMs >
      value.animation.maximumStepDurationMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["animation", "minimumStepDurationMs"],
        message: "Minimum animation duration cannot exceed the maximum.",
      });
    }
    const locales = value.localeVisibleLabels.map((entry) => entry.locale);
    if (new Set(locales).size !== locales.length) {
      context.addIssue({
        code: "custom",
        path: ["localeVisibleLabels"],
        message: "Visible-label locale policies must be unique.",
      });
    }
    for (const reference of value.references.filter((item) => item.required)) {
      if (
        !reference.approval ||
        reference.approval.decision !== "approved" ||
        reference.approval.boundRevision !== reference.revision ||
        reference.approval.contentHash !== reference.checksumSha256
      ) {
        context.addIssue({
          code: "custom",
          path: ["references"],
          message: `Required reference ${reference.id} must have checksum-bound approval.`,
        });
      }
    }
    if (
      value.approval &&
      (value.approval.boundRevision !== value.revision ||
        value.approval.contentHash !== value.contentHash)
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval"],
        message:
          "Approval must bind the current visual-style revision and hash.",
      });
    }
    if (
      value.validation.status === "passed" &&
      value.validation.issues.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["validation", "issues"],
        message: "A passed visual-style validation cannot retain issues.",
      });
    }
  });
export type EducationalVisualStyleManifest = z.infer<
  typeof educationalVisualStyleManifestSchema
>;

export function hashMathProfileContract(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export interface MathProfileReadiness {
  readonly ready: boolean;
  readonly reasons: readonly string[];
}

function approvalIsCurrent(
  approval: MathProfileApproval | undefined,
  revisionValue: string,
  contentHash: string,
  now: Date
): boolean {
  return Boolean(
    approval &&
    approval.decision === "approved" &&
    approval.boundRevision === revisionValue &&
    approval.contentHash === contentHash &&
    (!approval.expiresAt || new Date(approval.expiresAt) > now)
  );
}

export function assessMathLessonProfileReadiness(
  input: MathLessonProfileManifest | null,
  now = new Date()
): MathProfileReadiness {
  if (!input) {
    return {
      ready: false,
      reasons: ["The mathematics lesson profile is missing."],
    };
  }
  const profile = mathLessonProfileManifestSchema.parse(input);
  const reasons: string[] = [];
  if (
    !approvalIsCurrent(
      profile.approval,
      profile.revision,
      profile.contentHash,
      now
    )
  ) {
    reasons.push(
      "The exact mathematics lesson-profile revision is not approved."
    );
  }
  if (!["reviewed", "published"].includes(profile.curriculum.status)) {
    reasons.push("The bound curriculum release is not reviewed or published.");
  }
  return { ready: reasons.length === 0, reasons };
}

export function assessEducationalVisualStyleReadiness(
  input: EducationalVisualStyleManifest | null,
  locale: z.infer<typeof contentLocaleSchema>,
  now = new Date()
): MathProfileReadiness {
  if (!input) {
    return {
      ready: false,
      reasons: ["The educational visual-style manifest is missing."],
    };
  }
  const manifest = educationalVisualStyleManifestSchema.parse(input);
  const reasons: string[] = [];
  if (
    manifest.validation.status !== "passed" ||
    manifest.validation.checks.some((check) => check.status !== "passed")
  ) {
    reasons.push("Educational visual-style validation has not passed.");
  }
  if (!manifest.localeVisibleLabels.some((entry) => entry.locale === locale)) {
    reasons.push(`No visible-label policy exists for locale ${locale}.`);
  }
  if (
    !approvalIsCurrent(
      manifest.approval,
      manifest.revision,
      manifest.contentHash,
      now
    )
  ) {
    reasons.push(
      "The exact educational visual-style revision is not approved."
    );
  }
  return { ready: reasons.length === 0, reasons };
}

export function assessMathProfileIntegrationReadiness(
  profile: MathLessonProfileManifest | null,
  visualStyle: EducationalVisualStyleManifest | null,
  locale: z.infer<typeof contentLocaleSchema>,
  now = new Date()
): MathProfileReadiness {
  const lesson = assessMathLessonProfileReadiness(profile, now);
  const visual = assessEducationalVisualStyleReadiness(
    visualStyle,
    locale,
    now
  );
  const reasons = [...lesson.reasons, ...visual.reasons];
  if (profile && visualStyle) {
    if (visualStyle.profileRevision !== profile.revision) {
      reasons.push(
        "The educational visual-style manifest is bound to another lesson-profile revision."
      );
    }
    if (visualStyle.curriculumRevision !== profile.curriculum.revision) {
      reasons.push(
        "The educational visual-style manifest is bound to another curriculum revision."
      );
    }
  }
  return { ready: reasons.length === 0, reasons };
}
