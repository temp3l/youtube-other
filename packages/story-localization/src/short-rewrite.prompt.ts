import { getLanguageProfile } from "./language-profiles.js";
import { SHORT_REWRITE_PREFERRED_WORD_RANGE } from "./short-rewrite.constants.js";
import { type ShortRewritePromptContext } from "./short-rewrite.types.js";
import { compileShortStoryPrompt } from "./story-prompt-compiler.js";
import { adaptCanonicalStoryFactsToStoryIR } from "./story-artifact-model.js";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { loadAudioTemplate } from "./prompt-template-loader.js";
import { parseCanonicalSourceStory } from "./source-story-parser.js";
import { insertSectionBeforeMarker } from "./prompt-template-loader.js";
import { normalizeWhitespace } from "@mediaforge/shared";
import { StorySourceParseError } from "./story-localization.errors.js";

function buildCompatibilityParsedSource(context: ShortRewritePromptContext) {
  const compatibilityMarkdown = [
    `# Episode ${context.episodeNumber} — ${context.title}`,
    "",
    "## Narration Script",
    context.sourceStory,
  ].join("\n");
  return {
    language: "en" as const,
    sourceFile: `${context.episodeSlug}.md`,
    sourceHash: "",
    episodeNumber: context.episodeNumber,
    slug: context.episodeSlug,
    title: context.title,
    audioInstructions: [],
    narrationParagraphs: [normalizeWhitespace(context.narration)],
    metadata: {
      episodeNumber: context.episodeNumber,
      primaryTitle: context.title,
      audioInstructions: [],
      narration: [normalizeWhitespace(context.narration)],
      tags: [],
      hashtags: [],
    },
    content: compatibilityMarkdown,
  };
}

export function buildShortRewritePrompt(context: ShortRewritePromptContext): {
  readonly system: string;
  readonly user: string;
} {
  const compatibilityParsed = buildCompatibilityParsedSource(context);
  const facts = extractCanonicalStoryFacts(compatibilityParsed);
  const compiled = compileShortStoryPrompt({
    language: context.targetLanguage,
    adaptationMode: "retention-optimized",
    sourceStory: compatibilityParsed,
    canonicalFacts: facts,
    fullStoryText: context.sourceStory,
    storyIr: adaptCanonicalStoryFactsToStoryIR(facts, compatibilityParsed),
    outputConstraints: {
      variant: "short",
      targetWordRange: {
        min: SHORT_REWRITE_PREFERRED_WORD_RANGE.min,
        max: SHORT_REWRITE_PREFERRED_WORD_RANGE.max,
      },
      targetNarrationWpm: getLanguageProfile(context.targetLanguage)
        .shortNarrationWpm,
      targetDuration: {
        minSeconds: 55,
        maxSeconds: 65,
      },
      hookDeadlineSeconds: 8,
      fullVideoBridgeRequired: true,
    },
  });
  return {
    system: compiled.system,
    user: compiled.user,
  };
}

export function buildShortRewriteRepairPrompt(args: {
  readonly context: ShortRewritePromptContext;
  readonly invalidResult: unknown;
  readonly validationErrors: readonly string[];
}): { readonly system: string; readonly user: string } {
  const basePrompt = buildShortRewritePrompt(args.context);
  const repairSection = [
    "The previous result was invalid.",
    "Fix only the problems described below and return the complete JSON again.",
    "",
    "Validation errors:",
    ...args.validationErrors.map((entry) => `- ${entry}`),
    "",
    "Invalid result:",
    JSON.stringify(args.invalidResult, null, 2),
    "",
    "Do not repeat the errors in prose.",
  ].join("\n");
  return {
    system: basePrompt.system,
    user: insertSectionBeforeMarker(
      basePrompt.user,
      "Before returning the result, silently verify:",
      repairSection
    ),
  };
}
