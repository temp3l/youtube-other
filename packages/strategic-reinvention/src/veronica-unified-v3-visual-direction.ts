import { z } from "zod";

export const VERONICA_UNIFIED_V3_VISUAL_DIRECTION_VERSION =
  "veronica-unified-v3-visual-direction.v1" as const;

const conciseText = z.string().trim().min(8).max(320);
const concreteText = z.string().trim().min(12).max(420);
const cropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
  focalObject: concreteText,
}).strict().refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, "Crop must remain in bounds.");

export const veronicaAuthoredSceneStateSchema = z.object({
  stateRole: conciseText,
  cropFocus: conciseText,
  semanticPurpose: concreteText,
  crop: cropSchema,
}).strict();

export const veronicaAuthoredSceneDirectionSchema = z.object({
  subjectMode: z.enum(["character-led", "object-led", "environment-led", "process-led", "comparison-led", "evidence-led"]),
  depiction: concreteText,
  primarySubject: concreteText,
  primaryAction: concreteText,
  concreteObjects: z.array(concreteText).min(2).max(5),
  environment: concreteText,
  spatialRelationship: concreteText,
  semanticFocus: concreteText,
  visualIntent: concreteText,
  treatmentStrategy: conciseText,
  composition: concreteText,
  camera: conciseText,
  transitionRelationship: z.enum(["introduces", "explains", "contrasts", "demonstrates", "resolves"]),
  semanticStates: z.array(veronicaAuthoredSceneStateSchema).min(1).max(4).nullable(),
}).strict();

export const veronicaAuthoredSceneBundleSchema = z.object({
  storyId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  scenes: z.array(veronicaAuthoredSceneDirectionSchema).min(1).max(16),
}).strict();

export const veronicaIdentityBibleSchema = z
  .object({
    identityId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    stableVisibleDescription: concreteText,
    professionalContext: conciseText,
  })
  .strict();

export const veronicaThumbnailDirectionSchema = z
  .object({
    centralContradiction: conciseText,
    focalSubjectOrObject: conciseText,
    visibleActionOrState: concreteText,
    practicalTension: conciseText,
    composition: concreteText,
    titleRelationship: conciseText,
    neighborDistinction: concreteText,
  })
  .strict();

export const veronicaStoryVisualDirectionSchema = z
  .object({
    storyId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    visualPremise: concreteText,
    anchorVisualLanguage: concreteText,
    protagonist: veronicaIdentityBibleSchema.nullable(),
    recurringConcreteObjects: z.array(concreteText).min(3).max(6),
    allowedEnvironments: z.array(concreteText).min(2).max(5),
    preferredTreatmentFamilies: z
      .array(
        z.enum([
          "character-led",
          "object-led",
          "environment-led",
          "process-led",
          "comparison-led",
          "evidence-led",
        ])
      )
      .min(3),
    forbiddenCliches: z.array(conciseText).min(2).max(6),
    progression: z.tuple([concreteText, concreteText, concreteText]),
    thumbnail: veronicaThumbnailDirectionSchema,
  })
  .strict();

/** Resolved at canonical source admission from the editorial scene-direction files. */
export const veronicaResolvedStoryVisualDirectionSchema = veronicaStoryVisualDirectionSchema.extend({
  authoredScenes: z.array(veronicaAuthoredSceneDirectionSchema).min(1).max(16).optional(),
}).strict();

export const veronicaVisualDirectionPackSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_UNIFIED_V3_VISUAL_DIRECTION_VERSION),
    stories: z.array(veronicaStoryVisualDirectionSchema).length(54),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.stories.forEach((story, index) => {
      if (seen.has(story.storyId)) {
        context.addIssue({
          code: "custom",
          path: ["stories", index, "storyId"],
          message: `Duplicate visual direction for ${story.storyId}`,
        });
      }
      seen.add(story.storyId);
    });
  });

export type VeronicaStoryVisualDirection = z.infer<
  typeof veronicaResolvedStoryVisualDirectionSchema
>;
export type VeronicaVisualDirectionPack = z.infer<
  typeof veronicaVisualDirectionPackSchema
>;
export type VeronicaAuthoredSceneDirection = z.infer<typeof veronicaAuthoredSceneDirectionSchema>;
export type VeronicaAuthoredSceneBundle = z.infer<typeof veronicaAuthoredSceneBundleSchema>;
