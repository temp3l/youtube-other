import { hashText } from "@mediaforge/shared";
import { z } from "zod";
import {
  diagnosticsSchema,
  fullRewriteGenerationDiagnosticsSchema,
  generatedStoryPackageSchema,
  preservationChecklistSchema,
} from "./story-localization.schemas.js";
import { shortRewriteResultSchema } from "./short-rewrite.schemas.js";
import {
  type GeneratedStoryPackage,
  type LanguageCode,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import { stableSerialize } from "./stable-json.js";
import { type StoryPromptSchemaDescriptor } from "./story-prompt-modules.js";

export const FULL_NARRATION_RESPONSE_SCHEMA_VERSION =
  "full-narration-response-schema-v1";
export const SHORT_REWRITE_RESPONSE_SCHEMA_VERSION =
  "short-rewrite-response-schema-v1";

export const narrationOnlyFullRewriteResponseSchema = z
  .object({
    language: z.enum(["en", "de", "es", "fr", "pt"]),
    full: z
      .object({
        narrationParagraphs: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    targetNarrationWpm: z.number().int().min(120).max(220),
    preservationChecklist: preservationChecklistSchema,
    diagnostics: fullRewriteGenerationDiagnosticsSchema,
  })
  .strict();

export type NarrationOnlyFullRewriteResponse = z.infer<
  typeof narrationOnlyFullRewriteResponseSchema
>;

export const legacyMixedBatchStoryResultSchema = z
  .object({
    language: z.enum(["en", "de", "es", "fr", "pt"]),
    full: generatedStoryPackageSchema.shape.full.unwrap(),
    short: generatedStoryPackageSchema.shape.short,
    preservationChecklist: preservationChecklistSchema,
    diagnostics: diagnosticsSchema,
  })
  .strict();

export type LegacyMixedBatchStoryResult = z.infer<
  typeof legacyMixedBatchStoryResultSchema
>;

export const legacyFullOnlyBatchStoryResultSchema = z
  .object({
    language: z.enum(["en", "de", "es", "fr", "pt"]),
    full: generatedStoryPackageSchema.shape.full.unwrap(),
    preservationChecklist: preservationChecklistSchema,
    diagnostics: fullRewriteGenerationDiagnosticsSchema,
  })
  .strict();

export type LegacyFullOnlyBatchStoryResult = z.infer<
  typeof legacyFullOnlyBatchStoryResultSchema
>;

export type ImportedBatchStoryResult =
  | NarrationOnlyFullRewriteResponse
  | LegacyMixedBatchStoryResult
  | LegacyFullOnlyBatchStoryResult;

export interface NormalizedNarrationOnlyBatchResult {
  readonly normalized: NarrationOnlyFullRewriteResponse;
  readonly detectedFormat: "narration-only" | "legacy-mixed";
  readonly deprecationDiagnostics: readonly string[];
}

function descriptorFingerprint(
  name: string,
  version: string,
  schema: z.ZodTypeAny
): string {
  return hashText(
    stableSerialize({
      name,
      version,
      schema: z.toJSONSchema(schema),
    })
  );
}

export const fullNarrationResponseSchemaDescriptor: StoryPromptSchemaDescriptor =
  {
    name: "full_narration_story_package",
    version: FULL_NARRATION_RESPONSE_SCHEMA_VERSION,
    schema: narrationOnlyFullRewriteResponseSchema,
    fingerprint: descriptorFingerprint(
      "full_narration_story_package",
      FULL_NARRATION_RESPONSE_SCHEMA_VERSION,
      narrationOnlyFullRewriteResponseSchema
    ),
  };

export const shortRewriteResponseSchemaDescriptor: StoryPromptSchemaDescriptor =
  {
    name: "short_rewrite_result",
    version: SHORT_REWRITE_RESPONSE_SCHEMA_VERSION,
    schema: shortRewriteResultSchema,
    fingerprint: descriptorFingerprint(
      "short_rewrite_result",
      SHORT_REWRITE_RESPONSE_SCHEMA_VERSION,
      shortRewriteResultSchema
    ),
  };

export function normalizeNarrationOnlyBatchResult(
  value: unknown
): NormalizedNarrationOnlyBatchResult {
  const narrationOnly = narrationOnlyFullRewriteResponseSchema.safeParse(value);
  const legacyMixed = legacyMixedBatchStoryResultSchema.safeParse(value);
  const legacyFullOnly = legacyFullOnlyBatchStoryResultSchema.safeParse(value);
  const matchedFormats = [
    narrationOnly.success ? "narration-only" : undefined,
    legacyMixed.success ? "legacy-mixed" : undefined,
    legacyFullOnly.success ? "legacy-full-only" : undefined,
  ].filter((format): format is string => Boolean(format));
  if (matchedFormats.length > 1) {
    throw new z.ZodError([
      {
        code: "custom",
        message: `Ambiguous batch result format matched ${matchedFormats.join(", ")}.`,
        path: [],
      },
    ]);
  }
  if (narrationOnly.success) {
    return {
      normalized: narrationOnly.data,
      detectedFormat: "narration-only",
      deprecationDiagnostics: [],
    };
  }
  if (legacyMixed.success) {
    return {
      normalized: {
        language: legacyMixed.data.language,
        full: {
          narrationParagraphs: legacyMixed.data.full.narrationParagraphs,
        },
        targetNarrationWpm: legacyMixed.data.full.targetNarrationWpm,
        preservationChecklist: legacyMixed.data.preservationChecklist,
        diagnostics: {
          removedGenericFiller:
            legacyMixed.data.diagnostics.removedGenericFiller,
          adaptationNotes: legacyMixed.data.diagnostics.adaptationNotes,
        },
      },
      detectedFormat: "legacy-mixed",
      deprecationDiagnostics: [
        "Legacy mixed-format full batch result was normalized to the narration-only internal contract.",
      ],
    };
  }
  if (legacyFullOnly.success) {
    return {
      normalized: {
        language: legacyFullOnly.data.language,
        full: {
          narrationParagraphs: legacyFullOnly.data.full.narrationParagraphs,
        },
        targetNarrationWpm: legacyFullOnly.data.full.targetNarrationWpm,
        preservationChecklist: legacyFullOnly.data.preservationChecklist,
        diagnostics: legacyFullOnly.data.diagnostics,
      },
      detectedFormat: "legacy-mixed",
      deprecationDiagnostics: [
        "Legacy full-only result was normalized to the narration-only internal contract.",
      ],
    };
  }
  throw new z.ZodError([
    {
      code: "custom",
      message:
        "Batch result does not match the narration-only or legacy mixed full schema.",
      path: [],
    },
  ]);
}

export function adaptNarrationOnlyFullToLegacyRendererPackage(args: {
  readonly sourceStory: ParsedSourceStory;
  readonly response: NarrationOnlyFullRewriteResponse;
}): NonNullable<GeneratedStoryPackage["full"]> {
  const metadata = args.sourceStory.metadata;
  return {
    title: args.sourceStory.title,
    ...(args.sourceStory.sourceTitle
      ? { sourceTitle: args.sourceStory.sourceTitle }
      : {}),
    audioInstructions:
      metadata.audioInstructions.length > 0
        ? metadata.audioInstructions
        : ["Use a restrained narration performance."],
    ...(args.sourceStory.soundMotif
      ? { soundMotif: args.sourceStory.soundMotif }
      : {}),
    narrationParagraphs: args.response.full.narrationParagraphs,
    thumbnailText: metadata.thumbnailText ?? args.sourceStory.title,
    contentDisclosure:
      metadata.contentDisclosure ?? "Narration-only compatibility rendering.",
    seoDescription: metadata.seoDescription ?? args.sourceStory.title,
    tags:
      metadata.tags.length > 0
        ? metadata.tags
        : ["story", "narration", "compatibility"],
    hashtags: metadata.hashtags.length > 0 ? metadata.hashtags : ["#Story"],
    targetNarrationWpm: args.response.targetNarrationWpm,
    visualDirection:
      metadata.visualDirection ?? "Reuse existing full-story visual direction.",
  };
}
