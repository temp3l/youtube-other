import { z } from "zod";
import { languageCodes } from "./story-localization.types.js";

export const sourceMetadataBlockSchema = z.object({
  episodeNumber: z.string().min(1),
  primaryTitle: z.string().min(1),
  sourceTitle: z.string().min(1).optional(),
  audioInstructions: z.array(z.string().min(1)).default([]),
  soundMotif: z.string().min(1).optional(),
  thumbnailText: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  hashtags: z.array(z.string().min(1)).default([]),
  narrationWpm: z.number().int().positive().optional(),
  contentDisclosure: z.string().min(1).optional(),
  visualDirection: z.string().min(1).optional(),
});

export const sourceStoryFileSchema = z.object({
  language: z.literal("en"),
  title: z.string().min(1),
  episodeNumber: z.string().min(3),
  slug: z.string().min(1),
  narrationParagraphs: z.array(z.string().min(1)).min(1),
  metadata: sourceMetadataBlockSchema,
});

export const preservationChecklistSchema = z.object({
  charactersPreserved: z.boolean(),
  relationshipsPreserved: z.boolean(),
  chronologyPreserved: z.boolean(),
  criticalObjectsPreserved: z.boolean(),
  cluesPreserved: z.boolean(),
  writtenMessagesPreserved: z.boolean(),
  primaryRevealPreserved: z.boolean(),
  endingPreserved: z.boolean(),
  noNewPlotElementsAdded: z.boolean(),
});

export const diagnosticsSchema = z.object({
  fullWordCount: z.number().int().nonnegative().optional(),
  shortWordCount: z.number().int().nonnegative(),
  shortEstimatedDurationSeconds: z.number().nonnegative(),
  removedGenericFiller: z.array(z.string()),
  adaptationNotes: z.array(z.string()),
});

export const generatedStoryPackageSchema = z.object({
  language: z.enum(languageCodes),
  full: z
    .object({
      title: z.string().min(1),
      sourceTitle: z.string().min(1).optional(),
      audioInstructions: z.array(z.string().min(1)).min(1),
      soundMotif: z.string().min(1).optional(),
      narrationParagraphs: z.array(z.string().min(1)).min(3),
      thumbnailText: z.string().min(1).max(50),
      contentDisclosure: z.string().min(1),
      seoDescription: z.string().min(1),
      tags: z.array(z.string().min(1)).min(3).max(20),
      hashtags: z.array(z.string().regex(/^#/u)).min(1).max(8),
      targetNarrationWpm: z.number().int().min(120).max(220),
      visualDirection: z.string().min(1),
    })
    .optional(),
  short: z.object({
    title: z.string().min(1),
    narrationInstructions: z.array(z.string().min(1)).min(1),
    narrationParagraphs: z.array(z.string().min(1)).min(1),
    thumbnailText: z.string().min(1).max(50),
    description: z.string().min(1),
    hashtags: z.array(z.string().regex(/^#/u)).min(1).max(8),
    targetNarrationWpm: z.number().int().min(120).max(220),
    recommendedDurationSeconds: z.object({
      min: z.number().int().min(30).max(90),
      max: z.number().int().min(30).max(90),
    }),
    visualGuidance: z.string().min(1),
  }),
  preservationChecklist: preservationChecklistSchema,
  diagnostics: diagnosticsSchema,
});

export type GeneratedStoryPackageShape = z.infer<typeof generatedStoryPackageSchema>;

export const EnglishGeneratedStoryPackageSchema = z.object({
  short: generatedStoryPackageSchema.shape.short,
  preservationChecklist: preservationChecklistSchema,
  diagnostics: diagnosticsSchema,
});

export type EnglishGeneratedStoryPackageShape = z.infer<typeof EnglishGeneratedStoryPackageSchema>;
