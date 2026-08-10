import { z } from "zod";

import { ApplicationError } from "@mediaforge/application";
import {
  budgetTierSchema,
  dynamicGenreOverrideSchema,
} from "@mediaforge/dynamic-genre";
import {
  bulkSelectionItemSchema,
  episodeBlueprintSchema,
  evaluateDecisionRationale,
  normalizeContentProfileId,
} from "@mediaforge/domain";

const opaqueId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const mathGrade = z.union([
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
]);
const mathDifficulty = z.enum(["foundation", "standard", "challenge"]);
const mathSkillId = z.string().regex(/^M(?:5|6|7|8|9|10)-[A-Z]{2}-\d{3}$/u);
const mathematicsEducationContentSchema = z
  .object({
    type: z.literal("mathematics_education"),
    version: z.literal("1"),
    curriculumSourceId: opaqueId,
    skillId: mathSkillId,
    grade: mathGrade,
    difficulty: mathDifficulty,
    presentationPresetId: opaqueId,
    audioPresetId: opaqueId,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      Number(value.skillId.slice(1, value.skillId.indexOf("-"))) !== value.grade
    ) {
      context.addIssue({
        code: "custom",
        path: ["skillId"],
        message: "Mathematics skill ID grade must match the selected grade.",
      });
    }
  });
const historyContentSchema = z
  .object({
    type: z.literal("history"),
    version: z.literal("1"),
    topic: z.string().trim().min(1).max(20_000),
    presetId: z.enum([
      "military-campaign",
      "civilization-rise-fall",
      "historical-biography",
      "archaeology-mystery",
      "world-war-geopolitics",
      "royal-court-intrigue",
      "everyday-life",
      "disaster-pandemic-survival",
      "technology-trade-transformation",
      "dark-strange-history",
    ]),
    format: z.enum(["short", "standard", "long"]),
    audienceLevel: z.enum(["general", "enthusiast", "academic-lite"]),
    period: z
      .enum([
        "prehistory",
        "ancient",
        "late antiquity",
        "medieval",
        "early modern",
        "industrial age",
        "modern",
        "contemporary history",
        "cross-period",
      ])
      .optional(),
  })
  .strict();
function normalizeApiProfileInput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const profile = Reflect.get(value, "profile");
  return {
    ...(value as Record<string, unknown>),
    profile:
      profile === "strategic_reinvention"
        ? "veronicabenini"
        : normalizeContentProfileId(profile),
  };
}

export const projectInputSchema = z.preprocess(
  normalizeApiProfileInput,
  z
    .object({
      name: z.string().trim().min(1).max(160),
      profile: z.enum([
        "dark_truth",
        "mathematics_education",
        "dynamic_generic",
        "history",
        "veronicabenini",
      ]),
    })
    .strict()
);
const dynamicGenericInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("completed_story"),
      locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u),
      canonicalLanguage: z
        .string()
        .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)
        .optional(),
      title: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(120_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("structured_outline"),
      locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u),
      canonicalLanguage: z
        .string()
        .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)
        .optional(),
      title: z.string().trim().min(1).max(300),
      sections: z
        .array(
          z
            .object({
              id: opaqueId,
              heading: z.string().trim().max(200).optional(),
              body: z.string().trim().min(1).max(30_000),
            })
            .strict()
        )
        .min(1)
        .max(200),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.sections.reduce(
          (total, section) => total + section.body.length,
          0
        ) > 120_000
      )
        context.addIssue({
          code: "custom",
          path: ["sections"],
          message: "Outline exceeds 120000 characters.",
        });
    }),
]);
export const dynamicGenericContentSchema = z
  .object({
    type: z.literal("dynamic_generic"),
    version: z.literal("1"),
    input: dynamicGenericInputSchema,
    budgetTier: budgetTierSchema,
    overrides: dynamicGenreOverrideSchema.optional(),
  })
  .strict();
export const veronicaBlueprintInputSchema = episodeBlueprintSchema.omit({
  schemaVersion: true,
  episodeId: true,
  genreId: true,
});
export const veronicaContentSchema = z.strictObject({
  type: z.literal("veronicabenini"),
  version: z.literal("1"),
  blueprint: veronicaBlueprintInputSchema,
});

function normalizeEpisodeProfileInput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const content = Reflect.get(value, "content");
  if (!content || typeof content !== "object") return value;
  const type = Reflect.get(content, "type");
  return {
    ...(value as Record<string, unknown>),
    content: {
      ...(content as Record<string, unknown>),
      type:
        type === "strategic_reinvention"
          ? "veronicabenini"
          : normalizeContentProfileId(type),
    },
  };
}

export const episodeInputSchema = z.preprocess(
  normalizeEpisodeProfileInput,
  z
    .object({
      content: z.discriminatedUnion("type", [
        z
          .object({
            type: z.literal("dark_truth"),
            version: z.literal("1"),
            premise: z.string().trim().min(1).max(20_000),
            storyBibleId: opaqueId,
            referenceAssetIds: z.array(opaqueId).max(100),
          })
          .strict(),
        mathematicsEducationContentSchema,
        historyContentSchema,
        dynamicGenericContentSchema,
        veronicaContentSchema,
      ]),
    })
    .strict()
);

/** Keeps parsed-but-unsupported profile capability input distinct from malformed JSON. */
export function parseEpisodeInput(value: unknown): EpisodeInput {
  const parsed = episodeInputSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const content =
    value && typeof value === "object"
      ? Reflect.get(value, "content")
      : undefined;
  if (
    content &&
    typeof content === "object" &&
    Reflect.get(content, "type") === "mathematics_education"
  ) {
    throw new ApplicationError(
      "profile_input_invalid",
      "Mathematics episode input is outside the supported profile capability.",
      false,
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
    );
  }
  if (
    content &&
    typeof content === "object" &&
    Reflect.get(content, "type") === "history"
  ) {
    throw new ApplicationError(
      "profile_input_invalid",
      "History episode input must contain a bounded topic and supported documentary selections.",
      false,
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
    );
  }
  if (
    content &&
    typeof content === "object" &&
    normalizeContentProfileId(Reflect.get(content, "type")) === "veronicabenini"
  ) {
    throw new ApplicationError(
      "profile_input_invalid",
      "Veronica episode input must contain a valid source-led blueprint.",
      false,
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
    );
  }
  if (
    content &&
    typeof content === "object" &&
    Reflect.get(content, "type") === "dynamic_generic"
  ) {
    throw new ApplicationError(
      "profile_input_invalid",
      "Dynamic generic episode input must contain only bounded semantic content and overrides.",
      false,
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
    );
  }
  throw parsed.error;
}
export const workflowAdmissionSchema = z
  .object({
    template: z.literal("episode-production"),
    episodeRevision: z.number().int().nonnegative(),
    locales: z
      .array(z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u))
      .min(1)
      .max(10),
    variants: z
      .array(z.enum(["full", "short"]))
      .min(1)
      .max(2),
    approvalMode: z.enum(["required", "automatic"]),
    publicationMode: z.literal("none"),
  })
  .strict();

export const bulkProductionPreflightInputSchema = z
  .object({ items: z.array(bulkSelectionItemSchema).min(1).max(100) })
  .strict();
export const approvalInputSchema = z
  .object({
    challengeId: opaqueId,
    subjectId: opaqueId,
    expectedRevision: z.number().int().nonnegative(),
    decision: z.enum(["approved", "rejected", "request_changes"]),
    reason: z.string().trim().min(1).max(2_000).optional(),
    override: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const rationale = evaluateDecisionRationale({
      decision: value.decision,
      ...(value.reason !== undefined ? { reason: value.reason } : {}),
      ...(value.override === true ? { isOverride: true } : {}),
    });
    if (!rationale.allowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: rationale.message ?? "Decision rationale is required.",
      });
    }
  });
export const approvalRevocationInputSchema = z
  .object({ reason: z.string().trim().min(1).max(2_000) })
  .strict();

export { openApiDocument } from "./contracts/compose-openapi.js";
export {
  OPENAPI_PATH_MODULES,
  OPENAPI_MODULE_OWNERSHIP,
} from "./contracts/openapi-registry.js";
export type ProjectInput = z.infer<typeof projectInputSchema>;
export type EpisodeInput = z.infer<typeof episodeInputSchema>;
export type WorkflowAdmission = z.infer<typeof workflowAdmissionSchema>;
export type ApprovalInput = z.infer<typeof approvalInputSchema>;
export type ApprovalRevocationInput = z.infer<
  typeof approvalRevocationInputSchema
>;
